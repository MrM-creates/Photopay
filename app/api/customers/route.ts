import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { buildCustomerFullName, upsertCustomerForPhotographer } from "@/lib/customers";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const createCustomerSchema = z
  .object({
  fullName: z.string().trim().min(1).max(180).optional(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(1000).optional(),
})
  .superRefine((value, ctx) => {
    if (!value.fullName && !value.firstName) {
      ctx.addIssue({
        code: "custom",
        path: ["firstName"],
        message: "Bitte mindestens Vorname oder Name angeben.",
      });
    }
  });

export const runtime = "nodejs";

type CustomerResponseRow = {
  id: string;
  customer_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  email: string;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const customersExtended = await supabase
    .from("customers")
    .select("id,customer_number,first_name,last_name,full_name,email,note,last_used_at,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  let rows: CustomerResponseRow[] = [];
  if (isMissingSchemaObjectError(customersExtended.error)) {
    const customersFallback = await supabase
      .from("customers")
      .select("id,full_name,email,note,last_used_at,created_at")
      .eq("photographer_id", auth.photographerId)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (isMissingSchemaObjectError(customersFallback.error)) {
      return ok({ customers: [] });
    }
    if (customersFallback.error) {
      return fail("DB_ERROR", customersFallback.error.message, 500);
    }
    rows = customersFallback.data as CustomerResponseRow[];
  } else if (customersExtended.error) {
    return fail("DB_ERROR", customersExtended.error.message, 500);
  } else {
    rows = customersExtended.data as CustomerResponseRow[];
  }

  return ok({
    customers: rows.map((customer) => ({
      id: customer.id,
      customerNumber: customer.customer_number ?? null,
      firstName: customer.first_name ?? null,
      lastName: customer.last_name ?? null,
      fullName: buildCustomerFullName({
        fullName: customer.full_name,
        firstName: customer.first_name ?? null,
        lastName: customer.last_name ?? null,
      }),
      email: customer.email,
      note: customer.note,
      lastUsedAt: customer.last_used_at,
      createdAt: customer.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = createCustomerSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();

  const upsert = await upsertCustomerForPhotographer(supabase, auth.photographerId, {
    fullName: parsed.data.fullName,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    note: parsed.data.note ?? null,
  });

  if (upsert.error) {
    if (isMissingSchemaObjectError(upsert.error)) {
      return fail(
        "FEATURE_NOT_READY",
        "Customer management is not available yet. Please run migration 20260312_0003_customers_and_engagement.sql.",
        409,
      );
    }
    return fail("DB_ERROR", upsert.error.message, 500);
  }

  return ok(
    {
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
    },
    201,
  );
}
