import Link from "next/link";

export default function HomePage() {
  return (
    <main className="grid" style={{ gap: "1.2rem" }}>
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <header className="card">
        <p className="muted small" style={{ marginBottom: "0.5rem" }}>
          PhotoPay MVP
        </p>
        <h1 style={{ marginBottom: "0.5rem" }}>Swiss-first Foto-Auswahl, Bezahlung und Download</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Fokus: Auftrags-Shootings. Fotograf lädt hoch, Kunde wählt pro Package, zahlt via Twint/Stripe,
          und lädt gekaufte Bilder herunter.
        </p>
      </header>

      <section className="grid grid-2">
        <article className="card grid" style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>1) Fotografen-Ansicht</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Galerie anlegen, Demo-Bilder hinzufügen, Packages definieren und Galerie publizieren.
          </p>
          <Link className="btn" href="/studio" style={{ width: "fit-content" }}>
            Studio öffnen
          </Link>
        </article>

        <article className="card grid" style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>2) Kunden-Ansicht</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Nach dem Publizieren über den Public-Slug aufrufen, Passwort eingeben, auswählen und Checkout
            starten.
          </p>
          <p className="mono small" style={{ margin: 0 }}>
            /g/[publicSlug]
          </p>
        </article>
      </section>
    </main>
  );
}
