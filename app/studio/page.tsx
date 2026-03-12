"use client";

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

type WizardStepId = "create" | "assets" | "packages" | "share" | "summary";

const photographerStorageKey = "photopay_photographer_id";

const wizardSteps: Array<{ id: WizardStepId; title: string; short: string }> = [
  { id: "create", title: "Schritt 1: Projekt anlegen", short: "1. Projekt" },
  { id: "assets", title: "Schritt 2: Bilder hinzufügen", short: "2. Bilder" },
  { id: "packages", title: "Schritt 3: Pakete festlegen", short: "3. Pakete" },
  { id: "share", title: "Schritt 4: Kundenlink freigeben", short: "4. Freigabe" },
  { id: "summary", title: "Übersicht", short: "5. Übersicht" },
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

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function toFriendlyError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Ich konnte den Server gerade nicht erreichen. Bitte versuche es in ein paar Sekunden erneut.";
  }

  if (raw.includes("VALIDATION_ERROR")) {
    return "Bitte prüfe deine Eingaben. Ein Feld ist noch unvollständig.";
  }

  if (raw.includes("DB_ERROR")) {
    return "Es ist ein technischer Fehler aufgetreten. Bitte versuche es erneut.";
  }

  if (raw.includes("GALLERY_NOT_FOUND")) {
    return "Dieses Projekt wurde nicht gefunden. Bitte wähle ein Projekt aus der Liste.";
  }

  return fallback;
}

function nextIncompleteStep(input: {
  hasGallery: boolean;
  hasAssets: boolean;
  hasPackages: boolean;
  isPublished: boolean;
}): WizardStepId {
  if (!input.hasGallery) return "create";
  if (!input.hasAssets) return "assets";
  if (!input.hasPackages) return "packages";
  if (!input.isPublished) return "share";
  return "summary";
}

function previousStep(current: WizardStepId): WizardStepId {
  const index = wizardSteps.findIndex((step) => step.id === current);
  return wizardSteps[Math.max(0, index - 1)].id;
}

function nextStep(current: WizardStepId): WizardStepId {
  const index = wizardSteps.findIndex((step) => step.id === current);
  return wizardSteps[Math.min(wizardSteps.length - 1, index + 1)].id;
}

export default function StudioPage() {
  const [photographerId, setPhotographerId] = useState("");
  const [activeStep, setActiveStep] = useState<WizardStepId>("create");
  const [requestedProjectId, setRequestedProjectId] = useState<string | null>(null);

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);

  const [galleryTitle, setGalleryTitle] = useState("Babyshooting Moritz 20260329");
  const [galleryDescription, setGalleryDescription] = useState("Babyshooting im Studio");
  const [galleryPassword, setGalleryPassword] = useState("muster123");

  const [assetSeedText, setAssetSeedText] = useState("DSC_1001.jpg\nDSC_1002.jpg\nDSC_1003.jpg\nDSC_1004.jpg");

  const [packageName, setPackageName] = useState("10er Paket Digital");
  const [packagePrice, setPackagePrice] = useState("120");
  const [includedCount, setIncludedCount] = useState("10");
  const [allowExtra, setAllowExtra] = useState(true);
  const [extraPrice, setExtraPrice] = useState("15");

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

  const progress = useMemo(() => {
    const hasGallery = galleries.length > 0;
    const hasAssets = (selectedGallery?.assetCount ?? 0) > 0;
    const hasPackages = packages.length > 0;
    const isPublished = selectedGallery?.status === "published";

    return {
      hasGallery,
      hasAssets,
      hasPackages,
      isPublished,
      recommendedStep: nextIncompleteStep({ hasGallery, hasAssets, hasPackages, isPublished }),
    };
  }, [galleries.length, packages.length, selectedGallery?.assetCount, selectedGallery?.status]);

  const canGoNext = useMemo(() => {
    if (activeStep === "create") return progress.hasGallery;
    if (activeStep === "assets") return progress.hasAssets;
    if (activeStep === "packages") return progress.hasPackages;
    if (activeStep === "share") return progress.isPublished;
    return false;
  }, [activeStep, progress.hasAssets, progress.hasGallery, progress.hasPackages, progress.isPublished]);

  function isStepAccessible(step: WizardStepId) {
    if (step === "create") return true;
    if (step === "assets") return progress.hasGallery;
    if (step === "packages") return progress.hasAssets;
    if (step === "share") return progress.hasPackages;
    return progress.isPublished;
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(photographerStorageKey);
    if (stored) {
      setPhotographerId(stored);
    } else {
      const generated = createClientUuid();
      window.localStorage.setItem(photographerStorageKey, generated);
      setPhotographerId(generated);
    }

    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    const projectParam = params.get("project");

    if (stepParam && wizardSteps.some((step) => step.id === stepParam)) {
      setActiveStep(stepParam as WizardStepId);
    }

    if (projectParam) {
      setRequestedProjectId(projectParam);
    }
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
      setNotice({ type: "error", text: toFriendlyError(error, "Projekte konnten nicht geladen werden.") });
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

  useEffect(() => {
    if (!requestedProjectId || galleries.length === 0) return;

    const found = galleries.find((gallery) => gallery.id === requestedProjectId);
    if (found) {
      setSelectedGalleryId(found.id);
    } else {
      setNotice({
        type: "muted",
        text: "Das gewählte Projekt wurde nicht gefunden. Bitte wähle ein Projekt aus der Liste.",
      });
    }

    setRequestedProjectId(null);
  }, [requestedProjectId, galleries]);

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
      setNotice({ type: "success", text: "Fertig. Dein Projekt ist erstellt." });
      setActiveStep("assets");
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Das Projekt konnte nicht erstellt werden. Bitte prüfe deine Eingaben.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
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
      setNotice({ type: "error", text: "Bitte wähle mindestens ein Bild aus." });
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
      setNotice({ type: "success", text: `Fertig. ${json.uploaded} Bilder wurden hinzugefügt.` });
      setActiveStep("packages");
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Bilder konnten nicht gespeichert werden. Bitte versuche es erneut.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await withPhotographerHeaders(`/api/galleries/${selectedGalleryId}/packages`, {
        method: "POST",
        body: JSON.stringify({
          name: packageName,
          priceCents: Math.round(Number(packagePrice) * 100),
          includedCount: Number(includedCount),
          allowExtra,
          extraUnitPriceCents: allowExtra ? Math.round(Number(extraPrice) * 100) : null,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Paket konnte nicht erstellt werden");
      }

      await loadGalleries();
      await loadPackages(selectedGalleryId);
      setNotice({ type: "success", text: "Fertig. Das Paket wurde gespeichert." });
      setActiveStep("share");
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Das Paket konnte nicht gespeichert werden. Bitte prüfe die Eingaben.") });
    } finally {
      setLoading(false);
    }
  }

  async function handlePublishGallery() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
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
        throw new Error(json?.error?.message ?? "Galerie konnte nicht freigegeben werden");
      }

      await loadGalleries();
      setNotice({ type: "success", text: "Fertig. Die Galerie ist jetzt live." });
      setActiveStep("summary");
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyError(error, "Die Freigabe hat nicht geklappt. Bitte versuche es in einem Moment erneut.") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="studio-shell">
      <section className="card grid" style={{ gap: "0.9rem" }}>
        <div>
          <p className="pill" style={{ marginBottom: "0.5rem" }}>
            PhotoPay Studio
          </p>
          <h1 style={{ marginBottom: "0.35rem" }}>Ein Schritt, eine Entscheidung</h1>
          <p className="helper" style={{ marginBottom: 0 }}>
            Du siehst immer nur den aktuellen Schritt. So bleibt alles klar und ruhig.
          </p>
        </div>

        <nav aria-label="Schritte" className="wizard-nav">
          {wizardSteps.map((step) => {
            const isActive = activeStep === step.id;
            const isEnabled = isStepAccessible(step.id);

            return (
              <button
                className={`wizard-step ${isActive ? "wizard-step-active" : ""}`}
                disabled={!isEnabled && !isActive}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <span className="wizard-step-label">{step.short}</span>
                {progress.recommendedStep === step.id ? <span className="wizard-step-hint">nächster</span> : null}
              </button>
            );
          })}
        </nav>
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      {activeStep === "create" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Schritt 1: Projekt anlegen</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Lege zuerst das Projekt für dein Shooting an.
          </p>

          <form className="grid" onSubmit={handleCreateGallery} style={{ gap: "0.65rem" }}>
            <div>
              <label className="label" htmlFor="gallery-title">
                Projektname
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
                Kurzbeschreibung (optional)
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
                Passwort für Kunden
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
                Projekt speichern
              </button>
            </div>
          </form>

          {galleries.length > 0 ? (
            <div className="grid" style={{ gap: "0.55rem" }}>
              <h3 style={{ marginBottom: 0 }}>Bestehende Projekte</h3>
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
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeStep === "assets" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Schritt 2: Bilder hinzufügen</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Wähle das Projekt und füge die gewünschten Bilder hinzu.
          </p>

          {!progress.hasGallery ? (
            <div className="notice notice-error">Bitte zuerst in Schritt 1 ein Projekt anlegen.</div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="gallery-pick-assets">
                  Projekt
                </label>
                <select
                  className="select"
                  id="gallery-pick-assets"
                  onChange={(event) => setSelectedGalleryId(event.target.value)}
                  value={selectedGalleryId}
                >
                  {galleries.map((gallery) => (
                    <option key={gallery.id} value={gallery.id}>
                      {gallery.title} ({gallery.assetCount} Bilder)
                    </option>
                  ))}
                </select>
              </div>

              <form className="grid" onSubmit={handleSeedAssets} style={{ gap: "0.65rem" }}>
                <div>
                  <label className="label" htmlFor="asset-seed">
                    Bilder auswählen (Demo)
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
            </>
          )}
        </section>
      ) : null}

      {activeStep === "packages" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Schritt 3: Pakete festlegen</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Definiere Preis, enthaltene Bilder und optional den Preis für Zusatzbilder.
          </p>

          {!progress.hasAssets ? (
            <div className="notice notice-error">Bitte zuerst in Schritt 2 Bilder hinzufügen.</div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="gallery-pick-packages">
                  Projekt
                </label>
                <select
                  className="select"
                  id="gallery-pick-packages"
                  onChange={(event) => setSelectedGalleryId(event.target.value)}
                  value={selectedGalleryId}
                >
                  {galleries.map((gallery) => (
                    <option key={gallery.id} value={gallery.id}>
                      {gallery.title}
                    </option>
                  ))}
                </select>
              </div>

              <form className="grid" onSubmit={handleCreatePackage} style={{ gap: "0.65rem" }}>
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
                      Paketpreis (CHF)
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
                      Enthaltene Bilder
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
                  Zusatzbilder erlauben
                </label>

                {allowExtra ? (
                  <div>
                    <label className="label" htmlFor="extra-price">
                      Preis pro Zusatzbild (CHF)
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

              <div className="notice notice-muted small">
                Paketbibliothek: Vorlagenverwaltung folgt als nächster Ausbau. Aktuell arbeitest du mit Projektpaketen.
              </div>

              {packages.length > 0 ? (
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
                          ? `Zusatzbild: ${pkg.extraUnitPriceCents ? formatChf(pkg.extraUnitPriceCents) : "-"}`
                          : "Keine Zusatzbilder"}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {activeStep === "share" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Schritt 4: Kundenlink freigeben</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Wenn alles passt, schaltest du das Projekt live und teilst den Link mit deinen Kunden.
          </p>

          {!progress.hasPackages ? (
            <div className="notice notice-error">Bitte zuerst in Schritt 3 ein Paket festlegen.</div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="gallery-pick-share">
                  Projekt
                </label>
                <select
                  className="select"
                  id="gallery-pick-share"
                  onChange={(event) => setSelectedGalleryId(event.target.value)}
                  value={selectedGalleryId}
                >
                  {galleries.map((gallery) => (
                    <option key={gallery.id} value={gallery.id}>
                      {gallery.title} ({gallery.status === "published" ? "live" : "entwurf"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="toolbar">
                <button className="btn" disabled={loading || !selectedGalleryId} onClick={handlePublishGallery} type="button">
                  Jetzt freigeben
                </button>
              </div>

              {selectedGallery ? (
                <>
                  <div className="notice notice-muted small">
                    Aktives Projekt: <strong>{selectedGallery.title}</strong>
                  </div>
                  <div className="link-box">
                    <p className="small muted" style={{ marginBottom: "0.4rem" }}>
                      Persönlicher Kundenlink
                    </p>
                    <p className="mono small" style={{ margin: 0, wordBreak: "break-all" }}>
                      {publicGalleryUrl || "Noch nicht verfügbar"}
                    </p>
                  </div>
                  <div className="toolbar">
                    <a className="btn btn-secondary" href={publicGalleryUrl} rel="noreferrer" target="_blank">
                      Kundenseite öffnen
                    </a>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {activeStep === "summary" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Übersicht</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Hier siehst du den aktuellen Status deines Projekts.
          </p>

          <div className="grid grid-2">
            <div className={`notice ${progress.hasGallery ? "notice-success" : "notice-error"} small`}>
              Projekt: {progress.hasGallery ? "erledigt" : "offen"}
            </div>
            <div className={`notice ${progress.hasAssets ? "notice-success" : "notice-error"} small`}>
              Bilder: {progress.hasAssets ? "erledigt" : "offen"}
            </div>
            <div className={`notice ${progress.hasPackages ? "notice-success" : "notice-error"} small`}>
              Pakete: {progress.hasPackages ? "erledigt" : "offen"}
            </div>
            <div className={`notice ${progress.isPublished ? "notice-success" : "notice-error"} small`}>
              Freigabe: {progress.isPublished ? "erledigt" : "offen"}
            </div>
          </div>

          {selectedGallery ? (
            <div className="link-box">
              <p className="small muted" style={{ marginBottom: "0.4rem" }}>
                Persönlicher Kundenlink
              </p>
              <p className="mono small" style={{ margin: 0, wordBreak: "break-all" }}>
                {publicGalleryUrl || "Noch nicht verfügbar"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <button
            className="btn btn-secondary"
            disabled={activeStep === "create"}
            onClick={() => setActiveStep(previousStep(activeStep))}
            type="button"
          >
            Zurück
          </button>

          {activeStep !== "summary" ? (
            <button
              className="btn"
              disabled={!canGoNext}
              onClick={() => setActiveStep(nextStep(activeStep))}
              type="button"
            >
              Weiter
            </button>
          ) : (
            <button className="btn" onClick={() => setActiveStep(progress.recommendedStep)} type="button">
              Zum nächsten offenen Schritt
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
