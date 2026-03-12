"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DownloadItem = {
  assetId: string;
  filename: string;
  downloadUrl: string;
  expiresAt: string;
  remainingDownloads: number;
};

type Props = {
  orderId: string;
};

function formatDate(input: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(input));
}

export default function SuccessClient({ orderId }: Props) {
  const [cartToken, setCartToken] = useState("");
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success" | "muted"; text: string } | null>(null);
  const [consumed, setConsumed] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!orderId) return;

    const tokenFromOrder = window.localStorage.getItem(`photopay_order_cart_${orderId}`);
    const tokenFallback = window.localStorage.getItem("photopay_last_cart_token");
    setCartToken(tokenFromOrder ?? tokenFallback ?? "");
  }, [orderId]);

  async function loadDownloads() {
    if (!orderId || !cartToken) {
      setNotice({ type: "error", text: "order_id oder cart token fehlt." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/public/orders/${orderId}/downloads`, {
        method: "GET",
        headers: {
          "x-cart-token": cartToken,
        },
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Downloads konnten nicht geladen werden");
      }

      setItems((json.items ?? []) as DownloadItem[]);
      setNotice({ type: "success", text: `${(json.items ?? []).length} Downloads verfügbar.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  async function consumeDownload(downloadUrl: string, assetId: string) {
    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch(downloadUrl, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Download konnte nicht freigegeben werden");
      }

      setConsumed((prev) => ({
        ...prev,
        [assetId]: json.storageKey as string,
      }));
      setNotice({ type: "success", text: `Download für ${json.filename} freigegeben.` });
      await loadDownloads();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <section className="card grid" style={{ gap: "0.6rem" }}>
        <h1 style={{ marginBottom: 0 }}>Zahlung erfolgreich</h1>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Lade hier die gekauften Bilder. Diese Seite nutzt den Warenkorb-Token der Kundensitzung.
        </p>

        <div className="grid grid-2">
          <div>
            <label className="label" htmlFor="order-id">
              Order ID
            </label>
            <input className="input mono" id="order-id" readOnly value={orderId} />
          </div>
          <div>
            <label className="label" htmlFor="cart-token">
              Cart Token
            </label>
            <input
              className="input mono"
              id="cart-token"
              onChange={(event) => setCartToken(event.target.value)}
              value={cartToken}
            />
          </div>
        </div>

        <div className="toolbar">
          <button className="btn" disabled={loading || !orderId || !cartToken} onClick={loadDownloads} type="button">
            Downloads laden
          </button>
          <Link className="btn btn-secondary" href="/">
            Zurück zur Startseite
          </Link>
        </div>
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <section className="card grid" style={{ gap: "0.6rem" }}>
        <h2 style={{ marginBottom: 0 }}>Verfügbare Downloads</h2>

        {items.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Noch keine Downloads geladen.
          </p>
        ) : (
          <div className="grid" style={{ gap: "0.6rem" }}>
            {items.map((item) => (
              <article className="card" key={item.assetId}>
                <div className="kv">
                  <strong>{item.filename}</strong>
                  <span className="status">Rest: {item.remainingDownloads}</span>
                </div>
                <p className="small muted" style={{ marginTop: "0.4rem", marginBottom: "0.4rem" }}>
                  Ablauf: {formatDate(item.expiresAt)}
                </p>
                <div className="toolbar">
                  <button
                    className="btn btn-secondary"
                    disabled={loading || item.remainingDownloads <= 0}
                    onClick={() => {
                      void consumeDownload(item.downloadUrl, item.assetId);
                    }}
                    type="button"
                  >
                    Download freischalten
                  </button>
                </div>
                {consumed[item.assetId] ? (
                  <p className="small mono" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                    storageKey: {consumed[item.assetId]}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
