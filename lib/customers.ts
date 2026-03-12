import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

type CustomerRow = {
  id: string;
  photographer_id: string;
  full_name: string;
  email: string;
  email_normalized: string;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = {
  fullName: string;
  email: string;
  note?: string | null;
};

export type UpsertCustomerResult =
  | { data: CustomerRow; error: null }
  | { data: null; error: PostgrestError };

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function upsertCustomerForPhotographer(
  supabase: SupabaseClient,
  photographerId: string,
  input: CustomerInput,
): Promise<UpsertCustomerResult> {
  const emailNormalized = normalizeCustomerEmail(input.email);

  const existing = await supabase
    .from("customers")
    .select("id,photographer_id,full_name,email,email_normalized,note,last_used_at,created_at,updated_at")
    .eq("photographer_id", photographerId)
    .eq("email_normalized", emailNormalized)
    .maybeSingle<CustomerRow>();

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (existing.data) {
    const update = await supabase
      .from("customers")
      .update({
        full_name: input.fullName,
        email: input.email.trim(),
        email_normalized: emailNormalized,
        note: input.note?.trim() || null,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .eq("photographer_id", photographerId)
      .select("id,photographer_id,full_name,email,email_normalized,note,last_used_at,created_at,updated_at")
      .single<CustomerRow>();

    return update.error ? { data: null, error: update.error } : { data: update.data, error: null };
  }

  const insert = await supabase
    .from("customers")
    .insert({
      photographer_id: photographerId,
      full_name: input.fullName,
      email: input.email.trim(),
      email_normalized: emailNormalized,
      note: input.note?.trim() || null,
      last_used_at: new Date().toISOString(),
    })
    .select("id,photographer_id,full_name,email,email_normalized,note,last_used_at,created_at,updated_at")
    .single<CustomerRow>();

  return insert.error ? { data: null, error: insert.error } : { data: insert.data, error: null };
}
