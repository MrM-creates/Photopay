import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { loadPhotographerSmtpSettings } from "@/lib/email-settings";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { ensurePhotographerRecord } from "@/lib/photographers";
import { createAdminClient } from "@/lib/supabase";

const updateEmailSettingsSchema = z.object({
  host: z.string().trim().min(3).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  user: z.string().trim().min(3).max(255),
  password: z.string().min(1).max(500).optional(),
  from: z.string().trim().min(3).max(320),
  replyTo: z.string().trim().max(320).optional().or(z.literal("")),
});

type EmailSettingsRow = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
  smtp_reply_to: string | null;
};

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  try {
    const loaded = await loadPhotographerSmtpSettings(supabase, auth.photographerId);
    if (!loaded.featureReady) {
      return ok({
        featureReady: false,
        settings: {
          host: "",
          port: 465,
          secure: true,
          user: "",
          from: "",
          replyTo: "",
          hasPassword: false,
          source: "none",
        },
      });
    }

    if (!loaded.settings) {
      return ok({
        featureReady: true,
        settings: {
          host: "",
          port: 465,
          secure: true,
          user: "",
          from: "",
          replyTo: "",
          hasPassword: false,
          source: loaded.source,
        },
      });
    }

    return ok({
      featureReady: true,
      settings: {
        host: loaded.settings.host,
        port: loaded.settings.port,
        secure: loaded.settings.secure,
        user: loaded.settings.user,
        from: loaded.settings.from,
        replyTo: loaded.settings.replyTo ?? "",
        hasPassword: Boolean(loaded.settings.pass),
        source: loaded.source,
      },
    });
  } catch (error) {
    return fail("DB_ERROR", error instanceof Error ? error.message : "Email settings could not be loaded.", 500);
  }
}

export async function PUT(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = updateEmailSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  const existing = await supabase
    .from("photographer_email_settings")
    .select("smtp_password")
    .eq("photographer_id", auth.photographerId)
    .maybeSingle<{ smtp_password: string }>();

  if (isMissingSchemaObjectError(existing.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "E-Mail-Einstellungen sind noch nicht aktiviert. Bitte Migration 20260314_0008_photographer_profile_and_email_settings.sql ausführen.",
      409,
    );
  }
  if (existing.error) return fail("DB_ERROR", existing.error.message, 500);

  const smtpPassword = parsed.data.password?.trim() || existing.data?.smtp_password || "";
  if (!smtpPassword) {
    return fail("VALIDATION_ERROR", "Bitte SMTP-Passwort eingeben.", 422);
  }

  const upsert = await supabase
    .from("photographer_email_settings")
    .upsert(
      {
        photographer_id: auth.photographerId,
        smtp_host: parsed.data.host.trim(),
        smtp_port: parsed.data.port,
        smtp_secure: parsed.data.secure ?? parsed.data.port === 465,
        smtp_user: parsed.data.user.trim(),
        smtp_password: smtpPassword,
        smtp_from: parsed.data.from.trim(),
        smtp_reply_to: parsed.data.replyTo?.trim() || null,
      },
      { onConflict: "photographer_id" },
    )
    .select("smtp_host,smtp_port,smtp_secure,smtp_user,smtp_from,smtp_reply_to")
    .single<Omit<EmailSettingsRow, "smtp_password">>();

  if (upsert.error) return fail("DB_ERROR", upsert.error.message, 500);

  return ok({
    featureReady: true,
    settings: {
      host: upsert.data.smtp_host,
      port: upsert.data.smtp_port,
      secure: upsert.data.smtp_secure,
      user: upsert.data.smtp_user,
      from: upsert.data.smtp_from,
      replyTo: upsert.data.smtp_reply_to ?? "",
      hasPassword: true,
      source: "database",
    },
  });
}
