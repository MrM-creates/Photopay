import Link from "next/link";

export default function HomePage() {
  return (
    <main className="grid" style={{ gap: "1.2rem" }}>
      <div className="nav">
        <Link href="/">Start</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <header className="card app-hero">
        <span className="pill">PhotoPay fuer Fotografen</span>
        <h1 className="hero-title" style={{ marginBottom: 0 }}>
          Dein Shooting in 4 klaren Schritten online verkaufen
        </h1>
        <p className="muted" style={{ marginBottom: 0, maxWidth: "62ch" }}>
          Galerie anlegen, Bilder bereitstellen, Pakete festlegen und Kundenlink teilen. Deine Kundschaft waehlt, bezahlt
          und laedt danach die gekauften Fotos herunter.
        </p>
        <div className="toolbar">
          <Link className="btn" href="/studio">
            Studio oeffnen
          </Link>
          <Link className="btn btn-secondary" href="/studio#sharing">
            Kundenlink vorbereiten
          </Link>
        </div>
      </header>

      <section className="grid grid-2">
        <article className="card">
          <h2 style={{ marginBottom: "0.45rem" }}>Fotografen-Bereich</h2>
          <p className="helper" style={{ marginBottom: "0.65rem" }}>
            Du arbeitest in einem gefuehrten Studio mit klaren Menues:
          </p>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Uebersicht, Galerien, Pakete & Preise, Kundenlinks, Einstellungen.
          </p>
        </article>

        <article className="card">
          <h2 style={{ marginBottom: "0.45rem" }}>Kunden-Bereich</h2>
          <p className="helper" style={{ marginBottom: "0.65rem" }}>
            Kundinnen und Kunden sehen nur die Galerie ueber ihren persoenlichen Link.
          </p>
          <p className="mono small" style={{ margin: 0 }}>
            /g/[publicSlug]
          </p>
        </article>
      </section>
    </main>
  );
}
