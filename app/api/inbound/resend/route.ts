import { after } from "next/server";
import { decideIntake } from "@/lib/intake";
import { advancePost } from "@/lib/pipeline";
import { verifyWebhook } from "@/lib/resend";
import { supabaseAdmin } from "@/lib/supabase";

// Resend calls this for every email received on in.playlistfaery.com.
// The webhook only carries the envelope (sender, recipients, subject, email_id);
// the pipeline (Capture, Parse, ...) starts right after we respond; the scheduled
// function retries anything that doesn't finish.
//
// Responses: 401 for a bad signature, 200 for anything handled or deliberately
// ignored (so Resend doesn't retry it), 500 when saving fails (so Resend retries).
export async function POST(request: Request) {
  const rawBody = await request.text();

  let event;
  try {
    event = verifyWebhook(rawBody, request.headers);
  } catch (err) {
    console.warn("[inbound] rejected: invalid webhook signature", err);
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.type !== "email.received") {
    return Response.json({ ok: true, ignored: event.type });
  }

  const email = event.data;
  const decision = decideIntake(email);
  if (!decision.accept) {
    console.warn("[inbound] ignored email", {
      reason: decision.reason,
      from: decision.from,
      to: email.to,
      subject: email.subject,
      email_id: email.email_id,
    });
    return Response.json({ ok: true, ignored: decision.reason });
  }

  // intake_message_id is unique, so a re-delivered webhook is a no-op.
  const { data: inserted, error } = await supabaseAdmin()
    .from("posts")
    .upsert(
      {
        intake_message_id: email.email_id,
        intake_from: decision.from,
        intake_subject: email.subject,
      },
      { onConflict: "intake_message_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    console.error("[inbound] failed to save post", { email_id: email.email_id, error });
    return new Response("Failed to save", { status: 500 });
  }

  // A redelivered webhook inserts nothing, so the pipeline isn't started twice.
  const postId = inserted?.[0]?.id;
  if (postId) after(() => advancePost(postId));

  console.log("[inbound] received", { from: decision.from, email_id: email.email_id, postId });
  return Response.json({ ok: true });
}
