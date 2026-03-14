import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { ensurePhotographerRecord } from "@/lib/photographers";
import { createAdminClient } from "@/lib/supabase";

const updateProfileSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  postalAddress: z.string().trim().max(500).optional(),
  mailSalutationMode: z.enum(["first_name", "full_name"]).optional(),
});

type ProfileRow = {
  display_name: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  postal_address?: string | null;
  mail_salutation_mode?: "first_name" | "full_name" | null;
};

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Photographer";
}

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  const query = await supabase
    .from("photographers")
    .select("display_name,email,first_name,last_name,postal_address,mail_salutation_mode")
    .eq("id", auth.photographerId)
    .maybeSingle<ProfileRow>();

  if (isMissingSchemaObjectError(query.error)) {
    const fallback = await supabase
      .from("photographers")
      .select("display_name,email")
      .eq("id", auth.photographerId)
      .maybeSingle<{ display_name: string; email: string | null }>();
    if (fallback.error) return fail("DB_ERROR", fallback.error.message, 500);
    return ok({
      featureReady: false,
      profile: {
        firstName: "",
        lastName: "",
        email: fallback.data?.email ?? "",
        postalAddress: "",
        mailSalutationMode: "first_name",
        displayName: fallback.data?.display_name ?? "Photographer",
      },
    });
  }

  if (query.error) return fail("DB_ERROR", query.error.message, 500);

  return ok({
    featureReady: true,
    profile: {
      firstName: query.data?.first_name ?? "",
      lastName: query.data?.last_name ?? "",
      email: query.data?.email ?? "",
      postalAddress: query.data?.postal_address ?? "",
      mailSalutationMode: query.data?.mail_salutation_mode ?? "first_name",
      displayName: query.data?.display_name ?? buildDisplayName(query.data?.first_name, query.data?.last_name),
    },
  });
}

export async function PUT(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const supabase = createAdminClient();
  const ensureError = await ensurePhotographerRecord(supabase, auth.photographerId);
  if (ensureError) return fail("DB_ERROR", ensureError.message, 500);

  const firstName = parsed.data.firstName?.trim() || null;
  const lastName = parsed.data.lastName?.trim() || null;
  const displayName = buildDisplayName(firstName ?? undefined, lastName ?? undefined);
  const email = parsed.data.email?.trim() || null;
  const postalAddress = parsed.data.postalAddress?.trim() || null;
  const mailSalutationMode = parsed.data.mailSalutationMode ?? "first_name";

  const update = await supabase
    .from("photographers")
    .update({
      display_name: displayName,
      email,
      first_name: firstName,
      last_name: lastName,
      postal_address: postalAddress,
      mail_salutation_mode: mailSalutationMode,
    })
    .eq("id", auth.photographerId)
    .select("display_name,email,first_name,last_name,postal_address,mail_salutation_mode")
    .single<ProfileRow>();

  if (isMissingSchemaObjectError(update.error)) {
    return fail(
      "FEATURE_NOT_READY",
      "Fotografen-Daten sind noch nicht aktiviert. Bitte Migration 20260314_0008_photographer_profile_and_email_settings.sql ausführen.",
      409,
    );
  }

  if (update.error) return fail("DB_ERROR", update.error.message, 500);

  return ok({
    featureReady: true,
    profile: {
      firstName: update.data.first_name ?? "",
      lastName: update.data.last_name ?? "",
      email: update.data.email ?? "",
      postalAddress: update.data.postal_address ?? "",
      mailSalutationMode: update.data.mail_salutation_mode ?? "first_name",
      displayName: update.data.display_name,
    },
  });
}
