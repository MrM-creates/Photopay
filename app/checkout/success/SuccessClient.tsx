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

function toFriendlyDownloadError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Der Server ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.";
  }

  if (raw.includes("PAYMENT_NOT_COMPLETED")) {
    return "Die Zahlung ist noch nicht bestaetigt. Bitte versuche es in ein bis zwei Minuten nochmal.";
  }

  if (raw.includes("GALLERY_ACCESS_DENIED")) {
    return "Die Sitzung ist abgelaufen. Bitte oeffne den Kauf-Link erneut.";
  }

  return fallback;
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
      setNotice({ type: "error", text: "Uns fehlen noch Sitzungsdaten. Bitte den Kauf-Link erneut oeffnen." });
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
      setNotice({ type: "success", text: `${(json.items ?? []).length} Download(s) sind bereit.` });
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyDownloadError(error, "Die Downloads konnten nicht geladen werden.") });
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
      setNotice({ type: "success", text: `${json.filename} ist vorbereitet.` });
      await loadDownloads();
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyDownloadError(error, "Der Download konnte nicht vorbereitet werden.") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="nav">
        <Link href="/">Start</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <section className="card grid" style={{ gap: "0.6rem" }}>
        <h1 style={{ marginBottom: 0 }}>Zahlung erfolgreich</h1>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Super. Hier kannst du jetzt deine gekauften Bilder herunterladen.
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
              Sitzungs-Token
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
                    Download starten
                  </button>
                </div>
                {consumed[item.assetId] ? (
                  <p className="small muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                    Download vorbereitet (Demo-Modus).
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
