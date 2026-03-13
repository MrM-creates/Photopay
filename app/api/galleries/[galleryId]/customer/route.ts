import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { buildCustomerFullName, upsertCustomerForPhotographer } from "@/lib/customers";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

type LoadedCustomer = {
  id: string;
  customer_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  email: string;
  note: string | null;
  last_used_at: string | null;
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
    fullName: z.string().trim().min(1).max(180).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(320),
    note: z.string().trim().max(1000).optional(),
  }).superRefine((value, ctx) => {
    if (!value.fullName && !value.firstName) {
      ctx.addIssue({
        code: "custom",
        path: ["firstName"],
        message: "Bitte mindestens Vorname oder Name angeben.",
      });
    }
  }),
]);

async function loadCustomerById(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string,
  photographerId: string,
) {
  const extended = await supabase
    .from("customers")
    .select("id,customer_number,first_name,last_name,full_name,email,note,last_used_at")
    .eq("id", customerId)
    .eq("photographer_id", photographerId)
    .maybeSingle<LoadedCustomer>();

  if (isMissingSchemaObjectError(extended.error)) {
    const fallback = await supabase
      .from("customers")
      .select("id,full_name,email,note,last_used_at")
      .eq("id", customerId)
      .eq("photographer_id", photographerId)
      .maybeSingle<LoadedCustomer>();

    return fallback;
  }

  return extended;
}

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

  if (isMissingSchemaObjectError(query.error)) {
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

  const customer = await loadCustomerById(owned.supabase, owned.gallery.customer_id, auth.photographerId);

  if (isMissingSchemaObjectError(customer.error)) {
    return ok({ customer: null, featureReady: false });
  }
  if (customer.error) return fail("DB_ERROR", customer.error.message, 500);
  if (!customer.data) return ok({ customer: null, featureReady: true });

  return ok({
    featureReady: true,
    customer: {
      id: customer.data.id,
      customerNumber: customer.data.customer_number ?? null,
      firstName: customer.data.first_name ?? null,
      lastName: customer.data.last_name ?? null,
      fullName: buildCustomerFullName({
        fullName: customer.data.full_name,
        firstName: customer.data.first_name ?? null,
        lastName: customer.data.last_name ?? null,
      }),
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
    const customer = await loadCustomerById(owned.supabase, parsed.data.customerId, auth.photographerId);

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
        customerNumber: customer.data.customer_number ?? null,
        firstName: customer.data.first_name ?? null,
        lastName: customer.data.last_name ?? null,
        fullName: buildCustomerFullName({
          fullName: customer.data.full_name,
          firstName: customer.data.first_name ?? null,
          lastName: customer.data.last_name ?? null,
        }),
        email: customer.data.email,
        note: customer.data.note,
        lastUsedAt: new Date().toISOString(),
      },
    });
  }

  const upsert = await upsertCustomerForPhotographer(owned.supabase, auth.photographerId, {
    fullName: parsed.data.fullName,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
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
      customerNumber: upsert.data.customer_number ?? null,
      firstName: upsert.data.first_name ?? null,
      lastName: upsert.data.last_name ?? null,
      fullName: upsert.data.full_name,
      email: upsert.data.email,
      note: upsert.data.note,
      lastUsedAt: upsert.data.last_used_at,
    },
  });
}
