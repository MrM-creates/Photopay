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

type StudioNotice = {
  type: "error" | "success" | "muted";
  text: string;
};

type StudioSection = {
  id: "overview" | "galleries" | "packages" | "sharing" | "settings";
  label: string;
};

type StepState = "offen" | "aktiv" | "erledigt";

const photographerStorageKey = "photopay_photographer_id";

const studioSections: StudioSection[] = [
  { id: "overview", label: "Uebersicht" },
  { id: "galleries", label: "Galerien" },
  { id: "packages", label: "Pakete & Preise" },
  { id: "sharing", label: "Kundenlinks" },
  { id: "settings", label: "Einstellungen" },
];

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

function statusClassForStep(state: StepState) {
  if (state === "erledigt") return "status-published";
  if (state === "aktiv") return "status-active";
  return "status-open";
}

export default function StudioPage() {
  const [photographerId, setPhotographerId] = useState("");
  const [activeSection, setActiveSection] = useState<StudioSection["id"]>("overview");

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
  const [notice, setNotice] = useState<StudioNotice | null>(null);

  const selectedGallery = useMemo(
    () => galleries.find((gallery) => gallery.id === selectedGalleryId) ?? null,
    [galleries, selectedGalleryId],
  );

  const publicGalleryUrl = useMemo(() => {
    if (!selectedGallery) return "";
    if (typeof window === "undefined") return `/g/${selectedGallery.publicSlug}`;
    return `${window.location.origin}/g/${selectedGallery.publicSlug}`;
  }, [selectedGallery]);

  const workflowSteps = useMemo(() => {
    const hasGallery = galleries.length > 0;
    const hasAssets = (selectedGallery?.assetCount ?? 0) > 0;
    const hasPackages = packages.length > 0;
    const isPublished = selectedGallery?.status === "published";

    const doneFlags = [hasGallery, hasAssets, hasPackages, isPublished];

    return [
      {
        key: "galleries" as const,
        index: 1,
        title: "Galerie anlegen",
        detail: hasGallery ? `${galleries.length} Galerie(n) vorhanden` : "Erstelle die erste Galerie",
        state: doneFlags[0] ? "erledigt" : "aktiv",
      },
      {
        key: "packages" as const,
        index: 2,
        title: "Bilder bereitstellen",
        detail: hasAssets
          ? `${selectedGallery?.assetCount ?? 0} Bild(er) in aktiver Galerie`
          : "Fuege Bilder in die aktive Galerie ein",
        state: doneFlags[1] ? "erledigt" : doneFlags[0] ? "aktiv" : "offen",
      },
      {
        key: "packages" as const,
        index: 3,
        title: "Pakete festlegen",
        detail: hasPackages ? `${packages.length} Paket(e) bereit` : "Erstelle mindestens ein Paket",
        state: doneFlags[2] ? "erledigt" : doneFlags[1] ? "aktiv" : "offen",
      },
      {
        key: "sharing" as const,
        index: 4,
        title: "Kundenlink teilen",
        detail: isPublished ? "Galerie ist freigegeben" : "Galerie veroeffentlichen und Link teilen",
        state: doneFlags[3] ? "erledigt" : doneFlags[2] ? "aktiv" : "offen",
      },
    ] as Array<{
      key: StudioSection["id"];
      index: number;
      title: string;
      detail: string;
      state: StepState;
    }>;
  }, [galleries.length, packages.length, selectedGallery?.assetCount, selectedGallery?.status]);

  const nextStep = useMemo(
    () => workflowSteps.find((step) => step.state !== "erledigt") ?? workflowSteps[workflowSteps.length - 1],
    [workflowSteps],
  );

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

  useEffect(() => {
    function syncHash() {
      const next = window.location.hash.replace("#", "") as StudioSection["id"];
      if (studioSections.some((section) => section.id === next)) {
        setActiveSection(next);
      }
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
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
      window.location.hash = "#galleries";
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Galerie konnte leider nicht erstellt werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswaehlen." });
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
      window.location.hash = "#packages";
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Bilder konnten nicht hinzugefuegt werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswaehlen." });
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
      window.location.hash = "#sharing";
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Das Paket konnte nicht gespeichert werden.") });
    } finally {
      setLoading(false);
    }
  }

  async function handlePublishGallery() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst eine Galerie auswaehlen." });
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
      window.location.hash = "#sharing";
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Galerie konnte nicht freigegeben werden.") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="studio-shell">
      <div className="nav">
        <Link href="/">Start</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <section className="card grid section-anchor" id="overview" style={{ gap: "0.95rem" }}>
        <div className="kv">
          <div>
            <span className="pill" style={{ marginBottom: "0.5rem" }}>
              Fotografen-Studio
            </span>
            <h1 style={{ marginBottom: "0.35rem" }}>PhotoPay Studio</h1>
            <p className="helper" style={{ marginBottom: 0 }}>
              So einfach wie moeglich: Schritt fuer Schritt bis zum geteilten Kundenlink.
            </p>
          </div>
          <span className={`status ${statusClassForStep(nextStep.state)}`}>Naechster Schritt: {nextStep.index}</span>
        </div>

        <nav aria-label="Studio Navigation" className="studio-nav">
          {studioSections.map((section) => (
            <a
              className={`studio-nav-item ${activeSection === section.id ? "studio-nav-item-active" : ""}`}
              href={`#${section.id}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="step-track">
          {workflowSteps.map((step) => (
            <div className="step-chip" key={step.index}>
              <div className="step-label">
                <span className="step-index">{step.index}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p className="small muted" style={{ margin: "0.1rem 0 0" }}>
                    {step.detail}
                  </p>
                </div>
              </div>
              <span className={`status ${statusClassForStep(step.state)}`}>{step.state}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-3">
          <div className="notice notice-muted small">Galerien: {galleries.length}</div>
          <div className="notice notice-muted small">Pakete aktiv: {packages.length}</div>
          <div className="notice notice-muted small">Aktive Galerie: {selectedGallery ? selectedGallery.title : "keine"}</div>
        </div>
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <section className="grid grid-2 section-anchor" id="galleries">
        <form className="card grid" onSubmit={handleCreateGallery} style={{ gap: "0.65rem" }}>
          <h2 style={{ marginBottom: 0 }}>1. Galerie anlegen</h2>
          <p className="helper">Starte mit einem klaren Galerietitel und einem Passwort fuer die Kundschaft.</p>

          <div>
            <label className="label" htmlFor="gallery-title">
              Titel
            </label>
            <input
              className="input"
              id="gallery-title"
              onChange={(event) => setGalleryTitle(event.target.value)}
              required
              value={galleryTitle}
            />
          </div>

          <div>
            <label className="label" htmlFor="gallery-description">
              Beschreibung (optional)
            </label>
            <input
              className="input"
              id="gallery-description"
              onChange={(event) => setGalleryDescription(event.target.value)}
              value={galleryDescription}
            />
          </div>

          <div>
            <label className="label" htmlFor="gallery-password">
              Passwort fuer Kunden
            </label>
            <input
              className="input"
              id="gallery-password"
              onChange={(event) => setGalleryPassword(event.target.value)}
              required
              value={galleryPassword}
            />
          </div>

          <div className="toolbar">
            <button className="btn" disabled={loading} type="submit">
              Galerie erstellen
            </button>
          </div>
        </form>

        <div className="card grid" style={{ gap: "0.65rem" }}>
          <div className="kv">
            <h2 style={{ marginBottom: 0 }}>Deine Galerien</h2>
            <span className="pill">{galleries.length} gesamt</span>
          </div>

          {galleries.length === 0 ? (
            <p className="helper" style={{ marginBottom: 0 }}>
              Noch keine Galerie vorhanden. Lege links deine erste Galerie an.
            </p>
          ) : (
            <div className="gallery-list">
              {galleries.map((gallery) => (
                <button
                  className={`gallery-item ${selectedGalleryId === gallery.id ? "gallery-item-active" : ""}`}
                  key={gallery.id}
                  onClick={() => setSelectedGalleryId(gallery.id)}
                  type="button"
                >
                  <div className="kv" style={{ alignItems: "flex-start" }}>
                    <strong>{gallery.title}</strong>
                    <span className={`status ${gallery.status === "published" ? "status-published" : "status-draft"}`}>
                      {gallery.status === "published" ? "live" : "entwurf"}
                    </span>
                  </div>
                  <span className="small muted mono">/{gallery.publicSlug}</span>
                  <span className="small muted">
                    {gallery.assetCount} Bilder | {gallery.packageCount} Pakete
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-2 section-anchor" id="packages">
        <form className="card grid" onSubmit={handleSeedAssets} style={{ gap: "0.65rem" }}>
          <h2 style={{ marginBottom: 0 }}>2. Bilder bereitstellen</h2>
          <p className="helper">Aktuell im Demo-Modus: ein Dateiname pro Zeile.</p>

          <div>
            <label className="label" htmlFor="asset-seed">
              Dateinamen
            </label>
            <textarea
              className="textarea mono"
              id="asset-seed"
              onChange={(event) => setAssetSeedText(event.target.value)}
              value={assetSeedText}
            />
          </div>

          <div className="toolbar">
            <button className="btn" disabled={loading || !selectedGalleryId} type="submit">
              Bilder speichern
            </button>
          </div>
        </form>

        <form className="card grid" onSubmit={handleCreatePackage} style={{ gap: "0.65rem" }}>
          <h2 style={{ marginBottom: 0 }}>3. Paket festlegen</h2>
          <p className="helper">Beispiel: 10 Bilder inklusive, jedes weitere Bild als Einzelpreis.</p>

          <div>
            <label className="label" htmlFor="package-name">
              Paketname
            </label>
            <input
              className="input"
              id="package-name"
              onChange={(event) => setPackageName(event.target.value)}
              required
              value={packageName}
            />
          </div>

          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="package-price">
                Paketpreis (Rappen)
              </label>
              <input
                className="input mono"
                id="package-price"
                onChange={(event) => setPackagePrice(event.target.value)}
                required
                value={packagePrice}
              />
            </div>

            <div>
              <label className="label" htmlFor="included-count">
                Anzahl Bilder inklusive
              </label>
              <input
                className="input mono"
                id="included-count"
                onChange={(event) => setIncludedCount(event.target.value)}
                required
                value={includedCount}
              />
            </div>
          </div>

          <label className="asset-item" style={{ width: "fit-content" }}>
            <input checked={allowExtra} onChange={(event) => setAllowExtra(event.target.checked)} type="checkbox" />
            Zusaetzliche Bilder erlauben
          </label>

          {allowExtra ? (
            <div>
              <label className="label" htmlFor="extra-price">
                Einzelpreis pro Extra-Bild (Rappen)
              </label>
              <input
                className="input mono"
                id="extra-price"
                onChange={(event) => setExtraPrice(event.target.value)}
                required
                value={extraPrice}
              />
            </div>
          ) : null}

          <div className="toolbar">
            <button className="btn" disabled={loading || !selectedGalleryId} type="submit">
              Paket speichern
            </button>
          </div>
        </form>
      </section>

      <section className="card grid section-anchor" id="sharing" style={{ gap: "0.7rem" }}>
        <div className="kv">
          <div>
            <h2 style={{ marginBottom: "0.3rem" }}>4. Kundenlink teilen</h2>
            <p className="helper" style={{ marginBottom: 0 }}>
              Nach dem Freigeben kann deine Kundschaft die Galerie direkt ueber den Link oeffnen.
            </p>
          </div>
          <button className="btn" disabled={loading || !selectedGalleryId} onClick={handlePublishGallery} type="button">
            Galerie freigeben
          </button>
        </div>

        {selectedGallery ? (
          <>
            <div className="notice notice-muted small">
              Aktive Galerie: <strong>{selectedGallery.title}</strong> ({selectedGallery.publicSlug})
            </div>
            <div className="link-box">
              <p className="small muted" style={{ marginBottom: "0.4rem" }}>
                Kundenlink
              </p>
              <p className="mono small" style={{ margin: 0, wordBreak: "break-all" }}>
                {publicGalleryUrl || "Noch nicht verfuegbar"}
              </p>
            </div>
            <div className="toolbar">
              <a className="btn btn-secondary" href={publicGalleryUrl} rel="noreferrer" target="_blank">
                Kundenseite oeffnen
              </a>
            </div>
          </>
        ) : (
          <p className="helper" style={{ marginBottom: 0 }}>
            Bitte waehle zuerst eine Galerie aus.
          </p>
        )}

        <hr className="hr" />

        <h3 style={{ marginBottom: 0 }}>Pakete der aktiven Galerie</h3>
        {packages.length === 0 ? (
          <p className="helper" style={{ marginBottom: 0 }}>
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

      <section className="card grid section-anchor" id="settings" style={{ gap: "0.65rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.3rem" }}>Einstellungen</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Erweitert: nur noetig, wenn du Daten manuell zuruecksetzen willst.
          </p>
        </div>

        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Erweiterte Optionen anzeigen
          </summary>
          <div className="grid" style={{ marginTop: "0.7rem" }}>
            <div>
              <label className="label" htmlFor="photographer-id">
                Interne Nutzer-ID
              </label>
              <input
                className="input mono"
                id="photographer-id"
                onChange={(event) => {
                  const value = event.target.value;
                  setPhotographerId(value);
                  window.localStorage.setItem(photographerStorageKey, value);
                }}
                value={photographerId}
              />
            </div>
            <div className="toolbar">
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
                Daten aktualisieren
              </button>
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}
