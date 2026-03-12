import { fail, ok } from "@/lib/http";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type GalleryLifecycleRow = {
  id: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  archive_after_days?: number | null;
  never_auto_archive?: boolean | null;
};

function readCronSecret(headers: Headers) {
  const explicit = headers.get("x-cron-secret");
  if (explicit) return explicit;

  const auth = headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return "";
}

export async function POST(request: Request) {
  const expectedSecret = process.env.ARCHIVE_CRON_SECRET ?? "";
  if (!expectedSecret) {
    return fail("CONFIG_ERROR", "Missing ARCHIVE_CRON_SECRET", 500);
  }

  const incomingSecret = readCronSecret(request.headers);
  if (!incomingSecret || incomingSecret !== expectedSecret) {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const supabase = createAdminClient();
  const lifecycleQuery = await supabase
    .from("galleries")
    .select("id,status,published_at,archive_after_days,never_auto_archive")
    .eq("status", "published");

  if (isMissingSchemaObjectError(lifecycleQuery.error)) {
    return ok({
      checked: 0,
      archived: 0,
      archivedIds: [] as string[],
      skipped: "Lifecycle columns missing. Run migration 20260312_0002_gallery_lifecycle.sql.",
    });
  }

  if (lifecycleQuery.error) {
    return fail("DB_ERROR", lifecycleQuery.error.message, 500);
  }

  const now = Date.now();
  const rows = (lifecycleQuery.data ?? []) as GalleryLifecycleRow[];
  const dueIds = rows
    .filter((row) => !row.never_auto_archive)
    .filter((row) => row.status === "published")
    .filter((row) => Boolean(row.published_at))
    .filter((row) => {
      const publishedAtMs = new Date(row.published_at as string).getTime();
      if (Number.isNaN(publishedAtMs)) return false;
      const archiveAfterDays = row.archive_after_days ?? 90;
      const dueAtMs = publishedAtMs + archiveAfterDays * 24 * 60 * 60 * 1000;
      return dueAtMs <= now;
    })
    .map((row) => row.id);

  if (dueIds.length === 0) {
    return ok({
      checked: rows.length,
      archived: 0,
      archivedIds: [] as string[],
    });
  }

  const archiveUpdate = await supabase
    .from("galleries")
    .update({ status: "archived" })
    .in("id", dueIds)
    .eq("status", "published")
    .select("id");

  if (archiveUpdate.error) {
    return fail("DB_ERROR", archiveUpdate.error.message, 500);
  }

  return ok({
    checked: rows.length,
    archived: archiveUpdate.data.length,
    archivedIds: archiveUpdate.data.map((row) => row.id),
  });
}
