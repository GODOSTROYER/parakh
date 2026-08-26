import { writeFile } from "fs/promises";
import path from "path";
import { updateJob } from "./store";
import { assertCodexReady, codexJson } from "./codex";
import type { Bbox, Highlight, JobResult, OcrPage } from "./types";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8100";

async function workerPost<T>(pathName: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `OCR worker is not reachable at ${WORKER_URL} — start it with scripts/start-worker.ps1`
    );
  }
  if (!res.ok) throw new Error(`OCR worker ${pathName} failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ocr(
  jobId: string,
  kind: "qp" | "ans" | "scheme",
  filePath: string,
  onPage?: (done: number, total: number) => void
): Promise<OcrPage[]> {
  const { pages } = await workerPost<
    { pages: (Omit<OcrPage, "markdown" | "regions"> & { text: string })[] }
  >("/render", { job_id: jobId, kind, file_path: filePath });

  // Question papers / marking schemes are usually digital PDFs: the embedded
  // text layer is perfect, needs no boxes, and skips the GPU entirely. OCR
  // remains the path for scans and for answer sheets (which need boxes).
  if (kind !== "ans" && pages.reduce((n, p) => n + p.text.length, 0) > 200) {
    return pages.map((p) => ({ ...p, markdown: p.text, regions: [] }));
  }

  const out: OcrPage[] = [];
  for (const p of pages) {
    let r: { markdown: string; regions: OcrPage["regions"] };
    try {
      r = await workerPost("/ocr_page", { job_id: jobId, kind, index: p.index });
    } catch {
      try {
        r = await workerPost("/ocr_page", { job_id: jobId, kind, index: p.index });
      } catch (e2) {
        // degrade: an unreadable page shouldn't throw away the whole run
        console.error(`OCR failed twice on ${kind} page ${p.index}:`, e2);
        r = { markdown: "", regions: [] };
      }
    }
    out.push({ ...p, ...r });
    onPage?.(out.length, pages.length);
  }
  return out;
}

// ---------- single LLM call: extract + map + grade ----------

interface AnalysisOut {
  questions: {
    qid: string;
    number: string;
    part: string | null;
    label: string;
    text: string;
    marks: number;
    orGroup: string | null;
    answered: boolean;
    regionIds: string[];
    score: number;
    feedback: string;
  }[];
  unmatched: { regionIds: string[]; note: string }[];
  overall: { summary: string };
}

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qid: { type: "string" },
          number: { type: "string" },
          part: { type: ["string", "null"] },
          label: { type: "string" },
          text: { type: "string" },
          marks: { type: "number" },
          orGroup: { type: ["string", "null"] },
          answered: { type: "boolean" },
          regionIds: { type: "array", items: { type: "string" } },
          score: { type: "number" },
          feedback: { type: "string" },
        },
        required: [
          "qid", "number", "part", "label", "text", "marks", "orGroup",
          "answered", "regionIds", "score", "feedback",
        ],
        additionalProperties: false,
      },
    },
    unmatched: {
      type: "array",
      items: {
        type: "object",
        properties: {
          regionIds: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
        required: ["regionIds", "note"],
        additionalProperties: false,
      },
    },
    overall: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
      additionalProperties: false,
    },
  },
  required: ["questions", "unmatched", "overall"],
  additionalProperties: false,
};

function analysisPrompt(qpPages: OcrPage[], ansPages: OcrPage[], schemeText: string | null) {
  const paper = qpPages.map((p) => `--- QP PAGE ${p.index + 1} ---\n${p.markdown}`).join("\n\n");
  const regionsText = ansPages
    .map((p) =>
      p.regions
        .map((r, i) => `[p${p.index}_r${i}] (page ${p.index + 1}) ${r.text.replace(/\s+/g, " ").slice(0, 1500)}`)
        .join("\n")
    )
    .join("\n");

  return `You are an examiner. You get (A) the OCR/text of an exam QUESTION PAPER, (B) the OCR'd text regions of one student's handwritten ANSWER SHEET${schemeText ? ", and (C) the teacher's MARKING SCHEME" : ""}. Produce the full assessment in one pass.

STEP 1 — extract EVERY question, in exact printed order:
- Preserve printed numbering in "label" (e.g. "3", "11 (a)").
- Labelled sub-parts are SEPARATE entries whatever the style — "11 (a)"/"11 (b)", "Q1 part 1"/"part 2", "1 (i)"/"1 (ii)", "2.1"/"2.2" — number = main number, part = sub-label. No sub-parts → part=null.
- "text" = full question text (include shared stem/context a sub-part needs; never merge sub-parts).
- "marks" = printed max marks; if absent, estimate by type (1 MCQ/one-liner, 2-3 short, 5 long/diagram) — never 0.
- OPTIONAL/OR choices ("OR" between questions, "Answer any one", "Either/Or"): every alternative is its own entry, all alternatives of one choice-set share the same "orGroup" id; others get orGroup=null.
- "qid" unique like "q1", "q11a". Ignore headers/instructions/section titles.

STEP 2 — map each question to its answer regions:
- Use the student's own numbering ("Q2.", "Ans 3", "11 a)") as the primary signal, content similarity as fallback. Answers may be OUT OF ORDER and may SPAN multiple regions and pages — include ALL of its regions (continuations, working, equations, diagram captions).
- BE PRECISE about sub-parts: assign each sub-part ONLY the regions containing ITS answer, never a sibling's. A shared heading region belongs only to the first sub-part under it. In doubt → leave it out.
- No answer anywhere: answered=false, regionIds=[], score=0, feedback notes it. For an unattempted OR alternative whose sibling was answered: feedback "Not attempted — the student chose the other option."
- Regions belonging to NO question (stray notes, doodles; name/roll headers are NOT answers) go in "unmatched" with a short note. Regions used in questions must not appear in unmatched.

STEP 3 — grade:
- Score each answered question out of its marks (integers or .5).${schemeText ? " Grade AGAINST THE MARKING SCHEME below — award marks per its criteria." : " Judge correctness and completeness against the question."}
- Be fair: OCR noise on handwriting is not the student's fault when intent is clear.
- "feedback": 1-2 sentences addressed to the student, specific to what they wrote.
- "overall.summary": 2-3 sentences for the teacher — performance, strengths, gaps.

(A) QUESTION PAPER:
${paper}

(B) ANSWER SHEET REGIONS (id, page, text — reading order per page):
${regionsText}
${schemeText ? `\n(C) MARKING SCHEME:\n${schemeText}` : ""}`;
}

// ---------- vision re-grade for diagram questions ----------

const DIAGRAM_RE = /\b(draw|diagram|label|labelled|sketch|graph|figure|plot)\b/i;

const VISION_SCHEMA = {
  type: "object",
  properties: {
    regrades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qid: { type: "string" },
          score: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["qid", "score", "feedback"],
        additionalProperties: false,
      },
    },
  },
  required: ["regrades"],
  additionalProperties: false,
};

async function visionRegrade(
  jobId: string,
  analysis: AnalysisOut,
  highlightsByQid: Map<string, Highlight[]>
): Promise<void> {
  const targets = analysis.questions.filter(
    (q) => q.answered && DIAGRAM_RE.test(q.text) && (highlightsByQid.get(q.qid)?.length ?? 0) > 0
  );
  if (!targets.length) return;

  const images: string[] = [];
  const lines: string[] = [];
  for (const q of targets.slice(0, 6)) {
    // crop each highlight rect of the question (max 2 per question)
    for (const [i, h] of (highlightsByQid.get(q.qid) ?? []).slice(0, 2).entries()) {
      const { path: p } = await workerPost<{ path: string }>("/crop", {
        job_id: jobId,
        kind: "ans",
        index: h.page,
        bbox: h.bbox,
        name: `${q.qid}_${i}`,
      });
      images.push(p);
      lines.push(
        `Image ${images.length}: answer of ${q.qid} (Q${q.label}, max ${q.marks} marks) — "${q.text.slice(0, 200)}" (currently ${q.score}/${q.marks})`
      );
    }
  }
  if (!images.length) return;

  const prompt = `These images are cropped regions of a student's handwritten answer sheet for questions that ask for a DIAGRAM/drawing/graph. The scores so far were graded from OCR text only, which cannot see drawings. Look at each image and re-grade the question out of its max marks, now accounting for the drawing itself (structure, labels, correctness). Keep the score unchanged if the image shows no meaningful drawing beyond the text. Give 1-2 sentences of feedback per question mentioning the visual work.

${lines.join("\n")}`;

  try {
    const out = await codexJson<{ regrades: { qid: string; score: number; feedback: string }[] }>(
      prompt,
      VISION_SCHEMA,
      images
    );
    for (const r of out.regrades) {
      const q = analysis.questions.find((x) => x.qid === r.qid);
      if (q) {
        q.score = r.score;
        q.feedback = r.feedback;
      }
    }
  } catch (e) {
    console.error("vision regrade skipped:", e); // grading already has a text-based score
  }
}

// ---------- highlight assembly ----------

// Merge a question's regions into highlight rects: regions on the same page
// that are vertically adjacent (gap < 2.5% of page height) join one rect;
// distant regions stay separate so unrelated content in between isn't covered.
function clusterHighlights(regionIds: string[], ansPages: OcrPage[]): Highlight[] {
  const byPage = new Map<number, Bbox[]>();
  for (const id of regionIds) {
    const m = /^p(\d+)_r(\d+)$/.exec(id);
    if (!m) continue;
    const page = ansPages.find((p) => p.index === Number(m[1]));
    const region = page?.regions[Number(m[2])];
    if (!page || !region) continue;
    if (!byPage.has(page.index)) byPage.set(page.index, []);
    byPage.get(page.index)!.push([...region.bbox]);
  }
  const GAP = 0.025;
  const out: Highlight[] = [];
  for (const [page, boxes] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    boxes.sort((a, b) => a[1] - b[1]);
    let cur = boxes[0];
    for (const b of boxes.slice(1)) {
      if (b[1] - cur[3] < GAP) {
        cur = [Math.min(cur[0], b[0]), Math.min(cur[1], b[1]), Math.max(cur[2], b[2]), Math.max(cur[3], b[3])];
      } else {
        out.push({ page, bbox: cur });
        cur = b;
      }
    }
    out.push({ page, bbox: cur });
  }
  return out;
}

export async function runPipeline(
  jobId: string,
  qpPath: string,
  ansPath: string,
  schemePath?: string
) {
  try {
    await assertCodexReady();

    updateJob(jobId, { stage: "reading_qp", progress: 5, detail: "Reading question paper" });
    const qpPages = await ocr(jobId, "qp", qpPath, (done, total) =>
      updateJob(jobId, {
        progress: 5 + Math.round((done / total) * 20),
        detail: `Reading question paper · page ${done} of ${total}`,
      })
    );

    let schemeText: string | null = null;
    if (schemePath) {
      updateJob(jobId, { progress: 25, detail: "Reading marking scheme" });
      const schemePages = await ocr(jobId, "scheme", schemePath);
      schemeText = schemePages.map((p) => p.markdown).join("\n\n") || null;
    }

    updateJob(jobId, { stage: "reading_answers", progress: 30, detail: "Reading answer sheet" });
    const ansPages = await ocr(jobId, "ans", ansPath, (done, total) =>
      updateJob(jobId, {
        progress: 30 + Math.round((done / total) * 40),
        detail: `Reading answer sheet · page ${done} of ${total}`,
      })
    );
    if (!ansPages.some((p) => p.regions.length > 0)) {
      throw new Error("Could not read any text regions from the answer sheet");
    }

    updateJob(jobId, { stage: "mapping_grading", progress: 72, detail: "Extracting, mapping & grading" });
    const analysis = await codexJson<AnalysisOut>(
      analysisPrompt(qpPages, ansPages, schemeText),
      ANALYSIS_SCHEMA
    );
    if (!analysis.questions.length) {
      throw new Error("No questions could be extracted from the question paper");
    }

    const highlightsByQid = new Map(
      analysis.questions.map((q) => [q.qid, clusterHighlights(q.regionIds, ansPages)])
    );

    updateJob(jobId, { progress: 88, detail: "Reviewing diagrams" });
    await visionRegrade(jobId, analysis, highlightsByQid);

    // assemble result
    const answeredInGroup = new Map<string, boolean>();
    for (const q of analysis.questions) {
      if (q.orGroup && q.answered) answeredInGroup.set(q.orGroup, true);
    }
    const questionResults = analysis.questions.map((q) => {
      const answered = q.answered;
      // an OR alternative left blank while its sibling was answered = a choice, not a miss
      const skippedOr = !answered && !!q.orGroup && !!answeredInGroup.get(q.orGroup);
      return {
        qid: q.qid,
        label: q.label,
        number: q.number,
        part: q.part,
        text: q.text,
        maxMarks: q.marks,
        answered,
        skippedOr,
        score: Math.max(0, Math.min(q.score, q.marks)),
        feedback: q.feedback,
        highlights: highlightsByQid.get(q.qid) ?? [],
      };
    });

    // total: each OR choice-set counts once — the attempted alternative's marks
    const groupOf = new Map(analysis.questions.map((q) => [q.qid, q.orGroup]));
    const seenGroups = new Set<string>();
    let maxScore = 0;
    for (const q of questionResults) {
      const group = groupOf.get(q.qid);
      if (!group) {
        maxScore += q.maxMarks;
      } else if (!seenGroups.has(group)) {
        seenGroups.add(group);
        const alts = questionResults.filter((x) => groupOf.get(x.qid) === group);
        maxScore += (alts.find((a) => a.answered) ?? alts[0]).maxMarks;
      }
    }

    const result: JobResult = {
      questions: questionResults,
      unmatched: analysis.unmatched
        .map((u) => ({ note: u.note, highlights: clusterHighlights(u.regionIds, ansPages) }))
        .filter((u) => u.highlights.length > 0),
      overall: {
        score: questionResults.reduce((s, q) => s + q.score, 0),
        maxScore,
        summary: analysis.overall.summary,
      },
      answerPages: ansPages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
    };

    // persist so results survive a server restart
    await writeFile(
      path.join(process.cwd(), ".jobs", jobId, "result.json"),
      JSON.stringify(result)
    ).catch(() => {});

    updateJob(jobId, { stage: "done", progress: 100, detail: "Done", result });
  } catch (e) {
    updateJob(jobId, {
      stage: "error",
      detail: "Failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
