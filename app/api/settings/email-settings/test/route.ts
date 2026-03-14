import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { loadPhotographerSmtpSettings } from "@/lib/email-settings";
import { fail, ok } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase";

const testMailSchema = z.object({
  to: z.string().trim().email().max(320),
  senderEmail: z.string().trim().email().max(320).optional(),
});

function normalizeEmail(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>/);
  const email = match?.[1]?.trim() || trimmed;
  return email.toLowerCase();
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = testMailSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();

  let smtpSettings;
  try {
    const loaded = await loadPhotographerSmtpSettings(supabase, auth.photographerId);
    if (!loaded.featureReady) {
      return fail(
        "FEATURE_NOT_READY",
        "E-Mail-Einstellungen sind noch nicht aktiviert. Bitte Migration 20260314_0008_photographer_profile_and_email_settings.sql ausführen.",
        409,
      );
    }
    if (!loaded.settings) {
      return fail("MAIL_NOT_CONFIGURED", "Bitte zuerst SMTP-Daten speichern.", 409);
    }
    smtpSettings = loaded.settings;
  } catch (error) {
    return fail("DB_ERROR", error instanceof Error ? error.message : "SMTP settings could not be loaded.", 500);
  }

  const senderEmail = parsed.data.senderEmail?.trim();
  const senderNormalized = senderEmail ? normalizeEmail(senderEmail) : undefined;

  if (senderEmail) {
    smtpSettings = {
      ...smtpSettings,
      from: senderEmail,
    };
  }

  const subject = "PhotoPay Testmail";
  const text = "Diese Testmail wurde erfolgreich aus PhotoPay versendet.";

  try {
    const result = await sendMail({ to: parsed.data.to, subject, text }, smtpSettings);

    const effectiveSender = senderNormalized ?? normalizeEmail(smtpSettings.from);
    const markAsVerified = await supabase
      .from("photographer_sender_emails")
      .update({
        verified_at: new Date().toISOString(),
        last_tested_at: new Date().toISOString(),
      })
      .eq("photographer_id", auth.photographerId)
      .eq("email_normalized", effectiveSender);

    if (markAsVerified.error && !isMissingSchemaObjectError(markAsVerified.error)) {
      return fail("DB_ERROR", markAsVerified.error.message, 500);
    }

    return ok({
      sent: true,
      to: parsed.data.to,
      sender: smtpSettings.from,
      messageId: result.messageId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MAIL_NOT_CONFIGURED") {
      return fail("MAIL_NOT_CONFIGURED", "Bitte zuerst SMTP-Daten speichern.", 409);
    }
    return fail("EMAIL_SEND_FAILED", "Testmail konnte nicht gesendet werden.", 500);
  }
}
