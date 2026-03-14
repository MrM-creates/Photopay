import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { loadPhotographerSmtpSettings } from "@/lib/email-settings";
import { fail, ok } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase";

const paramsSchema = z.object({
  senderEmailId: z.string().uuid(),
});

const updateSenderEmailSchema = z.object({
  email: z.string().trim().email().max(320),
});

type SenderEmailRow = {
  id: string;
  email: string;
  verified_at: string | null;
  last_tested_at: string | null;
  created_at: string;
};

function toSenderEmailEntry(row: SenderEmailRow) {
  return {
    id: row.id,
    email: row.email,
    verified: Boolean(row.verified_at || row.last_tested_at),
    verifiedAt: row.verified_at,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
  };
}

function extractEmail(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1]?.trim() || trimmed).toLowerCase();
}

function pickVerificationRecipient(input: { user: string; replyTo?: string; from: string }) {
  const user = input.user.trim();
  if (user.includes("@")) return user;
  const replyTo = input.replyTo?.trim() ?? "";
  if (replyTo.includes("@")) return extractEmail(replyTo);
  return extractEmail(input.from);
}

type SenderEmailTargetRow = {
  id: string;
  email: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ senderEmailId: string }> }) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return fail("VALIDATION_ERROR", "Ungültige Mailadresse-ID.", 422, { issues: params.error.issues });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSenderEmailSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Ungültige Eingabe.", 422, { issues: parsed.error.issues });
  }

  const email = parsed.data.email.trim();
  const normalized = email.toLowerCase();
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

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
      return fail("MAIL_NOT_CONFIGURED", "Bitte zuerst SMTP-Zugang einrichten.", 409);
    }
    smtpSettings = loaded.settings;
  } catch (error) {
    return fail("DB_ERROR", error instanceof Error ? error.message : "SMTP settings could not be loaded.", 500);
  }

  const verificationTo = pickVerificationRecipient(smtpSettings);
  try {
    await sendMail(
      {
        to: verificationTo,
        subject: "PhotoPay Absender-Prüfung",
        text: "Diese E-Mail bestätigt die angepasste Absenderadresse in PhotoPay.",
      },
      { ...smtpSettings, from: email },
    );
  } catch {
    return fail("EMAIL_SEND_FAILED", "Mailadresse konnte nicht geprüft werden. Bitte SMTP-Daten prüfen.", 422);
  }

  const update = await supabase
    .from("photographer_sender_emails")
    .update({
      email,
      email_normalized: normalized,
      verified_at: nowIso,
      last_tested_at: nowIso,
    })
    .eq("id", params.data.senderEmailId)
    .eq("photographer_id", auth.photographerId)
    .select("id,email,verified_at,last_tested_at,created_at")
    .single<SenderEmailRow>();

  if (update.error) {
    return fail("DB_ERROR", update.error.message, 500);
  }

  return ok({
    senderEmail: toSenderEmailEntry(update.data),
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ senderEmailId: string }> }) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return fail("VALIDATION_ERROR", "Ungültige Mailadresse-ID.", 422, { issues: params.error.issues });
  }

  const supabase = createAdminClient();

  const target = await supabase
    .from("photographer_sender_emails")
    .select("id,email")
    .eq("id", params.data.senderEmailId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle<SenderEmailTargetRow>();

  if (target.error) return fail("DB_ERROR", target.error.message, 500);
  if (!target.data) return fail("NOT_FOUND", "Mailadresse nicht gefunden.", 404);

  const currentSettings = await supabase
    .from("photographer_email_settings")
    .select("smtp_from")
    .eq("photographer_id", auth.photographerId)
    .maybeSingle<{ smtp_from: string }>();

  if (currentSettings.error) return fail("DB_ERROR", currentSettings.error.message, 500);

  const targetNormalized = target.data.email.trim().toLowerCase();
  const activeNormalized = currentSettings.data?.smtp_from ? extractEmail(currentSettings.data.smtp_from) : "";
  if (activeNormalized === targetNormalized) {
    return fail("VALIDATION_ERROR", "Aktive Mailadresse kann nicht gelöscht werden. Bitte zuerst eine andere aktiv setzen.", 409);
  }

  const remove = await supabase
    .from("photographer_sender_emails")
    .delete()
    .eq("id", params.data.senderEmailId)
    .eq("photographer_id", auth.photographerId);

  if (remove.error) return fail("DB_ERROR", remove.error.message, 500);

  return ok({ deleted: true });
}
