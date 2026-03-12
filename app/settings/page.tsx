import Link from "next/link";

const settingsItems = [
  {
    title: "Pakete verwalten",
    text: "Hier verwaltest du künftig deine globalen Paketvorlagen, die du in Projekte übernehmen kannst.",
    status: "Nächster Ausbau",
  },
  {
    title: "Kundenmanagement",
    text: "Kunden zentral verwalten: neu erfassen, bestehende Kunden wiederverwenden und Historie einsehen.",
    status: "MVP aktiv",
  },
  {
    title: "Mailtexte verwalten",
    text: "Standardtexte für Freigabe, Erinnerungen und Hinweise zentral anpassen.",
    status: "Geplant",
  },
];

export default function SettingsPage() {
  return (
    <main className="landing-shell">
      <nav aria-label="Hauptmenü" className="landing-menu">
        <Link className="landing-menu-link" href="/">
          Start
        </Link>
        <Link className="landing-menu-link" href="/studio?step=create&mode=open">
          Studio
        </Link>
        <Link className="landing-menu-link landing-menu-link-active" href="/settings">
          <span aria-hidden="true">&#9881;</span> Einstellungen
        </Link>
      </nav>

      <section className="card settings-hero">
        <p className="pill">Projektübergreifende Verwaltung</p>
        <h1 className="landing-title">Einstellungen</h1>
        <p className="helper" style={{ marginBottom: 0, maxWidth: "62ch" }}>
          Hier konfigurierst du alles, was nicht an ein einzelnes Projekt gebunden ist.
        </p>
      </section>

      <section className="settings-grid" aria-label="Einstellungsbereiche">
        {settingsItems.map((item) => (
          <article className="benefit-card" key={item.title}>
            <p className="small muted" style={{ marginBottom: "0.35rem" }}>
              {item.status}
            </p>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
