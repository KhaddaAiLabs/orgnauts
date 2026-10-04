/**
 * visual.ts — D-107: a self-contained HTML page per stage that anyone can open in a browser:
 *   work/<KEY>/visuals/intake.html   "What is the issue" · "What must be done" · one worked example   (from 01-intake.json → visual)
 *   work/<KEY>/visuals/plan.html     "Root cause" · "The fix, step by step" · one worked example        (from 03-plan.json  → visual)
 *
 * Deterministic: the agent writes the `visual` block in the stage contract (headline, steps, where it breaks, mermaid
 * sources, example); the toolkit renders it. No LLM, no network at render time. Mermaid is drawn in the browser by the
 * mermaid library loaded from cdnjs when the page is opened; if that is blocked, the diagram SOURCE is still shown as text.
 * Every piece of agent text is HTML-escaped: a ticket cannot inject markup into the page.
 */
import path from "node:path";
import { vaultDir, type ProjectPaths } from "../core/paths.js";
import { ensureDir, exists, readJsonOr, writeTextAtomic } from "../core/util.js";

export interface VisualBlock {
  issue: { headline: string; steps: string[]; where_it_breaks: string };
  fix: { headline: string; steps: string[] };
  example: { record: string; today: string; expected: string };
  mermaid: { issue: string; fix: string };
  glossary?: { term: string; meaning: string }[];
  open_questions?: string[];
}

export const VISUAL_SOURCE: Record<string, { contract: string; title: string; issueTitle: string; fixTitle: string }> = {
  intake: { contract: "01-intake.json", title: "Intake", issueTitle: "1 · What is the issue?", fixTitle: "2 · What must be done?" },
  plan:   { contract: "03-plan.json",   title: "Plan",   issueTitle: "1 · Root cause (what breaks today)", fixTitle: "2 · The fix, step by step" },
};

const MERMAID_START = /^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b|^\s*sequenceDiagram\b|^\s*stateDiagram(-v2)?\b|^\s*classDiagram\b|^\s*journey\b/;

/** Structural checks the gate relies on (schema validation happens in contract-check). */
export function visualProblems(v: VisualBlock | undefined): string[] {
  const out: string[] = [];
  if (!v) return ["visual block missing"];
  if (!v.issue?.headline || v.issue.headline.trim().length < 10) out.push("issue.headline too short (≥ 10 chars)");
  if (!Array.isArray(v.issue?.steps) || v.issue.steps.length < 2) out.push("issue.steps needs ≥ 2 steps");
  if (!v.issue?.where_it_breaks || v.issue.where_it_breaks.trim().length < 10) out.push("issue.where_it_breaks too short");
  if (!v.fix?.headline || v.fix.headline.trim().length < 10) out.push("fix.headline too short (≥ 10 chars)");
  if (!Array.isArray(v.fix?.steps) || v.fix.steps.length < 1) out.push("fix.steps needs ≥ 1 step");
  for (const k of ["record", "today", "expected"] as const) if (!v.example?.[k] || v.example[k].trim().length < 5) out.push(`example.${k} too short`);
  for (const k of ["issue", "fix"] as const) {
    const src = v.mermaid?.[k] ?? "";
    if (!MERMAID_START.test(src)) out.push(`mermaid.${k} must start with flowchart/graph/sequenceDiagram/stateDiagram`);
    else if (!/-->|---|->>|-->>|\|/.test(src) || src.split("\n").filter((l) => l.trim()).length < 3) out.push(`mermaid.${k} is trivial (needs ≥ 2 connected nodes)`);
  }
  if (/<\/?(script|iframe|object|embed)\b/i.test(JSON.stringify(v))) out.push("visual text may not contain script/iframe tags");
  return out;
}

export interface RenderResult { file: string; relative: string; problems: string[]; rendered: boolean }

export function renderStageVisual(p: ProjectPaths, ticket: string, stage: string): RenderResult {
  const src = VISUAL_SOURCE[stage];
  const vault = vaultDir(p, ticket);
  const outDir = path.join(vault, "visuals");
  const file = path.join(outDir, `${stage}.html`);
  const relative = path.relative(p.root, file);
  if (!src) return { file, relative, problems: [`no visual defined for stage ${stage}`], rendered: false };
  const contract = readJsonOr<{ visual?: VisualBlock; summary?: string; classification?: string; root_cause?: string; confidence?: number } | undefined>(path.join(vault, src.contract), undefined);
  if (!contract) return { file, relative, problems: [`${src.contract} missing`], rendered: false };
  const problems = visualProblems(contract.visual);
  if (problems.length) return { file, relative, problems, rendered: false };
  const v = contract.visual!;
  const title = readJsonOr<{ title?: string }>(path.join(vault, "ticket.json"), {}).title ?? ticket;
  ensureDir(outDir);
  writeTextAtomic(file, renderHtml({ ticket, title, stage, stageTitle: src.title, issueTitle: src.issueTitle, fixTitle: src.fixTitle, v, summary: contract.summary ?? contract.root_cause, classification: contract.classification, confidence: contract.confidence }));
  return { file, relative, problems: [], rendered: true };
}

export function visualExists(p: ProjectPaths, ticket: string, stage: string): boolean {
  return exists(path.join(vaultDir(p, ticket), "visuals", `${stage}.html`));
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function steps(list: string[]): string {
  return `<ol class="steps">${list.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
}

function renderHtml(o: { ticket: string; title: string; stage: string; stageTitle: string; issueTitle: string; fixTitle: string; v: VisualBlock; summary?: string; classification?: string; confidence?: number }): string {
  const { v } = o;
  const glossary = v.glossary?.length ? `<section class="card"><h2>Words used above</h2><dl>${v.glossary.map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd>`).join("")}</dl></section>` : "";
  const questions = v.open_questions?.length ? `<section class="card warn"><h2>Open questions for you</h2><ul>${v.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></section>` : "";
  const meta = [o.classification ? `Type: ${esc(o.classification)}` : "", typeof o.confidence === "number" ? `Confidence: ${Math.round(o.confidence * 100)}%` : "", `Stage: ${esc(o.stageTitle)}`].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.ticket)} · ${esc(o.stageTitle)} visual</title>
<style>
  :root{--bg:#f7f8fb;--card:#fff;--fg:#1c2230;--muted:#5d6678;--line:#dde2ec;--issue:#b4232c;--fix:#1f7a4d;--ex:#0e6f8f;--warn:#b86a00}
  @media (prefers-color-scheme: dark){:root{--bg:#12161f;--card:#1a2030;--fg:#e8ecf5;--muted:#a3acc0;--line:#303a52;--issue:#f08a9a;--fix:#6fcf98;--ex:#5fc0de;--warn:#f0b25a}}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:960px;margin:0 auto;padding:28px 16px 64px}
  h1{font-size:clamp(22px,3.5vw,32px);margin:0 0 6px;line-height:1.2}
  h2{font-size:19px;margin:0 0 12px}
  .meta{color:var(--muted);font-size:13px;margin-bottom:22px}
  .summary{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:18px}
  .card.issue{border-left-color:var(--issue)} .card.issue h2{color:var(--issue)}
  .card.fix{border-left-color:var(--fix)} .card.fix h2{color:var(--fix)}
  .card.example{border-left-color:var(--ex)} .card.example h2{color:var(--ex)}
  .card.warn{border-left-color:var(--warn)} .card.warn h2{color:var(--warn)}
  .headline{font-size:17px;font-weight:600;margin:0 0 10px}
  .steps{margin:0 0 12px;padding-left:22px} .steps li{margin:6px 0}
  .breaks{background:color-mix(in srgb,var(--issue) 10%,transparent);border-radius:8px;padding:10px 12px;margin-top:8px}
  .diagram{margin-top:14px;border:1px dashed var(--line);border-radius:8px;padding:10px;overflow-x:auto}
  .diagram .label{font-size:12px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
  pre.mermaid{margin:0;background:transparent;font:13px/1.4 ui-monospace,Menlo,monospace;white-space:pre}
  .example-grid{display:grid;grid-template-columns:1fr;gap:10px}
  @media(min-width:720px){.example-grid{grid-template-columns:1fr 1fr 1fr}}
  .ex{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;min-width:0;word-wrap:break-word}
  .ex .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  dl{margin:0} dt{font-weight:600;margin-top:8px} dd{margin:2px 0 0 0;color:var(--muted)}
  footer{color:var(--muted);font-size:12px;margin-top:28px}
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(o.ticket)} — ${esc(o.title)}</h1>
  <div class="meta">${meta} · generated by Orgnauts from <code>work/${esc(o.ticket)}/${esc(VISUAL_SOURCE[o.stage]?.contract ?? "")}</code></div>
  ${o.summary ? `<div class="summary">${esc(o.summary)}</div>` : ""}

  <section class="card issue">
    <h2>${esc(o.issueTitle)}</h2>
    <p class="headline">${esc(v.issue.headline)}</p>
    ${steps(v.issue.steps)}
    <div class="breaks"><strong>Where it breaks:</strong> ${esc(v.issue.where_it_breaks)}</div>
    <div class="diagram"><div class="label">Diagram · today</div><pre class="mermaid">${esc(v.mermaid.issue)}</pre></div>
  </section>

  <section class="card fix">
    <h2>${esc(o.fixTitle)}</h2>
    <p class="headline">${esc(v.fix.headline)}</p>
    ${steps(v.fix.steps)}
    <div class="diagram"><div class="label">Diagram · after</div><pre class="mermaid">${esc(v.mermaid.fix)}</pre></div>
  </section>

  <section class="card example">
    <h2>3 · One real example</h2>
    <div class="example-grid">
      <div class="ex"><div class="k">The record</div>${esc(v.example.record)}</div>
      <div class="ex"><div class="k">What happens today</div>${esc(v.example.today)}</div>
      <div class="ex"><div class="k">What should happen</div>${esc(v.example.expected)}</div>
    </div>
  </section>
  ${questions}
  ${glossary}
  <footer>Diagrams are drawn by mermaid when this file is opened in a browser with internet access; without it, the diagram source is shown as text. Nothing on this page was fetched from the internet by an agent.</footer>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js"></script>
<script>if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'default',securityLevel:'strict'});}</script>
</body>
</html>
`;
}
