import type { SupabaseClient } from "@supabase/supabase-js";

export type CartRow = {
  id: string;
  gallery_id: string;
  status: string;
  access_token: string;
  customer_name: string | null;
  customer_email: string;
};

export async function fetchCart(client: SupabaseClient, cartId: string) {
  const { data, error } = await client
    .from("carts")
    .select("id,gallery_id,status,access_token,customer_name,customer_email")
    .eq("id", cartId)
    .maybeSingle<CartRow>();

  if (error) {
    throw error;
  }

  return data;
}
