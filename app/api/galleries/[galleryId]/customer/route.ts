import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { upsertCustomerForPhotographer } from "@/lib/customers";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

const patchCustomerSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("clear"),
  }),
  z.object({
    mode: z.literal("select"),
    customerId: z.string().uuid(),
  }),
  z.object({
    mode: z.literal("upsert"),
    fullName: z.string().trim().min(1).max(180),
    email: z.string().trim().email().max(320),
    note: z.string().trim().max(1000).optional(),
  }),
]);

async function loadOwnedGallery(
  galleryId: string,
  photographerId: string,
) {
  const supabase = createAdminClient();
  const query = await supabase
    .from("galleries")
    .select("id,photographer_id,customer_id")
    .eq("id", galleryId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (query.error?.code === "42703") {
    return {
      featureReady: false as const,
      supabase,
      gallery: null,
      error: null,
    };
  }

  if (query.error) {
    return {
      featureReady: true as const,
      supabase,
      gallery: null,
      error: query.error,
    };
  }

  return {
    featureReady: true as const,
    supabase,
    gallery: query.data,
    error: null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const owned = await loadOwnedGallery(galleryId, auth.photographerId);
  if (!owned.featureReady) {
    return ok({ customer: null, featureReady: false });
  }
  if (owned.error) return fail("DB_ERROR", owned.error.message, 500);
  if (!owned.gallery) return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);

  if (!owned.gallery.customer_id) {
    return ok({ customer: null, featureReady: true });
  }

  const customer = await owned.supabase
    .from("customers")
    .select("id,full_name,email,note,last_used_at")
    .eq("id", owned.gallery.customer_id)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (customer.error?.code === "42P01") {
    return ok({ customer: null, featureReady: false });
  }
  if (customer.error) return fail("DB_ERROR", customer.error.message, 500);
  if (!customer.data) return ok({ customer: null, featureReady: true });

  return ok({
    featureReady: true,
    customer: {
      id: customer.data.id,
      fullName: customer.data.full_name,
      email: customer.data.email,
      note: customer.data.note,
      lastUsedAt: customer.data.last_used_at,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const payload = await request.json().catch(() => null);
  const parsed = patchCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const owned = await loadOwnedGallery(galleryId, auth.photographerId);
  if (!owned.featureReady) {
    return fail(
      "FEATURE_NOT_READY",
      "Customer assignment is not available yet. Please run migration 20260312_0003_customers_and_engagement.sql.",
      409,
    );
  }
  if (owned.error) return fail("DB_ERROR", owned.error.message, 500);
  if (!owned.gallery) return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);

  if (parsed.data.mode === "clear") {
    const update = await owned.supabase
      .from("galleries")
      .update({ customer_id: null })
      .eq("id", galleryId)
      .eq("photographer_id", auth.photographerId);

    if (update.error) return fail("DB_ERROR", update.error.message, 500);
    return ok({ featureReady: true, customer: null });
  }

  if (parsed.data.mode === "select") {
    const customer = await owned.supabase
      .from("customers")
      .select("id,full_name,email,note,last_used_at")
      .eq("id", parsed.data.customerId)
      .eq("photographer_id", auth.photographerId)
      .maybeSingle();

    if (customer.error) return fail("DB_ERROR", customer.error.message, 500);
    if (!customer.data) return fail("CUSTOMER_NOT_FOUND", "Customer not found", 404);

    const update = await owned.supabase
      .from("galleries")
      .update({ customer_id: customer.data.id })
      .eq("id", galleryId)
      .eq("photographer_id", auth.photographerId);

    if (update.error) return fail("DB_ERROR", update.error.message, 500);

    const touch = await owned.supabase
      .from("customers")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", customer.data.id)
      .eq("photographer_id", auth.photographerId);

    if (touch.error) return fail("DB_ERROR", touch.error.message, 500);

    return ok({
      featureReady: true,
      customer: {
        id: customer.data.id,
        fullName: customer.data.full_name,
        email: customer.data.email,
        note: customer.data.note,
        lastUsedAt: new Date().toISOString(),
      },
    });
  }

  const upsert = await upsertCustomerForPhotographer(owned.supabase, auth.photographerId, {
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    note: parsed.data.note ?? null,
  });

  if (upsert.error) {
    return fail("DB_ERROR", upsert.error.message, 500);
  }

  const update = await owned.supabase
    .from("galleries")
    .update({ customer_id: upsert.data.id })
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId);

  if (update.error) return fail("DB_ERROR", update.error.message, 500);

  return ok({
    featureReady: true,
    customer: {
      id: upsert.data.id,
      fullName: upsert.data.full_name,
      email: upsert.data.email,
      note: upsert.data.note,
      lastUsedAt: upsert.data.last_used_at,
    },
  });
}
