import { Resend } from "resend";
import { config } from "../config.js";
import type { RenderedDigest } from "./render.js";

/** Send the rendered digest via Resend. Requires email config to be present. */
export async function sendDigest(digest: RenderedDigest): Promise<void> {
  const { apiKey, from, to } = config.email;
  if (!apiKey || !from || !to) {
    throw new Error("Email config (RESEND_API_KEY/DIGEST_FROM/DIGEST_TO) missing");
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: to.split(",").map((s) => s.trim()),
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
  });
  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
}
