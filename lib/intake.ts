// Rules for which inbound emails become posts. Pure functions, no I/O.

export const INTAKE_DOMAIN = "in.playlistfaery.com";

// "Dan <Dan@Example.com>" -> "dan@example.com"
export function emailAddress(value: string): string {
  const angled = value.match(/<([^>]+)>/);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

// ALLOWED_SENDERS is a comma-separated list of addresses.
export function allowedSenders(env = process.env.ALLOWED_SENDERS): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((s) => emailAddress(s))
      .filter(Boolean),
  );
}

// Any address at the intake domain counts (add@ is the official one).
export function isToIntake(recipients: string[]): boolean {
  return recipients.some((r) => emailAddress(r).endsWith(`@${INTAKE_DOMAIN}`));
}

export type IntakeDecision =
  | { accept: true; from: string }
  | { accept: false; from: string; reason: string };

export function decideIntake(
  email: { from: string; to: string[]; received_for?: string[] },
  allowed: Set<string> = allowedSenders(),
): IntakeDecision {
  const from = emailAddress(email.from);
  if (!isToIntake([...email.to, ...(email.received_for ?? [])])) {
    return { accept: false, from, reason: `not addressed to @${INTAKE_DOMAIN}` };
  }
  if (!allowed.has(from)) {
    return { accept: false, from, reason: "sender not in ALLOWED_SENDERS" };
  }
  return { accept: true, from };
}
