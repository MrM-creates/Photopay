"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Gallery = {
  id: string;
  title: string;
  description: string | null;
  publicSlug: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  packageCount: number;
  assetCount: number;
};

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  includedCount: number;
  allowExtra: boolean;
  extraUnitPriceCents: number | null;
  active: boolean;
  sortOrder: number;
};

const photographerStorageKey = "photopay_photographer_id";

function formatChf(cents: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

function createClientUuid() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const fallback = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  return fallback;
}

function toFriendlyError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Ich konnte den Server gerade nicht erreichen. Bitte kurz warten und nochmal versuchen.";
  }

  if (raw.includes("VALIDATION_ERROR")) {
    return "Bitte pruefe deine Eingaben. Manche Felder sind noch unvollstaendig.";
  }

  if (raw.includes("DB_ERROR")) {
    return "Im Hintergrund ist ein technischer Fehler passiert. Bitte versuche es gleich nochmal.";
  }

  if (raw.includes("GALLERY_NOT_FOUND")) {
    return "Diese Galerie wurde nicht gefunden. Bitte waehle eine Galerie aus der Liste.";
  }

  return fallback;
}

export default function StudioPage() {
  const [photographerId, setPhotographerId] = useState("");

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);

  const [galleryTitle, setGalleryTitle] = useState("Hochzeit Muster");
  const [galleryDescription, setGalleryDescription] = useState("Trauung + Feier");
  const [galleryPassword, setGalleryPassword] = useState("muster123");

  const [assetSeedText, setAssetSeedText] = useState("DSC_1001.jpg\nDSC_1002.jpg\nDSC_1003.jpg\nDSC_1004.jpg");

  const [packageName, setPackageName] = useState("10er Paket Digital");
  const [packagePrice, setPackagePrice] = useState("12000");
  const [includedCount, setIncludedCount] = useState("10");
  const [allowExtra, setAllowExtra] = useState(true);
  const [extraPrice, setExtraPrice] = useState("1500");

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success" | "muted"; text: string } | null>(null);

  const selectedGallery = useMemo(
    () => galleries.find((gallery) => gallery.id === selectedGalleryId) ?? null,
    [galleries, selectedGalleryId],
  );

  const publicGalleryUrl = useMemo(() => {
    if (!selectedGallery) return "";
    if (typeof window === "undefined") return `/g/${selectedGallery.publicSlug}`;
    return `${window.location.origin}/g/${selectedGallery.publicSlug}`;
  }, [selectedGallery]);

  useEffect(() => {
    const stored = window.localStorage.getItem(photographerStorageKey);
    if (stored) {
      setPhotographerId(stored);
      return;
    }

    const generated = createClientUuid();
    window.localStorage.setItem(photographerStorageKey, generated);
    setPhotographerId(generated);
  }, []);

  const withPhotographerHeaders = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!photographerId) throw new Error("Photographer ID fehlt");

      const headers = new Headers(init?.headers);
      headers.set("Content-Type", "application/json");
      headers.set("x-photographer-id", photographerId);

      return fetch(input, {
        ...init,
        headers,
      });
    },
    [photographerId],
  );

  const loadGalleries = useCallback(async () => {
    if (!photographerId) return;

    const response = await withPhotographerHeaders("/api/galleries", { method: "GET" });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Galleries konnten nicht geladen werden");
    }

    const next = (json.galleries ?? []) as Gallery[];
    setGalleries(next);
    setSelectedGalleryId((previous) => {
      if (!previous && next.length > 0) return next[0].id;
      if (previous && !next.some((entry) => entry.id === previous) && next.length > 0) return next[0].id;
      return previous;
    });
  }, [photographerId, withPhotographerHeaders]);

  const loadPackages = useCallback(
    async (galleryId: string) => {
      if (!galleryId) {
        setPackages([]);
        return;
      }

      const response = await withPhotographerHeaders(`/api/galleries/${galleryId}/packages`, {
        method: "GET",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Pakete konnten nicht geladen werden");
      }

      setPackages((json.packages ?? []) as PackageRow[]);
    },
    [withPhotographerHeaders],
  );

  useEffect(() => {
    if (!photographerId) return;

    void loadGalleries().catch((error) => {
      setNotice({ type: "error", text: toFriendlyError(error, "Galerien konnten nicht geladen werden.") });
    });
  }, [photographerId, loadGalleries]);

  useEffect(() => {
    if (!selectedGalleryId || !photographerId) {
      setPackages([]);
      return;
    }

    void loadPackages(selectedGalleryId).catch((error) => {
      setNotice({ type: "error", text: toFriendlyError(error, "Pakete konnten nicht geladen werden.") });
    });
  }, [selectedGalleryId, photographerId, loadPackages]);

  async function handleCreateGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await withPhotographerHeaders("/api/galleries", {
        method: "POST",
        body: JSON.stringify({
          title: galleryTitle,
          description: galleryDescription,
          accessPassword: galleryPassword,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Galerie konnte nicht erstellt werden");
      }

      await loadGalleries();
      setSelectedGalleryId(json.id);
      setNotice({ type: "success", text: `Fertig. Deine Galerie ist erstellt (${json.publicSlug}).` });
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Galerie konnte leider nicht erstellt werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswählen." });
      return;
    }

    const files = assetSeedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((filename) => ({
        filename,
        mimeType: "image/jpeg",
        fileSizeBytes: 1_500_000,
        width: 2400,
        height: 1600,
      }));

    if (files.length === 0) {
      setNotice({ type: "error", text: "Bitte mindestens einen Dateinamen eingeben." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await withPhotographerHeaders(`/api/galleries/${selectedGalleryId}/assets/finalize`, {
        method: "POST",
        body: JSON.stringify({ files }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Assets konnten nicht angelegt werden");
      }

      await loadGalleries();
      setNotice({ type: "success", text: `Fertig. ${json.uploaded} Bilder wurden hinzugefuegt.` });
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Bilder konnten nicht hinzugefuegt werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswählen." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await withPhotographerHeaders(`/api/galleries/${selectedGalleryId}/packages`, {
        method: "POST",
        body: JSON.stringify({
          name: packageName,
          priceCents: Number(packagePrice),
          includedCount: Number(includedCount),
          allowExtra,
          extraUnitPriceCents: allowExtra ? Number(extraPrice) : null,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Paket konnte nicht erstellt werden");
      }

      await loadGalleries();
      await loadPackages(selectedGalleryId);
      setNotice({ type: "success", text: `Fertig. Das Paket \"${json.name}\" wurde gespeichert.` });
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Das Paket konnte nicht gespeichert werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handlePublishGallery() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswählen." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await withPhotographerHeaders(`/api/galleries/${selectedGalleryId}/publish`, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Galerie konnte nicht publiziert werden");
      }

      await loadGalleries();
      setNotice({ type: "success", text: "Fertig. Die Galerie ist jetzt fuer Kunden freigegeben." });
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Galerie konnte nicht freigegeben werden.") });
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

      <section className="card grid" style={{ gap: "0.7rem" }}>
        <div className="kv">
          <h1 style={{ marginBottom: 0 }}>Studio</h1>
          <span className="status">Einfach gefuehrt</span>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Gehe einfach Schritt fuer Schritt durch. Du musst nichts Technisches wissen.
        </p>

        <div className="grid grid-2">
          <div>
            <label className="label" htmlFor="photographer-id">
              Interne Nutzer-ID (automatisch)
            </label>
            <input
              id="photographer-id"
              className="input mono"
              value={photographerId}
              onChange={(event) => {
                const value = event.target.value;
                setPhotographerId(value);
                window.localStorage.setItem(photographerStorageKey, value);
              }}
            />
          </div>
          <div className="toolbar" style={{ alignItems: "end" }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const next = createClientUuid();
                setPhotographerId(next);
                window.localStorage.setItem(photographerStorageKey, next);
              }}
              type="button"
            >
              Neue interne ID
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                void loadGalleries().catch((error) =>
                  setNotice({ type: "error", text: toFriendlyError(error, "Galerien konnten nicht geladen werden.") }),
                );
              }}
              type="button"
            >
              Aktualisieren
            </button>
          </div>
        </div>
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <section className="grid grid-2">
        <form className="card grid" onSubmit={handleCreateGallery} style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>1. Galerie erstellen</h2>

          <div>
            <label className="label" htmlFor="gallery-title">
              Titel
            </label>
            <input
              id="gallery-title"
              className="input"
              value={galleryTitle}
              onChange={(event) => setGalleryTitle(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="gallery-description">
              Beschreibung
            </label>
            <input
              id="gallery-description"
              className="input"
              value={galleryDescription}
              onChange={(event) => setGalleryDescription(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="gallery-password">
              Passwort fuer deine Kundinnen und Kunden
            </label>
            <input
              id="gallery-password"
              className="input"
              value={galleryPassword}
              onChange={(event) => setGalleryPassword(event.target.value)}
              required
            />
          </div>

          <button className="btn" disabled={loading} type="submit">
            Galerie anlegen
          </button>
        </form>

        <div className="card grid" style={{ gap: "0.6rem" }}>
          <div className="kv">
            <h2 style={{ marginBottom: 0 }}>Galerien</h2>
            <span className="muted small">{galleries.length} gesamt</span>
          </div>

          {galleries.length === 0 ? (
            <p className="muted small" style={{ marginBottom: 0 }}>
              Noch keine Galerie vorhanden.
            </p>
          ) : (
            <div className="grid" style={{ gap: "0.55rem" }}>
              {galleries.map((gallery) => (
                <button
                  key={gallery.id}
                  className="btn btn-secondary"
                  onClick={() => setSelectedGalleryId(gallery.id)}
                  style={{
                    textAlign: "left",
                    borderColor: selectedGalleryId === gallery.id ? "var(--accent)" : undefined,
                    display: "grid",
                    gap: "0.2rem",
                  }}
                  type="button"
                >
                  <strong>{gallery.title}</strong>
                  <span className="muted small mono">{gallery.publicSlug}</span>
                  <span className="small">
                    Bilder: {gallery.assetCount} | Pakete: {gallery.packageCount}
                  </span>
                  <span className={`status ${gallery.status === "published" ? "status-published" : "status-draft"}`}>
                    {gallery.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-2">
        <form className="card grid" onSubmit={handleSeedAssets} style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>2. Demo-Bilder hinzufügen</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Fuer den Moment arbeiten wir mit Demo-Dateinamen (eine Zeile = ein Bild).
          </p>

          <div>
            <label className="label" htmlFor="asset-seed">
              Dateinamen
            </label>
            <textarea
              id="asset-seed"
              className="textarea mono"
              value={assetSeedText}
              onChange={(event) => setAssetSeedText(event.target.value)}
            />
          </div>

          <button className="btn" disabled={loading || !selectedGalleryId} type="submit">
            Bilder hinzufuegen
          </button>
        </form>

        <form className="card grid" onSubmit={handleCreatePackage} style={{ gap: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>3. Paket festlegen</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Beispiel: 10 Bilder inklusive, jedes weitere Bild kostet extra.
          </p>

          <div>
            <label className="label" htmlFor="package-name">
              Name
            </label>
            <input
              id="package-name"
              className="input"
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
              required
            />
          </div>

          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="package-price">
                Preis (Rappen)
              </label>
              <input
                id="package-price"
                className="input mono"
                value={packagePrice}
                onChange={(event) => setPackagePrice(event.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="included-count">
                Inklusive Bilder
              </label>
              <input
                id="included-count"
                className="input mono"
                value={includedCount}
                onChange={(event) => setIncludedCount(event.target.value)}
                required
              />
            </div>
          </div>

          <label className="asset-item" style={{ width: "fit-content" }}>
            <input
              checked={allowExtra}
              onChange={(event) => setAllowExtra(event.target.checked)}
              type="checkbox"
            />
            Zusätzliche Bilder erlauben
          </label>

          {allowExtra ? (
            <div>
              <label className="label" htmlFor="extra-price">
                Einzelpreis Extra (Rappen)
              </label>
              <input
                id="extra-price"
                className="input mono"
                value={extraPrice}
                onChange={(event) => setExtraPrice(event.target.value)}
                required
              />
            </div>
          ) : null}

          <button className="btn" disabled={loading || !selectedGalleryId} type="submit">
            Paket speichern
          </button>
        </form>
      </section>

      <section className="card grid" style={{ gap: "0.7rem" }}>
        <div className="kv">
          <h2 style={{ marginBottom: 0 }}>4. Freigeben & testen</h2>
          <button className="btn" disabled={loading || !selectedGalleryId} onClick={handlePublishGallery} type="button">
            Galerie freigeben
          </button>
        </div>

        {selectedGallery ? (
          <>
            <div className="notice notice-muted small">
              <strong>Aktive Galerie:</strong> {selectedGallery.title} ({selectedGallery.publicSlug})
            </div>
            <div className="toolbar">
              <a className="btn btn-secondary" href={publicGalleryUrl} rel="noreferrer" target="_blank">
                Kundenseite öffnen
              </a>
              <span className="mono small">{publicGalleryUrl}</span>
            </div>
          </>
        ) : (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Bitte eine Galerie auswählen.
          </p>
        )}

        <hr className="hr" />

        <h3 style={{ marginBottom: 0 }}>Pakete der aktiven Galerie</h3>
        {packages.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Noch keine Pakete vorhanden.
          </p>
        ) : (
          <div className="grid grid-3">
            {packages.map((pkg) => (
              <article className="card" key={pkg.id}>
                <div className="kv" style={{ marginBottom: "0.45rem" }}>
                  <strong>{pkg.name}</strong>
                  <span className={`status ${pkg.active ? "status-published" : "status-draft"}`}>
                    {pkg.active ? "aktiv" : "inaktiv"}
                  </span>
                </div>
                <p className="small muted" style={{ marginBottom: "0.35rem" }}>
                  {formatChf(pkg.priceCents)} | inkl. {pkg.includedCount} Bilder
                </p>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {pkg.allowExtra
                    ? `Extra: ${pkg.extraUnitPriceCents ? formatChf(pkg.extraUnitPriceCents) : "-"} / Bild`
                    : "Extra nicht erlaubt"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
