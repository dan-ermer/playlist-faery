import "server-only";
import { Resend, type WebhookEventPayload } from "resend";

let client: Resend | undefined;

export function resend() {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing RESEND_API_KEY");
    client = new Resend(key);
  }
  return client;
}

// Checks the Svix signature Resend puts on every webhook. `rawBody` must be the
// exact request body text: re-serialized JSON will not match the signature.
// Throws if the signature is missing or invalid.
export function verifyWebhook(rawBody: string, headers: Headers): WebhookEventPayload {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing RESEND_WEBHOOK_SECRET");
  return resend().webhooks.verify({
    payload: rawBody,
    headers: {
      id: headers.get("svix-id") ?? "",
      timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    },
    webhookSecret: secret,
  });
}
