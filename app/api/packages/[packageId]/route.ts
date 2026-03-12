import { z } from "zod";

import { readPhotographerId, readProjectId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const patchPackageSchema = z
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
  params: Promise<{ packageId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;
  const projectContext = readProjectId(request.headers);
  if ("error" in projectContext) return projectContext.error;

  const { packageId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchPackageSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();

  const existing = await supabase
    .from("packages")
    .select("id,gallery_id,allow_extra")
    .eq("id", packageId)
    .maybeSingle();

  if (existing.error) {
    return fail("DB_ERROR", existing.error.message, 500);
  }

  if (!existing.data) {
    return fail("PACKAGE_NOT_FOUND", "Package not found", 404);
  }

  if (projectContext.projectId !== existing.data.gallery_id) {
    return fail("CONTEXT_MISMATCH", "Project context mismatch", 409, {
      expectedProjectId: existing.data.gallery_id,
      requestProjectId: projectContext.projectId,
    });
  }

  const ownsGallery = await supabase
    .from("galleries")
    .select("id")
    .eq("id", existing.data.gallery_id)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (ownsGallery.error) {
    return fail("DB_ERROR", ownsGallery.error.message, 500);
  }

  if (!ownsGallery.data) {
    return fail("PACKAGE_NOT_FOUND", "Package not found", 404);
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
      return fail(
        "VALIDATION_ERROR",
        "extraUnitPriceCents is required when allowExtra=true",
        422,
      );
    }
    patchPayload.extra_unit_price_cents = extraPrice;
  } else {
    patchPayload.extra_unit_price_cents = null;
  }

  const update = await supabase
    .from("packages")
    .update(patchPayload)
    .eq("id", packageId)
    .select("id,name,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order")
    .single();

  if (update.error) {
    return fail("DB_ERROR", update.error.message, 500);
  }

  return ok({
    id: update.data.id,
    projectId: existing.data.gallery_id,
    name: update.data.name,
    priceCents: update.data.price_cents,
    includedCount: update.data.included_count,
    allowExtra: update.data.allow_extra,
    extraUnitPriceCents: update.data.extra_unit_price_cents,
    active: update.data.active,
    sortOrder: update.data.sort_order,
  });
}
