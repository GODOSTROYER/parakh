import type { Job } from "./types";

// In-memory job store (assignment scope: no DB). Survives dev hot-reload via globalThis.
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
export const jobs: Map<string, Job> = (g.__jobs ??= new Map());

export function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}
