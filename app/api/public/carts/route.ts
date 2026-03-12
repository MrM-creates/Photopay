import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const createCartSchema = z.object({
  publicSlug: z.string().trim().min(3).max(180),
  customerName: z.string().trim().min(1).max(180).optional(),
  customerEmail: z.string().trim().email().max(320),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createCartSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id,status")
    .eq("public_slug", parsed.data.publicSlug)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  if (gallery.data.status !== "published") {
    return fail("GALLERY_NOT_AVAILABLE", "Gallery is not published", 409);
  }

  const cartInsert = await supabase
    .from("carts")
    .insert({
      gallery_id: gallery.data.id,
      customer_name: parsed.data.customerName ?? null,
      customer_email: parsed.data.customerEmail,
      status: "open",
    })
    .select("id,access_token")
    .single();

  if (cartInsert.error) {
    return fail("DB_ERROR", cartInsert.error.message, 500);
  }

  return ok(
    {
      cartId: cartInsert.data.id,
      cartAccessToken: cartInsert.data.access_token,
    },
    201,
  );
}
