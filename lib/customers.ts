import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { isMissingSchemaObjectError } from "@/lib/db-errors";

type CustomerRow = {
  id: string;
  photographer_id: string;
  customer_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  email: string;
  email_normalized: string;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  note?: string | null;
};

export type UpsertCustomerResult =
  | { data: CustomerRow; error: null }
  | { data: null; error: PostgrestError };

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildCustomerFullName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const explicit = input.fullName?.trim();
  if (explicit) return explicit;

  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || "Kunde";
}

function deriveNameParts(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function nextCustomerNumber(supabase: SupabaseClient, photographerId: string) {
  const query = await supabase
    .from("customers")
    .select("customer_number")
    .eq("photographer_id", photographerId)
    .not("customer_number", "is", null);

  if (isMissingSchemaObjectError(query.error)) return null;
  if (query.error) return query.error;

  let max = 0;
  for (const row of query.data) {
    const value = row.customer_number ?? "";
    const match = value.match(/(\d+)\s*$/);
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isInteger(numeric) && numeric > max) {
      max = numeric;
    }
  }

  return `K-${String(max + 1).padStart(4, "0")}`;
}

export async function upsertCustomerForPhotographer(
  supabase: SupabaseClient,
  photographerId: string,
  input: CustomerInput,
): Promise<UpsertCustomerResult> {
  const emailNormalized = normalizeCustomerEmail(input.email);
  const fullName = buildCustomerFullName({
    fullName: input.fullName ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
  });
  const derived = deriveNameParts(fullName);
  const firstName = (input.firstName?.trim() || derived.firstName).trim();
  const lastName = (input.lastName?.trim() || derived.lastName).trim();

  const extendedSelect =
    "id,photographer_id,customer_number,first_name,last_name,full_name,email,email_normalized,note,last_used_at,created_at,updated_at";
  const fallbackSelect =
    "id,photographer_id,full_name,email,email_normalized,note,last_used_at,created_at,updated_at";

  const existingExtended = await supabase
    .from("customers")
    .select(extendedSelect)
    .eq("photographer_id", photographerId)
    .eq("email_normalized", emailNormalized)
    .maybeSingle<CustomerRow>();

  let supportsExtendedColumns = true;
  let existing = existingExtended;

  if (isMissingSchemaObjectError(existingExtended.error)) {
    supportsExtendedColumns = false;
    existing = await supabase
      .from("customers")
      .select(fallbackSelect)
      .eq("photographer_id", photographerId)
      .eq("email_normalized", emailNormalized)
      .maybeSingle<CustomerRow>();
  }

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (existing.data) {
    const patchPayload: Record<string, unknown> = {
      full_name: fullName,
      email: input.email.trim(),
      email_normalized: emailNormalized,
      note: input.note?.trim() || null,
      last_used_at: new Date().toISOString(),
    };

    if (supportsExtendedColumns) {
      patchPayload.first_name = firstName || null;
      patchPayload.last_name = lastName || null;

      if (!existing.data.customer_number) {
        const next = await nextCustomerNumber(supabase, photographerId);
        if (typeof next === "string") {
          patchPayload.customer_number = next;
        } else if (next) {
          return { data: null, error: next };
        }
      }
    }

    const update = await supabase
      .from("customers")
      .update(patchPayload)
      .eq("id", existing.data.id)
      .eq("photographer_id", photographerId)
      .select(supportsExtendedColumns ? extendedSelect : fallbackSelect)
      .single<CustomerRow>();

    return update.error ? { data: null, error: update.error } : { data: update.data, error: null };
  }

  const insertPayload: Record<string, unknown> = {
    photographer_id: photographerId,
    full_name: fullName,
    email: input.email.trim(),
    email_normalized: emailNormalized,
    note: input.note?.trim() || null,
    last_used_at: new Date().toISOString(),
  };

  if (supportsExtendedColumns) {
    insertPayload.first_name = firstName || null;
    insertPayload.last_name = lastName || null;

    const next = await nextCustomerNumber(supabase, photographerId);
    if (typeof next === "string") {
      insertPayload.customer_number = next;
    } else if (next) {
      return { data: null, error: next };
    }
  }

  const insert = await supabase
    .from("customers")
    .insert(insertPayload)
    .select(supportsExtendedColumns ? extendedSelect : fallbackSelect)
    .single<CustomerRow>();

  return insert.error ? { data: null, error: insert.error } : { data: insert.data, error: null };
}
