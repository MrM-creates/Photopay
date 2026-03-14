import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { buildCustomerFullName, normalizeCustomerEmail } from "@/lib/customers";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const paramsSchema = z.object({
  customerId: z.string().uuid(),
});

const updateCustomerSchema = z
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

type CustomerRow = {
  id: string;
  customer_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  email: string;
  note: string | null;
  last_used_at: string | null;
};

function toCustomerResponse(row: CustomerRow) {
  return {
    id: row.id,
    customerNumber: row.customer_number ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    fullName: buildCustomerFullName({
      fullName: row.full_name,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
    }),
    email: row.email,
    note: row.note,
    lastUsedAt: row.last_used_at,
  };
}

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return fail("VALIDATION_ERROR", "Ungültige Kunden-ID.", 422, { issues: params.error.issues });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const fullName = buildCustomerFullName({
    fullName: parsed.data.fullName ?? null,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
  });

  const basePayload: Record<string, unknown> = {
    full_name: fullName,
    email: parsed.data.email.trim(),
    email_normalized: normalizeCustomerEmail(parsed.data.email),
    note: parsed.data.note?.trim() || null,
    last_used_at: new Date().toISOString(),
  };

  const extendedPayload: Record<string, unknown> = {
    ...basePayload,
    first_name: parsed.data.firstName?.trim() || null,
    last_name: parsed.data.lastName?.trim() || null,
  };

  const extendedUpdate = await supabase
    .from("customers")
    .update(extendedPayload)
    .eq("id", params.data.customerId)
    .eq("photographer_id", auth.photographerId)
    .select("id,customer_number,first_name,last_name,full_name,email,note,last_used_at")
    .single<CustomerRow>();

  if (isMissingSchemaObjectError(extendedUpdate.error)) {
    const fallbackUpdate = await supabase
      .from("customers")
      .update(basePayload)
      .eq("id", params.data.customerId)
      .eq("photographer_id", auth.photographerId)
      .select("id,full_name,email,note,last_used_at")
      .single<CustomerRow>();

    if (fallbackUpdate.error) return fail("DB_ERROR", fallbackUpdate.error.message, 500);
    return ok({ customer: toCustomerResponse(fallbackUpdate.data) });
  }

  if (extendedUpdate.error) {
    return fail("DB_ERROR", extendedUpdate.error.message, 500);
  }

  return ok({ customer: toCustomerResponse(extendedUpdate.data) });
}

export async function DELETE(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return fail("VALIDATION_ERROR", "Ungültige Kunden-ID.", 422, { issues: params.error.issues });
  }

  const supabase = createAdminClient();
  const deletion = await supabase
    .from("customers")
    .delete()
    .eq("id", params.data.customerId)
    .eq("photographer_id", auth.photographerId);

  if (deletion.error) {
    return fail("DB_ERROR", deletion.error.message, 500);
  }

  return ok({ deleted: true });
}
