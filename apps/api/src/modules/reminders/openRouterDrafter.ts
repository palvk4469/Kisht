import type { ReminderDrafter } from "./drafts.js";

// The only place that talks to an AI model, through OpenRouter. It is sent an
// approved template with its placeholders, the language and the situation: never
// a name, a number or a note (DPDP). That also makes free models safe to use, since
// some keep prompts, and there is no borrower data to keep and no outside text to
// inject. What comes back is untrusted: drafts.ts checks every reply.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Picks whichever free model is available, as individual ones come and go. */
const DEFAULT_MODEL = "openrouter/free";
/** An officer is waiting in the field. After this they get the approved template. */
const TIMEOUT_MS = 10_000;

const SYSTEM = `You reword payment reminders that a lender's field officers in India send to small business owners.

You are given an approved message. Write one version of it in the same language that reads as natural, warm and respectful, and says the same thing.

Rules:
- Keep every placeholder in curly braces exactly as written, each one exactly once. Add no others.
- Add no facts, numbers, dates, amounts, links or contact details.
- Never mention consequences, legal steps, the police, courts, family, reputation or anything that could feel like pressure.
- Use at most 300 characters.
- Reply with the message only, with no quotes, notes or explanation.`;

type Options = { apiKey: string; model?: string; fetch?: typeof fetch };

export function createOpenRouterDrafter(options: Options): ReminderDrafter {
  const { apiKey, model = DEFAULT_MODEL, fetch: send = fetch } = options;
  return async ({ template, lang, situation }) => {
    const response = await send(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-title": "Kisht Collections",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Language: ${lang === "hi" ? "Hindi" : "English"}\nSituation: ${situation}\nApproved message: ${template}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw Object.assign(new Error("OpenRouter"), { status: response.status });
    const body = (await response.json()) as {
      choices?: { finish_reason?: string; message?: { content?: unknown } }[];
    };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || typeof content !== "string") return null;
    return content.trim();
  };
}
