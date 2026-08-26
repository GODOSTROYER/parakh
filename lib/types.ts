export type Bbox = [number, number, number, number]; // normalized 0..1: x1,y1,x2,y2

export interface OcrRegion {
  label: string;
  text: string;
  bbox: Bbox;
}

export interface OcrPage {
  index: number;
  width: number;
  height: number;
  image: string;
  markdown: string;
  regions: OcrRegion[];
}

export interface Highlight {
  page: number; // answer-sheet page index
  bbox: Bbox;
}

export interface QuestionResult {
  qid: string;
  label: string; // printed label, e.g. "11 (a)"
  number: string; // main number, e.g. "11"
  part: string | null; // sub-part, e.g. "a"
  text: string;
  maxMarks: number;
  answered: boolean;
  score: number;
  feedback: string;
  highlights: Highlight[];
}

export interface UnmatchedAnswer {
  note: string;
  highlights: Highlight[];
}

export interface JobResult {
  questions: QuestionResult[];
  unmatched: UnmatchedAnswer[];
  overall: { score: number; maxScore: number; summary: string };
  answerPages: { index: number; width: number; height: number }[];
}

export type JobStage =
  | "queued"
  | "reading_qp"
  | "reading_answers"
  | "extracting_questions"
  | "mapping_grading"
  | "done"
  | "error";

export interface Job {
  id: string;
  stage: JobStage;
  progress: number; // 0..100
  detail: string;
  error?: string;
  result?: JobResult;
  createdAt: number;
}
