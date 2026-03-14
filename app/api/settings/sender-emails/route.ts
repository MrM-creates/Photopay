import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { loadPhotographerSmtpSettings } from "@/lib/email-settings";
import { fail, ok } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { ensurePhotographerRecord } from "@/lib/photographers";
import { createAdminClient } from "@/lib/supabase";

const createSenderEmailSchema = z.object({
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

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  const query = await supabase
    .from("photographer_sender_emails")
    .select("id,email,verified_at,last_tested_at,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("created_at", { ascending: true })
    .returns<SenderEmailRow[]>();

  if (isMissingSchemaObjectError(query.error)) {
    return ok({ featureReady: false, senderEmails: [] });
  }
  if (query.error) return fail("DB_ERROR", query.error.message, 500);

  return ok({
    featureReady: true,
    senderEmails: (query.data ?? []).map(toSenderEmailEntry),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = createSenderEmailSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  const email = parsed.data.email.trim();
  const normalizedEmail = email.toLowerCase();
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
        text: "Diese E-Mail bestätigt die neue Absenderadresse in PhotoPay.",
      },
      { ...smtpSettings, from: email },
    );
  } catch {
    return fail("EMAIL_SEND_FAILED", "Mailadresse konnte nicht geprüft werden. Bitte SMTP-Daten prüfen.", 422);
  }

  const upsert = await supabase
    .from("photographer_sender_emails")
    .upsert(
      {
        photographer_id: auth.photographerId,
        email,
        email_normalized: normalizedEmail,
        verified_at: nowIso,
        last_tested_at: nowIso,
      },
      { onConflict: "photographer_id,email_normalized" },
    )
    .select("id,email,verified_at,last_tested_at,created_at")
    .single<SenderEmailRow>();

  if (isMissingSchemaObjectError(upsert.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Absender-Adressen sind noch nicht aktiviert. Bitte Migration 20260314_0009_sender_emails.sql ausführen.",
      409,
    );
  }
  if (upsert.error) return fail("DB_ERROR", upsert.error.message, 500);

  return ok({
    featureReady: true,
    senderEmail: toSenderEmailEntry(upsert.data),
  });
}
