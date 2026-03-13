"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

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
  active: boolean;
  sortOrder: number;
  updatedAt: string | null;
};

type MailTemplate = {
  key: "gallery_share" | "gallery_reminder" | "download_ready";
  id: string;
  name: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  active: boolean;
  customized: boolean;
  updatedAt: string | null;
};

type SettingsCustomer = {
  id: string;
  customerNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string;
  note: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  projectCount: number;
  draftProjectCount: number;
  liveProjectCount: number;
  archivedProjectCount: number;
  paidOrderCount: number;
  lastProjectSavedAt: string | null;
};

type SettingsDialogKey = "packages" | "customers" | "mailtexts" | null;

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

function formatDateTime(input: string | null | undefined) {
  if (!input) return "Noch nicht vorhanden";
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return "Noch nicht vorhanden";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatChf(cents: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

function SettingsDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      aria-modal="true"
      className="settings-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="card settings-dialog-card">
        <div className="settings-dialog-header">
          <div>
            <h2 className="settings-dialog-title">{title}</h2>
            <p className="helper" style={{ marginBottom: 0 }}>
              {subtitle}
            </p>
          </div>
          <button aria-label="Dialog schliessen" className="btn btn-secondary" onClick={onClose} type="button">
            Schliessen
          </button>
        </div>
        <div className="settings-dialog-body">{children}</div>
      </section>
    </div>
  );
}

export default function SettingsClient() {
  const [photographerId, setPhotographerId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState<SettingsDialogKey>(null);

  const [packageTemplates, setPackageTemplates] = useState<PackageTemplate[]>([]);
  const [packageFeatureReady, setPackageFeatureReady] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templatePrice, setTemplatePrice] = useState("120");
  const [templateIncludedCount, setTemplateIncludedCount] = useState("10");
  const [templateAllowExtra, setTemplateAllowExtra] = useState(true);
  const [templateExtraPrice, setTemplateExtraPrice] = useState("15");

  const [mailTemplates, setMailTemplates] = useState<MailTemplate[]>([]);
  const [mailFeatureReady, setMailFeatureReady] = useState(true);
  const [selectedMailKey, setSelectedMailKey] = useState<MailTemplate["key"]>("gallery_share");
  const [mailName, setMailName] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailActive, setMailActive] = useState(true);

  const [customers, setCustomers] = useState<SettingsCustomer[]>([]);
  const [customerFeatureReady, setCustomerFeatureReady] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
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

  const loadPackageTemplates = useCallback(async () => {
    const response = await withHeaders("/api/settings/package-templates", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Paketvorlagen konnten nicht geladen werden.");
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
          text: error instanceof Error ? error.message : "Einstellungen konnten nicht geladen werden.",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [photographerId, loadCustomers, loadMailTemplates, loadPackageTemplates]);

  useEffect(() => {
    if (!selectedMailTemplate) return;
    setMailName(selectedMailTemplate.name);
    setMailSubject(selectedMailTemplate.subject);
    setMailBody(selectedMailTemplate.body);
    setMailActive(selectedMailTemplate.active);
  }, [selectedMailTemplate]);

  useEffect(() => {
    if (!openDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDialog(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openDialog]);

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
      setNotice({
        type: "success",
        text: editingTemplateId ? "Paket gespeichert." : "Paket erstellt.",
      });
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
      }
      setNotice({ type: "success", text: "Paket gelöscht." });
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
      setNotice({ type: "success", text: "Mailtext gespeichert." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Mailtext konnte nicht gespeichert werden.",
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

      setNewCustomerFirstName("");
      setNewCustomerLastName("");
      setNewCustomerEmail("");
      setNewCustomerNote("");
      await loadCustomers();
      setNotice({ type: "success", text: "Kunde gespeichert." });
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
    <main className="studio-shell">
      <header className="studio-top">
        <div className="studio-top-brand">
          <Link className="studio-brand-link" href="/">
            PhotoPay
          </Link>
          <p className="studio-top-project">Einstellungen</p>
        </div>
        <nav aria-label="Hauptmenü" className="wizard-nav">
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/">
            <span className="wizard-step-label">Start</span>
          </Link>
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/studio?step=summary&mode=open">
            <span className="wizard-step-label">Übersicht</span>
          </Link>
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/studio?step=create&mode=open">
            <span className="wizard-step-label">Projekt</span>
          </Link>
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/studio?step=assets&mode=open">
            <span className="wizard-step-label">Bilder</span>
          </Link>
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/studio?step=packages&mode=open">
            <span className="wizard-step-label">Pakete</span>
          </Link>
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/studio?step=share&mode=open">
            <span className="wizard-step-label">Galerie &amp; Freigabe</span>
          </Link>
          <Link aria-current="page" className="wizard-step wizard-step-active wizard-step-link" href="/settings">
            <span className="wizard-step-label">
              <span aria-hidden="true" className="wizard-step-gear">
                &#9881;
              </span>
              Einstellungen
            </span>
          </Link>
        </nav>
      </header>

      <section className="card settings-hero settings-hero-left">
        <h1 className="landing-title">Einstellungen</h1>
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <section className="settings-grid settings-entry-grid">
        <article className="card settings-entry-card">
          <h2>Pakete verwalten</h2>
          <p className="helper">Wie möchtest du deine Fotos anbieten? Hier bestimmst du deine Lösungen dazu.</p>
          <div className="toolbar">
            <button className="btn" onClick={() => setOpenDialog("packages")} type="button">
              Pakete verwalten
            </button>
          </div>
        </article>

        <article className="card settings-entry-card">
          <h2>Kunden verwalten</h2>
          <p className="helper">
            Neuer Kunde? Gratulation! Erfasse den Kunden hier und finde heraus, wer dir schon alles vertraut hat.
          </p>
          <div className="toolbar">
            <button className="btn" onClick={() => setOpenDialog("customers")} type="button">
              Kunden verwalten
            </button>
          </div>
        </article>

        <article className="card settings-entry-card">
          <h2>Mailtexte verwalten</h2>
          <p className="helper">
            Übermittle die frohe Nachricht über verfügbare Bilder an deine Kunden und mache sie darauf aufmerksam, dass sie
            noch Fotos herunterladen können.
          </p>
          <div className="toolbar">
            <button className="btn" onClick={() => setOpenDialog("mailtexts")} type="button">
              Mailtexte verwalten
            </button>
          </div>
        </article>
      </section>

      {openDialog === "packages" ? (
        <SettingsDialog
          onClose={() => setOpenDialog(null)}
          subtitle="Definiere Name, Inhalt und Preis deiner Standard-Pakete."
          title="Pakete verwalten"
        >
          {!packageFeatureReady ? (
            <div className="notice notice-muted">Pakete sind noch nicht aktiv. Bitte zuerst die Datenbank aktualisieren.</div>
          ) : (
            <>
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
                    <label className="label" htmlFor="tpl-price">
                      Paketpreis (CHF)
                    </label>
                    <input
                      className="input mono"
                      id="tpl-price"
                      onChange={(event) => setTemplatePrice(event.target.value)}
                      required
                      value={templatePrice}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="tpl-included">
                      Anzahl Fotos im Paket
                    </label>
                    <input
                      className="input mono"
                      id="tpl-included"
                      onChange={(event) => setTemplateIncludedCount(event.target.value)}
                      required
                      value={templateIncludedCount}
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
                      Preis pro Einzelfoto (CHF)
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
                  {editingTemplateId ? (
                    <button className="btn btn-secondary" disabled={loading} onClick={resetTemplateForm} type="button">
                      Neues Paket
                    </button>
                  ) : null}
                </div>
              </form>

              {packageTemplates.length > 0 ? (
                <div className="settings-list">
                  {packageTemplates.map((entry) => (
                    <article className="benefit-card" key={entry.id}>
                      <div className="kv">
                        <strong>{entry.name}</strong>
                        <span className={`status ${entry.active ? "status-active" : "status-draft"}`}>
                          {entry.active ? "Aktiv" : "Inaktiv"}
                        </span>
                      </div>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Paket-ID: <code>{entry.id}</code>
                      </p>
                      {entry.description ? <p className="small muted">{entry.description}</p> : null}
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        {formatChf(entry.priceCents)} • {entry.includedCount} Fotos
                        {entry.allowExtra && entry.extraUnitPriceCents !== null
                          ? ` • Einzelfoto ${formatChf(entry.extraUnitPriceCents)}`
                          : ""}
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Zuletzt gespeichert: {formatDateTime(entry.updatedAt)}
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
                          }}
                          type="button"
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => void handleDeleteTemplate(entry.id)}
                          type="button"
                        >
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice-muted">Noch keine Pakete vorhanden.</div>
              )}
            </>
          )}
        </SettingsDialog>
      ) : null}

      {openDialog === "customers" ? (
        <SettingsDialog
          onClose={() => setOpenDialog(null)}
          subtitle="Lege neue Kunden an oder finde bestehende Kunden über Name oder E-Mail."
          title="Kunden verwalten"
        >
          {!customerFeatureReady ? (
            <div className="notice notice-muted">Kundenverwaltung ist noch nicht aktiv. Bitte zuerst die Datenbank aktualisieren.</div>
          ) : (
            <>
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
                </div>
              </form>

              <div>
                <label className="label" htmlFor="settings-customer-search">
                  Bestehende Kunden
                </label>
                <input
                  className="input"
                  id="settings-customer-search"
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Name oder E-Mail suchen"
                  value={customerSearch}
                />
              </div>

              {filteredCustomers.length > 0 ? (
                <div className="settings-list">
                  {filteredCustomers.map((entry) => (
                    <article className="benefit-card" key={entry.id}>
                      <div className="kv">
                        <strong>{entry.fullName}</strong>
                        <span className="small muted">{entry.email}</span>
                      </div>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Kundennummer: <code>{entry.customerNumber ?? "-"}</code>
                      </p>
                      {entry.note ? <p className="small muted">{entry.note}</p> : null}
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Projekte: {entry.projectCount} (Entwurf {entry.draftProjectCount}, Live {entry.liveProjectCount})
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Bezahlte Bestellungen: {entry.paidOrderCount}
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Letzter Projekt-Stand: {formatDateTime(entry.lastProjectSavedAt)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice notice-muted">Noch keine passenden Kunden gefunden.</div>
              )}
            </>
          )}
        </SettingsDialog>
      ) : null}

      {openDialog === "mailtexts" ? (
        <SettingsDialog
          onClose={() => setOpenDialog(null)}
          subtitle="Passe Betreff und Nachricht für die automatische Kundenkommunikation an."
          title="Mailtexte verwalten"
        >
          {!mailFeatureReady ? (
            <div className="notice notice-muted">Mailtexte sind noch nicht aktiv. Bitte zuerst die Datenbank aktualisieren.</div>
          ) : mailTemplates.length > 0 ? (
            <form className="grid" onSubmit={handleSaveMailTemplate} style={{ gap: "0.6rem" }}>
              <div>
                <label className="label" htmlFor="mail-template-key">
                  Vorlage
                </label>
                <select
                  className="select"
                  id="mail-template-key"
                  onChange={(event) => setSelectedMailKey(event.target.value as MailTemplate["key"])}
                  value={selectedMailKey}
                >
                  {mailTemplates.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                <p className="small muted" style={{ margin: "0.35rem 0 0" }}>
                  {selectedMailTemplate?.description ?? ""}
                </p>
              </div>

              <div className="grid grid-2">
                <div>
                  <label className="label" htmlFor="mail-template-id">
                    Mailtext-ID
                  </label>
                  <input className="input mono" id="mail-template-id" readOnly value={selectedMailTemplate?.id ?? ""} />
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
                  Platzhalter: {`{{customer_name}}`} {`{{gallery_link}}`} {`{{gallery_password}}`} {`{{download_link}}`} {`{{photographer_name}}`}
                </p>
              </div>

              <label className="asset-item" style={{ width: "fit-content" }}>
                <input checked={mailActive} onChange={(event) => setMailActive(event.target.checked)} type="checkbox" />
                Vorlage aktiv
              </label>

              <div className="toolbar">
                <button className="btn" disabled={loading} type="submit">
                  Mailtext speichern
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={loading || !selectedMailTemplate}
                  onClick={() => {
                    if (!selectedMailTemplate) return;
                    setMailName(selectedMailTemplate.name);
                    setMailSubject(selectedMailTemplate.subject);
                    setMailBody(selectedMailTemplate.body);
                    setMailActive(selectedMailTemplate.active);
                  }}
                  type="button"
                >
                  Änderungen verwerfen
                </button>
              </div>
            </form>
          ) : (
            <div className="notice notice-muted">Noch keine Mailtexte vorhanden.</div>
          )}
        </SettingsDialog>
      ) : null}

      {loading ? <div className="notice notice-muted">Lädt oder speichert gerade ...</div> : null}
    </main>
  );
}
