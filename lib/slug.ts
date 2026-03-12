export function toPublicSlug(input: string) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");

  const suffix = crypto.randomUUID().split("-")[0];
  return `${base || "galerie"}-${suffix}`;
}
