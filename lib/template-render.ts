export function renderTemplate(template: string, values: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key];
    return value ?? "";
  });
}
