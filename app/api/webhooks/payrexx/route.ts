import { fail } from "@/lib/http";

export async function POST() {
  return fail(
    "PAYMENT_PROVIDER_UNSUPPORTED",
    "Payrexx webhook handling is not implemented yet in this build",
    501,
  );
}
