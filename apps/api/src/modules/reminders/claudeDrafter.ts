import type Anthropic from "@anthropic-ai/sdk";
import type { ReminderDrafter } from "./drafts.js";

// The only place that talks to Claude. It is sent an approved template with its
// placeholders, the language and the situation: never a name, a number or a note
// (DPDP), so there is no borrower data to leak and no outside text to inject.

const DEFAULT_MODEL = "claude-opus-5-5";
/** An officer is waiting in the field. After this they get the approved template. */
const TIMEOUT_MS = 10_000;

const SYSTEM = `You reword payment reminders that a lender's field officers in India send to small business owners.

You are given an approved message. Write one version of it in the same language that reads as natural, warm and respectful, and says the same thing.

Rules:
- Keep every placeholder in curly braces exactly as written, each one exactly once. Add no others.
- Add no facts, numbers, dates, amounts, links or contact details.
- Never mention consequences, legal steps, the police, courts, family, reputation or anything that could feel like pressure.
- Use at most 300 characters.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
  additionalProperties: false,
};

export function createClaudeDrafter(client: Anthropic, model = DEFAULT_MODEL): ReminderDrafter {
  return async ({ template, lang, situation }) => {
    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Language: ${lang === "hi" ? "Hindi" : "English"}\nSituation: ${situation}\nApproved message: ${template}`,
          },
        ],
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
    if (response.stop_reason !== "end_turn") return null;
    const text = response.content.find((block) => block.type === "text");
    if (text?.type !== "text") return null;
    const parsed = JSON.parse(text.text) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : null;
  };
}
