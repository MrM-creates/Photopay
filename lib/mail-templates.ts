export const mailTemplateDefinitions = [
  {
    key: "gallery_share",
    title: "Freigabe-Link",
    description: "Wird beim ersten Versand der Galerie verwendet.",
    defaultSubject: "Deine Fotoauswahl ist bereit",
    defaultBody:
      "Hallo {{customer_name}},\n\nhier ist deine persönliche Galerie: {{gallery_link}}\nPasswort: {{gallery_password}}\n\nViel Freude beim Auswählen.\n\nLiebe Grüsse\n{{photographer_name}}",
  },
  {
    key: "gallery_reminder",
    title: "Erinnerung",
    description: "Wird für freundliche Erinnerungen verwendet.",
    defaultSubject: "Kurze Erinnerung zu deiner Galerie",
    defaultBody:
      "Hallo {{customer_name}},\n\nnur als kurze Erinnerung: Deine Galerie ist weiterhin verfügbar.\nLink: {{gallery_link}}\n\nBei Fragen melde dich jederzeit.\n\nLiebe Grüsse\n{{photographer_name}}",
  },
  {
    key: "download_ready",
    title: "Download bereit",
    description: "Wird nach erfolgreicher Zahlung versendet.",
    defaultSubject: "Deine Downloads sind bereit",
    defaultBody:
      "Hallo {{customer_name}},\n\ndanke für deine Bestellung. Deine Dateien kannst du hier herunterladen:\n{{download_link}}\n\nViel Freude mit den Bildern!\n\nLiebe Grüsse\n{{photographer_name}}",
  },
] as const;

export type MailTemplateKey = (typeof mailTemplateDefinitions)[number]["key"];

export const mailTemplateKeyValues = mailTemplateDefinitions.map((entry) => entry.key);
