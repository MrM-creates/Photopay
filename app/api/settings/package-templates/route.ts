import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { ensurePhotographerRecord } from "@/lib/photographers";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

function salesKey(input: {
  name: string;
  priceCents: number;
  includedCount: number;
  allowExtra: boolean;
  extraUnitPriceCents: number | null;
}) {
  return [
    input.name.trim().toLowerCase(),
    input.priceCents,
    input.includedCount,
    input.allowExtra ? 1 : 0,
    input.allowExtra ? (input.extraUnitPriceCents ?? -1) : 0,
  ].join("|");
}

const packageTemplateSchema = z
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

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const templatesQuery = await supabase
    .from("package_templates")
    .select("id,name,description,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order,updated_at")
    .eq("photographer_id", auth.photographerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (isMissingSchemaObjectError(templatesQuery.error)) {
    return ok({
      featureReady: false,
      migration: "20260313_0005_settings_entities.sql",
      templates: [],
    });
  }

  if (templatesQuery.error) {
    return fail("DB_ERROR", templatesQuery.error.message, 500);
  }

  const salesByTemplate = new Map<string, number>();

  const salesQuery = await supabase
    .from("order_items")
    .select("package_name,base_price_cents,included_count,allow_extra,extra_unit_price_cents,orders!inner(photographer_id,payment_status)")
    .eq("orders.photographer_id", auth.photographerId)
    .eq("orders.payment_status", "paid");

  if (!salesQuery.error && Array.isArray(salesQuery.data)) {
    for (const row of salesQuery.data) {
      const key = salesKey({
        name: row.package_name,
        priceCents: row.base_price_cents,
        includedCount: row.included_count,
        allowExtra: row.allow_extra,
        extraUnitPriceCents: row.extra_unit_price_cents,
      });
      salesByTemplate.set(key, (salesByTemplate.get(key) ?? 0) + 1);
    }
  }

  return ok({
    featureReady: true,
    templates: templatesQuery.data.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      priceCents: entry.price_cents,
      includedCount: entry.included_count,
      allowExtra: entry.allow_extra,
      extraUnitPriceCents: entry.extra_unit_price_cents,
      soldCount:
        salesByTemplate.get(
          salesKey({
            name: entry.name,
            priceCents: entry.price_cents,
            includedCount: entry.included_count,
            allowExtra: entry.allow_extra,
            extraUnitPriceCents: entry.extra_unit_price_cents,
          }),
        ) ?? 0,
      active: entry.active,
      sortOrder: entry.sort_order,
      updatedAt: entry.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = packageTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensurePhotographerError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensurePhotographerError) {
    return fail("DB_ERROR", ensurePhotographerError.message, 500);
  }

  let sortOrder = parsed.data.sortOrder;
  if (sortOrder === undefined) {
    const max = await supabase
      .from("package_templates")
      .select("sort_order")
      .eq("photographer_id", auth.photographerId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isMissingSchemaObjectError(max.error)) {
      sortOrder = 0;
    } else if (max.error) {
      return fail("DB_ERROR", max.error.message, 500);
    } else {
      sortOrder = (max.data?.sort_order ?? -1) + 1;
    }
  }

  const insert = await supabase
    .from("package_templates")
    .insert({
      photographer_id: auth.photographerId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price_cents: parsed.data.priceCents,
      currency: "CHF",
      included_count: parsed.data.includedCount,
      allow_extra: parsed.data.allowExtra,
      extra_unit_price_cents: parsed.data.allowExtra ? parsed.data.extraUnitPriceCents : null,
      active: parsed.data.active ?? true,
      sort_order: sortOrder ?? 0,
    })
    .select("id,name,description,price_cents,included_count,allow_extra,extra_unit_price_cents,active,sort_order,updated_at")
    .single();

  if (isMissingSchemaObjectError(insert.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Paketvorlagen sind noch nicht aktiviert. Bitte Migration 20260313_0005_settings_entities.sql ausführen.",
      409,
    );
  }

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      template: {
        id: insert.data.id,
        name: insert.data.name,
        description: insert.data.description,
        priceCents: insert.data.price_cents,
        includedCount: insert.data.included_count,
        allowExtra: insert.data.allow_extra,
        extraUnitPriceCents: insert.data.extra_unit_price_cents,
        soldCount: 0,
        active: insert.data.active,
        sortOrder: insert.data.sort_order,
        updatedAt: insert.data.updated_at,
      },
    },
    201,
  );
}
