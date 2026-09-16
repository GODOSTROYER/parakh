import { NextRequest, NextResponse } from "next/server";
import { geminiJson, type ImagePart } from "@/lib/gemini";
import type { ExtractedQuestion } from "../questions/route";
import type { Bbox, Highlight, JobResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface GradeIn {
  questions: ExtractedQuestion[];
  pages: { index: number; width: number; height: number; image: ImagePart }[];
  schemeText?: string;
}

interface GeminiRegion {
  page: number; // 1-based page number as shown to the model
  box: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

interface GradeOut {
  results: {
    qid: string;
    answered: boolean;
    regions: GeminiRegion[];
    score: number;
    feedback: string;
  }[];
  unmatched: { note: string; regions: GeminiRegion[] }[];
  summary: string;
}

const REGION = {
  type: "object",
  properties: {
    page: { type: "integer" },
    box: { type: "array", items: { type: "integer" } },
  },
  required: ["page", "box"],
};

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qid: { type: "string" },
          answered: { type: "boolean" },
          regions: { type: "array", items: REGION },
          score: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["qid", "answered", "regions", "score", "feedback"],
      },
    },
    unmatched: {
      type: "array",
      items: {
        type: "object",
        properties: {
          note: { type: "string" },
          regions: { type: "array", items: REGION },
        },
        required: ["note", "regions"],
      },
    },
    summary: { type: "string" },
  },
  required: ["results", "unmatched", "summary"],
};

function toBboxes(regions: GeminiRegion[], nPages: number): Highlight[] {
  const out: Highlight[] = [];
  for (const r of regions ?? []) {
    const page = r.page - 1;
    if (page < 0 || page >= nPages || r.box?.length !== 4) continue;
    const [ymin, xmin, ymax, xmax] = r.box.map((v) => Math.min(Math.max(v / 1000, 0), 1));
    if (ymax <= ymin || xmax <= xmin) continue;
    out.push({ page, bbox: [xmin, ymin, xmax, ymax] as Bbox });
  }
  // merge vertically-adjacent boxes on the same page (gap < 2.5% page height)
  const byPage = new Map<number, Bbox[]>();
  for (const h of out) {
    if (!byPage.has(h.page)) byPage.set(h.page, []);
    byPage.get(h.page)!.push(h.bbox);
  }
  const merged: Highlight[] = [];
  for (const [page, boxes] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    boxes.sort((a, b) => a[1] - b[1]);
    let cur = boxes[0];
    for (const b of boxes.slice(1)) {
      if (b[1] - cur[3] < 0.025) {
        cur = [Math.min(cur[0], b[0]), Math.min(cur[1], b[1]), Math.max(cur[2], b[2]), Math.max(cur[3], b[3])];
      } else {
        merged.push({ page, bbox: cur });
        cur = b;
      }
    }
    merged.push({ page, bbox: cur });
  }
  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const { questions, pages, schemeText } = (await req.json()) as GradeIn;
    if (!questions?.length || !pages?.length) {
      return NextResponse.json({ error: "Missing questions or pages" }, { status: 400 });
    }

    const questionsText = questions
      .map(
        (q) =>
          `${q.qid} | Q${q.label} | max ${q.marks} marks${
            q.orGroup ? ` | OR-choice group ${q.orGroup} (student answers ONE of these)` : ""
          } | ${q.text}`
      )
      .join("\n");

    const prompt = `You are an examiner. The ${pages.length} attached images are the pages of ONE student's handwritten answer sheet, in order (image 1 = page 1 ... image ${pages.length} = page ${pages.length}). Grade it against the question list below${schemeText ? " and the marking scheme" : ""}.

For EVERY question qid produce one entry in "results":
1. Read the student's writing and find the answer to that question. Use the student's own numbering ("Q2.", "Ans 3", "11 a)") as the primary signal, content as fallback. Answers may be OUT OF ORDER and may SPAN multiple pages.
2. "regions": tight bounding boxes around ONLY that answer's ink — one region per contiguous block, page is the 1-based page number, box is [ymin, xmin, ymax, xmax] normalized to 0-1000. Include continuation blocks, working, equations and diagrams that belong to the answer. BE PRECISE with sub-parts: never include a sibling sub-part's writing; a shared heading belongs only to the first sub-part under it.
3. Not answered anywhere: answered=false, regions=[], score=0, feedback says so. For an unattempted OR alternative whose sibling was answered: feedback "Not attempted — the student chose the other option."
4. Grade out of max marks (integers or .5).${schemeText ? " Award marks per the MARKING SCHEME criteria." : " Judge correctness and completeness against the question."} For diagram questions, grade the drawing itself (structure, labels). Unreadable scrawl is not the student's fault when intent is clear.
5. "feedback": 1-2 sentences addressed to the student, specific to what they wrote.

"unmatched": writing that belongs to NO question (stray notes, doodles) with boxes — name/roll-number headers are ignored entirely (not answers, not unmatched).
"summary": 2-3 sentences for the teacher — performance, strengths, gaps.

QUESTIONS:
${questionsText}
${schemeText ? `\nMARKING SCHEME:\n${schemeText}` : ""}`;

    const out = await geminiJson<GradeOut>(
      prompt,
      SCHEMA,
      pages.map((p) => p.image)
    );

    const byQid = new Map(out.results.map((r) => [r.qid, r]));
    const answeredInGroup = new Map<string, boolean>();
    for (const q of questions) {
      if (q.orGroup && byQid.get(q.qid)?.answered) answeredInGroup.set(q.orGroup, true);
    }
    const questionResults = questions.map((q) => {
      const r = byQid.get(q.qid);
      const answered = r?.answered ?? false;
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
        score: r ? Math.max(0, Math.min(r.score, q.marks)) : 0,
        feedback: r?.feedback ?? "No answer found for this question.",
        highlights: r ? toBboxes(r.regions, pages.length) : [],
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
      unmatched: (out.unmatched ?? [])
        .map((u) => ({ note: u.note, highlights: toBboxes(u.regions, pages.length) }))
        .filter((u) => u.highlights.length > 0),
      overall: {
        score: questionResults.reduce((s, q) => s + q.score, 0),
        maxScore,
        summary: out.summary,
      },
      answerPages: pages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Grading failed" },
      { status: 500 }
    );
  }
}
