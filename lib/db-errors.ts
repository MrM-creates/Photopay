type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

export function isMissingSchemaObjectError(error: DbErrorLike) {
  if (!error) return false;

  const code = (error.code ?? "").toUpperCase();
  if (code === "42703" || code === "42P01" || code === "PGRST204") return true;

  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("relation") && text.includes("does not exist")) ||
    text.includes("could not find the")
  );
}
