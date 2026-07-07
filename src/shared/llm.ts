/**
 * Optional LLM backing for agent reasoning. If OPENAI_API_KEY is set, juror
 * rationales and arbiter announcements come from a real model; otherwise a
 * deterministic scripted fallback keeps the demo reproducible offline.
 */
export async function complete(system: string, user: string, fallback: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;
  try {
    const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 160,
        temperature: 0.4,
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}
