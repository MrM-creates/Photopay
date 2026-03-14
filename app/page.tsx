"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminDropdown from "@/app/components/AdminDropdown";

const photographerStorageKey = "photopay_photographer_id";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createClientUuid() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex(3)}-${randomHex(12)}`;
}

export default function HomePage() {
  const [photographerId, setPhotographerId] = useState("");
  const [photographerName, setPhotographerName] = useState("Noch nicht eingerichtet");
  const [profileReady, setProfileReady] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = window.localStorage.getItem(photographerStorageKey);
      if (stored && isUuidLike(stored)) {
        if (!cancelled) setPhotographerId(stored);
        return;
      }

      try {
        const response = await fetch("/api/photographers/default", { method: "GET" });
        const json = await response.json().catch(() => null);
        const nextId = typeof json?.photographerId === "string" ? json.photographerId : "";
        if (response.ok && isUuidLike(nextId)) {
          window.localStorage.setItem(photographerStorageKey, nextId);
          if (!cancelled) setPhotographerId(nextId);
          return;
        }
      } catch {
        // fallback below
      }

      const fallback = createClientUuid();
      window.localStorage.setItem(photographerStorageKey, fallback);
      if (!cancelled) setPhotographerId(fallback);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!photographerId) return;
    let cancelled = false;

    const loadProfile = async () => {
      setProfileReady(false);
      try {
        const response = await fetch("/api/settings/photographer-profile", {
          method: "GET",
          headers: {
            "x-photographer-id": photographerId,
          },
        });
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          if (!cancelled) {
            setPhotographerName("Noch nicht eingerichtet");
            setProfileComplete(false);
            setProfileReady(true);
          }
          return;
        }

        const firstName = String(json?.profile?.firstName ?? "").trim();
        const lastName = String(json?.profile?.lastName ?? "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

        if (!cancelled) {
          setPhotographerName(fullName || "Noch nicht eingerichtet");
          setProfileComplete(Boolean(firstName && lastName));
          setProfileReady(true);
        }
      } catch {
        if (!cancelled) {
          setPhotographerName("Noch nicht eingerichtet");
          setProfileComplete(false);
          setProfileReady(true);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [photographerId]);

  return (
    <main className="landing-shell">
      <header className="card landing-topbar">
        <Link className="studio-brand-link" href="/">
          PhotoPay
        </Link>
        <div className="landing-topbar-side">
          <p className="studio-top-photographer">
            Fotograf: <strong>{photographerName}</strong>
          </p>
          <nav aria-label="Hauptmenü" className="landing-menu">
            <AdminDropdown />
          </nav>
        </div>
      </header>

      {profileReady && !profileComplete ? (
        <section className="notice notice-muted">
          Bitte erfasse einmalig deine Fotografen-Daten, bevor du startest.
          <div className="toolbar" style={{ marginTop: "0.55rem" }}>
            <Link className="btn" href="/settings/photographer">
              Fotografen-Daten erfassen
            </Link>
          </div>
        </section>
      ) : null}

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
