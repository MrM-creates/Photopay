import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const packageSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    priceCents: z.number().int().min(0),
    includedCount: z.number().int().min(1),
    allowExtra: z.boolean(),
    extraUnitPriceCents: z.number().int().min(0).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.allowExtra && (value.extraUnitPriceCents === null || value.extraUnitPriceCents === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["extraUnitPriceCents"],
        message: "extraUnitPriceCents is required when allowExtra=true",
      });
    }

    if (!value.allowExtra && value.extraUnitPriceCents !== null && value.extraUnitPriceCents !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["extraUnitPriceCents"],
        message: "extraUnitPriceCents must be null when allowExtra=false",
      });
    }
  });

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const packagesQuery = await supabase
    .from("packages")
    .select(
      "id,name,description,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order",
    )
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: true });

  if (packagesQuery.error) {
    return fail("DB_ERROR", packagesQuery.error.message, 500);
  }

  return ok({
    packages: packagesQuery.data.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      priceCents: pkg.price_cents,
      includedCount: pkg.included_count,
      allowExtra: pkg.allow_extra,
      extraUnitPriceCents: pkg.extra_unit_price_cents,
      active: pkg.active,
      sortOrder: pkg.sort_order,
    })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = packageSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const insert = await supabase
    .from("packages")
    .insert({
      gallery_id: galleryId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price_cents: parsed.data.priceCents,
      currency: "CHF",
      included_count: parsed.data.includedCount,
      allow_extra: parsed.data.allowExtra,
      extra_unit_price_cents: parsed.data.allowExtra ? parsed.data.extraUnitPriceCents : null,
      active: parsed.data.active ?? true,
      sort_order: parsed.data.sortOrder ?? 0,
    })
    .select(
      "id,gallery_id,name,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order",
    )
    .single();

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      id: insert.data.id,
      galleryId: insert.data.gallery_id,
      name: insert.data.name,
      priceCents: insert.data.price_cents,
      includedCount: insert.data.included_count,
      allowExtra: insert.data.allow_extra,
      extraUnitPriceCents: insert.data.extra_unit_price_cents,
      active: insert.data.active,
      sortOrder: insert.data.sort_order,
    },
    201,
  );
}
