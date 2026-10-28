"""Local, dependency-free web app over the existing benchmark runner.

Run from a source checkout with ``PYTHONPATH=src python -m deep_research_bench.web``.
Answers stay in the request/response; this server does not save them or call an LLM.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Sequence
from urllib.parse import parse_qs, unquote, urlsplit

from deep_research_bench import (
    CitationCountScorer,
    EngineAnswer,
    RegexScorer,
    WordCountScorer,
    load_cases,
    run_benchmark,
    to_json,
    to_markdown,
)
from deep_research_bench.adapters.mock_engine import MockEngine


ROOT = Path(__file__).resolve().parents[2]
MAX_REQUEST_BYTES = 1024 * 1024
MAX_ANSWER_CHARS = 200_000
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
}


class RequestError(ValueError):
    """Safe, client-facing validation error."""


class ManualEngine:
    name = "manual-answer"

    def __init__(self, answers: Dict[str, EngineAnswer]) -> None:
        self.answers = answers

    def run(self, query: str) -> EngineAnswer:
        return self.answers[query]


class BenchServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int = 8765, web_root: Optional[Path] = None) -> None:
        self.web_root = (web_root or ROOT / "web").resolve()
        self.cases_path = ROOT / "cases" / "public-10.json"
        self.cases = load_cases(self.cases_path)
        self.case_by_id = {case.id: case for case in self.cases}
        self.suite = json.loads(self.cases_path.read_text(encoding="utf-8"))
        self.connectome_preloaded = False
        super().__init__(("127.0.0.1", port), BenchHandler)


class BenchHandler(BaseHTTPRequestHandler):
    server: BenchServer

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(10)

    def version_string(self) -> str:
        return "AfterThought"

    def log_message(self, format: str, *args: Any) -> None:
        # Request bodies can contain unpublished research; never log their content.
        pass

    def _allowed_request(self) -> bool:
        allowed_hosts = {
            "127.0.0.1:%s" % self.server.server_port,
            "localhost:%s" % self.server.server_port,
        }
        host_headers = self.headers.get_all("Host", [])
        if len(host_headers) != 1 or host_headers[0].lower() not in allowed_hosts:
            self._json(403, {"error": "This app accepts localhost requests only."})
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin.lower() not in {
            "http://" + host for host in allowed_hosts
        }:
            self._json(403, {"error": "Cross-origin requests are not allowed."})
            return False
        return True

    def _send(self, status: int, content: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(content)

    def _json(self, status: int, value: Any) -> None:
        self._send(
            status,
            json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def do_GET(self) -> None:
        if not self._allowed_request():
            return
        path = urlsplit(self.path).path
        if path == "/api/health":
            self._json(200, {
                "status": "ok",
                "app": "AfterThought",
                "case_count": len(self.server.cases),
                "live_provider": False,
                "connectome_preloaded": self.server.connectome_preloaded,
            })
            return
        if path == "/api/cases":
            self._json(200, {
                "version": self.server.suite.get("version", ""),
                "description": self.server.suite.get("description", ""),
                "cases": [asdict(case) for case in self.server.cases],
            })
            return
        if path == "/api/connectome":
            try:
                params = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
                if any(len(values) != 1 for values in params.values()):
                    raise ValueError("Each filter must have one value.")
                query = params.get("q", [""])[0]
                transmitter = params.get("transmitter", [""])[0]
                try:
                    limit = int(params.get("limit", ["30"])[0])
                except ValueError:
                    raise ValueError("Limit must be an integer from 1 to 100.")
                if len(query) > 128 or len(transmitter) > 32 or not 1 <= limit <= 100:
                    raise ValueError("Invalid connectome filters.")
                # Import/fetch is lazy: ordinary app startup never downloads the dataset.
                from deep_research_bench.connectome import query_neurons

                self._json(200, query_neurons(q=query, transmitter=transmitter, limit=limit))
            except ValueError:
                self._json(400, {"error": "Invalid connectome filters."})
            except Exception:
                self._json(502, {
                    "error": "CONNECTOME_UNAVAILABLE",
                    "message": "Could not load the published connectome snapshot. Try again.",
                })
            return
        if path.startswith("/api/"):
            self._json(404, {"error": "Endpoint not found."})
            return
        try:
            decoded = unquote(path, errors="strict")
            if "\x00" in decoded or "\\" in decoded:
                raise ValueError("invalid path")
            target = (self.server.web_root / decoded.lstrip("/")).resolve()
            target.relative_to(self.server.web_root)
            if target.is_dir():
                target = target / "index.html"
            # Resolve again after index selection to reject a symlinked index.
            target = target.resolve()
            target.relative_to(self.server.web_root)
            content = target.read_bytes()
        except (OSError, ValueError):
            self._json(404, {"error": "File not found."})
            return
        # Windows registry MIME associations must not disable scripts under nosniff.
        content_type = STATIC_TYPES.get(target.suffix.lower(), "application/octet-stream")
        self._send(200, content, content_type)

    def _read_payload(self) -> Optional[dict]:
        if self.headers.get("Transfer-Encoding") is not None:
            raise RequestError("Chunked requests are not supported.")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1:
            raise RequestError("A valid Content-Length is required.")
        if not lengths[0].isascii() or not lengths[0].isdigit():
            raise RequestError("A valid Content-Length is required.")
        length = int(lengths[0])
        if length < 0:
            raise RequestError("A valid Content-Length is required.")
        if length > MAX_REQUEST_BYTES:
            self._json(413, {"error": "Request exceeds the 1 MB limit."})
            return None
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._json(415, {"error": "Send application/json."})
            return None
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise RequestError("Incomplete request body.")
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeError, ValueError):
            raise RequestError("Request body must be valid UTF-8 JSON.")
        if not isinstance(value, dict):
            raise RequestError("Request body must be a JSON object.")
        return value

    def _evaluate(self, payload: dict) -> dict:
        mode = payload.get("mode", "mock")
        if mode not in ("mock", "manual"):
            raise RequestError("Choose mock or manual mode.")
        case_ids = payload.get("case_ids")
        if (
            not isinstance(case_ids, list)
            or not case_ids
            or len(case_ids) > len(self.server.cases)
            or any(not isinstance(value, str) for value in case_ids)
            or len(set(case_ids)) != len(case_ids)
            or any(value not in self.server.case_by_id for value in case_ids)
        ):
            raise RequestError("Select one or more unique known case IDs.")
        cases = [self.server.case_by_id[value] for value in case_ids]
        if mode == "mock":
            engine = MockEngine(name="mock-demo")
        else:
            submitted = payload.get("answers")
            if not isinstance(submitted, dict):
                raise RequestError("Manual mode requires answers keyed by case ID.")
            answers = {}
            for case in cases:
                answer = submitted.get(case.id)
                if not isinstance(answer, dict):
                    raise RequestError("Provide an answer for every selected case.")
                text = answer.get("text")
                citations = answer.get("citations", [])
                if not isinstance(text, str) or len(text) > MAX_ANSWER_CHARS:
                    raise RequestError("Each answer must be text of at most 200,000 characters.")
                if (
                    not isinstance(citations, list)
                    or len(citations) > 100
                    or any(not isinstance(value, str) or len(value) > 2048 for value in citations)
                ):
                    raise RequestError("Citations must be at most 100 URL strings.")
                for citation in citations:
                    try:
                        parsed = urlsplit(citation)
                        valid = parsed.scheme in ("https", "http") and bool(parsed.netloc)
                    except ValueError:
                        valid = False
                    if not valid:
                        raise RequestError("Citation URLs must use http or https.")
                answers[case.query] = EngineAnswer(
                    text=text,
                    citations=list(citations),
                    metadata={"source": "user-submitted", "generated_by_app": False},
                )
            engine = ManualEngine(answers)
        run = run_benchmark(
            cases,
            [engine],
            [RegexScorer(), CitationCountScorer(), WordCountScorer()],
            judge=None,
        )
        return {"run": to_json(run), "markdown": to_markdown(run), "mode": mode}

    def do_POST(self) -> None:
        self.close_connection = True
        if not self._allowed_request():
            return
        if urlsplit(self.path).path != "/api/run":
            self._json(404, {"error": "Endpoint not found."})
            return
        try:
            payload = self._read_payload()
            if payload is None:
                return
            self._json(200, self._evaluate(payload))
        except RequestError as error:
            self._json(400, {"error": str(error)})
        except (OSError, TimeoutError):
            self._json(400, {"error": "Could not read the request."})
        except Exception:
            self._json(500, {"error": "Could not evaluate the submitted answers."})


def preload_connectome(server: BenchServer) -> bool:
    """Warm the fixed public metadata snapshot only when explicitly requested."""
    server.connectome_preloaded = False
    try:
        from deep_research_bench.connectome import query_neurons

        result = query_neurons(limit=1)
        total = result["total_neurons"]
        if not isinstance(total, int) or isinstance(total, bool) or total <= 0:
            raise ValueError("invalid snapshot count")
    except Exception:
        print(
            "FlyWire preload unavailable; load the metadata snapshot from the app to retry.",
            flush=True,
        )
        return False
    server.connectome_preloaded = True
    print(
        "FlyWire FAFB v783 metadata preloaded: %s neurons (published snapshot, not a neural simulation)." % total,
        flush=True,
    )
    return True


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run the local AfterThought app.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--preload-connectome",
        action="store_true",
        help="Load the fixed public FlyWire metadata snapshot before serving the app.",
    )
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")
    with BenchServer(args.port) as server:
        if args.preload_connectome:
            preload_connectome(server)
        print("AfterThought: http://127.0.0.1:%s" % server.server_port, flush=True)
        print("Local scoring only; no provider API or LLM judge is connected.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
