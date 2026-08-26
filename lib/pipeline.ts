import { updateJob } from "./store";
import { codexJson } from "./codex";
import type { Bbox, Highlight, JobResult, OcrPage } from "./types";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8100";

async function workerPost<T>(path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `OCR worker is not reachable at ${WORKER_URL} — start it with scripts/start-worker.ps1`
    );
  }
  if (!res.ok) throw new Error(`OCR worker ${path} failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function ocr(
  jobId: string,
  kind: "qp" | "ans",
  filePath: string,
  onPage?: (done: number, total: number) => void
): Promise<OcrPage[]> {
  const { pages } = await workerPost<
    { pages: (Omit<OcrPage, "markdown" | "regions"> & { text: string })[] }
  >("/render", { job_id: jobId, kind, file_path: filePath });

  // Question papers are usually digital PDFs: their embedded text layer is
  // perfect, needs no bounding boxes, and skips the GPU entirely. OCR remains
  // the path for scanned papers and for answer sheets (which need boxes).
  if (kind === "qp" && pages.reduce((n, p) => n + p.text.length, 0) > 200) {
    return pages.map((p) => ({ ...p, markdown: p.text, regions: [] }));
  }

  const out: OcrPage[] = [];
  for (const p of pages) {
    const r = await workerPost<{ markdown: string; regions: OcrPage["regions"] }>("/ocr_page", {
      job_id: jobId,
      kind,
      index: p.index,
    });
    out.push({ ...p, ...r });
    onPage?.(out.length, pages.length);
  }
  return out;
}

// ---------- codex call 1: structure the questions ----------

interface ExtractedQuestion {
  qid: string;
  number: string;
  part: string | null;
  label: string;
  text: string;
  marks: number;
  orGroup: string | null;
}

const QUESTIONS_SCHEMA = {
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
        },
        required: ["qid", "number", "part", "label", "text", "marks", "orGroup"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

async function extractQuestions(qpPages: OcrPage[]): Promise<ExtractedQuestion[]> {
  const paper = qpPages
    .map((p) => `--- PAGE ${p.index + 1} ---\n${p.markdown}`)
    .join("\n\n");
  const prompt = `You are given the OCR text of an exam question paper. Extract EVERY question in the exact printed order.

Rules:
- Preserve the original printed numbering exactly (in "label", e.g. "3", "11 (a)").
- Treat labelled sub-parts as SEPARATE entries, whatever the labelling style: "11 (a)"/"11 (b)", "Q1 part 1"/"part 2", "1 (i)"/"1 (ii)", "2.1"/"2.2" — each becomes its own entry with number = the main question number and part = the sub-label ("a", "2", "ii", ...). A question without sub-parts has part=null.
- "text" is the full question text (include any shared stem/context needed to understand a sub-part, but do not merge sub-parts).
- "marks" is the printed maximum marks for that question/sub-part. If not printed, estimate sensibly from question type (1 for MCQ/one-liner, 2-3 for short answer, 5 for long/diagram) — never 0.
- OPTIONAL/OR questions: when the paper offers alternatives ("OR" between two questions, "Answer any one of the following", "Either ... Or ..."), extract EVERY alternative as its own entry and give all alternatives in one choice-set the same "orGroup" id (e.g. "or1"). Questions that are not part of a choice get orGroup=null. Only alternatives of each other share an orGroup — never put a whole section in one group unless the paper says "answer any one".
- "qid" is a unique id like "q1", "q11a".
- Ignore headers, instructions, section titles — they are not questions.

QUESTION PAPER OCR:
${paper}`;
  const out = await codexJson<{ questions: ExtractedQuestion[] }>(prompt, QUESTIONS_SCHEMA);
  return out.questions;
}

// ---------- codex call 2: map answers to questions + grade ----------

interface MapResult {
  results: {
    qid: string;
    answered: boolean;
    regionIds: string[];
    score: number;
    feedback: string;
  }[];
  unmatched: { regionIds: string[]; note: string }[];
  overall: { summary: string };
}

const MAP_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qid: { type: "string" },
          answered: { type: "boolean" },
          regionIds: { type: "array", items: { type: "string" } },
          score: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["qid", "answered", "regionIds", "score", "feedback"],
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
  required: ["results", "unmatched", "overall"],
  additionalProperties: false,
};

async function mapAndGrade(questions: ExtractedQuestion[], ansPages: OcrPage[]): Promise<MapResult> {
  const regionsText = ansPages
    .map((p) =>
      p.regions
        .map((r, i) => `[p${p.index}_r${i}] (page ${p.index + 1}) ${r.text.replace(/\s+/g, " ").slice(0, 600)}`)
        .join("\n")
    )
    .join("\n");
  const questionsText = questions
    .map(
      (q) =>
        `${q.qid} | Q${q.label} | max ${q.marks} marks${
          q.orGroup ? ` | OR-choice group ${q.orGroup} (student answers ONE of these)` : ""
        } | ${q.text}`
    )
    .join("\n");

  const prompt = `You are grading a student's handwritten answer sheet that was OCR'd into text regions.

QUESTIONS (from the question paper):
${questionsText}

ANSWER SHEET REGIONS (id, page, OCR text — reading order within each page):
${regionsText}

Task — for EVERY question qid, produce one result entry:
1. Find which region(s) contain the student's answer to that question. Use the question numbers the student wrote (e.g. "Q2.", "Ans 3", "11 a)") as the primary signal, and answer content similarity as fallback. Answers may be OUT OF ORDER and may SPAN MULTIPLE regions and multiple pages — include ALL regions belonging to the answer (including continuation regions with no number, diagrams, working, equations that clearly belong to it).
2. BE PRECISE about sub-parts: when one written section answers several sub-parts (e.g. "1." and "2." under one "Q2" heading), assign each sub-part ONLY the regions containing ITS answer — never the sibling sub-part's regions. A shared section heading region (e.g. "Q2. ...") belongs only to the FIRST sub-part answered under it. When in doubt between including a neighbouring region or not, leave it out.
3. If a question has no answer anywhere: answered=false, regionIds=[], score=0, feedback briefly noting it was left unanswered. For an OR-choice alternative the student did not attempt (they answered the other alternative), say "Not attempted — the student chose the other option." as feedback.
4. Grade each answered question out of its max marks (integers or .5 steps). Judge correctness and completeness of the STUDENT's answer against the QUESTION. Be fair: OCR noise on handwriting should not be penalized when intent is clear.
5. "feedback": 1-2 sentences addressed to the student, specific to what they wrote.
6. Any region that belongs to NO question (stray notes, doodles, name/roll-number header regions are NOT answers — ignore headers entirely) goes in "unmatched" with a short note, grouped sensibly. Regions used in results must not appear in unmatched.
7. "overall.summary": 2-3 sentences for the teacher on the student's performance, strengths and gaps.`;
  return codexJson<MapResult>(prompt, MAP_SCHEMA);
}

// ---------- assembly ----------

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
    (byPage.get(page.index) ?? byPage.set(page.index, []).get(page.index)!).push([
      ...region.bbox,
    ]);
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

export async function runPipeline(jobId: string, qpPath: string, ansPath: string) {
  try {
    updateJob(jobId, { stage: "reading_qp", progress: 5, detail: "Reading question paper" });
    const qpPages = await ocr(jobId, "qp", qpPath, (done, total) =>
      updateJob(jobId, { progress: 5 + Math.round((done / total) * 25) })
    );

    updateJob(jobId, { stage: "reading_answers", progress: 30, detail: "Reading answer sheet" });
    const ansPages = await ocr(jobId, "ans", ansPath, (done, total) =>
      updateJob(jobId, { progress: 30 + Math.round((done / total) * 30) })
    );

    updateJob(jobId, { stage: "extracting_questions", progress: 60, detail: "Extracting questions" });
    const questions = await extractQuestions(qpPages);
    if (!questions.length) throw new Error("No questions could be extracted from the question paper");

    updateJob(jobId, { stage: "mapping_grading", progress: 75, detail: "Mapping answers & grading" });
    const mapped = await mapAndGrade(questions, ansPages);

    const resultByQid = new Map(mapped.results.map((r) => [r.qid, r]));
    const answeredInGroup = new Map<string, boolean>();
    for (const q of questions) {
      if (q.orGroup && resultByQid.get(q.qid)?.answered) answeredInGroup.set(q.orGroup, true);
    }
    const questionResults = questions.map((q) => {
      const r = resultByQid.get(q.qid);
      const score = r ? Math.max(0, Math.min(r.score, q.marks)) : 0;
      const answered = r?.answered ?? false;
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
        score,
        feedback: r?.feedback ?? "No answer found for this question.",
        highlights: r ? clusterHighlights(r.regionIds, ansPages) : [],
      };
    });

    // total: each OR choice-set counts once — the attempted alternative's marks
    const groupOf = new Map(questions.map((q) => [q.qid, q.orGroup]));
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
      unmatched: mapped.unmatched
        .map((u) => ({ note: u.note, highlights: clusterHighlights(u.regionIds, ansPages) }))
        .filter((u) => u.highlights.length > 0),
      overall: {
        score: questionResults.reduce((s, q) => s + q.score, 0),
        maxScore,
        summary: mapped.overall.summary,
      },
      answerPages: ansPages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
    };

    updateJob(jobId, { stage: "done", progress: 100, detail: "Done", result });
  } catch (e) {
    updateJob(jobId, {
      stage: "error",
      detail: "Failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
