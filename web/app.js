const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  grid: "M3 3h6v6H3z M13 3h6v6h-6z M3 13h6v6H3z M13 13h6v6h-6z",
  activity: "M2 11h4l3-7 4 14 3-7h4",
  network:
    "M7 5l8 3M7 5l-2 12m10-9 3 10M5 17l13 1M15 8L5 17M7 5h.01M15 8h.01M5 17h.01M18 18h.01",
  book: "M3 4h6l2 2 2-2h6v14h-6l-2 2-2-2H3z M11 6v14",
  code: "m7 6-5 5 5 5m8-10 5 5-5 5m-3-14-3 18",
  play: "m7 4 12 7-12 7Z",
  search: "M15 15l5 5M17 9A7 7 0 1 1 3 9a7 7 0 0 1 14 0Z",
  download: "M11 2v12m-5-5 5 5 5-5M3 15v5h16v-5",
  arrow: "M4 11h14m-5-5 5 5-5 5",
  check: "m5 11 4 4 8-9",
  cross: "m6 6 10 10M16 6 6 16",
  info: "M11 10v6M11 6h.01M21 11A10 10 0 1 1 1 11a10 10 0 0 1 20 0Z",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 22 22" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = icon(el.dataset.icon);
});
const titles = {
  "recency-python-3-13-features": "Python 3.13 features",
  "recency-open-weight-llms-2025": "Open-weight models in 2025",
  "synthesis-orm-comparison": "The ORM comparison",
  "citation-density-http3-priority": "HTTP/3 stream priority",
  "niche-attention-free-lms": "Beyond attention",
  "long-form-crdt-implementation": "CRDTs in production",
  "adversarial-self-evolving-agents": "Self-evolving agents",
  "conflict-agi-embodiment": "Intelligence & embodiment",
  "code-context-distributed-lock": "Distributed locks",
  "factual-tree-balancing": "AVL vs. Red-Black trees",
};
const categories = {
  recency: "Recency",
  synthesis: "Synthesis",
  "citation-density": "Citations",
  "niche-post-cutoff": "Niche research",
  "long-form-analysis": "Long-form",
  "adversarial-honest-deficit": "Honest deficit",
  "cross-source-conflict": "Conflicting sources",
  "code-context-multi-step": "Code reasoning",
  "factual-lookup": "Factual lookup",
};
const state = {
  cases: [],
  selected: new Set(),
  active: null,
  filter: "",
  category: "",
  view: "benchmark",
  answers: {},
  run: null,
  history: [],
  busy: false,
  error: "",
  phase: 0,
  connectome: null,
  neuronQuery: "",
  transmitter: "",
  neuronBusy: false,
  neuronError: "",
  preloaded: false,
};
const fmt = (n) => Number(n).toLocaleString();
const title = (c) => titles[c.id] || c.id;
const modeLabel = (mode) =>
  mode === "mock" ? "Deterministic mock" : "Manual answer";
const currentCase = () => state.cases.find((c) => c.id === state.active);
const currentCell = (id) => state.run?.run.cells.find((c) => c.case_id === id);
const draft = (id) => (state.answers[id] ||= { text: "", citations: "" });
const status = (cell) =>
  cell
    ? `<span class="status ${cell.passed ? "pass" : "fail"}"><i></i>${cell.passed ? "Passed" : "Needs review"}</span>`
    : '<span class="status"><i></i>Not run</span>';
const phases = [
  {
    name: "The first attempt",
    note: "Disguised physics puzzles",
    path: "01-first-attempt",
    heading: "A new vocabulary isn’t a new idea.",
    body: "Two invented, physics-shaped puzzles were recognized as familiar scientific ideas by every judge: six matches out of six. Disguising the vocabulary did not disguise the underlying structure.",
    finding:
      "The test detected recognizable structure. It did not establish a general detector of scientific novelty.",
  },
  {
    name: "The second attempt",
    note: "Generation vs. verification",
    path: "02-second-attempt",
    heading: "A test needs room to fail.",
    body: "The next design separated generating an answer from verifying one. A calibrated pilot reached a ceiling: the items were too easy for the comparison to reveal the intended difference.",
    finding:
      "An inconclusive experiment stays inconclusive. A ceiling effect is not evidence that two capabilities are equivalent.",
  },
  {
    name: "A competence check",
    note: "Replicating grokking",
    path: "03-competence-check",
    heading: "First, reproduce something real.",
    body: "A separate replication checked whether the research process could reproduce grokking: a small arithmetic network shifting from memorization to generalization. All five reported seeds grokked.",
    finding:
      "This is a replication result reported in the repository, not a new training run in this app.",
  },
  {
    name: "Can judges be gamed?",
    note: "Independent errors, shared limits",
    path: "04-can-the-judges-be-gamed",
    heading: "More judges can share one blind spot.",
    body: "Five small experiments explored framing and correlated error. Independent judges helped with independent mistakes, while adding more judges did not remove a shared constraint.",
    finding:
      "A larger panel is not automatically stronger evidence. Check what its members can independently observe.",
  },
  {
    name: "Why this is hard",
    note: "Novelty and answer keys",
    path: "05-why-this-is-hard",
    heading: "Where does the answer key live?",
    body: "The research surveys the difficulty of certifying both novelty and correctness without relying on a known answer, a judge’s prior knowledge, a corpus, or a later experiment. It connects the question to Fodor’s problem of concept acquisition.",
    finding:
      "The project’s philosophical interpretation is an argument to inspect, not a theorem proved by this benchmark.",
  },
  {
    name: "Building Apex",
    note: "Adversarial testing",
    path: "06-building-apex",
    heading: "Try to break your own conclusion.",
    body: "A dedicated adversarial judging setup tested disguised, combined, and cross-domain ideas. The reported total was ten matched ideas, zero stumped cases, across seven fields.",
    finding:
      "These finite test results support a bounded conclusion about these cases. They cannot establish universal impossibility.",
  },
  {
    name: "The follow-up",
    note: "Positive control, honest null",
    path: "07-followup-test-2026",
    heading: "A useful result can be a null.",
    body: "Lone judges and panels both traced two medical claims to the relevant research-fraud records, yielding no panel advantage on those cases. A separate invented-mechanism positive control was correctly rejected by three judges.",
    finding:
      "Well-indexed retraction records may make this task easy for a single search. The result does not settle whether panels reason more deeply elsewhere.",
  },
];
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 3800);
}
async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      data.message || data.error || "The local request failed. Please retry.",
    );
  return data;
}
function heading(name, description, actions = "") {
  return `<header class="page-heading"><div><h1>${name}</h1><p>${description}</p></div><div class="actions">${actions}</div></header>`;
}
function metric(label, value, note) {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value num">${value}</div><div class="metric-note">${note}</div></div>`;
}
function render() {
  state.view = [
    "overview",
    "guide",
    "benchmark",
    "runs",
    "connectome",
    "research",
  ].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "overview";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = a.dataset.nav === state.view;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#breadcrumb").textContent =
    `Workspace / ${{ overview: "Introduction & demos", guide: "Live demo guide", benchmark: "Benchmarks", runs: "Evaluation runs", connectome: "FlyWire connectome", research: "Einstein’s Jump" }[state.view]}`;
  $("#run-count").textContent = state.history.length;
  $("#nav-count").textContent = state.cases.length || "—";
  $("#page").innerHTML =
    state.view === "guide"
      ? renderGuide()
      : state.view === "overview"
        ? renderOverview()
        : state.view === "runs"
          ? renderRuns()
          : state.view === "research"
            ? renderResearch()
            : state.view === "connectome"
              ? renderConnectome()
              : renderBenchmark();
}
function renderGuide() {
  const steps = [
    [
      "Introduce the project",
      "Say: AfterThought is a local evidence workspace. It checks research answers against explicit rules, makes experimental results inspectable, and explores real published fly-neuron metadata.",
      "Explain the three parts: Deep Research Bench supplies the scorer, Einstein’s Jump supplies the research notebook, and FlyWire supplies a real metadata snapshot.",
      "go-overview",
      "Open introduction",
    ],
    [
      "Run a passing example",
      "Click the button below. It submits the authored, 111-word Python 3.13 example and its official documentation URL to the real Python runner.",
      "Expected: 1 of 1 case passed; regex, citation count and word count each show 100%. These are structural checks, not a fact-checking verdict.",
      "demo-score",
      "Run passing example",
    ],
    [
      "Show why an answer fails",
      "Run the short answer with no citation. Inspect the failure details rather than presenting a score without an explanation.",
      "Expected: the Python 3.13 case fails all three checks. Explain that changing the input changes the measured result, so this is a working evaluation, not a prerecorded screen.",
      "demo-fail",
      "Run failing example",
    ],
    [
      "Run the suite and export evidence",
      "Run all ten public cases with the deliberately weak deterministic mock. Inspect the per-case checks, then use Export JSON. Evaluation runs also offers Export Markdown.",
      "Expected: ten scored cases, labeled Deterministic mock. The current mock fails the overall case contracts. No research provider or LLM judge has been called.",
      "demo-suite",
      "Run 10-case mock suite",
    ],
    [
      "Query real fly-neuron data",
      "Find GABA neurons in the preloaded FlyWire FAFB v783 snapshot. Then return here and inspect the exact-neuron example below.",
      "Expected: 139,255 total records and 16,017 GABA matches. The exact ID 720575940598267657 has source group ME, predicted transmitter GABA and confidence 0.74. These are metadata predictions, not measured activity.",
      "demo-neurons",
      "Find GABA neurons",
    ],
    [
      "Inspect one neuron precisely",
      "Search one complete neuron ID. Notice that all 18 digits are preserved; the identifier is handled as text rather than rounded as a JavaScript number.",
      "Expected: exactly one matching record, ID 720575940598267657. Use the source and license links to show where the data comes from.",
      "demo-neuron",
      "Find the exact neuron",
    ],
    [
      "Explain the research and its limits",
      "Open The follow-up in Einstein’s Jump. Both lone judges and panels found the relevant fraud records on the two reported cases; the project reported an honest null result.",
      "Close with: The evaluation and dataset queries run live. A passing structural check does not certify truth or novelty. This app is not a brain simulation and does not use a fly brain to reason.",
      "demo-research",
      "Open the follow-up",
    ],
  ];
  return `${heading("Live demo guide", "A 5–7 minute walkthrough. Use the buttons to run each real step.", '<button data-action="go-overview">Project introduction</button>')}
  <section class="panel synopsis"><h2>Your 30-second synopsis</h2><p>AfterThought turns research claims into inspectable evidence. It combines a transparent evaluation framework, a notebook about the limits of AI judging, and a searchable connection to published FlyWire neuron metadata. Every score and dataset count has a visible source and a clear boundary.</p><p><strong>Before presenting:</strong> keep this localhost server running. The Windows launcher preloads FlyWire; without it, use <code>python run_app.py --preload-connectome</code>. No provider keys are needed. The first download requires internet; a valid local cache works afterward.</p></section>
  <ol class="guide-list">${steps.map(([name, say, expected, action, label]) => `<li class="panel guide-step"><h2>${esc(name)}</h2><p>${esc(say)}</p><p class="expected"><strong>What to show:</strong> ${esc(expected)}</p><button class="primary" data-action="${action}">${icon("play")}${esc(label)}</button></li>`).join("")}</ol>
  <section class="panel synopsis"><h2>If something is unavailable</h2><p>For a dataset error, retry in FlyWire connectome and check the internet connection. The scoring demo needs no network. If there is no report to export, run an evaluation first. Use the Live demo guide navigation item to return here after each step.</p><button data-action="export-json" ${state.run ? "" : "disabled"}>${icon("download")}Export the latest result</button></section>`;
}
function renderOverview() {
  const d = state.connectome;
  return `${heading("AfterThought", "An evidence workspace by Arsh Talkhani.", '<button class="primary" data-action="demo-score">' + icon("play") + "Start scoring demo</button>")}
  <section class="panel overview-lead"><h2>From an answer to evidence.</h2><p>AI-generated research can sound convincing while missing the question, the sources, or the substance. AfterThought makes those expectations explicit, runs reproducible checks, and shows the reason behind every score.</p><p>This app brings together three pieces of work: the <strong>Deep Research Bench</strong> evaluation framework, the <strong>Einstein’s Jump</strong> investigation into judging novelty, and a real connection to the published <strong>FlyWire fly-brain metadata</strong>.</p><ol class="workflow"><li><strong>Choose a question</strong><span>Inspect a versioned case and its scoring rules.</span></li><li><strong>Evaluate an answer</strong><span>Run the actual regex, citation and length checks.</span></li><li><strong>Inspect the evidence</strong><span>Review each result and export the full report.</span></li></ol></section>
  <div class="overview-grid"><section class="panel demo-card"><h2>A live research evaluation</h2><p>Score the supplied Python 3.13 example against the actual benchmark. Then shorten the answer or remove its citation and evaluate again to see which checks change.</p><div class="demo-actions"><button class="primary" data-action="demo-score">${icon("play")}Evaluate the example</button><button data-action="demo-fail">Show a failing answer</button></div><small>No AI response is generated. The example is authored demonstration text; scoring runs live in Python.</small></section>
  <section class="panel demo-card"><h2>A real fly-connectome connection</h2><p>A connectome maps neural wiring. FlyWire’s published adult fruit-fly dataset also provides neuron metadata. Here you can search exact neuron IDs, explore source groups, and compare predicted transmitter counts.</p><div class="demo-actions"><button class="primary" data-action="demo-neurons">${icon("network")}Find GABA neurons</button><a class="external-link" href="#connectome">Open metadata explorer ↗</a></div><small>${d ? `${fmt(d.total_neurons)} real records loaded from FAFB v783.` : state.preloaded ? "The published snapshot is preloaded on this server." : "The snapshot loads on demand; use --preload-connectome before a demo."} CC BY-NC 4.0; cached locally.</small></section></div>
  <section class="panel synopsis"><h2>What the work shows</h2><p><strong>Evaluation:</strong> ten public cases make research-answer structure measurable. Passing these checks does not prove the facts or citations are correct.</p><p><strong>Novelty:</strong> Einstein’s Jump documents seven phases of experiments, negative results and methodological limits. A confident judge is not a certificate of a new discovery.</p><p><strong>Connectomics:</strong> this app actively filters and summarizes real published neuron records. It does not load synaptic edges, run a neural model, simulate a fly, or use a brain to reason. Those would require a separate, validated simulation pipeline.</p><a class="external-link" href="#research">Inspect the research synopsis and original experiments ${icon("arrow")}</a></section>`;
}
function renderBenchmark() {
  const cells = state.run?.run.cells || [],
    passed = cells.filter((c) => c.passed).length;
  const actions = `<button title="Run a demo or evaluate an answer to export its report" data-action="export-json" ${state.run ? "" : "disabled"}>${icon("download")}Export JSON</button><button class="primary" data-action="run-demo" ${state.busy || !state.selected.size ? "disabled" : ""}>${state.busy ? '<span class="spinner"></span>' : icon("play")}${state.busy ? "Evaluating…" : "Run demo suite"}</button>`;
  return `${heading("Benchmark workspace", "Good research should survive a closer look.", actions)}
  ${state.error ? `<div class="error-box" role="alert">${esc(state.error)}</div>` : ""}
  <div class="metric-strip">${metric("Public benchmark cases", state.cases.length || "—", "Versioned, inspectable questions")}${metric("Research categories", new Set(state.cases.map((c) => c.category)).size || "—", "From recency to code reasoning")}${metric("Cases evaluated", cells.length ? `${passed}<small>/ ${cells.length} passed</small>` : '<span aria-hidden="true">—</span><span class="sr-only">None yet</span>', state.run ? modeLabel(state.run.mode) : "Run a demo or submit an answer")}${metric("Scoring methods", "3", "Regex · citations · word count")}</div>
  <div class="benchmark-grid"><section class="panel" aria-labelledby="suite-heading"><div class="panel-header"><div><h2 id="suite-heading">Public research suite</h2><small>Choose cases, then inspect what each check asks.</small></div><span class="subtle-tag">public-10-v1</span></div>
  <div class="filter-row"><label class="search">${icon("search")}<input id="case-search" aria-label="Search benchmark cases" placeholder="Search cases…" value="${esc(state.filter)}"></label><select id="category-filter" aria-label="Filter by category"><option value="">All categories</option>${[...new Set(state.cases.map((c) => c.category))].map((c) => `<option value="${esc(c)}" ${state.category === c ? "selected" : ""}>${esc(categories[c] || c)}</option>`).join("")}</select></div>
  <table class="case-table"><thead><tr><th><label class="check-target"><input type="checkbox" class="check-box" id="select-all" aria-label="Select all visible cases" ${filteredCases().length && filteredCases().every((c) => state.selected.has(c.id)) ? "checked" : ""}></label></th><th>Research question</th><th class="case-category">Category</th><th class="check-column">Checks</th><th>Last result</th></tr></thead><tbody id="case-list">${renderRows()}</tbody></table><div class="panel-foot"><span id="selection-count">${state.selected.size} of ${state.cases.length} cases selected</span><span>Inspect a row →</span></div></section>
  <aside class="panel detail-panel" id="detail-panel" aria-label="Selected benchmark case">${renderDetail()}</aside></div>
  <div class="scoring-note">${icon("info")}<div><strong>A checkable score, not a claim of truth.</strong>Regex, length and citation counts measure structure. They do not verify facts, open citation URLs, or certify novelty. The demo engine is deliberately limited. No LLM judge is connected.</div></div>`;
}
function filteredCases() {
  const q = state.filter.toLowerCase();
  return state.cases.filter(
    (c) =>
      (!state.category || c.category === state.category) &&
      `${title(c)} ${c.query} ${c.category}`.toLowerCase().includes(q),
  );
}
function updateCaseFilter() {
  const cases = filteredCases();
  $("#case-list").innerHTML = renderRows();
  $("#select-all").checked =
    cases.length > 0 && cases.every((c) => state.selected.has(c.id));
  $("#select-all").disabled = !cases.length;
}
function renderRows() {
  const rows = filteredCases();
  return rows.length
    ? rows
        .map(
          (c) =>
            `<tr class="case-row ${state.active === c.id ? "selected" : ""}" data-case="${esc(c.id)}"><td><label class="check-target"><input type="checkbox" class="check-box" data-select="${esc(c.id)}" aria-label="Select ${esc(title(c))}" ${state.selected.has(c.id) ? "checked" : ""}></label></td><td><button class="case-title" data-case="${esc(c.id)}">${esc(title(c))}</button><span class="case-sub">${esc(categories[c.category] || c.category)} · ${esc(c.severity)}</span></td><td class="case-category">${esc(categories[c.category] || c.category)}</td><td class="check-column num">${c.must_contain_regex.length + (c.min_citation_count != null ? 1 : 0) + (c.min_word_count != null ? 1 : 0)}</td><td>${status(currentCell(c.id))}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5"><div class="empty">No cases match this filter. Try another term.</div></td></tr>';
}
function renderDetail() {
  const c = currentCase();
  if (!c) return '<div class="empty">Loading the public benchmark…</div>';
  const answer = draft(c.id),
    cell = currentCell(c.id);
  return `<div class="detail-top"><div class="form-label">Case details<span class="subtle-tag">${esc(c.severity)}</span></div><h2>${esc(title(c))}</h2><p class="detail-query">${esc(c.query)}</p><div class="contract-pills"><span class="contract-pill">${c.must_contain_regex.length} regex patterns</span><span class="contract-pill">${c.min_citation_count ?? 0}+ citations</span><span class="contract-pill">${c.min_word_count ?? 0}+ words</span></div><details><summary>Inspect scoring rules &amp; judge rubric</summary><div class="details-copy">${esc(c.must_contain_regex.join("\n"))}\n\nRubric (not executed): ${esc(c.judge_criteria)}</div></details></div>
  <div class="detail-body"><form id="answer-form"><label class="form-label" for="answer-text">Try your own answer<button type="button" class="text-button" data-action="sample">${c.id === "recency-python-3-13-features" ? "Load example" : "Clear answer"}</button></label><textarea class="answer-input" id="answer-text" placeholder="Paste a research answer to see exactly which checks it passes…" required maxlength="200000">${esc(answer.text)}</textarea><p class="form-help"><span id="word-count">${answer.text.trim() ? answer.text.trim().split(/\s+/).length : 0}</span> words · Minimum ${c.min_word_count ?? 0}</p><label class="form-label" for="answer-citations">Citation URLs<small>One per line</small></label><textarea id="answer-citations" class="citation-input" placeholder="https://source.example/article" maxlength="100000">${esc(answer.citations)}</textarea><button class="primary full-width" type="submit" ${state.busy ? "disabled" : ""}>${icon("arrow")}Evaluate answer</button><p class="evaluate-note">Runs locally · Server stores no answers</p></form>
  ${
    cell
      ? `<div class="score-result"><div class="form-label">${modeLabel(state.run.mode)} ${status(cell)}</div>${Object.entries(
          cell.scorers,
        )
          .map(
            ([name, s]) =>
              `<div class="score-line"><span class="score-icon ${s.passed ? "" : "fail"}">${s.passed ? icon("check") : icon("cross")}</span>${esc(name)}<span class="num">${Math.round(s.score * 100)}%</span></div><details><summary>${esc(s.detail)}</summary><div class="details-copy">${esc(s.detail)}</div></details>`,
          )
          .join(
            "",
          )}<button class="text-button" data-action="show-answer">Inspect evaluated answer</button></div>`
      : ""
  }</div>`;
}
function renderRuns() {
  return `${heading("Evaluation runs", "A transparent record of this browser session.", `<button data-action="export-md" ${state.run ? "" : "disabled"}>${icon("download")}Export Markdown</button>`)}<div class="run-list">${
    state.history.length
      ? state.history
          .map((r, i) => {
            const cells = r.run.cells,
              passed = cells.filter((c) => c.passed).length;
            return `<article class="panel run-row"><div class="run-title"><h2>${modeLabel(r.mode)}</h2><small>${new Date(r.run.started_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${cells.length} ${cells.length === 1 ? "case" : "cases"} · No LLM judge</small></div><div class="score-bars">${[
              "regex",
              "citation_count",
              "word_count",
            ]
              .map((name) => {
                const vals = cells.map((c) => c.scorers[name]).filter(Boolean);
                const pct = vals.length
                  ? (vals.filter((v) => v.passed).length / vals.length) * 100
                  : 0;
                return `<div class="bar-track" title="${esc(name)}: ${Math.round(pct)}% passed"><div class="bar-fill" style="width:${pct}%"></div></div>`;
              })
              .join(
                "",
              )}</div><span class="num">${passed} / ${cells.length} passed</span><button data-run="${i}">Inspect run ${icon("arrow")}</button></article>`;
          })
          .join("")
      : `<section class="panel empty"><h2>Your first evaluation starts here.</h2><p>Run the public suite, or check one of your own research answers.</p><button class="primary" data-action="go-bench">Open benchmarks ${icon("arrow")}</button></section>`
  }</div><div class="scoring-note">${icon("info")}<div><strong>Session history is temporary.</strong>Reloading clears this list. Export JSON or Markdown to keep a report. Manual submissions and mock output always retain their own labels.</div></div>`;
}
function renderResearch() {
  const p = phases[state.phase];
  return `${heading("Einstein’s Jump", "A research notebook on novelty, judges, and honest negative results.", `<a class="external-link" href="https://github.com/dnarsh/einsteins-jump" target="_blank" rel="noopener noreferrer">Open research repository ↗</a>`)}<div class="research-layout"><nav class="panel phase-list" aria-label="Research phases">${phases.map((p, i) => `<button class="phase-button ${i === state.phase ? "active" : ""}" data-phase="${i}">${esc(p.name)}<small>${esc(p.note)}</small></button>`).join("")}</nav><article class="panel research-article"><h2>${esc(p.heading)}</h2><p>${esc(p.body)}</p><div class="article-callout">${esc(p.finding)}</div><p>The common thread: a confident answer and a checkable answer are different things. AfterThought makes its scoring contracts visible so you can decide what a result actually supports.</p><a class="external-link" href="https://github.com/dnarsh/einsteins-jump/tree/main/${p.path}" target="_blank" rel="noopener noreferrer">Read the original experiment ${icon("arrow")}</a><div class="research-source">Summarized from Arsh’s Einstein’s Jump repository. Historical findings are attributed to that project; no new experiments or AI judging run on this screen.</div></article></div>`;
}
function neuronIllustration() {
  return '<svg viewBox="0 0 280 190" fill="none" aria-hidden="true"><g stroke="#c7ced8" stroke-width="1.5"><path d="M48 38 114 87 53 146m61-59 62-52m-62 52 70 60m-70-60 111 5m-49-57 49 57-41 55M48 38l5 108m123-111 8 112M48 38l128-3"/></g><g fill="#fff" stroke="#8f9aaa" stroke-width="1.5"><circle cx="48" cy="38" r="7"/><circle cx="53" cy="146" r="7"/><circle cx="176" cy="35" r="7"/><circle cx="184" cy="147" r="7"/><circle cx="225" cy="92" r="7"/></g><circle cx="114" cy="87" r="13" fill="#f0f5fc" stroke="#1d5fbf" stroke-width="1.5"/><circle cx="114" cy="87" r="4" fill="#1d5fbf"/><text x="140" y="185" text-anchor="middle" fill="#697380" font-size="10" font-family="Geist,sans-serif">Metadata explorer · schematic illustration</text></svg>';
}
function renderConnectome() {
  const d = state.connectome;
  return `${heading("FlyWire connectome", "Explore real neuron metadata from the published FAFB v783 snapshot.")}<section class="panel connectome-intro"><div><h2>A brain, in inspectable detail.</h2><p>Connect to FlyWire’s public static archive and browse neuron IDs, source groups, predicted neurotransmitters and confidence. Data is retrieved by this local server, without an API key.</p><button class="primary" data-action="load-neurons" ${state.neuronBusy ? "disabled" : ""}>${state.neuronBusy ? '<span class="spinner"></span>' : icon("network")}${state.neuronBusy ? "Loading published snapshot…" : d ? "Refresh metadata view" : "Load FlyWire snapshot"}</button><div class="provenance">FlyWire FAFB v783 · <a href="https://join.flywire.ai/guidelines" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a> · <a href="https://codex.flywire.ai/app/explore" target="_blank" rel="noopener noreferrer">Open Codex ↗</a></div></div><div class="neuron-glyph">${neuronIllustration()}</div></section>${state.neuronError ? `<div class="error-box" role="alert">${esc(state.neuronError)}</div>` : ""}
  ${d ? `<div class="metric-strip">${metric("Neurons in snapshot", fmt(d.total_neurons), "Actual rows in the published archive")}${metric("Matching neurons", fmt(d.matching_neurons), "Current search and transmitter filter")}${metric("Transmitter labels", d.neurotransmitters.length, "Includes unknown predictions")}${metric("Dataset version", "783", "Static snapshot · not live activity")}</div><div class="connectome-grid"><section class="panel distribution"><h2>Predicted transmitters</h2>${d.neurotransmitters.map((t, i) => `<div class="distribution-row"><div class="line"><span>${esc(t.name)}</span><span class="num">${fmt(t.count)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(t.count / d.total_neurons) * 100}%;${i ? "background:#8a96a6" : ""}"></div></div></div>`).join("")}<p class="dataset-notice">Counts describe the entire metadata snapshot. Predictions do not measure neural firing or behavior.</p></section><section class="panel"><div class="panel-header"><div><h2>Neuron explorer</h2><small>Source identifiers are preserved without rounding.</small></div><span class="subtle-tag">${d.neurons.length} shown</span></div><form id="neuron-form" class="filter-row"><label class="search">${icon("search")}<input id="neuron-search" placeholder="Neuron ID or group…" aria-label="Search neuron ID or group" value="${esc(state.neuronQuery)}"></label><select id="transmitter-filter" aria-label="Predicted transmitter"><option value="">All transmitters</option>${d.neurotransmitters.map((t) => `<option ${state.transmitter === t.name ? "selected" : ""} value="${esc(t.name)}">${esc(t.name)}</option>`).join("")}</select><button type="submit" ${state.neuronBusy ? "disabled" : ""}>Search</button></form><table class="case-table neuron-table"><thead><tr><th>Neuron ID</th><th>Group</th><th>Transmitter</th><th>Confidence</th></tr></thead><tbody>${d.neurons.length ? d.neurons.map((n) => `<tr><td class="mono">${esc(n.id)}</td><td>${esc(n.group || "—")}</td><td>${esc(n.neurotransmitter)}</td><td class="num">${n.confidence == null ? "—" : Number(n.confidence).toFixed(2)}</td></tr>`).join("") : '<tr><td colspan="4"><div class="empty">No matching neurons. Try another ID or group.</div></td></tr>'}</tbody></table><div class="panel-foot"><span>First ${d.neurons.length} of ${fmt(d.matching_neurons)} matches</span><a href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer">Source archive ↗</a></div></section></div>` : `<section class="panel empty"><h2>The published data is one click away.</h2><p>The first load retrieves about 1.7 MB. Following searches use the local cache.</p></section>`}<div class="scoring-note">${icon("info")}<div><strong>Real metadata, clearly bounded.</strong>This is a static dataset connection, not a whole-brain simulation, synaptic connectivity viewer or live FlyWire API. Codex’s interactive explorer requires sign-in. Data is cached locally and retains its non-commercial license.</div></div>`;
}
async function evaluate(mode) {
  if (state.busy) return;
  const ids = mode === "manual" ? [state.active] : [...state.selected];
  if (!ids.length) return toast("Select at least one benchmark case.");
  const answers = {};
  if (mode === "manual") {
    const a = draft(state.active);
    if (!a.text.trim()) return toast("Paste an answer before evaluating.");
    answers[state.active] = {
      text: a.text,
      citations: a.citations
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  state.busy = true;
  state.error = "";
  render();
  try {
    const result = await api("/api/run", { case_ids: ids, mode, answers });
    state.run = result;
    state.history.unshift(result);
    state.history = state.history.slice(0, 30);
    toast(
      `${result.run.cells.length} ${result.run.cells.length === 1 ? "case evaluated" : "cases evaluated"} with the local scorers.`,
    );
  } catch (e) {
    state.error = e.message;
  } finally {
    state.busy = false;
    render();
  }
}
function download(format) {
  if (!state.run) return;
  const content =
    format === "json"
      ? JSON.stringify(state.run.run, null, 2)
      : state.run.markdown;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([content], {
      type:
        format === "json" ? "application/json" : "text/markdown;charset=utf-8",
    }),
  );
  a.download = `afterthought-${state.run.mode}-${Date.now()}.${format === "json" ? "json" : "md"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Report exported.");
}
async function loadNeurons() {
  if (state.neuronBusy) return;
  state.neuronBusy = true;
  state.neuronError = "";
  render();
  try {
    state.connectome = await api(
      `/api/connectome?q=${encodeURIComponent(state.neuronQuery)}&transmitter=${encodeURIComponent(state.transmitter)}&limit=30`,
    );
  } catch (e) {
    state.neuronError = e.message;
  } finally {
    state.neuronBusy = false;
    render();
  }
}
const sampleAnswer =
  "Python 3.13 introduced several important improvements. First, its new interactive REPL supports multiline editing, colored prompts, help browsing, and a paste mode, making interactive work more convenient. Second, experimental free-threaded builds can run with the global interpreter lock disabled, allowing suitable threaded programs to use multiple CPU cores. This is an optional build, not the behavior of the standard interpreter. Third, an experimental JIT compiler is available as an opt-in build feature; it is not enabled by default. Other changes include clearer colored tracebacks, defined semantics for the locals() mapping, and default values for type parameters. These are release features rather than a guarantee that every existing application will run faster.";
document.addEventListener("input", (e) => {
  if (e.target.id === "answer-text") {
    draft(state.active).text = e.target.value;
    $("#word-count").textContent = e.target.value.trim()
      ? e.target.value.trim().split(/\s+/).length
      : 0;
  }
  if (e.target.id === "answer-citations")
    draft(state.active).citations = e.target.value;
  if (e.target.id === "case-search") {
    state.filter = e.target.value;
    updateCaseFilter();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "category-filter") {
    state.category = e.target.value;
    updateCaseFilter();
  }
  if (e.target.dataset.select) {
    e.target.checked
      ? state.selected.add(e.target.dataset.select)
      : state.selected.delete(e.target.dataset.select);
    render();
  }
  if (e.target.id === "select-all") {
    filteredCases().forEach((c) =>
      e.target.checked ? state.selected.add(c.id) : state.selected.delete(c.id),
    );
    render();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "answer-form") {
    e.preventDefault();
    evaluate("manual");
  }
  if (e.target.id === "neuron-form") {
    e.preventDefault();
    state.neuronQuery = $("#neuron-search").value;
    state.transmitter = $("#transmitter-filter").value;
    loadNeurons();
  }
});
document.addEventListener("click", (e) => {
  if (e.target.closest(".check-target")) return;
  const row = e.target.closest("[data-case]");
  if (row) {
    state.active = row.dataset.case;
    render();
    return;
  }
  const phase = e.target.closest("[data-phase]");
  if (phase) {
    state.phase = Number(phase.dataset.phase);
    render();
    return;
  }
  const run = e.target.closest("[data-run]");
  if (run) {
    state.run = state.history[Number(run.dataset.run)];
    state.active = state.run.run.cells[0].case_id;
    location.hash = "benchmark";
    render();
    return;
  }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "go-overview") location.hash = "overview";
  if (action === "demo-suite") {
    state.selected = new Set(state.cases.map((c) => c.id));
    location.hash = "benchmark";
    render();
    evaluate("mock");
  }
  if (action === "demo-neuron") {
    state.neuronQuery = "720575940598267657";
    state.transmitter = "GABA";
    location.hash = "connectome";
    render();
    loadNeurons();
  }
  if (action === "demo-research") {
    state.phase = 6;
    location.hash = "research";
    render();
  }
  if (action === "demo-score" || action === "demo-fail") {
    state.active = "recency-python-3-13-features";
    const answer = draft(state.active);
    answer.text = action === "demo-score" ? sampleAnswer : "Python is great.";
    answer.citations =
      action === "demo-score"
        ? "https://docs.python.org/3.13/whatsnew/3.13.html"
        : "";
    location.hash = "benchmark";
    render();
    evaluate("manual");
  }
  if (action === "demo-neurons") {
    state.neuronQuery = "";
    state.transmitter = "GABA";
    location.hash = "connectome";
    render();
    loadNeurons();
  }
  if (action === "run-demo") evaluate("mock");
  if (action === "export-json") download("json");
  if (action === "export-md") download("md");
  if (action === "go-bench") location.hash = "benchmark";
  if (action === "load-neurons") loadNeurons();
  if (action === "sample") {
    const a = draft(state.active);
    a.text =
      state.active === "recency-python-3-13-features" ? sampleAnswer : "";
    a.citations =
      state.active === "recency-python-3-13-features"
        ? "https://docs.python.org/3.13/whatsnew/3.13.html"
        : "";
    render();
  }
  if (action === "show-answer") {
    const c = currentCell(state.active);
    if (c) {
      draft(state.active).text = c.answer_text;
      draft(state.active).citations = c.answer_citations.join("\n");
      render();
      $("#answer-text").focus();
    }
  }
});
$("#menu-button").addEventListener("click", () => {
  const open = $("#navigation").classList.toggle("open");
  $("#menu-button").setAttribute("aria-expanded", String(open));
});
window.addEventListener("hashchange", () => {
  $("#navigation").classList.remove("open");
  $("#menu-button").setAttribute("aria-expanded", "false");
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
render();
try {
  const [data, health] = await Promise.all([
    api("/api/cases"),
    api("/api/health"),
  ]);
  state.cases = data.cases;
  state.selected = new Set(data.cases.map((c) => c.id));
  state.active = data.cases[0]?.id;
  state.preloaded = health.connectome_preloaded === true;
  $("#server-state").innerHTML =
    '<span class="local-dot"></span>Local scoring engine ready';
  render();
  if (state.preloaded) {
    try {
      state.connectome = await api("/api/connectome?limit=30");
      render();
    } catch {
      /* The explorer retains its explicit retry action. */
    }
  }
} catch (e) {
  $("#server-state").textContent = "Local engine unavailable";
  state.error = e.message;
  render();
}
