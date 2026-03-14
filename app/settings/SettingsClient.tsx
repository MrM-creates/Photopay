"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  linkedProjects: Array<{
    id: string;
    title: string;
    status: "draft" | "published" | "archived";
    updatedAt: string;
  }>;
};

type PhotographerProfile = {
  firstName: string;
  lastName: string;
  email: string;
  postalAddress: string;
  mailSalutationMode: "first_name" | "full_name";
  displayName: string;
};

type EmailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  replyTo: string;
  hasPassword: boolean;
  source: "database" | "env" | "none";
};

type SenderEmail = {
  id: string;
  email: string;
  verified: boolean;
  verifiedAt: string | null;
  lastTestedAt: string | null;
  createdAt: string;
};

type SettingsSection = "home" | "packages" | "customers" | "mailtexts" | "photographer" | "email";

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

function toLinkedProjectBadge(status: "draft" | "published" | "archived") {
  if (status === "published") return { label: "Abgeschlossen", className: "status-published" };
  if (status === "archived") return { label: "Archiv", className: "status-draft" };
  return { label: "Läuft", className: "status-active" };
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
  const [customerFormMode, setCustomerFormMode] = useState<"create" | "edit">("create");
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");
  const [profileFeatureReady, setProfileFeatureReady] = useState(true);
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePostalAddress, setProfilePostalAddress] = useState("");
  const [profileMailSalutationMode, setProfileMailSalutationMode] = useState<"first_name" | "full_name">("first_name");
  const [emailFeatureReady, setEmailFeatureReady] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpReplyTo, setSmtpReplyTo] = useState("");
  const [senderEmails, setSenderEmails] = useState<SenderEmail[]>([]);
  const [senderEmailsFeatureReady, setSenderEmailsFeatureReady] = useState(true);
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [senderSetActive, setSenderSetActive] = useState(false);
  const [isSenderFormOpen, setIsSenderFormOpen] = useState(false);
  const [senderFormMode, setSenderFormMode] = useState<"create" | "edit">("create");
  const [editingSenderEmailId, setEditingSenderEmailId] = useState<string | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

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

  const photographerDisplayName = useMemo(() => {
    const fullName = [profileFirstName.trim(), profileLastName.trim()].filter(Boolean).join(" ").trim();
    return fullName || "Noch nicht eingerichtet";
  }, [profileFirstName, profileLastName]);

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

  const loadPhotographerProfile = useCallback(async () => {
    const response = await withHeaders("/api/settings/photographer-profile", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Fotografen-Daten konnten nicht geladen werden.");
    }
    setProfileFeatureReady(json.featureReady !== false);
    const profile = (json.profile ?? {}) as PhotographerProfile;
    setProfileFirstName(profile.firstName ?? "");
    setProfileLastName(profile.lastName ?? "");
    setProfileEmail(profile.email ?? "");
    setProfilePostalAddress(profile.postalAddress ?? "");
    setProfileMailSalutationMode(profile.mailSalutationMode === "full_name" ? "full_name" : "first_name");
  }, [withHeaders]);

  const loadEmailSettings = useCallback(async () => {
    const response = await withHeaders("/api/settings/email-settings", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "E-Mail-Einstellungen konnten nicht geladen werden.");
    }
    setEmailFeatureReady(json.featureReady !== false);
    const settings = (json.settings ?? {}) as EmailSettings;
    setSmtpHost(settings.host ?? "");
    setSmtpPort(String(settings.port ?? 465));
    setSmtpSecure(Boolean(settings.secure ?? true));
    setSmtpUser(settings.user ?? "");
    setSmtpFrom(settings.from ?? "");
    setSmtpReplyTo(settings.replyTo ?? "");
    setSmtpPassword("");
  }, [withHeaders]);

  const loadSenderEmails = useCallback(async () => {
    const response = await withHeaders("/api/settings/sender-emails", { method: "GET" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Absender-Adressen konnten nicht geladen werden.");
    }
    setSenderEmailsFeatureReady(json.featureReady !== false);
    setSenderEmails((json.senderEmails ?? []) as SenderEmail[]);
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

    void Promise.all([
      loadPackageTemplates(),
      loadMailTemplates(),
      loadCustomers(),
      loadPhotographerProfile(),
      loadEmailSettings(),
      loadSenderEmails(),
    ])
      .catch((error: unknown) => {
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Admin-Bereich konnte nicht geladen werden.",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    photographerId,
    loadCustomers,
    loadEmailSettings,
    loadMailTemplates,
    loadPackageTemplates,
    loadPhotographerProfile,
    loadSenderEmails,
  ]);

  useEffect(() => {
    if (!notice || notice.type !== "success") return;
    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.type === "success" ? null : current));
    }, 3500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  useEffect(() => {
    setOverlayReady(true);
  }, []);

  useEffect(() => {
    applyMailTemplate(selectedMailTemplate);
  }, [applyMailTemplate, selectedMailTemplate]);

  useEffect(() => {
    if (mailTemplates.length === 0) return;
    const exists = mailTemplates.some((entry) => entry.key === selectedMailKey);
    if (exists) return;
    setSelectedMailKey(mailTemplates[0].key);
  }, [mailTemplates, selectedMailKey]);

  useEffect(() => {
    if (smtpFrom.trim()) return;
    if (senderEmails.length === 0) return;
    setSmtpFrom(senderEmails[0].email);
  }, [senderEmails, smtpFrom]);

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

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders(editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers", {
        method: editingCustomerId ? "PATCH" : "POST",
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
      setEditingCustomerId(null);
      setCustomerFormMode("create");
      setIsCustomerFormOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : editingCustomerId ? "Kunde konnte nicht angepasst werden." : "Kunde konnte nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCustomer(customerId: string, customerName: string) {
    const confirmed = window.confirm(`Kunde ${customerName} wirklich löschen?`);
    if (!confirmed) return;

    setLoading(true);
    setNotice(null);
    try {
      const response = await withHeaders(`/api/customers/${customerId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Kunde konnte nicht gelöscht werden.");
      }
      await loadCustomers();
      if (editingCustomerId === customerId) {
        setIsCustomerFormOpen(false);
        resetCustomerForm();
        setEditingCustomerId(null);
        setCustomerFormMode("create");
      }
      setNotice(null);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Kunde konnte nicht gelöscht werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePhotographerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await withHeaders("/api/settings/photographer-profile", {
        method: "PUT",
        body: JSON.stringify({
          firstName: profileFirstName.trim(),
          lastName: profileLastName.trim() || undefined,
          email: profileEmail.trim() || undefined,
          postalAddress: profilePostalAddress.trim() || undefined,
          mailSalutationMode: profileMailSalutationMode,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Fotografen-Daten konnten nicht gespeichert werden.");
      }
      await loadPhotographerProfile();
      setNotice({ type: "success", text: "Fotografen-Daten gespeichert." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Fotografen-Daten konnten nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function createSenderEmail() {
    const email = newSenderEmail.trim();
    if (!email) return;
    if (!smtpHost.trim() || !smtpPort.trim() || !smtpUser.trim() || !smtpPassword.trim()) {
      setNotice({ type: "error", text: "Bitte SMTP Host, Port, Benutzername und Passwort erfassen." });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const fromValue = senderSetActive ? email : smtpFrom.trim() || email;
      const settingsResponse = await withHeaders("/api/settings/email-settings", {
        method: "PUT",
        body: JSON.stringify({
          host: smtpHost.trim(),
          port: Number(smtpPort),
          secure: smtpSecure,
          user: smtpUser.trim(),
          password: smtpPassword.trim(),
          from: fromValue,
          replyTo: smtpReplyTo.trim() || undefined,
        }),
      });
      const settingsJson = await settingsResponse.json();
      if (!settingsResponse.ok) {
        throw new Error(settingsJson?.error?.message ?? "SMTP-Daten konnten nicht gespeichert werden.");
      }

      const response = await withHeaders("/api/settings/sender-emails", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Mailadresse konnte nicht gespeichert werden.");
      }

      setSmtpFrom(fromValue);
      setSmtpPassword("");
      await loadEmailSettings();
      await loadSenderEmails();
      setNewSenderEmail("");
      setSenderSetActive(false);
      setEditingSenderEmailId(null);
      setIsSenderFormOpen(false);
      setNotice({ type: "success", text: "Mailadresse gespeichert und geprüft." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Mailadresse konnte nicht gespeichert werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateSenderEmail() {
    if (!editingSenderEmailId) return;
    const email = newSenderEmail.trim();
    if (!email) return;
    if (!smtpHost.trim() || !smtpPort.trim() || !smtpUser.trim() || !smtpPassword.trim()) {
      setNotice({ type: "error", text: "Bitte SMTP Host, Port, Benutzername und Passwort erfassen." });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const fromValue = senderSetActive ? email : smtpFrom.trim() || email;
      const settingsResponse = await withHeaders("/api/settings/email-settings", {
        method: "PUT",
        body: JSON.stringify({
          host: smtpHost.trim(),
          port: Number(smtpPort),
          secure: smtpSecure,
          user: smtpUser.trim(),
          password: smtpPassword.trim(),
          from: fromValue,
          replyTo: smtpReplyTo.trim() || undefined,
        }),
      });
      const settingsJson = await settingsResponse.json();
      if (!settingsResponse.ok) {
        throw new Error(settingsJson?.error?.message ?? "SMTP-Daten konnten nicht gespeichert werden.");
      }

      const response = await withHeaders(`/api/settings/sender-emails/${editingSenderEmailId}`, {
        method: "PATCH",
        body: JSON.stringify({ email }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Mailadresse konnte nicht angepasst werden.");
      }

      setSmtpFrom(fromValue);
      setSmtpPassword("");
      await loadEmailSettings();
      await loadSenderEmails();
      setNewSenderEmail("");
      setSenderSetActive(false);
      setEditingSenderEmailId(null);
      setIsSenderFormOpen(false);
      setNotice({ type: "success", text: "Mailadresse angepasst und geprüft." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Mailadresse konnte nicht angepasst werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSenderEmail(senderEmailId: string, senderEmail: string, isActive: boolean) {
    if (isActive) {
      setNotice({ type: "error", text: "Aktive Mailadresse kann nicht gelöscht werden. Bitte zuerst eine andere aktiv setzen." });
      return;
    }

    const confirmed = window.confirm(`Mailadresse ${senderEmail} wirklich löschen?`);
    if (!confirmed) return;

    setLoading(true);
    setNotice(null);
    try {
      const response = await withHeaders(`/api/settings/sender-emails/${senderEmailId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Mailadresse konnte nicht gelöscht werden.");
      }
      await loadSenderEmails();
      setNotice({ type: "success", text: "Mailadresse gelöscht." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Mailadresse konnte nicht gelöscht werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSenderEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (senderFormMode === "edit") {
      await updateSenderEmail();
      return;
    }
    await createSenderEmail();
  }

  return (
    <main className="landing-shell">
      <header className="card settings-topbar">
        <div className="settings-brand-block">
          <Link className="studio-brand-link" href="/">
            PhotoPay
          </Link>
          <p className="studio-top-photographer">
            Fotograf: <strong>{photographerDisplayName}</strong>
          </p>
        </div>
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

            <article className="card settings-entry-card">
              <h2 className="settings-title-row">
                <UiIcon name="profile" />
                Fotograf-Daten
              </h2>
              <p className="helper">
                Pflege deine Angaben für Mails und Kommunikation: Name, E-Mail, Adresse und Ansprache.
              </p>
              <div className="toolbar">
                <Link className="btn settings-entry-action" href="/settings/photographer">
                  Fotograf-Daten
                </Link>
              </div>
            </article>

            <article className="card settings-entry-card">
              <h2 className="settings-title-row">
                <UiIcon name="emailsetup" />
                E-Mail einrichten
              </h2>
              <p className="helper">Mailversand einrichten, Absender wählen und Testmail senden.</p>
              <div className="toolbar">
                <Link className="btn settings-entry-action" href="/settings/email">
                  E-Mail einrichten
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
                      <div className="toolbar settings-card-actions">
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
                        Bezahlte Bestellungen: {entry.paidOrderCount}
                      </p>
                      {entry.linkedProjects.length > 0 ? (
                        <>
                          <p className="small muted" style={{ marginBottom: 0 }}>
                            Verknüpfte Projekte
                          </p>
                          <div className="toolbar settings-card-actions settings-linked-projects">
                            {entry.linkedProjects.map((project) => (
                              <Link className="btn btn-secondary" href={`/studio?step=summary&mode=open&project=${project.id}`} key={project.id}>
                                <span>{project.title}</span>
                                <span className={`status ${toLinkedProjectBadge(project.status).className}`}>
                                  {toLinkedProjectBadge(project.status).label}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </>
                      ) : null}
                      <div className="toolbar settings-card-actions">
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => {
                            setCustomerFormMode("edit");
                            setEditingCustomerId(entry.id);
                            setNewCustomerFirstName(entry.firstName ?? entry.fullName);
                            setNewCustomerLastName(entry.lastName ?? "");
                            setNewCustomerEmail(entry.email);
                            setNewCustomerNote(entry.note ?? "");
                            setIsCustomerFormOpen(true);
                          }}
                          type="button"
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={loading}
                          onClick={() => void handleDeleteCustomer(entry.id, entry.fullName)}
                          type="button"
                        >
                          Löschen
                        </button>
                      </div>
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
                    setCustomerFormMode("create");
                    setEditingCustomerId(null);
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
                      setCustomerFormMode("create");
                      setEditingCustomerId(null);
                      resetCustomerForm();
                    }
                  }}
                  role="dialog"
                >
                  <section className="card settings-overlay-card">
                    <div className="settings-dialog-header">
                      <div>
                        <h3 className="settings-dialog-title" style={{ marginBottom: "0.15rem" }}>
                          {customerFormMode === "edit" ? "Kunde bearbeiten" : "Neuen Kunden erfassen"}
                        </h3>
                        <p className="helper" style={{ marginBottom: 0 }}>
                          {customerFormMode === "edit"
                            ? "Passe die Kundendaten in wenigen Schritten an."
                            : "Erfasse die Kundendaten in wenigen Schritten."}
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsCustomerFormOpen(false);
                          setCustomerFormMode("create");
                          setEditingCustomerId(null);
                          resetCustomerForm();
                        }}
                        type="button"
                      >
                        Schliessen
                      </button>
                    </div>

                    <form className="grid" onSubmit={handleSaveCustomer} style={{ gap: "0.6rem" }}>
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
                            setCustomerFormMode("create");
                            setEditingCustomerId(null);
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

      {section === "photographer" ? (
        <section className="card grid" style={{ gap: "0.8rem" }}>
          <div className="settings-dialog-header settings-dialog-header-page">
            <div>
              <h2 className="settings-dialog-title settings-title-row">
                <UiIcon name="profile" />
                Fotograf-Daten
              </h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                Diese Angaben werden in Mailtexten und in der Kundenkommunikation verwendet.
              </p>
            </div>
          </div>

          {!profileFeatureReady ? (
            <div className="notice notice-muted">
              Fotografen-Daten sind noch nicht aktiviert. Bitte Migration <code>20260314_0008_photographer_profile_and_email_settings.sql</code>{" "}
              ausführen.
            </div>
          ) : (
            <form className="grid" onSubmit={handleSavePhotographerProfile} style={{ gap: "0.6rem" }}>
              <div className="grid grid-2">
                <div>
                  <label className="label" htmlFor="profile-first-name">
                    Vorname
                  </label>
                  <input
                    className="input"
                    id="profile-first-name"
                    onChange={(event) => setProfileFirstName(event.target.value)}
                    value={profileFirstName}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="profile-last-name">
                    Nachname
                  </label>
                  <input
                    className="input"
                    id="profile-last-name"
                    onChange={(event) => setProfileLastName(event.target.value)}
                    value={profileLastName}
                  />
                </div>
              </div>

              <div className="grid grid-2">
                <div>
                  <label className="label" htmlFor="profile-email">
                    E-Mail
                  </label>
                  <input
                    className="input"
                    id="profile-email"
                    onChange={(event) => setProfileEmail(event.target.value)}
                    type="email"
                    value={profileEmail}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="profile-salutation">
                    Ansprache in Mails
                  </label>
                  <select
                    className="select"
                    id="profile-salutation"
                    onChange={(event) => setProfileMailSalutationMode(event.target.value as "first_name" | "full_name")}
                    value={profileMailSalutationMode}
                  >
                    <option value="first_name">Nur Vorname</option>
                    <option value="full_name">Vor- und Nachname</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="profile-address">
                  Adresse
                </label>
                <textarea
                  className="textarea"
                  id="profile-address"
                  onChange={(event) => setProfilePostalAddress(event.target.value)}
                  placeholder={"z. B. Musterstrasse 5\n8000 Zürich"}
                  value={profilePostalAddress}
                />
              </div>

              <div className="toolbar">
                <button className="btn" disabled={loading} type="submit">
                  Fotograf-Daten speichern
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {section === "email" ? (
        <section className="card grid" style={{ gap: "0.8rem" }}>
          <div className="settings-dialog-header settings-dialog-header-page">
            <div>
              <h2 className="settings-dialog-title settings-title-row">
                <UiIcon name="emailsetup" />
                E-Mail einrichten
              </h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                Du findest die Angaben zu deinem Mailaccount bei deinem Mail-Provider.
              </p>
            </div>
          </div>

          {!emailFeatureReady ? (
            <div className="notice notice-muted">
              E-Mail-Einstellungen sind noch nicht aktiviert. Bitte Migration <code>20260314_0008_photographer_profile_and_email_settings.sql</code>{" "}
              ausführen.
            </div>
          ) : !senderEmailsFeatureReady ? (
            <div className="notice notice-muted">
              Absender-Adressen sind noch nicht aktiviert. Bitte Migration <code>20260314_0009_sender_emails.sql</code> ausführen.
            </div>
          ) : (
            <>
              <section className="settings-list">
                <h3 style={{ marginBottom: 0 }}>Vorhandene Mailadressen</h3>
                {senderEmails.length > 0 ? (
                  senderEmails.map((entry) => {
                    const isActive = smtpFrom.trim().toLowerCase() === entry.email.trim().toLowerCase();
                    return (
                      <article className="benefit-card settings-mail-card" key={entry.id}>
                        <div className="kv">
                          <strong>{entry.email}</strong>
                          <span className="small muted">{isActive ? "Aktiv" : "Inaktiv"}</span>
                        </div>
                        <p className="small muted settings-mail-status">Status: Geprüft</p>
                        <div className="toolbar settings-card-actions">
                          <button
                            className="btn btn-secondary"
                            disabled={loading}
                            onClick={() => {
                              setSenderFormMode("edit");
                              setEditingSenderEmailId(entry.id);
                              setNewSenderEmail(entry.email);
                              setSenderSetActive(isActive);
                              setIsSenderFormOpen(true);
                            }}
                            type="button"
                          >
                            Bearbeiten
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={loading}
                            onClick={() => void handleDeleteSenderEmail(entry.id, entry.email, isActive)}
                            type="button"
                          >
                            Löschen
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="notice notice-muted">Noch keine Mailadresse erfasst.</div>
                )}
              </section>

              <div className="toolbar">
                <button
                  className="btn"
                  onClick={() => {
                    setSenderFormMode("create");
                    setEditingSenderEmailId(null);
                    setIsSenderFormOpen(true);
                    setNewSenderEmail(profileEmail.trim() || "");
                    setSenderSetActive(false);
                  }}
                  type="button"
                >
                  Neue Mailadresse erfassen
                </button>
              </div>

              {isSenderFormOpen && overlayReady
                ? createPortal(
                    <div
                      aria-modal="true"
                      className="settings-overlay-backdrop"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setIsSenderFormOpen(false);
                        }
                      }}
                      role="dialog"
                    >
                      <section className="card settings-overlay-card">
                        <div className="settings-dialog-header">
                          <div>
                            <h3 className="settings-dialog-title" style={{ marginBottom: "0.15rem" }}>
                              {senderFormMode === "create" ? "Neue Mailadresse erfassen" : "Mailadresse anpassen"}
                            </h3>
                            <p className="helper" style={{ marginBottom: 0 }}>
                              Die Mailadresse wird beim Speichern automatisch geprüft.
                            </p>
                          </div>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setIsSenderFormOpen(false);
                              setEditingSenderEmailId(null);
                            }}
                            type="button"
                          >
                            Schliessen
                          </button>
                        </div>

                    <form className="grid" onSubmit={handleCreateSenderEmail} style={{ gap: "0.6rem" }}>
                      <div>
                        <label className="label" htmlFor="sender-email-new">
                          Mailadresse
                        </label>
                            <input
                              autoFocus
                              className="input"
                              id="sender-email-new"
                              onChange={(event) => setNewSenderEmail(event.target.value)}
                              placeholder="z. B. info@mrmimagines.ch"
                              required
                              type="email"
                          value={newSenderEmail}
                        />
                      </div>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="sender-smtp-host">
                            SMTP Host
                          </label>
                          <input
                            className="input"
                            id="sender-smtp-host"
                            onChange={(event) => setSmtpHost(event.target.value)}
                            placeholder="asmtp.mail.hostpoint.ch"
                            required
                            value={smtpHost}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="sender-smtp-port">
                            Port
                          </label>
                          <input
                            className="input mono"
                            id="sender-smtp-port"
                            onChange={(event) => setSmtpPort(event.target.value)}
                            required
                            type="number"
                            value={smtpPort}
                          />
                        </div>
                      </div>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="sender-smtp-user">
                            Benutzername
                          </label>
                          <input
                            className="input"
                            id="sender-smtp-user"
                            onChange={(event) => setSmtpUser(event.target.value)}
                            required
                            value={smtpUser}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="sender-smtp-password">
                            Passwort
                          </label>
                          <input
                            className="input"
                            id="sender-smtp-password"
                            onChange={(event) => setSmtpPassword(event.target.value)}
                            required
                            type="password"
                            value={smtpPassword}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="sender-smtp-reply-to">
                          Reply-To (optional)
                        </label>
                        <input
                          className="input"
                          id="sender-smtp-reply-to"
                          onChange={(event) => setSmtpReplyTo(event.target.value)}
                          value={smtpReplyTo}
                        />
                      </div>
                      <label className="asset-item" style={{ width: "fit-content" }}>
                        <input checked={smtpSecure} onChange={(event) => setSmtpSecure(event.target.checked)} type="checkbox" />
                        TLS/SSL verwenden
                      </label>
                      <label className="asset-item" style={{ width: "fit-content" }}>
                        <input
                          checked={senderSetActive}
                              onChange={(event) => setSenderSetActive(event.target.checked)}
                              type="checkbox"
                            />
                            Als aktive Mailadresse setzen
                          </label>
                          <div className="toolbar">
                            <button className="btn" disabled={loading || !newSenderEmail.trim()} type="submit">
                              Mailadresse speichern
                            </button>
                          </div>
                        </form>
                      </section>
                    </div>,
                    document.body,
                  )
                : null}
            </>
          )}
        </section>
      ) : null}

      {loading ? <div className="notice notice-muted">Lädt oder speichert gerade ...</div> : null}
    </main>
  );
}
