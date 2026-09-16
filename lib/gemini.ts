// Gemini API with free-tier key rotation and model fallback.
// Keys come from GEMINI_API_KEYS (comma-separated). Every call round-robins
// the start key and advances through keys × models on quota/availability
// errors, so five free-tier keys behave like one bigger quota pool.

const MODELS = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim());

function keys(): string[] {
  const raw = process.env.GEMINI_API_KEYS || "";
  const list = raw.split(",").map((k) => k.trim()).filter(Boolean);
  if (!list.length) throw new Error("GEMINI_API_KEYS is not configured");
  return list;
}

let cursor = Math.floor(Math.random() * 1000); // lambda-local round robin

export interface ImagePart {
  mimeType: string;
  data: string; // base64, no data: prefix
}

export async function geminiJson<T>(
  prompt: string,
  schema: object,
  images: ImagePart[] = []
): Promise<T> {
  const ks = keys();
  const parts: object[] = [
    ...images.map((im) => ({ inline_data: { mime_type: im.mimeType, data: im.data } })),
    { text: prompt },
  ];
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
      maxOutputTokens: 65536,
    },
  });

  let lastErr = "";
  for (const model of MODELS) {
    for (let i = 0; i < ks.length; i++) {
      const key = ks[(cursor + i) % ks.length];
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body,
          }
        );
        if (!res.ok) {
          const text = await res.text();
          lastErr = `${model} → ${res.status}: ${text.slice(0, 300)}`;
          // quota/availability → try next key; other 4xx are permanent per model
          if (res.status === 429 || res.status === 503 || res.status === 500) continue;
          break; // next model
        }
        cursor = (cursor + i + 1) % ks.length;
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? "")
          .join("");
        if (!text) {
          lastErr = `${model} → empty response (${data?.candidates?.[0]?.finishReason ?? "no candidates"})`;
          continue;
        }
        return JSON.parse(text) as T;
      } catch (e) {
        lastErr = `${model} → ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
  throw new Error(`All Gemini keys/models exhausted. Last error: ${lastErr}`);
}
