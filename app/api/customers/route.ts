import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { upsertCustomerForPhotographer } from "@/lib/customers";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const createCustomerSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(320),
  note: z.string().trim().max(1000).optional(),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const customers = await supabase
    .from("customers")
    .select("id,full_name,email,note,last_used_at,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (customers.error?.code === "42P01") {
    return ok({ customers: [] });
  }

  if (customers.error) {
    return fail("DB_ERROR", customers.error.message, 500);
  }

  return ok({
    customers: customers.data.map((customer) => ({
      id: customer.id,
      fullName: customer.full_name,
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
    email: parsed.data.email,
    note: parsed.data.note ?? null,
  });

  if (upsert.error) {
    return fail("DB_ERROR", upsert.error.message, 500);
  }

  return ok(
    {
      customer: {
        id: upsert.data.id,
        fullName: upsert.data.full_name,
        email: upsert.data.email,
        note: upsert.data.note,
        lastUsedAt: upsert.data.last_used_at,
      },
    },
    201,
  );
}
