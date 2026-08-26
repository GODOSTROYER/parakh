import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const CODEX_MODEL = process.env.CODEX_MODEL || "gpt-5.6-luna";

/** Run `codex exec` (OpenAI OAuth via `codex login`) with a JSON output schema. */
export async function codexJson<T>(prompt: string, schema: object): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "vedaai-codex-"));
  const schemaPath = path.join(dir, "schema.json");
  const outPath = path.join(dir, "out.json");
  await writeFile(schemaPath, JSON.stringify(schema));

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "codex",
        [
          "exec",
          "--skip-git-repo-check",
          "-m",
          CODEX_MODEL,
          "--output-schema",
          schemaPath,
          "-o",
          outPath,
          "-",
        ],
        { cwd: dir, shell: process.platform === "win32", windowsHide: true }
      );
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`codex exec exited ${code}: ${stderr.slice(-2000)}`))
      );
      child.stdin.write(prompt);
      child.stdin.end();
    });
    const raw = await readFile(outPath, "utf-8");
    return JSON.parse(raw) as T;
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
