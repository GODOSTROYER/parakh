import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const CODEX_MODEL = process.env.CODEX_MODEL || "gpt-5.6-luna";
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 5 * 60_000);

function runCodex(args: string[], prompt: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`codex exec timed out after ${CODEX_TIMEOUT_MS / 1000}s`));
    }, CODEX_TIMEOUT_MS);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error(`codex exec exited ${code}: ${stderr.slice(-2000)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Verify the Codex CLI is installed and logged in; throws a friendly error if not. */
export async function assertCodexReady(): Promise<void> {
  try {
    await runCodex(["login", "status"], "", tmpdir());
  } catch {
    throw new Error(
      "Codex CLI is not ready — install with `npm i -g @openai/codex` and run `codex login` once."
    );
  }
}

/** Run `codex exec` (OpenAI OAuth via `codex login`) with a JSON output schema.
 *  Retries once on failure. `images` are attached to the prompt (vision). */
export async function codexJson<T>(
  prompt: string,
  schema: object,
  images: string[] = []
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "vedaai-codex-"));
  const schemaPath = path.join(dir, "schema.json");
  const outPath = path.join(dir, "out.json");
  await writeFile(schemaPath, JSON.stringify(schema));
  const args = [
    "exec",
    "--skip-git-repo-check",
    "-m",
    CODEX_MODEL,
    "--output-schema",
    schemaPath,
    "-o",
    outPath,
    ...images.flatMap((p) => ["-i", p]),
    "-",
  ];

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await runCodex(args, prompt, dir);
        return JSON.parse(await readFile(outPath, "utf-8")) as T;
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
