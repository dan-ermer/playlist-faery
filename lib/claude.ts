import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | undefined;

// Reads ANTHROPIC_API_KEY from the environment.
export function claude() {
  client ??= new Anthropic();
  return client;
}

// Server-side refusal fallback: if a safety classifier declines a request,
// the API re-runs it on a fallback model chosen by refusal category.
export const FALLBACK_OPTIONS: Pick<Anthropic.Beta.MessageCreateParams, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
