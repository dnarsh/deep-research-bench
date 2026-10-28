# AfterThought app

Run from a source checkout with Python 3.8 or newer:

```text
python run_app.py
```

On Windows you can also double-click `start-app.cmd`. Open
<http://127.0.0.1:8765> in your browser. For instant dataset demos use `python run_app.py --preload-connectome`. The Windows
launcher enables this option. It warms the real metadata cache before serving;
if loading fails the app still starts with a safe warning and an explicit Retry.
The server binds only to the loopback
interface. Stop it with Ctrl+C. The Introduction page explains the project and the in-app Live demo guide provides
seven runnable presenter steps. No runtime dependencies, model accounts, or
provider keys are needed. `python run_app.py --port 8766` chooses another port.

## What works

- Browse and filter the repository's 10 real public cases, across 9 distinct
  category labels. Inspect their regex contracts, citation minimums, word
  minimums, and unexecuted judge rubrics.
- Select cases and run the existing deterministic `MockEngine`. This engine is
  deliberately poor; its failures are expected and always labeled as mock data.
- Paste an answer and citation URLs to run the actual `RegexScorer`,
  `CitationCountScorer`, and `WordCountScorer`. Inspect each result and its detail.
- Keep up to 30 reports in browser memory for the current page session. Export
  the actual JSON or Markdown report. Reloading clears browser history and
  answer drafts; the server does not store submitted answers.
- Browse a seven-phase companion to
  [Einstein's Jump](https://github.com/dnarsh/einsteins-jump), with links to the
  original research. Its historical results are attributed, not newly reproduced.
- Explicitly load the official FlyWire FAFB v783 neuron metadata archive and
  filter actual neuron IDs, source groups, predicted neurotransmitters, and
  confidence values. The fetched snapshot currently contains 139,255 rows.
  Neuron IDs remain strings to preserve their full 64-bit precision.

## Evidence and limits

Structural scores do not establish factual accuracy, citation validity, or
scientific novelty. Citation URLs are counted; they are not fetched or verified.
No live research engine or LLM judge is connected. Manual answer metadata
explicitly records `generated_by_app: false`.

The FlyWire connector reads one fixed, official
[v783 archive](https://storage.googleapis.com/flywire-data/codex/data/fafb/783/neurons.csv.gz),
on an explicit user action or with the optional `--preload-connectome` launch flag. It caches approximately 1.7 MB under ignored
`.cache/flywire/`, validates compressed/decompressed limits, reuses parsed
metadata across queries, and repairs corrupt caches with one validated refetch.
It does not fetch the much larger synaptic graph, simulate neural activity, or
authenticate to the live Codex/CAVE APIs. This is a static metadata connection.

FlyWire data retains **CC BY-NC 4.0** terms. The source code's MIT license does
not relicense the downloaded dataset. See the
[FlyWire use and citation guidelines](https://join.flywire.ai/guidelines) and
[official Codex loader](https://github.com/murthylab/codex/blob/main/codex/data/local_data_loader.py).
Downloaded data is not bundled or committed. The external
[Codex explorer](https://codex.flywire.ai/app/explore) requires sign-in.

Geist font files are from Google Fonts, copyright the Geist Project Authors,
and are bundled under the [SIL Open Font License](fonts/OFL.txt). The small
neuron diagram is an original schematic illustration, not measured connectivity.

## Checks

With the repository's development extra installed:

```text
python -m pytest -q
```

The added web and connector checks also run using only the standard library:

```text
python -m unittest discover -s tests -p test_web.py -v
python -m unittest discover -s tests -p test_connectome.py -v
```

For these direct test commands, set `PYTHONPATH=src` in your shell first.
The web suite exercises the real HTTP server and the existing runner/scorers,
including manual passes/failures, report contents, explicit mock labeling,
cross-origin/Host refusal, request bounds, static containment, and fixed errors.
The connector suite covers actual CSV parsing with fixture archives, precision,
filters, bounded downloads, corrupt-cache recovery, and concurrent cache reuse.
