import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { mailTemplateDefinitions, mailTemplateKeyValues } from "@/lib/mail-templates";
import { ensurePhotographerRecord } from "@/lib/photographers";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type NotificationTemplateRow = {
  template_key: string;
  name?: string | null;
  subject: string;
  body: string;
  active: boolean;
  updated_at: string | null;
};

const updateSchema = z.object({
  key: z.string().refine((value) => mailTemplateKeyValues.includes(value as (typeof mailTemplateKeyValues)[number]), {
    message: "Invalid template key",
  }),
  name: z.string().trim().min(2).max(160).optional(),
  subject: z.string().trim().min(3).max(220),
  body: z.string().trim().min(10).max(8000),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const queryWithName = await supabase
    .from("notification_templates")
    .select("template_key,name,subject,body,active,updated_at")
    .eq("photographer_id", auth.photographerId);

  let rows: NotificationTemplateRow[] = [];
  let supportsNameColumn = true;

  if (isMissingSchemaObjectError(queryWithName.error)) {
    supportsNameColumn = false;
    const queryFallback = await supabase
      .from("notification_templates")
      .select("template_key,subject,body,active,updated_at")
      .eq("photographer_id", auth.photographerId);

    if (isMissingSchemaObjectError(queryFallback.error)) {
      return ok({
        featureReady: false,
        migration: "20260313_0005_settings_entities.sql",
        templates: mailTemplateDefinitions.map((entry) => ({
          key: entry.key,
          id: entry.key,
          name: entry.title,
          title: entry.title,
          description: entry.description,
          subject: entry.defaultSubject,
          body: entry.defaultBody,
          active: true,
          customized: false,
          updatedAt: null,
        })),
      });
    }
    if (queryFallback.error) {
      return fail("DB_ERROR", queryFallback.error.message, 500);
    }
    rows = queryFallback.data as NotificationTemplateRow[];
  } else if (queryWithName.error) {
    return fail("DB_ERROR", queryWithName.error.message, 500);
  } else {
    rows = queryWithName.data as NotificationTemplateRow[];
  }
  const existingByKey = new Map(rows.map((entry) => [entry.template_key, entry]));
  return ok({
    featureReady: true,
    templates: mailTemplateDefinitions.map((entry) => {
      const customized = existingByKey.get(entry.key);
      return {
        key: entry.key,
        id: entry.key,
        name: (supportsNameColumn ? customized?.name : null) ?? entry.title,
        title: entry.title,
        description: entry.description,
        subject: customized?.subject ?? entry.defaultSubject,
        body: customized?.body ?? entry.defaultBody,
        active: customized?.active ?? true,
        customized: Boolean(customized),
        updatedAt: customized?.updated_at ?? null,
      };
    }),
  });
}

export async function PUT(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensurePhotographerError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensurePhotographerError) {
    return fail("DB_ERROR", ensurePhotographerError.message, 500);
  }

  const upsertWithName = await supabase
    .from("notification_templates")
    .upsert(
      {
        photographer_id: auth.photographerId,
        template_key: parsed.data.key,
        name: parsed.data.name?.trim() || mailTemplateDefinitions.find((entry) => entry.key === parsed.data.key)?.title || parsed.data.key,
        subject: parsed.data.subject,
        body: parsed.data.body,
        active: parsed.data.active ?? true,
      },
      { onConflict: "photographer_id,template_key" },
    )
    .select("template_key,name,subject,body,active,updated_at")
    .single();

  let upsertResult = upsertWithName;
  let supportsNameColumn = true;
  if (isMissingSchemaObjectError(upsertWithName.error)) {
    supportsNameColumn = false;
    upsertResult = await supabase
      .from("notification_templates")
      .upsert(
        {
          photographer_id: auth.photographerId,
          template_key: parsed.data.key,
          subject: parsed.data.subject,
          body: parsed.data.body,
          active: parsed.data.active ?? true,
        },
        { onConflict: "photographer_id,template_key" },
      )
      .select("template_key,subject,body,active,updated_at")
      .single();
  }

  if (isMissingSchemaObjectError(upsertResult.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Mailtexte sind noch nicht aktiviert. Bitte Migration 20260313_0005_settings_entities.sql ausführen.",
      409,
    );
  }

  if (upsertResult.error) {
    return fail("DB_ERROR", upsertResult.error.message, 500);
  }

  const definition = mailTemplateDefinitions.find((entry) => entry.key === upsertResult.data.template_key);
  return ok({
    template: {
      key: upsertResult.data.template_key,
      id: upsertResult.data.template_key,
      name:
        (supportsNameColumn ? (upsertResult.data as NotificationTemplateRow).name ?? null : null) ??
        parsed.data.name?.trim() ??
        definition?.title ??
        upsertResult.data.template_key,
      title: definition?.title ?? upsertResult.data.template_key,
      description: definition?.description ?? "",
      subject: upsertResult.data.subject,
      body: upsertResult.data.body,
      active: upsertResult.data.active,
      customized: true,
      updatedAt: upsertResult.data.updated_at,
    },
  });
}
