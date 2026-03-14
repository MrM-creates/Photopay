import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { mailTemplateDefinitions } from "@/lib/mail-templates";
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

const templateKeyPattern = /^[a-z0-9_]{3,120}$/;
const builtInKeySet: ReadonlySet<string> = new Set(mailTemplateDefinitions.map((entry) => entry.key));

const updateSchema = z.object({
  key: z.string().trim().regex(templateKeyPattern, { message: "Invalid template key" }),
  name: z.string().trim().min(2).max(160).optional(),
  subject: z.string().trim().min(3).max(220),
  body: z.string().trim().min(10).max(8000),
  active: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  subject: z.string().trim().min(3).max(220),
  body: z.string().trim().min(10).max(8000),
  active: z.boolean().optional(),
});

function createTemplateResponse(input: {
  key: string;
  id?: string;
  name: string;
  title?: string;
  description?: string;
  subject: string;
  body: string;
  active: boolean;
  customized?: boolean;
  updatedAt?: string | null;
  system?: boolean;
}) {
  return {
    key: input.key,
    id: input.id ?? input.key,
    name: input.name,
    title: input.title ?? input.name,
    description: input.description ?? "",
    subject: input.subject,
    body: input.body,
    active: input.active,
    customized: input.customized ?? true,
    updatedAt: input.updatedAt ?? null,
    system: input.system ?? false,
  };
}

function fallbackTitleFromKey(key: string) {
  const label = key
    .replace(/^custom_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return label || "Eigene Vorlage";
}

function createCustomTemplateKey(name: string) {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "vorlage";
  const unique = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`)
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 8);
  return `custom_${base}_${unique}`;
}

function isTemplateKeyRestrictedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const typed = error as { code?: string; message?: string };
  const message = (typed.message ?? "").toLowerCase();
  return typed.code === "23514" || (message.includes("template_key") && message.includes("check"));
}

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
        templates: mailTemplateDefinitions.map((entry) =>
          createTemplateResponse({
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
            system: true,
          }),
        ),
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
  const builtInTemplates = mailTemplateDefinitions.map((entry) => {
    const customized = existingByKey.get(entry.key);
    return createTemplateResponse({
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
      system: true,
    });
  });

  const customTemplates = rows
    .filter((entry) => !builtInKeySet.has(entry.template_key))
    .map((entry) =>
      createTemplateResponse({
        key: entry.template_key,
        id: entry.template_key,
        name: (supportsNameColumn ? entry.name : null) ?? fallbackTitleFromKey(entry.template_key),
        title: (supportsNameColumn ? entry.name : null) ?? fallbackTitleFromKey(entry.template_key),
        description: "Benutzerdefinierte Vorlage.",
        subject: entry.subject,
        body: entry.body,
        active: entry.active,
        customized: true,
        updatedAt: entry.updated_at,
        system: false,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "de-CH"));

  return ok({
    featureReady: true,
    templates: [...builtInTemplates, ...customTemplates],
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

  const definition = mailTemplateDefinitions.find((entry) => entry.key === parsed.data.key);
  const defaultName = definition?.title ?? fallbackTitleFromKey(parsed.data.key);

  const upsertWithName = await supabase
    .from("notification_templates")
    .upsert(
      {
        photographer_id: auth.photographerId,
        template_key: parsed.data.key,
        name: parsed.data.name?.trim() || defaultName,
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

  if (isTemplateKeyRestrictedError(upsertResult.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Neue Mailvorlagen sind noch nicht aktiviert. Bitte Migration 20260314_0007_mail_templates_custom.sql ausführen.",
      409,
    );
  }

  if (upsertResult.error) {
    return fail("DB_ERROR", upsertResult.error.message, 500);
  }

  return ok({
    template: createTemplateResponse({
      key: upsertResult.data.template_key,
      id: upsertResult.data.template_key,
      name: (supportsNameColumn ? (upsertResult.data as NotificationTemplateRow).name : null) ?? parsed.data.name?.trim() ?? defaultName,
      title: definition?.title ?? defaultName,
      description: definition?.description ?? "Benutzerdefinierte Vorlage.",
      subject: upsertResult.data.subject,
      body: upsertResult.data.body,
      active: upsertResult.data.active,
      customized: true,
      updatedAt: upsertResult.data.updated_at,
      system: builtInKeySet.has(upsertResult.data.template_key),
    }),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensurePhotographerError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensurePhotographerError) {
    return fail("DB_ERROR", ensurePhotographerError.message, 500);
  }

  let templateKey = createCustomTemplateKey(parsed.data.name);
  let insertWithName = await supabase
    .from("notification_templates")
    .insert({
      photographer_id: auth.photographerId,
      template_key: templateKey,
      name: parsed.data.name.trim(),
      subject: parsed.data.subject,
      body: parsed.data.body,
      active: parsed.data.active ?? true,
    })
    .select("template_key,name,subject,body,active,updated_at")
    .single();

  if (insertWithName.error && (insertWithName.error as { code?: string }).code === "23505") {
    templateKey = createCustomTemplateKey(parsed.data.name);
    insertWithName = await supabase
      .from("notification_templates")
      .insert({
        photographer_id: auth.photographerId,
        template_key: templateKey,
        name: parsed.data.name.trim(),
        subject: parsed.data.subject,
        body: parsed.data.body,
        active: parsed.data.active ?? true,
      })
      .select("template_key,name,subject,body,active,updated_at")
      .single();
  }

  let insertResult = insertWithName;
  let supportsNameColumn = true;
  if (isMissingSchemaObjectError(insertWithName.error)) {
    supportsNameColumn = false;
    insertResult = await supabase
      .from("notification_templates")
      .insert({
        photographer_id: auth.photographerId,
        template_key: templateKey,
        subject: parsed.data.subject,
        body: parsed.data.body,
        active: parsed.data.active ?? true,
      })
      .select("template_key,subject,body,active,updated_at")
      .single();
  }

  if (isMissingSchemaObjectError(insertResult.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Mailtexte sind noch nicht aktiviert. Bitte Migration 20260313_0005_settings_entities.sql ausführen.",
      409,
    );
  }

  if (isTemplateKeyRestrictedError(insertResult.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Neue Mailvorlagen sind noch nicht aktiviert. Bitte Migration 20260314_0007_mail_templates_custom.sql ausführen.",
      409,
    );
  }

  if (insertResult.error) {
    return fail("DB_ERROR", insertResult.error.message, 500);
  }

  return ok({
    template: createTemplateResponse({
      key: insertResult.data.template_key,
      id: insertResult.data.template_key,
      name: (supportsNameColumn ? (insertResult.data as NotificationTemplateRow).name : null) ?? parsed.data.name.trim(),
      title: parsed.data.name.trim(),
      description: "Benutzerdefinierte Vorlage.",
      subject: insertResult.data.subject,
      body: insertResult.data.body,
      active: insertResult.data.active,
      customized: true,
      updatedAt: insertResult.data.updated_at,
      system: false,
    }),
  });
}
