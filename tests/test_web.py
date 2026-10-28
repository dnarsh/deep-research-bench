"""HTTP entrypoint checks using the real benchmark runner and scorers."""

import http.client
import io
import json
import tempfile
import threading
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import MagicMock, patch

from deep_research_bench.web import BenchServer, MAX_REQUEST_BYTES, main, preload_connectome


class WebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.web_root = Path(cls.tmp.name)
        (cls.web_root / "index.html").write_text("<h1>Research Bench</h1>", encoding="utf-8")
        (cls.web_root / "app.js").write_text("console.log('ready');", encoding="utf-8")
        cls.server = BenchServer(0, cls.web_root)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port
        cls.first = cls.server.cases[0]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            raw = response.read()
            return response.status, dict(response.getheaders()), raw
        finally:
            connection.close()

    def post(self, payload, headers=None):
        all_headers = {"Content-Type": "application/json"}
        all_headers.update(headers or {})
        status, response_headers, raw = self.request(
            "POST", "/api/run", json.dumps(payload).encode("utf-8"), all_headers
        )
        return status, response_headers, json.loads(raw)

    def test_cases_and_health_are_actual_suite(self):
        status, headers, raw = self.request("GET", "/api/cases")
        self.assertEqual(status, 200)
        value = json.loads(raw)
        self.assertEqual(len(value["cases"]), 10)
        self.assertEqual(value["cases"][0]["id"], self.first.id)
        self.assertEqual(value["cases"][0]["query"], self.first.query)
        self.assertEqual(value["cases"][0]["must_contain_regex"], self.first.must_contain_regex)
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, _, raw = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertIs(json.loads(raw)["live_provider"], False)
        self.assertIs(json.loads(raw)["connectome_preloaded"], False)

    def test_manual_http_runs_real_three_scorers_and_reports_answer(self):
        text = "Python 3.13 includes experimental JIT and free-threaded GIL work. " + "explanation " * 90
        status, _, result = self.post({
            "mode": "manual",
            "case_ids": [self.first.id],
            "answers": {self.first.id: {"text": text, "citations": ["https://docs.python.org/3.13/whatsnew/3.13.html"]}},
        })
        self.assertEqual(status, 200)
        self.assertEqual(result["mode"], "manual")
        self.assertEqual(result["run"]["engines"], ["manual-answer"])
        self.assertIsNone(result["run"]["judge"])
        self.assertEqual(result["run"]["summary"]["manual-answer"]["cases_passed"], 1)
        cell = result["run"]["cells"][0]
        self.assertEqual(cell["answer_text"], text)
        self.assertIs(cell["answer_metadata"]["generated_by_app"], False)
        self.assertEqual(set(cell["scorers"]), {"regex", "citation_count", "word_count"})
        self.assertIs(cell["passed"], True)
        self.assertIn("| manual-answer | 100% | 1/1 |", result["markdown"])

    def test_short_manual_answer_records_actual_failures(self):
        status, _, result = self.post({
            "mode": "manual", "case_ids": [self.first.id],
            "answers": {self.first.id: {"text": "Unsupported claim.", "citations": []}},
        })
        self.assertEqual(status, 200)
        cell = result["run"]["cells"][0]
        self.assertIs(cell["passed"], False)
        self.assertFalse(cell["scorers"]["regex"]["passed"])
        self.assertFalse(cell["scorers"]["citation_count"]["passed"])
        self.assertFalse(cell["scorers"]["word_count"]["passed"])
        self.assertIn("Failure details", result["markdown"])

    def test_mock_is_explicit_not_a_live_provider_or_llm_judge(self):
        status, _, result = self.post({"mode": "mock", "case_ids": [self.first.id]})
        self.assertEqual(status, 200)
        self.assertEqual(result["mode"], "mock")
        self.assertEqual(result["run"]["engines"], ["mock-demo"])
        self.assertIsNone(result["run"]["judge"])
        self.assertFalse(result["run"]["cells"][0]["passed"])

    def test_invalid_contracts_reject_without_benchmark_results(self):
        cases = [
            {}, [], {"mode": "live", "case_ids": [self.first.id]},
            {"mode": "mock", "case_ids": []},
            {"case_ids": [self.first.id, self.first.id]},
            {"case_ids": ["missing-case"]},
            {"case_ids": [None]},
            {"mode": "manual", "case_ids": [self.first.id]},
            {"mode": "manual", "case_ids": [self.first.id], "answers": {}},
            {"mode": "manual", "case_ids": [self.first.id], "answers": {self.first.id: {"text": 3}}},
            {"mode": "manual", "case_ids": [self.first.id], "answers": {self.first.id: {"text": "a", "citations": ["javascript:alert(1)"]}}},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                status, _, value = self.post(payload)
                self.assertEqual(status, 400)
                self.assertEqual(set(value), {"error"})

    def test_cross_origin_and_dns_rebinding_hosts_are_rejected(self):
        for headers in [
            {"Host": "attacker.invalid:%s" % self.port},
            {"Origin": "https://attacker.invalid"},
            {"Origin": "null"},
        ]:
            with self.subTest(headers=headers):
                status, _, value = self.post({"case_ids": [self.first.id]}, headers)
                self.assertEqual(status, 403)
                self.assertEqual(set(value), {"error"})
        status, _, _ = self.post(
            {"case_ids": [self.first.id]},
            {"Origin": "http://localhost:%s" % self.port},
        )
        self.assertEqual(status, 200)

    def test_bounded_json_and_content_type(self):
        status, _, _ = self.request(
            "POST", "/api/run", b"{", {"Content-Type": "application/json"}
        )
        self.assertEqual(status, 400)
        status, _, _ = self.request(
            "POST", "/api/run", b"{}", {"Content-Type": "text/plain"}
        )
        self.assertEqual(status, 415)
        status, _, _ = self.request(
            "POST", "/api/run", b"", {"Content-Type": "application/json", "Content-Length": str(MAX_REQUEST_BYTES + 1)}
        )
        self.assertEqual(status, 413)

    def test_content_length_uses_http_decimal_grammar(self):
        for value in ["+2", "2_0", "-1"]:
            with self.subTest(value=value):
                status, _, raw = self.request(
                    "POST", "/api/run", b"{}",
                    {"Content-Type": "application/json", "Content-Length": value},
                )
                self.assertEqual(status, 400)
                self.assertNotIn(b"run", json.loads(raw))

    def test_static_files_cannot_escape_web_root(self):
        status, headers, raw = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(raw, b"<h1>Research Bench</h1>")
        self.assertIn("text/html", headers["Content-Type"])
        status, headers, raw = self.request("GET", "/app.js")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")
        self.assertIn(b"console.log", raw)
        for path in ["/%2e%2e/README.md", "/%2e%2e%5cREADME.md", "/%00", "/api/no-such-route"]:
            with self.subTest(path=path):
                status, _, value = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertNotIn(str(self.web_root).encode(), value)

    def test_connectome_route_filters_and_safe_network_failure(self):
        module = types.ModuleType("deep_research_bench.connectome")
        calls = []

        def query_neurons(**kwargs):
            calls.append(kwargs)
            return {"snapshot": True, "total_neurons": 3, "matching_neurons": 1, "neurons": []}

        module.query_neurons = query_neurons
        with patch.dict("sys.modules", {"deep_research_bench.connectome": module}):
            status, _, raw = self.request("GET", "/api/connectome?q=MN9&transmitter=ACH&limit=12")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)["matching_neurons"], 1)
            self.assertEqual(calls, [{"q": "MN9", "transmitter": "ACH", "limit": 12}])
            for path in ["/api/connectome?limit=0", "/api/connectome?limit=hi", "/api/connectome?q=a&q=b"]:
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 400)
            self.assertEqual(len(calls), 1)

            def fail(**kwargs):
                raise RuntimeError("private machine path and downstream message")

            module.query_neurons = fail
            status, _, raw = self.request("GET", "/api/connectome")
            self.assertEqual(status, 502)
            self.assertEqual(json.loads(raw)["error"], "CONNECTOME_UNAVAILABLE")
            self.assertNotIn(b"private", raw)

    def test_preload_sets_actual_health_state_only_after_success(self):
        stdout = io.StringIO()
        try:
            with patch(
                "deep_research_bench.connectome.query_neurons",
                return_value={"total_neurons": 139255},
            ) as query, redirect_stdout(stdout):
                self.assertIs(preload_connectome(self.server), True)
            query.assert_called_once_with(limit=1)
            self.assertIn("139255 neurons", stdout.getvalue())
            status, _, raw = self.request("GET", "/api/health")
            self.assertEqual(status, 200)
            self.assertIs(json.loads(raw)["connectome_preloaded"], True)

            stdout = io.StringIO()
            with patch(
                "deep_research_bench.connectome.query_neurons",
                side_effect=RuntimeError("private path and downstream response"),
            ), redirect_stdout(stdout):
                self.assertIs(preload_connectome(self.server), False)
            self.assertNotIn("private", stdout.getvalue())
            self.assertIn("preload unavailable", stdout.getvalue())
            status, _, raw = self.request("GET", "/api/health")
            self.assertEqual(status, 200)
            self.assertIs(json.loads(raw)["connectome_preloaded"], False)
        finally:
            self.server.connectome_preloaded = False

    def test_cli_preload_is_opt_in_and_failure_does_not_abort_serving(self):
        for enabled in [False, True]:
            with self.subTest(enabled=enabled):
                server = MagicMock()
                server.__enter__.return_value = server
                server.server_port = 8765
                server.serve_forever.side_effect = KeyboardInterrupt()
                argv = ["--port", "8765"] + (["--preload-connectome"] if enabled else [])
                with patch("deep_research_bench.web.BenchServer", return_value=server), patch(
                    "deep_research_bench.web.preload_connectome", return_value=False
                ) as preload, redirect_stdout(io.StringIO()):
                    self.assertEqual(main(argv), 0)
                server.serve_forever.assert_called_once_with()
                if enabled:
                    preload.assert_called_once_with(server)
                else:
                    preload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
