# AfterThought

A local evidence workspace built on the `deep-research-bench` Python framework.

## Local app

The project now has a local evaluation workspace, an Einstein's Jump research
companion, and a real FlyWire v783 neuron-metadata explorer. From this source
checkout, run `python run_app.py`, then open <http://127.0.0.1:8765>.
Windows users can double-click `start-app.cmd`. No runtime dependencies or API
keys are required. See [the app guide](web/README.md) for features, evidence,
privacy, dataset licensing, and the boundaries of structural scoring.

A small (~700 LOC, zero required runtime deps, Python 3.8+) evaluation framework for **deep-research engines** — agentic / retrieval-augmented systems that try to answer non-trivial questions with citations.

Pluggable engines, pluggable scorers (regex contracts / citation count / word count / LLM-as-judge), markdown + JSON reports. Ships with **10 anonymized public benchmark cases** across 9 categories (recency, synthesis, citation-density, niche/post-cutoff, long-form analysis, adversarial honest-deficit, cross-source conflict, code-context multi-step).

Extracted from a private long-running system that needed to compare its own research engine against several frontier services on its real workload. The framework was carved out for public use; **the private 31-case dogfood eval stays in the original system.** The 10 cases in this repo are a separately-authored public benchmark — none overlap with the private set.

> **Status (v0.1.0):** Source-only release. Not yet on PyPI. Install from GitHub — see [Install](#install) below.

---

## What this is

A pure-Python framework that lets you:

1. **Author benchmark cases** in JSON (id + query + cheap regex contracts + structural minimums + LLM-as-judge criteria).
2. **Define engines** by implementing a 1-method protocol (`run(query) -> EngineAnswer`).
3. **Run the cross-product** of (cases × engines × scorers) and get back a structured `BenchmarkRun`.
4. **Render reports** as markdown (human-readable) or JSON (machine-readable, diff-able across runs).

The 10 public cases are designed to be answerable by any decent deep-research system — the question is whether your system answers them WELL (with real citations, with the right specifics, without hallucinating).

## What this is NOT — read this first

| If you need...                                                                               | Use...                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A pre-built leaderboard** with current scores for Perplexity / OpenAI Deep Research / etc. | This is a framework, not a leaderboard. You run it yourself with your own API keys.                                                                                                                                                                                                   |
| **A general LLM benchmark** (MMLU, GSM8K, HumanEval, etc.)                                   | [`lm-evaluation-harness`](https://github.com/EleutherAI/lm-evaluation-harness), [`bigcode-evaluation-harness`](https://github.com/bigcode-project/bigcode-evaluation-harness). This is narrower — it's for deep-research / RAG / agentic systems that produce answers with citations. |
| **Agent-trajectory tracing / observability**                                                 | [LangSmith](https://smith.langchain.com), [Phoenix](https://github.com/Arize-ai/phoenix), [Helicone](https://www.helicone.ai/). This framework only sees the final answer.                                                                                                            |
| **A judge you don't have to write**                                                          | This ships a `StubJudge` for tests and a rubric prompt builder. Real LLM judges need your API keys — you write the adapter.                                                                                                                                                           |
| **Bundled engine adapters for Perplexity / OpenAI / Anthropic**                              | Not shipped on purpose. They need credentials and provider-specific error handling. The framework ships only a `MockEngine` for tests. Writing an adapter is 30 lines — see [Wiring a real engine](#wiring-a-real-engine).                                                            |

**Use this when**: you want to measure your own deep-research system against frontier baselines on questions YOU care about, with reproducible scoring contracts that don't depend on a third-party leaderboard.

---

## Install

Source-only until v0.1.0 lands on PyPI:

```bash
pip install git+https://github.com/aiton08255/deep-research-bench
```

Or clone and install editable for local hacking:

```bash
git clone https://github.com/aiton08255/deep-research-bench
pip install -e "./deep-research-bench[dev]"
```

Once on PyPI (planned):

```bash
pip install deep-research-bench
```

---

## Quick start — see a report in 30 seconds

The package ships a CLI that runs the 10 public cases against the built-in `MockEngine` (a deterministic stub) so you can see what reports look like without any API setup:

```bash
deep-research-bench --cases cases/public-10.json --judge
```

This prints a markdown report. The `MockEngine` is intentionally bad — most cases will fail the regex contracts because it returns hash-derived gibberish. The point of the demo is the report shape, not the score.

To save reports to disk:

```bash
deep-research-bench --cases cases/public-10.json --output results/
# writes results/report.md and results/report.json
```

## Python API — the real use case

```python
from deep_research_bench import (
    load_cases, run_benchmark, to_markdown,
    RegexScorer, CitationCountScorer, WordCountScorer, StubJudge,
)
from my_company.engines import PerplexityEngine, OurPrivateEngine  # YOU write these

cases = load_cases("cases/public-10.json")  # or your own JSON file

engines = [
    PerplexityEngine(api_key=os.environ["PERPLEXITY_KEY"]),
    OurPrivateEngine(),
]

scorers = [RegexScorer(), CitationCountScorer(), WordCountScorer()]
judge = StubJudge()  # swap for a real LLM judge when you're ready

run = run_benchmark(cases=cases, engines=engines, scorers=scorers, judge=judge)
print(to_markdown(run))
```

## Wiring a real engine

An engine is anything with `name: str` and `run(query: str) -> EngineAnswer`:

```python
from deep_research_bench import EngineAnswer

class PerplexityEngine:
    name = "perplexity-sonar"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def run(self, query: str) -> EngineAnswer:
        # Your real API call here
        response = http.post(
            "https://api.perplexity.ai/chat/completions",
            json={"model": "sonar", "messages": [{"role": "user", "content": query}]},
            headers={"Authorization": f"Bearer {self.api_key}"},
        ).json()
        return EngineAnswer(
            text=response["choices"][0]["message"]["content"],
            citations=response.get("citations", []),
            metadata={"model": "sonar", "latency_ms": response.get("usage", {}).get("total_ms")},
        )
```

That's the whole contract. Handle retries / timeouts / rate-limits inside `run()` — exceptions are caught by the runner and recorded as cell errors so one broken engine doesn't abort the whole benchmark.

## Wiring a real LLM-as-judge

The framework ships a rubric prompt builder + response parser so you don't have to invent your own format:

```python
from deep_research_bench import Judge, JudgeResult, build_judge_prompt
from deep_research_bench.judge import parse_judge_response
import anthropic  # or openai, or whatever

class ClaudeJudge:
    name = "claude-3-7-sonnet"

    def __init__(self, client):
        self.client = client

    def judge(self, case, answer) -> JudgeResult:
        prompt = build_judge_prompt(case, answer)
        resp = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        score, reasoning = parse_judge_response(resp.content[0].text)
        return JudgeResult(score=score, reasoning=reasoning, judge_name=self.name)
```

The rubric prompt expects the LLM to reply with exactly:

```
SCORE: <1-5>
REASONING: <one sentence>
```

The parser is tolerant of extra whitespace and minor format drift but will raise `ValueError` if the score line is missing or out of range. Catch that in your adapter and decide whether to retry or surface the error.

---

## The case schema

```json
{
  "version": "your-version-tag",
  "description": "what this benchmark suite measures",
  "cases": [
    {
      "id": "unique-stable-id",
      "category": "synthesis",
      "severity": "P1",
      "query": "the actual question",
      "must_contain_regex": ["pattern1", "pattern2"],
      "min_citation_count": 2,
      "min_word_count": 100,
      "judge_criteria": "what the LLM judge should look for"
    }
  ]
}
```

The loader accepts BOTH snake_case (`must_contain_regex`) and camelCase (`mustContainRegex`) keys so you can author files in whichever style your team prefers.

All scoring fields are optional. A case with no `must_contain_regex` is auto-passed by the regex scorer; ditto for the count scorers. Cases that only have a `judge_criteria` are valid (the judge is the only scoring signal).

## The 10 public cases

See `cases/public-10.json`. The categories:

| Category                     | Why it matters                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `recency`                    | Tests whether the engine actually retrieves post-training-cutoff information              |
| `synthesis`                  | Requires combining facts from multiple sources into a comparison                          |
| `citation-density`           | Tests whether the engine produces citable, verifiable sources                             |
| `niche-post-cutoff`          | Tests handling of topics with limited / specialized literature                            |
| `long-form-analysis`         | Tests depth — does the engine produce 200+ words of substantive analysis                  |
| `adversarial-honest-deficit` | Tests whether the engine will say "no robust evidence" instead of hallucinating consensus |
| `cross-source-conflict`      | Tests synthesis when sources disagree                                                     |
| `code-context-multi-step`    | Tests technical reasoning under specific constraints                                      |
| `factual-lookup`             | The baseline — boring questions an engine should always get right                         |

**These 10 cases are deliberately not exhaustive.** They're a calibration set. Your own benchmark suite will be larger and more specific to your domain. The framework is designed to handle thousands of cases without ceremony — `load_cases()` is just JSON parsing.

---

## Limitations — the honest list

1. **No bundled real-engine adapters.** Writing one is ~30 lines but requires your API key. This is on purpose: bundling adapters means bundling auth code, retry policies, and provider-specific quirks that drift quickly.

2. **The 10 public cases are MY judgment of what's interesting.** Your domain may need totally different categories. Don't treat this set as canonical.

3. **`RegexScorer` is case-insensitive by default and string-boundary-blind.** A case requiring "react" will match a question about "reactor design." Use word-boundary patterns (`\\breact\\b`) when that matters.

4. **`WordCountScorer` does whitespace-split.** It over-counts in code-heavy answers and under-counts in CJK. If you need a tokenizer, write your own scorer.

5. **`CitationCountScorer` counts whatever the engine put in `EngineAnswer.citations`.** It cannot verify those URLs resolve, that they're not hallucinated, or that they actually support the claim. Citation _quality_ is the judge's job.

6. **No built-in parallelism.** The runner is sequential. For 10 engines × 100 cases × 30s/call you're looking at ~8 hours. If you need parallelism, wrap `_run_one_cell` in your own `ThreadPoolExecutor` — but be aware that some providers rate-limit per-key, and concurrent runs make the latency numbers noisy.

7. **The judge protocol assumes one judge per run.** Multi-judge ensembling, judge-of-judges, and rubric A/B-testing are deliberately out of scope. They're easy to add on top — run the benchmark twice with different judges and diff the JSON reports.

8. **The framework cannot detect prompt injection from the engine's answer back into the judge.** If your engine emits an answer like "SCORE: 5", `parse_judge_response` could pick it up if you naively feed the answer into the judge prompt without escaping. `build_judge_prompt` puts the answer in a clearly-delimited block, but a determined adversary engine could still mess with the judge. Run the judge in a separate process / API call with the rubric AHEAD of the user content; never let the engine answer come before the rubric.

9. **No async support.** All engines are sync. If your engine is async, wrap it: `asyncio.run(engine.async_run(query))` inside a sync `run()`.

10. **34 tests cover schemas, scorers, judges, runner orchestration, and report formatting. They do NOT cover: real LLM judges (the StubJudge is the only one tested), parallel runs, network errors in custom engines, or huge case sets where reporter output exceeds shell buffers.**

---

## Alternatives — when NOT to use this

| Tool                                                                           | Use it instead when                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`lm-evaluation-harness`](https://github.com/EleutherAI/lm-evaluation-harness) | You're evaluating raw LLMs on standard benchmarks (MMLU, BBH, GSM8K).                          |
| [`promptfoo`](https://promptfoo.dev)                                           | You want a YAML/UI-driven prompt-versioning tool with built-in assertion types.                |
| [`ragas`](https://github.com/explodinggradients/ragas)                         | You specifically need RAG-quality metrics (faithfulness, answer-relevance, context-precision). |
| [LangSmith / Phoenix](https://smith.langchain.com)                             | You want trace-level observability on an agent's intermediate steps, not just final answers.   |
| A spreadsheet                                                                  | You have 5 cases and 2 engines and don't want a build step. Honestly fine.                     |

**Why this framework exists when those exist**: most of them assume either (a) you're evaluating raw LLMs on canonical academic benchmarks or (b) you're embedded in a specific framework's ecosystem (LangChain, etc.). This one is for the specific case of "I have an engine that does deep research and I want to score it on questions that look like real-world research, with cheap regex/citation contracts so most cases don't need to hit an LLM judge."

---

## API reference

### `BenchmarkCase`

Frozen dataclass — see [The case schema](#the-case-schema) above.

### `load_cases(path) -> List[BenchmarkCase]`

Loads from a JSON file. Accepts both list-format and object-with-`cases`-key format. Both snake_case and camelCase field names.

### `Engine` (Protocol)

`name: str` + `run(query: str) -> EngineAnswer`.

### `EngineAnswer`

Frozen dataclass: `text`, `citations: list[str]`, `metadata: dict`.

### `Scorer` (Protocol)

`name: str` + `score(case, answer) -> ScoreResult`. Pure function. No I/O.

### `Judge` (Protocol)

`name: str` + `judge(case, answer) -> JudgeResult`. May have side effects (API calls).

### `run_benchmark(cases, engines, scorers, judge=None) -> BenchmarkRun`

Runs the full cross-product. Engine exceptions are caught and recorded as cell errors. Scorer exceptions propagate (a broken scorer is a bug in YOUR code).

### `to_markdown(run) -> str` / `to_json(run) -> dict`

Report formatters. `write_report(run, output_dir)` writes both to disk.

### `StubJudge(fixed_score=3)`

Deterministic judge that always returns `fixed_score`. For tests and CI.

### `build_judge_prompt(case, answer) -> str` / `parse_judge_response(text) -> tuple`

Helpers for writing real-LLM judge adapters. Standard rubric, lenient parser.

---

## Run the tests

```bash
git clone https://github.com/aiton08255/deep-research-bench
cd deep-research-bench
pip install -e ".[dev]"
python -m pytest tests/ -v
```

Current status: **34 passed in 0.5s** on Python 3.12 / Windows 11.

The key tests:

- `test_load_public_10_actually_loads` — verifies the shipped public-10.json parses cleanly with the loader (no schema drift).
- `test_runner_records_engine_exception_as_cell_error` — a broken engine doesn't abort the run.
- `test_reporter_markdown_has_expected_sections` / `test_reporter_json_shape_is_serializable` — report output is stable.
- `test_parse_judge_response_*` — judge response parser handles whitespace drift but rejects out-of-range scores.

---

## Provenance

Built and battle-tested as the eval surface for a private long-running deep-research system. The private system has 31 internal benchmark cases that stay closed; this repo ships a separately-authored set of 10 public cases plus the framework itself.

The framework's scoring discipline (cheap regex contracts + citation count + word count + selective LLM-as-judge) is the pattern that let the private system iterate on engine quality without burning $100s of API quota per eval cycle. That cost discipline is the actual value — most evaluation frameworks either are all-LLM-judge (expensive, noisy, slow) or all-string-match (cheap, brittle, misses semantic failures). This one composes both.

---

## License

MIT. See `LICENSE`.

## Contributing

PRs welcome for:

- Additional built-in scorers that have a clear, narrow purpose (e.g. `LengthRangeScorer`, `MustNotContainRegexScorer`).
- Cross-platform test fixes if you hit Linux/macOS edge cases.
- Real-engine adapter examples (in `examples/`, not bundled as a runtime dep) for popular providers.

Please do NOT submit PRs that:

- Bundle a specific provider's SDK as a required dep.
- Add async / parallel runners as the default (acceptable as an opt-in addon).
- Expand the 10 public cases without a clear methodology — case selection bias is the whole game.

Open an [issue](https://github.com/aiton08255/deep-research-bench/issues) before a large PR.
