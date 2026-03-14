import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    includedCount: z.number().int().min(1).optional(),
    allowExtra: z.boolean().optional(),
    extraUnitPriceCents: z.number().int().min(0).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

type RouteContext = {
  params: Promise<{ templateId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { templateId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const existing = await supabase
    .from("package_templates")
    .select("id,allow_extra")
    .eq("id", templateId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (isMissingSchemaObjectError(existing.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Paketvorlagen sind noch nicht aktiviert. Bitte Migration 20260313_0005_settings_entities.sql ausführen.",
      409,
    );
  }

  if (existing.error) {
    return fail("DB_ERROR", existing.error.message, 500);
  }

  if (!existing.data) {
    return fail("PACKAGE_TEMPLATE_NOT_FOUND", "Paketvorlage nicht gefunden", 404);
  }

  const nextAllowExtra = parsed.data.allowExtra ?? existing.data.allow_extra;
  const patchPayload: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) patchPayload.name = parsed.data.name;
  if (parsed.data.description !== undefined) patchPayload.description = parsed.data.description;
  if (parsed.data.priceCents !== undefined) patchPayload.price_cents = parsed.data.priceCents;
  if (parsed.data.includedCount !== undefined) patchPayload.included_count = parsed.data.includedCount;
  if (parsed.data.allowExtra !== undefined) patchPayload.allow_extra = parsed.data.allowExtra;
  if (parsed.data.active !== undefined) patchPayload.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) patchPayload.sort_order = parsed.data.sortOrder;

  if (nextAllowExtra) {
    const extraPrice = parsed.data.extraUnitPriceCents;
    if (extraPrice === undefined || extraPrice === null) {
      return fail("VALIDATION_ERROR", "extraUnitPriceCents is required when allowExtra=true", 422);
    }
    patchPayload.extra_unit_price_cents = extraPrice;
  } else {
    patchPayload.extra_unit_price_cents = null;
  }

  const update = await supabase
    .from("package_templates")
    .update(patchPayload)
    .eq("id", templateId)
    .eq("photographer_id", auth.photographerId)
    .select("id,name,description,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order,updated_at")
    .single();

  if (update.error) {
    return fail("DB_ERROR", update.error.message, 500);
  }

  return ok({
    template: {
      id: update.data.id,
      name: update.data.name,
      description: update.data.description,
      priceCents: update.data.price_cents,
      includedCount: update.data.included_count,
      allowExtra: update.data.allow_extra,
      extraUnitPriceCents: update.data.extra_unit_price_cents,
      soldCount: 0,
      active: update.data.active,
      sortOrder: update.data.sort_order,
      updatedAt: update.data.updated_at,
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { templateId } = await context.params;
  const supabase = createAdminClient();

  const remove = await supabase
    .from("package_templates")
    .delete()
    .eq("id", templateId)
    .eq("photographer_id", auth.photographerId);

  if (isMissingSchemaObjectError(remove.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Paketvorlagen sind noch nicht aktiviert. Bitte Migration 20260313_0005_settings_entities.sql ausführen.",
      409,
    );
  }

  if (remove.error) {
    return fail("DB_ERROR", remove.error.message, 500);
  }

  return ok({ deleted: true });
}
