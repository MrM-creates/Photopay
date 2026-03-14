"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import UiIcon from "@/app/components/UiIcon";
import AdminDropdown from "@/app/components/AdminDropdown";

type Notice = {
  type: "error" | "success" | "muted";
  text: string;
};

type PackageTemplate = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  includedCount: number;
  allowExtra: boolean;
  extraUnitPriceCents: number | null;
  soldCount: number;
};

type MailTemplate = {
  key: string;
  id: string;
  name: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  active: boolean;
  system?: boolean;
};

type SettingsCustomer = {
  id: string;
  customerNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string;
  note: string | null;
  projectCount: number;
  draftProjectCount: number;
  liveProjectCount: number;
  paidOrderCount: number;
  lastProjectSavedAt: string | null;
};

type SettingsSection = "home" | "packages" | "customers" | "mailtexts";

const photographerStorageKey = "photopay_photographer_id";

function createClientUuid() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex(3)}-${randomHex(12)}`;
}

function formatChf(cents: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

function formatPackageId(id: string) {
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `P-${compact}`;
}

function formatCustomerId(customerNumber: string | null, id: string) {
  if (customerNumber && customerNumber.trim().length > 0) return customerNumber;
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `K-${compact}`;
}

function formatMailTemplateId(id: string) {
  const compact = id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `M-${compact}`;
}

export default function SettingsClient({ section = "home" }: { section?: SettingsSection }) {
  const [photographerId, setPhotographerId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  const [packageTemplates, setPackageTemplates] = useState<PackageTemplate[]>([]);
  const [packageFeatureReady, setPackageFeatureReady] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isPackageFormOpen, setIsPackageFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templatePrice, setTemplatePrice] = useState("120");
  const [templateIncludedCount, setTemplateIncludedCount] = useState("10");
  const [templateAllowExtra, setTemplateAllowExtra] = useState(true);
  const [templateExtraPrice, setTemplateExtraPrice] = useState("15");

  const [mailTemplates, setMailTemplates] = useState<MailTemplate[]>([]);
  const [mailFeatureReady, setMailFeatureReady] = useState(true);
  const [selectedMailKey, setSelectedMailKey] = useState("gallery_share");
  const [mailName, setMailName] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailActive, setMailActive] = useState(true);
  const [isMailFormOpen, setIsMailFormOpen] = useState(false);
  const [mailFormMode, setMailFormMode] = useState<"edit" | "create">("edit");

  const [customers, setCustomers] = useState<SettingsCustomer[]>([]);
  const [customerFeatureReady, setCustomerFeatureReady] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");

  const withHeaders = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      let effectivePhotographerId = photographerId;
      if (!effectivePhotographerId) {
        const stored = window.localStorage.getItem(photographerStorageKey);
        if (stored) effectivePhotographerId = stored;
      }

      if (!effectivePhotographerId) {
        throw new Error("Photographer ID fehlt");
      }

      const headers = new Headers(init?.headers);
      headers.set("x-photographer-id", effectivePhotographerId);
      if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(input, { ...init, headers });
    },
    [photographerId],
  );

  const selectedMailTemplate = useMemo(
    () => mailTemplates.find((entry) => entry.key === selectedMailKey) ?? null,
    [mailTemplates, selectedMailKey],
  );

  const applyMailTemplate = useCallback((template: MailTemplate | null) => {
    if (!template) return;
    setMailName(template.name);
    setMailSubject(template.subject);
    setMailBody(template.body);
    setMailActive(template.active);
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((entry) =>
      `${entry.customerNumber ?? ""} ${entry.fullName} ${entry.firstName ?? ""} ${entry.lastName ?? ""} ${entry.email}`
        .toLowerCase()
        .includes(query),
    );
  }, [customerSearch, customers]);

  const resetTemplateForm = useCallback(() => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplatePrice("120");
    setTemplateIncludedCount("10");
    setTemplateAllowExtra(true);
    setTemplateExtraPrice("15");
  }, []);

  const resetCustomerForm = useCallback(() => {
    setNewCustomerFirstName("");
    setNewCustomerLastName("");
    setNewCustomerEmail("");
    setNewCustomerNote("");
  }, []);

  const resetMailForm = useCallback(() => {
    setMailName("");
    setMailSubject("");
    setMailBody("");
    setMailActive(true);
  }, []);

  const loadPackageTemplates = useCallback(async () => {
    const response = await withHeaders("/api/settings/package-templates", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Pakete konnten nicht geladen werden.");
    }
    setPackageFeatureReady(json.featureReady !== false);
    setPackageTemplates((json.templates ?? []) as PackageTemplate[]);
  }, [withHeaders]);

  const loadMailTemplates = useCallback(async () => {
    const response = await withHeaders("/api/settings/mail-templates", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Mailtexte konnten nicht geladen werden.");
    }
    setMailFeatureReady(json.featureReady !== false);
    setMailTemplates((json.templates ?? []) as MailTemplate[]);
  }, [withHeaders]);

  const loadCustomers = useCallback(async () => {
    const response = await withHeaders("/api/settings/customers", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Kunden konnten nicht geladen werden.");
    }
    setCustomerFeatureReady(json.featureReady !== false);
    setCustomers((json.customers ?? []) as SettingsCustomer[]);
  }, [withHeaders]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = window.localStorage.getItem(photographerStorageKey);
      if (stored) {
        if (!cancelled) setPhotographerId(stored);
        return;
      }

      try {
        const response = await fetch("/api/photographers/default");
        const json = await response.json().catch(() => null);
        const nextId = typeof json?.photographerId === "string" ? json.photographerId : "";
        if (response.ok && nextId) {
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
    setLoading(true);
    setNotice(null);

    void Promise.all([loadPackageTemplates(), loadMailTemplates(), loadCustomers()])
      .catch((error: unknown) => {
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Admin-Bereich konnte nicht geladen werden.",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [photographerId, loadCustomers, loadMailTemplates, loadPackageTemplates]);

  useEffect(() => {
    applyMailTemplate(selectedMailTemplate);
  }, [applyMailTemplate, selectedMailTemplate]);

  useEffect(() => {
    if (mailTemplates.length === 0) return;
    const exists = mailTemplates.some((entry) => entry.key === selectedMailKey);
    if (exists) return;
    setSelectedMailKey(mailTemplates[0].key);
  }, [mailTemplates, selectedMailKey]);

  async function handleSaveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const payload = {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        priceCents: Math.round(Number(templatePrice) * 100),
        includedCount: Number(templateIncludedCount),
        allowExtra: templateAllowExtra,
        extraUnitPriceCents: templateAllowExtra ? Math.round(Number(templateExtraPrice) * 100) : null,
      };

      const targetUrl = editingTemplateId
        ? `/api/settings/package-templates/${editingTemplateId}`
        : "/api/settings/package-templates";
      const method = editingTemplateId ? "PATCH" : "POST";

      const response = await withHeaders(targetUrl, {
        method,
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Paket konnte nicht gespeichert werden.");
      }

      await loadPackageTemplates();
      resetTemplateForm();
      setIsPackageFormOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Paket konnte nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    const confirmed = window.confirm("Paket wirklich löschen?");
    if (!confirmed) return;

    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders(`/api/settings/package-templates/${templateId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Paket konnte nicht gelöscht werden.");
      }

      await loadPackageTemplates();
      if (editingTemplateId === templateId) {
        resetTemplateForm();
        setIsPackageFormOpen(false);
      }
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Paket konnte nicht gelöscht werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMailTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMailKey) return;
    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders("/api/settings/mail-templates", {
        method: "PUT",
        body: JSON.stringify({
          key: selectedMailKey,
          name: mailName.trim(),
          subject: mailSubject.trim(),
          body: mailBody.trim(),
          active: mailActive,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Mailtext konnte nicht gespeichert werden.");
      }

      await loadMailTemplates();
      applyMailTemplate({
        key: selectedMailKey,
        id: selectedMailTemplate?.id ?? selectedMailKey,
        name: mailName.trim(),
        title: selectedMailTemplate?.title ?? mailName.trim(),
        description: selectedMailTemplate?.description ?? "",
        subject: mailSubject.trim(),
        body: mailBody.trim(),
        active: mailActive,
        system: selectedMailTemplate?.system,
      });
      setIsMailFormOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Mailtext konnte nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMailTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders("/api/settings/mail-templates", {
        method: "POST",
        body: JSON.stringify({
          name: mailName.trim(),
          subject: mailSubject.trim(),
          body: mailBody.trim(),
          active: mailActive,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Vorlage konnte nicht erstellt werden.");
      }

      await loadMailTemplates();
      if (typeof json?.template?.key === "string") {
        setSelectedMailKey(json.template.key);
      }
      setIsMailFormOpen(false);
      setMailFormMode("edit");
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Vorlage konnte nicht erstellt werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          firstName: newCustomerFirstName.trim(),
          lastName: newCustomerLastName.trim() || undefined,
          email: newCustomerEmail.trim(),
          note: newCustomerNote.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Kunde konnte nicht gespeichert werden.");
      }

      await loadCustomers();
      resetCustomerForm();
      setIsCustomerFormOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Kunde konnte nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-shell">
      <header className="card settings-topbar">
        <Link className="studio-brand-link" href="/">
          PhotoPay
        </Link>
        <nav aria-label="Hauptmenü" className="landing-menu">
          <Link className="landing-menu-link" href="/">
            <UiIcon name="home" />
            Start
          </Link>
          <Link className="landing-menu-link" href="/studio?step=create&mode=open">
            <UiIcon name="project" />
            Projekt
          </Link>
          <Link className="landing-menu-link" href="/studio?step=assets&mode=open">
            <UiIcon name="images" />
            Bilder
          </Link>
          <Link className="landing-menu-link" href="/studio?step=share&mode=open">
            <UiIcon name="gallery" />
            Galerie &amp; Freigabe
          </Link>
          <Link className="landing-menu-link" href="/studio?step=summary&mode=open">
            <UiIcon name="summary" />
            Übersicht
          </Link>
          <AdminDropdown active />
        </nav>
      </header>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      {section === "home" ? (
        <>
          <section className="settings-grid settings-entry-grid">
            <article className="card settings-entry-card">
              <h2 className="settings-title-row">
                <UiIcon name="packages" />
                Pakete verwalten
              </h2>
              <p className="helper">Wie möchtest du deine Fotos anbieten? Hier bestimmst du deine Lösungen dazu.</p>
              <div className="toolbar">
                <Link className="btn settings-entry-action" href="/settings/packages">
                  Pakete verwalten
                </Link>
              </div>
            </article>

            <article className="card settings-entry-card">
              <h2 className="settings-title-row">
                <UiIcon name="customers" />
                Kunden verwalten
              </h2>
              <p className="helper">
                Neuer Kunde? Gratulation! Erfasse den Kunden hier und finde heraus, wer dir schon alles vertraut hat.
              </p>
              <div className="toolbar">
                <Link className="btn settings-entry-action" href="/settings/customers">
                  Kunden verwalten
                </Link>
              </div>
            </article>

            <article className="card settings-entry-card">
              <h2 className="settings-title-row">
                <UiIcon name="mailtexts" />
                Mailtexte verwalten
              </h2>
              <p className="helper">
                Übermittle die frohe Nachricht über verfügbare Bilder an deine Kunden und mache sie darauf aufmerksam, dass
                sie noch Fotos herunterladen können.
              </p>
              <div className="toolbar">
                <Link className="btn settings-entry-action" href="/settings/mailtexts">
                  Mailtexte verwalten
                </Link>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {section === "packages" ? (
        <section className="card grid" style={{ gap: "0.8rem" }}>
          <div className="settings-dialog-header settings-dialog-header-page">
            <div>
              <h2 className="settings-dialog-title settings-title-row">
                <UiIcon name="packages" />
                Pakete verwalten
              </h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                Hier kannst du deine Pakete zusammenstellen. Wieviele Fotos sollen enthalten sein, sind zusätzlich auch
                Einzelfotos erwerbbar? Du bestimmst, was für dich passt.
              </p>
            </div>
          </div>

          {!packageFeatureReady ? (
            <div className="notice notice-muted">Pakete sind aktuell noch nicht verfügbar.</div>
          ) : (
            <>
              {packageTemplates.length > 0 ? (
                <div className="settings-list">
                  <h3 style={{ marginBottom: 0 }}>Bestehende Pakete</h3>
                  {packageTemplates.map((entry) => (
                    <article className="benefit-card" key={entry.id}>
                      <div className="kv">
                        <strong>{entry.name}</strong>
                        <span className="small muted">{formatPackageId(entry.id)}</span>
                      </div>
                      {entry.description ? <p className="small muted">{entry.description}</p> : null}
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        {formatChf(entry.priceCents)} • {entry.includedCount} Fotos
                        {entry.allowExtra && entry.extraUnitPriceCents !== null
                          ? ` • Einzelfoto ${formatChf(entry.extraUnitPriceCents)}`
                          : ""}
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Anzahl verkauft: {entry.soldCount ?? 0}
                      </p>
                      <div className="toolbar">
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            setEditingTemplateId(entry.id);
                            setTemplateName(entry.name);
                            setTemplateDescription(entry.description ?? "");
                            setTemplatePrice((entry.priceCents / 100).toFixed(2).replace(".00", ""));
                            setTemplateIncludedCount(String(entry.includedCount));
                            setTemplateAllowExtra(entry.allowExtra);
                            setTemplateExtraPrice(
                              entry.extraUnitPriceCents !== null
                                ? (entry.extraUnitPriceCents / 100).toFixed(2).replace(".00", "")
                                : "15",
                            );
                            setIsPackageFormOpen(true);
                          }}
                          type="button"
                        >
                          Bearbeiten
                        </button>
                        <button className="btn btn-secondary" disabled={loading} onClick={() => void handleDeleteTemplate(entry.id)} type="button">
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice-muted">Noch keine Pakete vorhanden.</div>
              )}

              <div className="toolbar">
                <button
                  className="btn"
                  onClick={() => {
                    resetTemplateForm();
                    setIsPackageFormOpen(true);
                  }}
                  type="button"
                >
                  Paket erstellen
                </button>
              </div>

              {isPackageFormOpen ? (
                <div
                  aria-modal="true"
                  className="settings-overlay-backdrop"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setIsPackageFormOpen(false);
                      resetTemplateForm();
                    }
                  }}
                  role="dialog"
                >
                  <section className="card settings-overlay-card">
                    <div className="settings-dialog-header">
                      <div>
                        <h3 className="settings-dialog-title" style={{ marginBottom: "0.15rem" }}>
                          {editingTemplateId ? "Paket bearbeiten" : "Paket erstellen"}
                        </h3>
                        <p className="helper" style={{ marginBottom: 0 }}>
                          Erfasse die Paketdaten in wenigen Schritten.
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsPackageFormOpen(false);
                          resetTemplateForm();
                        }}
                        type="button"
                      >
                        Schliessen
                      </button>
                    </div>

                    <form className="grid" onSubmit={handleSaveTemplate} style={{ gap: "0.6rem" }}>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="tpl-name">
                            Paketname
                          </label>
                          <input
                            className="input"
                            id="tpl-name"
                            onChange={(event) => setTemplateName(event.target.value)}
                            placeholder="z. B. 10er Paket"
                            required
                            value={templateName}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="tpl-description">
                            Kurzbeschreibung (optional)
                          </label>
                          <input
                            className="input"
                            id="tpl-description"
                            onChange={(event) => setTemplateDescription(event.target.value)}
                            value={templateDescription}
                          />
                        </div>
                      </div>

                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="tpl-included">
                            Anzahl enthaltener Fotos
                          </label>
                          <input
                            className="input mono"
                            id="tpl-included"
                            onChange={(event) => setTemplateIncludedCount(event.target.value)}
                            required
                            value={templateIncludedCount}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="tpl-price">
                            Preis in CHF
                          </label>
                          <input
                            className="input mono"
                            id="tpl-price"
                            onChange={(event) => setTemplatePrice(event.target.value)}
                            required
                            value={templatePrice}
                          />
                        </div>
                      </div>

                      <label className="asset-item" style={{ width: "fit-content" }}>
                        <input
                          checked={templateAllowExtra}
                          onChange={(event) => setTemplateAllowExtra(event.target.checked)}
                          type="checkbox"
                        />
                        Einzelfotos erlauben
                      </label>

                      {templateAllowExtra ? (
                        <div style={{ maxWidth: "280px" }}>
                          <label className="label" htmlFor="tpl-extra">
                            Preis in CHF für Einzelfotos
                          </label>
                          <input
                            className="input mono"
                            id="tpl-extra"
                            onChange={(event) => setTemplateExtraPrice(event.target.value)}
                            required
                            value={templateExtraPrice}
                          />
                        </div>
                      ) : null}

                      <div className="toolbar">
                        <button className="btn" disabled={loading} type="submit">
                          {editingTemplateId ? "Paket speichern" : "Paket erstellen"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            setIsPackageFormOpen(false);
                            resetTemplateForm();
                          }}
                          type="button"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  </section>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {section === "customers" ? (
        <section className="card grid" style={{ gap: "0.8rem" }}>
          <div className="settings-dialog-header settings-dialog-header-page">
            <div>
              <h2 className="settings-dialog-title settings-title-row">
                <UiIcon name="customers" />
                Kunden verwalten
              </h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                Lege neue Kunden an oder finde bestehende Kunden über Name oder E-Mail.
              </p>
            </div>
          </div>

          {!customerFeatureReady ? (
            <div className="notice notice-muted">Kundenverwaltung ist noch nicht aktiv.</div>
          ) : (
            <>
              <div className="settings-list">
                <h3 style={{ marginBottom: 0 }}>Bestehende Kunden</h3>
                <input
                  className="input"
                  id="settings-customer-search"
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Name oder E-Mail suchen"
                  value={customerSearch}
                />

                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((entry) => (
                    <article className="benefit-card" key={entry.id}>
                      <div className="settings-customer-header">
                        <div className="settings-customer-identity">
                          <strong>{entry.fullName}</strong>
                          <span className="small muted">{entry.email}</span>
                        </div>
                        <span className="small muted">{formatCustomerId(entry.customerNumber, entry.id)}</span>
                      </div>
                      {entry.note ? <p className="small muted">{entry.note}</p> : null}
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Projekte: {entry.projectCount} (Läuft {entry.draftProjectCount}, Abgeschlossen {entry.liveProjectCount})
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Bezahlte Bestellungen: {entry.paidOrderCount}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="notice notice-muted">Noch keine passenden Kunden gefunden.</div>
                )}
              </div>

              <div className="toolbar">
                <button
                  className="btn"
                  onClick={() => {
                    resetCustomerForm();
                    setIsCustomerFormOpen(true);
                  }}
                  type="button"
                >
                  Neuen Kunden erfassen
                </button>
              </div>

              {isCustomerFormOpen ? (
                <div
                  aria-modal="true"
                  className="settings-overlay-backdrop"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setIsCustomerFormOpen(false);
                      resetCustomerForm();
                    }
                  }}
                  role="dialog"
                >
                  <section className="card settings-overlay-card">
                    <div className="settings-dialog-header">
                      <div>
                        <h3 className="settings-dialog-title" style={{ marginBottom: "0.15rem" }}>
                          Neuen Kunden erfassen
                        </h3>
                        <p className="helper" style={{ marginBottom: 0 }}>
                          Erfasse die Kundendaten in wenigen Schritten.
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsCustomerFormOpen(false);
                          resetCustomerForm();
                        }}
                        type="button"
                      >
                        Schliessen
                      </button>
                    </div>

                    <form className="grid" onSubmit={handleCreateCustomer} style={{ gap: "0.6rem" }}>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="customer-first-name">
                            Vorname
                          </label>
                          <input
                            className="input"
                            id="customer-first-name"
                            onChange={(event) => setNewCustomerFirstName(event.target.value)}
                            required
                            value={newCustomerFirstName}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="customer-last-name">
                            Nachname
                          </label>
                          <input
                            className="input"
                            id="customer-last-name"
                            onChange={(event) => setNewCustomerLastName(event.target.value)}
                            value={newCustomerLastName}
                          />
                        </div>
                      </div>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="customer-email">
                            E-Mail
                          </label>
                          <input
                            className="input"
                            id="customer-email"
                            onChange={(event) => setNewCustomerEmail(event.target.value)}
                            required
                            type="email"
                            value={newCustomerEmail}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="customer-note">
                          Anmerkung (optional)
                        </label>
                        <input
                          className="input"
                          id="customer-note"
                          onChange={(event) => setNewCustomerNote(event.target.value)}
                          value={newCustomerNote}
                        />
                      </div>
                      <div className="toolbar">
                        <button className="btn" disabled={loading} type="submit">
                          Kunde speichern
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            setIsCustomerFormOpen(false);
                            resetCustomerForm();
                          }}
                          type="button"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  </section>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {section === "mailtexts" ? (
        <section className="card grid" style={{ gap: "0.8rem" }}>
          <div className="settings-dialog-header settings-dialog-header-page">
            <div>
              <h2 className="settings-dialog-title settings-title-row">
                <UiIcon name="mailtexts" />
                Mailtexte verwalten
              </h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                Passe Betreff und Nachricht für die automatische Kundenkommunikation an.
              </p>
            </div>
          </div>

          {!mailFeatureReady ? (
            <div className="notice notice-muted">Mailtexte sind aktuell noch nicht verfügbar.</div>
          ) : (
            <>
              {mailTemplates.length > 0 ? (
                <div className="settings-list">
                  <h3 style={{ marginBottom: 0 }}>Bestehende Mailtexte</h3>
                  {mailTemplates.map((entry) => (
                    <article className="benefit-card" key={entry.key}>
                      <div className="settings-customer-header">
                        <div className="settings-customer-identity">
                          <strong>{entry.name}</strong>
                          <span className="small muted">{entry.subject}</span>
                        </div>
                        <span className="small muted mono" title={entry.id}>
                          {formatMailTemplateId(entry.id)}
                        </span>
                      </div>
                      <p className="small muted">{entry.description}</p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Status: {entry.active ? "Aktiv" : "Inaktiv"}
                      </p>
                      <div className="toolbar">
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            setSelectedMailKey(entry.key);
                            applyMailTemplate(entry);
                            setMailFormMode("edit");
                            setIsMailFormOpen(true);
                          }}
                          type="button"
                        >
                          Bearbeiten
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice-muted">Noch keine Mailtexte vorhanden.</div>
              )}

              <div className="toolbar">
                <button
                  className="btn"
                  disabled={loading}
                  onClick={() => {
                    resetMailForm();
                    setMailFormMode("create");
                    setIsMailFormOpen(true);
                  }}
                  type="button"
                >
                  Neue Vorlage erstellen
                </button>
              </div>

              {isMailFormOpen ? (
                <div
                  aria-modal="true"
                  className="settings-overlay-backdrop"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setIsMailFormOpen(false);
                      if (mailFormMode === "edit") {
                        applyMailTemplate(selectedMailTemplate);
                      } else {
                        resetMailForm();
                      }
                    }
                  }}
                  role="dialog"
                >
                  <section className="card settings-overlay-card">
                    <div className="settings-dialog-header">
                      <div>
                        <h3 className="settings-dialog-title" style={{ marginBottom: "0.15rem" }}>
                          {mailFormMode === "edit" ? "Mailtext bearbeiten" : "Neue Vorlage erstellen"}
                        </h3>
                        <p className="helper" style={{ marginBottom: 0 }}>
                          {mailFormMode === "edit"
                            ? "Passe Betreff und Nachricht für die gewählte Vorlage an."
                            : "Erfasse Name, Betreff und Nachricht für deine neue Vorlage."}
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsMailFormOpen(false);
                          if (mailFormMode === "edit") {
                            applyMailTemplate(selectedMailTemplate);
                          } else {
                            resetMailForm();
                          }
                        }}
                        type="button"
                      >
                        Schliessen
                      </button>
                    </div>

                    <form
                      className="grid"
                      onSubmit={mailFormMode === "edit" ? handleSaveMailTemplate : handleCreateMailTemplate}
                      style={{ gap: "0.6rem" }}
                    >
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="mail-template-id">
                            Mailtext-ID
                          </label>
                          <input
                            className="input mono"
                            id="mail-template-id"
                            readOnly
                            value={
                              mailFormMode === "edit" && selectedMailTemplate
                                ? formatMailTemplateId(selectedMailTemplate.id)
                                : "Wird beim Speichern vergeben"
                            }
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="mail-template-name">
                            Mailtext-Name
                          </label>
                          <input
                            className="input"
                            id="mail-template-name"
                            onChange={(event) => setMailName(event.target.value)}
                            required
                            value={mailName}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="label" htmlFor="mail-template-subject">
                          Betreff
                        </label>
                        <input
                          className="input"
                          id="mail-template-subject"
                          onChange={(event) => setMailSubject(event.target.value)}
                          required
                          value={mailSubject}
                        />
                      </div>

                      <div>
                        <label className="label" htmlFor="mail-template-body">
                          Nachricht
                        </label>
                        <textarea
                          className="textarea"
                          id="mail-template-body"
                          onChange={(event) => setMailBody(event.target.value)}
                          required
                          value={mailBody}
                        />
                        <p className="small muted" style={{ margin: "0.35rem 0 0" }}>
                          Platzhalter: {`{{kunde_name}}`} {`{{projekt_name}}`} {`{{galerie_link}}`} {`{{passwort}}`}{" "}
                          {`{{ablaufdatum}}`} {`{{fotograf_name}}`}
                        </p>
                      </div>

                      <label className="asset-item" style={{ width: "fit-content" }}>
                        <input checked={mailActive} onChange={(event) => setMailActive(event.target.checked)} type="checkbox" />
                        Vorlage aktiv
                      </label>

                      <div className="toolbar">
                        <button className="btn" disabled={loading} type="submit">
                          {mailFormMode === "edit" ? "Mailtext speichern" : "Vorlage erstellen"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            if (mailFormMode === "edit") {
                              applyMailTemplate(selectedMailTemplate);
                            } else {
                              resetMailForm();
                            }
                          }}
                          type="button"
                        >
                          Änderungen verwerfen
                        </button>
                      </div>
                    </form>
                  </section>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {loading ? <div className="notice notice-muted">Lädt oder speichert gerade ...</div> : null}
    </main>
  );
}
