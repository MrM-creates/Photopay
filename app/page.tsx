"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  publicSlug: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  createdAt: string;
  packageCount: number;
  assetCount: number;
};

type HomeNotice = {
  type: "error" | "muted";
  text: string;
};

type WizardStepId = "create" | "assets" | "packages" | "share" | "summary";

const photographerStorageKey = "photopay_photographer_id";

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

function toFriendlyHomeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Ich konnte den Server gerade nicht erreichen. Bitte versuche es in ein paar Sekunden erneut.";
  }

  return "Die Projekte konnten nicht geladen werden. Bitte versuche es erneut.";
}

function getSuggestedStep(project: ProjectRow): WizardStepId {
  if (project.assetCount <= 0) return "assets";
  if (project.packageCount <= 0) return "packages";
  if (project.status !== "published") return "share";
  return "summary";
}

function buildStudioLink(projectId: string, step: WizardStepId) {
  const params = new URLSearchParams({ project: projectId, step });
  return `/studio?${params.toString()}`;
}

export default function HomePage() {
  const [photographerId, setPhotographerId] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<HomeNotice | null>(null);

  const hasProjects = projects.length > 0;
  const latestProject = projects[0] ?? null;

  const continueHref = useMemo(() => {
    if (!latestProject) return "/studio?step=create";
    return buildStudioLink(latestProject.id, getSuggestedStep(latestProject));
  }, [latestProject]);

  const loadProjects = useCallback(async () => {
    if (!photographerId) return;

    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/galleries", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-photographer-id": photographerId,
        },
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Projects konnten nicht geladen werden");
      }

      setProjects((json.galleries ?? []) as ProjectRow[]);
    } catch (error) {
      setNotice({ type: "error", text: toFriendlyHomeError(error) });
    } finally {
      setLoading(false);
    }
  }, [photographerId]);

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
    if (!photographerId) return;

    void loadProjects();
  }, [photographerId, loadProjects]);

  return (
    <main className="landing-shell">
      <header className="card landing-hero">
        <p className="pill">PhotoPay für Fotografen</p>
        <h1 className="landing-title">PhotoPay</h1>
        <p className="landing-subtitle">Verkaufe dein Shooting in 4 klaren Schritten.</p>
        <p className="helper" style={{ marginBottom: 0, maxWidth: "60ch" }}>
          Du legst ein Projekt an, fügst Bilder hinzu, definierst Pakete und teilst den persönlichen Kundenlink.
        </p>

        <div className="landing-actions">
          <Link className="btn" href="/studio?step=create">
            Neues Projekt starten
          </Link>
          <Link className="btn btn-secondary" href={continueHref}>
            Projekt fortsetzen
          </Link>
        </div>
      </header>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <section className="grid grid-2">
        <article className="card value-card">
          <h2>Einfach geführt</h2>
          <p className="helper">Jeder Schritt zeigt nur das, was jetzt wichtig ist.</p>
        </article>
        <article className="card value-card">
          <h2>Klarer Kundenprozess</h2>
          <p className="helper">Kunden öffnen ihren Link, wählen, zahlen und laden herunter.</p>
        </article>
        <article className="card value-card">
          <h2>Projektbasiert arbeiten</h2>
          <p className="helper">Neue Projekte starten und bestehende jederzeit weiterbearbeiten.</p>
        </article>
        <article className="card value-card">
          <h2>Pakete wiederverwenden</h2>
          <p className="helper">Projektpakete sind aktiv, Paketbibliothek folgt als nächster Ausbau.</p>
        </article>
      </section>

      <section className="card" id="project-list">
        <div className="kv" style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ marginBottom: 0 }}>Deine Projekte</h2>
          <span className="pill">{projects.length}</span>
        </div>

        {loading ? <p className="helper">Projekte werden geladen...</p> : null}

        {!loading && !hasProjects ? (
          <p className="helper" style={{ marginBottom: 0 }}>
            Noch kein Projekt vorhanden. Starte mit deinem ersten Projekt.
          </p>
        ) : null}

        {hasProjects ? (
          <div className="project-list">
            {projects.map((project) => {
              const suggestedStep = getSuggestedStep(project);
              return (
                <article className="project-item" key={project.id}>
                  <div className="kv" style={{ alignItems: "flex-start" }}>
                    <div>
                      <strong>{project.title}</strong>
                      <p className="small muted" style={{ margin: "0.2rem 0 0" }}>
                        {project.description || "Ohne Beschreibung"}
                      </p>
                    </div>
                    <span className={`status ${project.status === "published" ? "status-published" : "status-draft"}`}>
                      {project.status === "published" ? "live" : "entwurf"}
                    </span>
                  </div>

                  <p className="small muted" style={{ marginBottom: "0.5rem" }}>
                    Bilder: {project.assetCount} | Pakete: {project.packageCount}
                  </p>

                  <div className="toolbar">
                    <Link className="btn" href={buildStudioLink(project.id, suggestedStep)}>
                      Fortsetzen
                    </Link>
                    <Link className="btn btn-secondary" href={buildStudioLink(project.id, "create")}>
                      Projekt öffnen
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card grid" style={{ gap: "0.55rem" }}>
        <h2 style={{ marginBottom: 0 }}>Paketmanagement</h2>
        <p className="helper" style={{ marginBottom: 0 }}>
          Projektpakete kannst du bereits in Schritt 3 verwalten. Die zentrale Paketbibliothek bauen wir als nächstes aus.
        </p>
        <div className="toolbar">
          <Link className="btn btn-secondary" href="/studio?step=packages">
            Pakete verwalten
          </Link>
        </div>
      </section>
    </main>
  );
}
