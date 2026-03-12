import { compare } from "bcryptjs";
import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const accessSchema = z.object({
  password: z.string().min(1).max(128),
});

type RouteContext = {
  params: Promise<{ publicSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const payload = await request.json().catch(() => null);
  const parsed = accessSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const { publicSlug } = await context.params;
  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id,access_password_hash,status")
    .eq("public_slug", publicSlug)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const passwordMatches = await compare(parsed.data.password, gallery.data.access_password_hash);
  if (!passwordMatches) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid password", 401);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return ok({
    galleryAccessToken: crypto.randomUUID(),
    expiresAt,
  });
}
