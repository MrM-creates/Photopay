import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { loadPhotographerSmtpSettings } from "@/lib/email-settings";
import { fail, ok } from "@/lib/http";
import { mailTemplateDefinitions } from "@/lib/mail-templates";
import { sendMail } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase";
import { renderTemplate } from "@/lib/template-render";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

const sendShareEmailSchema = z.object({
  accessPassword: z.string().trim().max(128).optional(),
  templateKey: z.string().trim().default("gallery_share").optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const payload = await request.json().catch(() => null);
  const parsed = sendShareEmailSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const templateKey = parsed.data.templateKey || "gallery_share";
  const supabase = createAdminClient();

  const galleryQuery = await supabase
    .from("galleries")
    .select("id,title,public_slug,status,customer_id,archive_after_days,never_auto_archive")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle<{
      id: string;
      title: string;
      public_slug: string;
      status: string;
      customer_id: string | null;
      archive_after_days?: number | null;
      never_auto_archive?: boolean | null;
    }>();

  if (galleryQuery.error) return fail("DB_ERROR", galleryQuery.error.message, 500);
  if (!galleryQuery.data) return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  if (galleryQuery.data.status !== "published") {
    return fail("GALLERY_NOT_PUBLISHED", "Gallery must be published before sending the share mail.", 409);
  }
  if (!galleryQuery.data.customer_id) {
    return fail("CUSTOMER_REQUIRED", "Please assign a customer before sending the share mail.", 409);
  }

  const customerQuery = await supabase
    .from("customers")
    .select("first_name,last_name,full_name,email")
    .eq("id", galleryQuery.data.customer_id)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle<{ first_name?: string | null; last_name?: string | null; full_name: string; email: string }>();

  if (customerQuery.error) return fail("DB_ERROR", customerQuery.error.message, 500);
  if (!customerQuery.data) return fail("CUSTOMER_NOT_FOUND", "Customer not found.", 404);
  if (!customerQuery.data.email) return fail("CUSTOMER_EMAIL_REQUIRED", "Customer email is required.", 409);

  const photographerQuery = await supabase
    .from("photographers")
    .select("display_name,first_name,last_name,mail_salutation_mode")
    .eq("id", auth.photographerId)
    .maybeSingle<{
      display_name: string | null;
      first_name?: string | null;
      last_name?: string | null;
      mail_salutation_mode?: "first_name" | "full_name" | null;
    }>();

  if (photographerQuery.error) return fail("DB_ERROR", photographerQuery.error.message, 500);

  const templateQuery = await supabase
    .from("notification_templates")
    .select("template_key,name,subject,body,active")
    .eq("photographer_id", auth.photographerId)
    .eq("template_key", templateKey)
    .maybeSingle<{ template_key: string; name: string | null; subject: string; body: string; active: boolean }>();

  if (templateQuery.error) return fail("DB_ERROR", templateQuery.error.message, 500);

  const defaultTemplate =
    mailTemplateDefinitions.find((entry) => entry.key === templateKey) ??
    mailTemplateDefinitions.find((entry) => entry.key === "gallery_share");

  if (!defaultTemplate) {
    return fail("TEMPLATE_NOT_FOUND", "Template not found.", 404);
  }

  if (templateQuery.data && !templateQuery.data.active) {
    return fail("TEMPLATE_INACTIVE", "Template is inactive.", 409);
  }

  const subjectTemplate = templateQuery.data?.subject ?? defaultTemplate.defaultSubject;
  const bodyTemplate = templateQuery.data?.body ?? defaultTemplate.defaultBody;

  const origin = new URL(request.url).origin;
  const galleryLink = `${origin}/g/${galleryQuery.data.public_slug}`;
  const photographerName = photographerQuery.data?.display_name?.trim() || "Photographer";
  const salutationMode = photographerQuery.data?.mail_salutation_mode ?? "first_name";
  const customerFirstName = customerQuery.data.first_name?.trim() || "";
  const customerFullName = customerQuery.data.full_name;
  const salutationCustomerName = salutationMode === "first_name" && customerFirstName ? customerFirstName : customerFullName;
  const expiry =
    galleryQuery.data.never_auto_archive === true
      ? "Keine automatische Archivierung"
      : `${galleryQuery.data.archive_after_days ?? 90} Tage`;

  const replacements: Record<string, string> = {
    customer_name: salutationCustomerName,
    kunde_name: salutationCustomerName,
    customer_full_name: customerFullName,
    kunde_vollname: customerFullName,
    customer_first_name: customerFirstName || customerFullName,
    kunde_vorname: customerFirstName || customerFullName,
    project_name: galleryQuery.data.title,
    projekt_name: galleryQuery.data.title,
    gallery_link: galleryLink,
    galerie_link: galleryLink,
    gallery_password: parsed.data.accessPassword?.trim() || "",
    passwort: parsed.data.accessPassword?.trim() || "",
    download_link: galleryLink,
    photographer_name: photographerName,
    fotograf_name: photographerName,
    expiry_days: expiry,
    ablaufdatum: expiry,
  };

  const renderedSubject = renderTemplate(subjectTemplate, replacements).trim();
  const renderedBody = renderTemplate(bodyTemplate, replacements).trim();

  try {
    const smtpLoaded = await loadPhotographerSmtpSettings(supabase, auth.photographerId);
    if (!smtpLoaded.featureReady) {
      return fail(
        "FEATURE_NOT_READY",
        "E-Mail-Einstellungen sind noch nicht aktiviert. Bitte Migration 20260314_0008_photographer_profile_and_email_settings.sql ausführen.",
        409,
      );
    }
    if (!smtpLoaded.settings) {
      return fail(
        "MAIL_NOT_CONFIGURED",
        "Kein SMTP-Konto hinterlegt. Bitte unter Admin → E-Mail einrichten zuerst speichern.",
        409,
      );
    }

    const result = await sendMail({
      to: customerQuery.data.email,
      subject: renderedSubject,
      text: renderedBody,
    }, smtpLoaded.settings);

    return ok({
      sent: true,
      to: customerQuery.data.email,
      subject: renderedSubject,
      templateKey,
      messageId: result.messageId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MAIL_NOT_CONFIGURED") {
      return fail(
        "MAIL_NOT_CONFIGURED",
        "SMTP ist nicht konfiguriert. Bitte SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS und SMTP_FROM setzen.",
        409,
      );
    }
    return fail("EMAIL_SEND_FAILED", "Mail konnte nicht gesendet werden.", 500);
  }
}
