import Link from "next/link";
import AdminDropdown from "@/app/components/AdminDropdown";

export default function HomePage() {
  const benefits = [
    {
      focus: "Speed",
      title: "In wenigen Minuten startklar",
      text: "Keine stundenlange Konfiguration. Lade deine Bilder hoch und deine Galerie steht in kürzester Zeit bereit.",
    },
    {
      focus: "Payment",
      title: "Twint-Integration inklusive",
      text: "Der Schweizer Standard. Deine Kunden zahlen bequem mobil – du erhältst dein Geld ohne mühsame Umwege.",
    },
    {
      focus: "Fokus",
      title: "Konzentration auf das Wesentliche",
      text: "Wir verzichten auf unnötigen Ballast. Ein smarter Workflow, der dir und deinen Kunden wertvolle Zeit spart.",
    },
    {
      focus: "Outcome",
      title: "Profi-Auftritt für deine Kunden",
      text: "Hochwertige Präsentation, intuitive Bildauswahl und automatischer Download direkt nach der Zahlung.",
    },
  ];

  return (
    <main className="landing-shell">
      <nav aria-label="Hauptmenü" className="landing-menu">
        <AdminDropdown />
      </nav>

      <header className="card landing-hero">
        <h1 className="landing-title">PhotoPay</h1>
        <p className="landing-subtitle">Weniger Admin. Mehr Fotografie. Schneller bezahlt.</p>
        <p className="helper" style={{ marginBottom: 0, maxWidth: "60ch" }}>
          Die schlankste Galerie-Lösung für Schweizer Fotografen. Erstelle in wenigen Minuten deine Profi-Galerie und erhalte
          Zahlungen direkt via TWINT.
        </p>

        <div className="landing-actions">
          <Link className="btn" href="/studio?step=create&mode=new">
            Projekt erstellen
          </Link>
          <Link className="btn btn-secondary" href="/studio?step=create&mode=open">
            Meine Projekte
          </Link>
        </div>

        <section aria-label="Vorteile" className="landing-benefits">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.title}>
              <p className="small muted" style={{ marginBottom: "0.35rem" }}>
                {benefit.focus}
              </p>
              <h2>{benefit.title}</h2>
              <p>{benefit.text}</p>
            </article>
          ))}
        </section>
      </header>
    </main>
  );
}
