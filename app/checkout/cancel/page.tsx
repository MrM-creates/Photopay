import Link from "next/link";

export default async function CheckoutCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id ?? "-";

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="nav">
        <Link href="/">Start</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <section className="card grid" style={{ gap: "0.6rem" }}>
        <h1 style={{ marginBottom: 0 }}>Zahlung abgebrochen</h1>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Die Bestellung wurde nicht abgeschlossen. Du kannst den Checkout erneut starten.
        </p>

        {orderId !== "-" ? <p className="small muted">Bestellung: {orderId}</p> : null}

        <div className="toolbar">
          <Link className="btn" href="/">
            Zur Startseite
          </Link>
        </div>
      </section>
    </main>
  );
}
