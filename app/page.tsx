import Link from "next/link";

export default function HomePage() {
  return (
    <main className="grid" style={{ gap: "1.2rem" }}>
      <div className="nav">
        <Link href="/">Start</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <header className="card">
        <p className="muted small" style={{ marginBottom: "0.5rem" }}>
          Einfacher Foto-Verkauf fuer Auftrags-Shootings
        </p>
        <h1 style={{ marginBottom: "0.5rem" }}>Fotos auswaehlen, bezahlen, sofort herunterladen</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Du erstellst eine Galerie, gibst den Link weiter und deine Kundin oder dein Kunde waehlt ganz
          einfach die gewuenschten Bilder aus.
        </p>
      </header>

      <section className="grid grid-2">
        <article className="card grid" style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>1) Fuer Fotografen</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Galerie anlegen, Bilder bereitstellen, Paket festlegen und den Kundenlink teilen.
          </p>
          <Link className="btn" href="/studio" style={{ width: "fit-content" }}>
            Studio starten
          </Link>
        </article>

        <article className="card grid" style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>2) Fuer Kunden</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Link oeffnen, Passwort eingeben, Lieblingsbilder auswaehlen und sicher bezahlen.
          </p>
          <p className="mono small" style={{ margin: 0 }}>
            /g/[publicSlug]
          </p>
        </article>
      </section>
    </main>
  );
}
