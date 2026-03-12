import { fail } from "@/lib/http";

export async function POST() {
  return fail(
    "NOT_IMPLEMENTED",
    "Signed upload URLs are not implemented yet. Use /assets/finalize for MVP seeding.",
    501,
  );
}
