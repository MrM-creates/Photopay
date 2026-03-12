import Link from "next/link";

export default function HomePage() {
  const benefits = [
    {
      title: "Klarer Ablauf",
      text: "Du führst jedes Projekt in wenigen, klaren Schritten von der Anlage bis zur Freigabe.",
    },
    {
      title: "Schneller Start",
      text: "Projekt anlegen, Bilder hinzufügen, Pakete setzen und direkt mit Kunden teilen.",
    },
    {
      title: "Verkauf ohne Umwege",
      text: "Preislogik und Freigabe sind direkt im Workflow integriert statt auf mehrere Tools verteilt.",
    },
    {
      title: "Alles pro Projekt gebündelt",
      text: "Bilder, Pakete und Link bleiben zusammen und sind jederzeit sauber nachvollziehbar.",
    },
  ];

  return (
    <main className="landing-shell">
      <header className="card landing-hero">
        <p className="pill">PhotoPay für Fotografen</p>
        <h1 className="landing-title">PhotoPay</h1>
        <p className="landing-subtitle">Deine Bilder. Dein Workflow. Dein Verkauf.</p>
        <p className="helper" style={{ marginBottom: 0, maxWidth: "60ch" }}>
          Lege ein Projekt an, füge Bilder hinzu, setze Pakete und teile den persönlichen Kundenlink in klaren Schritten.
        </p>

        <div className="landing-actions">
          <Link className="btn" href="/studio?step=create&mode=new">
            Projekt starten
          </Link>
          <Link className="btn btn-secondary" href="/studio?step=create&mode=open">
            Projekt öffnen
          </Link>
        </div>

        <div className="landing-tertiary">
          <Link className="btn-link" href="/studio?step=packages">
            Pakete bearbeiten
          </Link>
        </div>

        <section aria-label="Vorteile" className="landing-benefits">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.title}>
              <h2>{benefit.title}</h2>
              <p>{benefit.text}</p>
            </article>
          ))}
        </section>
      </header>
    </main>
  );
}
