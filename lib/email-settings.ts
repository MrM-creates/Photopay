import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
};

type SmtpSettingsRow = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
  smtp_reply_to: string | null;
};

export function readEnvSmtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const portRaw = process.env.SMTP_PORT?.trim() ?? "";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS?.trim() ?? "";
  const from = process.env.SMTP_FROM?.trim() ?? "";
  const replyTo = process.env.SMTP_REPLY_TO?.trim() ?? "";
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase();
  const port = Number(portRaw || "587");
  const secure = secureRaw === "true" || port === 465;

  if (!host || !port || !user || !pass || !from) return null;
  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    replyTo: replyTo || undefined,
  };
}

export async function loadPhotographerSmtpSettings(
  supabase: ReturnType<typeof createAdminClient>,
  photographerId: string,
) {
  const query = await supabase
    .from("photographer_email_settings")
    .select("smtp_host,smtp_port,smtp_secure,smtp_user,smtp_password,smtp_from,smtp_reply_to")
    .eq("photographer_id", photographerId)
    .maybeSingle<SmtpSettingsRow>();

  if (isMissingSchemaObjectError(query.error)) {
    return {
      featureReady: false as const,
      source: "none" as const,
      settings: null,
    };
  }

  if (query.error) {
    throw query.error;
  }

  if (query.data) {
    return {
      featureReady: true as const,
      source: "database" as const,
      settings: {
        host: query.data.smtp_host,
        port: query.data.smtp_port,
        secure: query.data.smtp_secure,
        user: query.data.smtp_user,
        pass: query.data.smtp_password,
        from: query.data.smtp_from,
        replyTo: query.data.smtp_reply_to ?? undefined,
      },
    };
  }

  const envSettings = readEnvSmtpSettings();
  if (envSettings) {
    return {
      featureReady: true as const,
      source: "env" as const,
      settings: envSettings,
    };
  }

  return {
    featureReady: true as const,
    source: "none" as const,
    settings: null,
  };
}
