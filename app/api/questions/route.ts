import { NextRequest, NextResponse } from "next/server";
import { geminiJson, type ImagePart } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export interface ExtractedQuestion {
  qid: string;
  number: string;
  part: string | null;
  label: string;
  text: string;
  marks: number;
  orGroup: string | null;
}

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qid: { type: "string" },
          number: { type: "string" },
          part: { type: "string", nullable: true },
          label: { type: "string" },
          text: { type: "string" },
          marks: { type: "number" },
          orGroup: { type: "string", nullable: true },
        },
        required: ["qid", "number", "label", "text", "marks"],
      },
    },
  },
  required: ["questions"],
};

const RULES = `Extract EVERY question from this exam question paper, in exact printed order.
- Preserve the printed numbering in "label" (e.g. "3", "11 (a)").
- Labelled sub-parts are SEPARATE entries whatever the style — "11 (a)"/"11 (b)", "Q1 part 1"/"part 2", "1 (i)"/"1 (ii)", "2.1"/"2.2" — number = main question number, part = sub-label ("a", "2", "ii"...). No sub-parts → part = null.
- "text" = the full question text (include any shared stem/context a sub-part needs; never merge sub-parts).
- "marks" = printed maximum marks; if absent, estimate by type (1 MCQ/one-liner, 2-3 short answer, 5 long/diagram) — never 0.
- OPTIONAL/OR choices ("OR" between questions, "Answer any one", "Either/Or"): every alternative is its own entry and all alternatives of one choice-set share the same "orGroup" id (e.g. "or1"); everything else gets orGroup = null.
- "qid" unique like "q1", "q11a". Ignore headers, instructions, and section titles.`;

export async function POST(req: NextRequest) {
  try {
    const { qpText, qpImages } = (await req.json()) as {
      qpText?: string;
      qpImages?: ImagePart[];
    };
    if (!qpText && !qpImages?.length) {
      return NextResponse.json({ error: "No question paper content" }, { status: 400 });
    }
    const prompt = qpText
      ? `${RULES}\n\nQUESTION PAPER TEXT:\n${qpText}`
      : `${RULES}\n\nThe attached images are the pages of the question paper, in order.`;
    const out = await geminiJson<{ questions: ExtractedQuestion[] }>(
      prompt,
      SCHEMA,
      qpText ? [] : qpImages!
    );
    const questions = (out.questions ?? []).map((q) => ({
      ...q,
      part: q.part ?? null,
      orGroup: q.orGroup ?? null,
      marks: q.marks > 0 ? q.marks : 1,
    }));
    if (!questions.length) {
      return NextResponse.json(
        { error: "No questions could be extracted from the question paper" },
        { status: 422 }
      );
    }
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
