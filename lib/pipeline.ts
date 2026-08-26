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
  const { pages } = await workerPost<{ pages: Omit<OcrPage, "markdown" | "regions">[] }>(
    "/render",
    { job_id: jobId, kind, file_path: filePath }
  );
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
        },
        required: ["qid", "number", "part", "label", "text", "marks"],
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
- Treat labelled sub-parts as SEPARATE entries: "11 (a)" and "11 (b)" are two questions, each with number="11" and part="a"/"b". A question without sub-parts has part=null.
- "text" is the full question text (include any shared stem/context needed to understand a sub-part, but do not merge sub-parts).
- "marks" is the printed maximum marks for that question/sub-part. If not printed, estimate sensibly from question type (1 for MCQ/one-liner, 2-3 for short answer, 5 for long/diagram) — never 0.
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
    .map((q) => `${q.qid} | Q${q.label} | max ${q.marks} marks | ${q.text}`)
    .join("\n");

  const prompt = `You are grading a student's handwritten answer sheet that was OCR'd into text regions.

QUESTIONS (from the question paper):
${questionsText}

ANSWER SHEET REGIONS (id, page, OCR text — reading order within each page):
${regionsText}

Task — for EVERY question qid, produce one result entry:
1. Find which region(s) contain the student's answer to that question. Use the question numbers the student wrote (e.g. "Q2.", "Ans 3", "11 a)") as the primary signal, and answer content similarity as fallback. Answers may be OUT OF ORDER and may SPAN MULTIPLE regions and multiple pages — include ALL regions belonging to the answer (including continuation regions with no number, diagrams, working, equations that clearly belong to it).
2. A region containing only the student's own restated heading still counts as part of the answer.
3. If a question has no answer anywhere: answered=false, regionIds=[], score=0, feedback briefly noting it was left unanswered.
4. Grade each answered question out of its max marks (integers or .5 steps). Judge correctness and completeness of the STUDENT's answer against the QUESTION. Be fair: OCR noise on handwriting should not be penalized when intent is clear.
5. "feedback": 1-2 sentences addressed to the student, specific to what they wrote.
6. Any region that belongs to NO question (stray notes, doodles, name/roll-number header regions are NOT answers — ignore headers entirely) goes in "unmatched" with a short note, grouped sensibly. Regions used in results must not appear in unmatched.
7. "overall.summary": 2-3 sentences for the teacher on the student's performance, strengths and gaps.`;
  return codexJson<MapResult>(prompt, MAP_SCHEMA);
}

// ---------- assembly ----------

function unionPerPage(regionIds: string[], ansPages: OcrPage[]): Highlight[] {
  const byPage = new Map<number, Bbox>();
  for (const id of regionIds) {
    const m = /^p(\d+)_r(\d+)$/.exec(id);
    if (!m) continue;
    const page = ansPages.find((p) => p.index === Number(m[1]));
    const region = page?.regions[Number(m[2])];
    if (!page || !region) continue;
    const cur = byPage.get(page.index);
    const [x1, y1, x2, y2] = region.bbox;
    byPage.set(
      page.index,
      cur
        ? [Math.min(cur[0], x1), Math.min(cur[1], y1), Math.max(cur[2], x2), Math.max(cur[3], y2)]
        : [x1, y1, x2, y2]
    );
  }
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, bbox]) => ({ page, bbox }));
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
    const questionResults = questions.map((q) => {
      const r = resultByQid.get(q.qid);
      const score = r ? Math.max(0, Math.min(r.score, q.marks)) : 0;
      return {
        qid: q.qid,
        label: q.label,
        number: q.number,
        part: q.part,
        text: q.text,
        maxMarks: q.marks,
        answered: r?.answered ?? false,
        score,
        feedback: r?.feedback ?? "No answer found for this question.",
        highlights: r ? unionPerPage(r.regionIds, ansPages) : [],
      };
    });

    const result: JobResult = {
      questions: questionResults,
      unmatched: mapped.unmatched
        .map((u) => ({ note: u.note, highlights: unionPerPage(u.regionIds, ansPages) }))
        .filter((u) => u.highlights.length > 0),
      overall: {
        score: questionResults.reduce((s, q) => s + q.score, 0),
        maxScore: questionResults.reduce((s, q) => s + q.maxMarks, 0),
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
