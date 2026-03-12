"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

type Gallery = {
  id: string;
  title: string;
  description: string | null;
  publicSlug: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  coverAssetId?: string | null;
  archiveAfterDays?: number | null;
  neverAutoArchive?: boolean;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerNote?: string | null;
  customerStatus?: "new" | "active" | "downloads" | "completed";
  lastAccessAt?: string | null;
  paidOrderCount?: number;
  purchasedAssetCount?: number;
  downloadedAssetCount?: number;
  createdAt: string;
  packageCount: number;
  assetCount: number;
};

type Customer = {
  id: string;
  fullName: string;
  email: string;
  note: string | null;
  lastUsedAt: string | null;
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
  action?: "reload_project" | "reload_page" | "retry_failed_uploads";
};

type UploadedAssetFile = {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  storageKeyOriginal: string;
  storageKeyPreview: string;
  watermarkApplied: boolean;
};

type ManagedAsset = {
  id: string;
  filename: string;
  previewKey: string;
  previewUrl: string | null;
  watermark: boolean;
  sortOrder: number;
};

type WizardStepId = "create" | "assets" | "packages" | "share" | "summary";
type EntryMode = "new" | "open";
type GalleryDesign = "clean" | "editorial" | "bold";

const photographerStorageKey = "photopay_photographer_id";

const wizardSteps: Array<{ id: WizardStepId; title: string; short: string }> = [
  { id: "create", title: "Schritt 1: Projekt anlegen", short: "Projekt" },
  { id: "assets", title: "Schritt 2: Bilder hinzufügen", short: "Bilder" },
  { id: "packages", title: "Schritt 3: Pakete festlegen", short: "Pakete" },
  { id: "share", title: "Schritt 4: Galerie & Freigabe", short: "Galerie & Freigabe" },
  { id: "summary", title: "Übersicht", short: "Übersicht" },
];

function formatChf(cents: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

function formatDateTime(input: string | null | undefined) {
  if (!input) return "Noch kein Zugriff";
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return "Noch kein Zugriff";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function toCustomerStatusLabel(status: Gallery["customerStatus"]) {
  if (status === "completed") return "Abgeschlossen";
  if (status === "downloads") return "Downloads laufen";
  if (status === "active") return "Geöffnet";
  return "Noch kein Zugriff";
}

function toCustomerStatusClass(status: Gallery["customerStatus"]) {
  if (status === "completed") return "status-published";
  if (status === "downloads") return "status-open";
  if (status === "active") return "status-active";
  return "status-draft";
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

  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex(3)}-${randomHex(12)}`;
}

function fileFingerprint(file: File) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toFriendlyError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (raw.includes("DUPLICATE_PROJECT_NAME")) {
    return "Dieser Projektname existiert bereits. Bitte wähle einen anderen Namen.";
  }
  if (raw.includes("PROJECT_DELETE_BLOCKED")) {
    return "Dieses Projekt kann nicht gelöscht werden, weil bereits Bestellungen oder Downloads dazu existieren.";
  }

  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Ich konnte den Server gerade nicht erreichen. Bitte versuche es in ein paar Sekunden erneut.";
  }

  if (raw.includes("VALIDATION_ERROR")) {
    return "Bitte prüfe deine Eingaben. Ein Feld ist noch unvollständig.";
  }

  if (raw.includes("FEATURE_NOT_READY")) {
    return "Kundenverwaltung ist in der Datenbank noch nicht aktiviert. Bitte kurz Migration ausführen oder vorerst „Kunden später zuordnen“ wählen.";
  }

  if (raw.includes("DB_ERROR")) {
    if (lower.includes("invalid input syntax for type uuid")) {
      return "Die App-Identität war ungültig und wurde korrigiert. Bitte versuche es jetzt erneut.";
    }
    if (lower.includes("galleries_public_slug_key")) {
      return "Der öffentliche Link war bereits vergeben. Bitte versuche es erneut.";
    }
    if (lower.includes("uq_galleries_photographer_title_normalized")) {
      return "Dieser Projektname existiert bereits. Bitte wähle einen anderen Namen.";
    }
    if (lower.includes("violates unique constraint")) {
      return "Ein Wert ist bereits vergeben. Bitte ändere den Projektnamen und versuche es erneut.";
    }

    const detail = raw.replace(/^DB_ERROR:\s*/i, "").trim();
    if (detail) {
      return `Speichern fehlgeschlagen: ${detail}`;
    }
    return "Es ist ein technischer Fehler aufgetreten. Bitte versuche es erneut.";
  }

  if (raw.includes("CONTEXT_MISMATCH")) {
    return "Das aktive Projekt stimmt nicht mehr mit dem Speichervorgang überein. Bitte Projekt kurz neu öffnen und erneut speichern.";
  }

  if (raw.includes("GALLERY_NOT_FOUND")) {
    return "Dieses Projekt wurde nicht gefunden. Bitte wähle ein Projekt aus der Liste.";
  }

  return fallback;
}

function getErrorKind(error: unknown): "context" | "network" | "other" {
  const raw = error instanceof Error ? error.message : "";
  const lower = raw.toLowerCase();

  if (raw.includes("CONTEXT_MISMATCH")) return "context";
  if (lower.includes("failed to fetch") || lower.includes("network")) return "network";
  return "other";
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

async function readImageDimensions(file: File) {
  if (!file.type.startsWith("image/")) {
    return { width: 2400, height: 1600 };
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth || 2400,
          height: image.naturalHeight || 1600,
        });
      };
      image.onerror = () => reject(new Error("Could not read image dimensions"));
      image.src = previewUrl;
    });

    return dimensions;
  } catch {
    return { width: 2400, height: 1600 };
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

export default function StudioPage() {
  const [photographerId, setPhotographerId] = useState("");
  const [activeStep, setActiveStep] = useState<WizardStepId>("create");
  const [entryMode, setEntryMode] = useState<EntryMode>("new");
  const [requestedProjectId, setRequestedProjectId] = useState<string | null>(null);

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projectAssets, setProjectAssets] = useState<ManagedAsset[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [galleryDesign, setGalleryDesign] = useState<GalleryDesign>("clean");
  const [dragAssetId, setDragAssetId] = useState<string | null>(null);

  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const [galleryPassword, setGalleryPassword] = useState("");
  const [createCustomerMode, setCreateCustomerMode] = useState<"none" | "existing" | "new">("none");
  const [createCustomerSearch, setCreateCustomerSearch] = useState("");
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerEmail, setCreateCustomerEmail] = useState("");
  const [createCustomerNote, setCreateCustomerNote] = useState("");
  const [shareCustomerMode, setShareCustomerMode] = useState<"existing" | "new">("new");
  const [shareCustomerSearch, setShareCustomerSearch] = useState("");
  const [shareCustomerId, setShareCustomerId] = useState("");
  const [shareCustomerName, setShareCustomerName] = useState("");
  const [shareCustomerEmail, setShareCustomerEmail] = useState("");
  const [shareCustomerNote, setShareCustomerNote] = useState("");
  const [archiveAfterDays, setArchiveAfterDays] = useState("90");
  const [neverAutoArchive, setNeverAutoArchive] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [failedUploadKeys, setFailedUploadKeys] = useState<string[]>([]);
  const [dragSelectedFileKey, setDragSelectedFileKey] = useState<string | null>(null);
  const [isDragOverAssets, setIsDragOverAssets] = useState(false);

  const [packageName, setPackageName] = useState("10er Paket Digital");
  const [packagePrice, setPackagePrice] = useState("120");
  const [includedCount, setIncludedCount] = useState("10");
  const [allowExtra, setAllowExtra] = useState(true);
  const [extraPrice, setExtraPrice] = useState("15");
  const [openProjectsSearch, setOpenProjectsSearch] = useState("");
  const [openProjectsSort, setOpenProjectsSort] = useState<"newest" | "oldest" | "name_asc" | "name_desc">("newest");

  const [loading, setLoading] = useState(false);
  const [galleriesReady, setGalleriesReady] = useState(false);
  const [galleriesLoadFailed, setGalleriesLoadFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "partial" | "error">("idle");
  const [notice, setNotice] = useState<StudioNotice | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFolderInputRef = useRef<HTMLInputElement | null>(null);
  const projectWriteQueueRef = useRef<Map<string, Promise<void>>>(new Map());

  const selectedGallery = useMemo(
    () => galleries.find((gallery) => gallery.id === selectedGalleryId) ?? null,
    [galleries, selectedGalleryId],
  );

  const currentProjectLabel = selectedGallery?.title ?? (galleries.length > 0 ? "Projekt auswählen" : "Kein Projekt geöffnet");
  const failedUploadKeySet = useMemo(() => new Set(failedUploadKeys), [failedUploadKeys]);

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

  const saveStatusText = useMemo(() => {
    if (saveStatus === "saving") return "Speichert gerade...";
    if (saveStatus === "saved") return "Alle Änderungen sind gespeichert.";
    if (saveStatus === "partial") return "Teilweise gespeichert. Bitte fehlgeschlagene Bilder erneut hochladen.";
    if (saveStatus === "error") return "Speichern fehlgeschlagen. Bitte versuche es erneut.";
    return "";
  }, [saveStatus]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [saveStatus]);

  const canGoNext = useMemo(() => {
    if (activeStep === "create") return progress.hasGallery;
    if (activeStep === "assets") return progress.hasAssets || selectedFiles.length > 0;
    if (activeStep === "packages") return progress.hasPackages;
    if (activeStep === "share") return progress.isPublished;
    return false;
  }, [activeStep, progress.hasAssets, progress.hasGallery, progress.hasPackages, progress.isPublished, selectedFiles.length]);

  const archiveDaysNumber = Number(archiveAfterDays);
  const archiveDaysIsValid =
    Number.isInteger(archiveDaysNumber) && archiveDaysNumber >= 7 && archiveDaysNumber <= 3650;

  const customerSelectionIsSaved = useMemo(() => {
    if (!selectedGallery) return true;

    if (shareCustomerMode === "existing") {
      if (!shareCustomerId) return false;
      return selectedGallery.customerId === shareCustomerId;
    }

    const hasDraftCustomerValues =
      Boolean(shareCustomerName.trim()) || Boolean(shareCustomerEmail.trim()) || Boolean(shareCustomerNote.trim());
    if (!hasDraftCustomerValues) {
      return !selectedGallery.customerId;
    }

    return (
      (selectedGallery.customerName ?? "").trim() === shareCustomerName.trim() &&
      (selectedGallery.customerEmail ?? "").trim().toLowerCase() === shareCustomerEmail.trim().toLowerCase() &&
      (selectedGallery.customerNote ?? "").trim() === shareCustomerNote.trim()
    );
  }, [
    selectedGallery,
    shareCustomerEmail,
    shareCustomerId,
    shareCustomerMode,
    shareCustomerName,
    shareCustomerNote,
  ]);

  const openStepGalleries = useMemo(() => {
    const query = openProjectsSearch.trim().toLowerCase();

    const filtered = query
      ? galleries.filter((gallery) => {
          const haystack = `${gallery.title} ${gallery.customerName ?? ""} ${gallery.customerEmail ?? ""}`.toLowerCase();
          return haystack.includes(query);
        })
      : galleries;

    return [...filtered].sort((a, b) => {
      if (openProjectsSort === "name_asc") return a.title.localeCompare(b.title, "de-CH");
      if (openProjectsSort === "name_desc") return b.title.localeCompare(a.title, "de-CH");

      const aTs = new Date(a.createdAt).getTime();
      const bTs = new Date(b.createdAt).getTime();
      if (openProjectsSort === "oldest") return aTs - bTs;
      return bTs - aTs;
    });
  }, [galleries, openProjectsSearch, openProjectsSort]);

  const createStepCustomers = useMemo(() => {
    const query = createCustomerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const haystack = `${customer.fullName} ${customer.email}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [createCustomerSearch, customers]);

  const shareStepCustomers = useMemo(() => {
    const query = shareCustomerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const haystack = `${customer.fullName} ${customer.email}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [customers, shareCustomerSearch]);

  const showGlobalNavigation = !(activeStep === "create" && entryMode === "new");

  const setErrorNotice = useCallback((error: unknown, fallback: string) => {
    const kind = getErrorKind(error);
    const text = toFriendlyError(error, fallback);

    if (kind === "context") {
      setNotice({ type: "error", text, action: "reload_project" });
      return;
    }

    if (kind === "network") {
      setNotice({ type: "error", text, action: "reload_page" });
      return;
    }

    setNotice({ type: "error", text });
  }, []);

  function isStepAccessible(step: WizardStepId) {
    if (step === "create") return true;
    if (step === "assets") return progress.hasGallery;
    if (step === "packages") return progress.hasAssets;
    if (step === "share") return progress.hasPackages;
    return progress.isPublished;
  }

  function getStepState(step: WizardStepId): "open" | "active" | "done" {
    if (activeStep === step) return "active";
    if (step === "create" && progress.hasGallery) return "done";
    if (step === "assets" && progress.hasAssets) return "done";
    if (step === "packages" && progress.hasPackages) return "done";
    if (step === "share" && progress.isPublished) return "done";
    if (step === "summary" && progress.isPublished) return "done";
    return "open";
  }

  function appendFiles(filesToAppend: File[]) {
    setSelectedFiles((previous) => {
      const existing = new Set(previous.map((file) => fileFingerprint(file)));
      const next = [...previous];

      for (const file of filesToAppend) {
        const key = fileFingerprint(file);
        if (existing.has(key)) continue;
        existing.add(key);
        next.push(file);
      }

      return next;
    });
  }

  function reorderSelectedFilesByDrag(targetFileKey: string) {
    if (!dragSelectedFileKey || dragSelectedFileKey === targetFileKey) return;

    setSelectedFiles((previous) => {
      const fromIndex = previous.findIndex((file) => fileFingerprint(file) === dragSelectedFileKey);
      const toIndex = previous.findIndex((file) => fileFingerprint(file) === targetFileKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return previous;

      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    setDragSelectedFileKey(null);
  }

  function handleAssetFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    appendFiles(files);
    event.target.value = "";
  }

  function handleAssetsDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOverAssets(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    appendFiles(files);
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((previous) => {
      const removed = previous[index];
      if (removed) {
        const removedKey = fileFingerprint(removed);
        setFailedUploadKeys((existing) => existing.filter((key) => key !== removedKey));
      }
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function formatFileSize(sizeInBytes: number) {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${Math.round(sizeInBytes / 1024)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const selectedFilePreviews = useMemo(
    () =>
      selectedFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        key: fileFingerprint(file),
      })),
    [selectedFiles],
  );

  useEffect(() => {
    return () => {
      for (const preview of selectedFilePreviews) {
        URL.revokeObjectURL(preview.previewUrl);
      }
    };
  }, [selectedFilePreviews]);

  useEffect(() => {
    const stored = window.localStorage.getItem(photographerStorageKey);
    if (stored && isUuidLike(stored)) {
      setPhotographerId(stored);
    } else {
      const generated = createClientUuid();
      window.localStorage.setItem(photographerStorageKey, generated);
      setPhotographerId(generated);
    }

    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    const projectParam = params.get("project");
    const modeParam = params.get("mode");

    if (modeParam === "open") {
      setEntryMode("open");
    } else {
      setEntryMode("new");
    }

    if (stepParam && wizardSteps.some((step) => step.id === stepParam)) {
      setActiveStep(stepParam as WizardStepId);
    }

    if (projectParam) {
      setRequestedProjectId(projectParam);
    }
  }, []);

  const withPhotographerHeaders = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      let effectivePhotographerId = photographerId;
      if (!effectivePhotographerId || !isUuidLike(effectivePhotographerId)) {
        effectivePhotographerId = createClientUuid();
        window.localStorage.setItem(photographerStorageKey, effectivePhotographerId);
        setPhotographerId(effectivePhotographerId);
      }

      const headers = new Headers(init?.headers);
      headers.set("x-photographer-id", effectivePhotographerId);

      const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
      if (!isFormData && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(input, {
        ...init,
        headers,
      });
    },
    [photographerId],
  );

  const withProjectHeaders = useCallback(
    async (projectId: string, input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-project-id", projectId);
      return withPhotographerHeaders(input, {
        ...init,
        headers,
      });
    },
    [withPhotographerHeaders],
  );

  async function runWithProjectWriteLock<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const currentTail = projectWriteQueueRef.current.get(projectId) ?? Promise.resolve();
    let releaseTail: () => void = () => undefined;
    const nextTail = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });

    projectWriteQueueRef.current.set(
      projectId,
      currentTail.then(
        () => nextTail,
        () => nextTail,
      ),
    );

    await currentTail.catch(() => undefined);

    try {
      return await task();
    } finally {
      releaseTail();
    }
  }

  const loadGalleries = useCallback(async () => {
    if (!photographerId) return;

    const response = await withPhotographerHeaders("/api/galleries", { method: "GET" });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Galleries konnten nicht geladen werden");
    }

    const next = (json.galleries ?? []) as Gallery[];
    setGalleries(next);
    setGalleriesReady(true);
    setGalleriesLoadFailed(false);
    setSelectedGalleryId((previous) => {
      if (!previous && next.length > 0) return next[0].id;
      if (previous && !next.some((entry) => entry.id === previous) && next.length > 0) return next[0].id;
      return previous;
    });
  }, [photographerId, withPhotographerHeaders]);

  const loadCustomers = useCallback(async () => {
    if (!photographerId) return;

    const response = await withPhotographerHeaders("/api/customers", { method: "GET" });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Kunden konnten nicht geladen werden");
    }

    setCustomers((json.customers ?? []) as Customer[]);
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

  const loadProjectAssets = useCallback(
    async (galleryId: string) => {
      if (!galleryId) {
        setProjectAssets([]);
        return;
      }

      const response = await withPhotographerHeaders(`/api/galleries/${galleryId}/assets`, {
        method: "GET",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Bilder konnten nicht geladen werden");
      }

      setProjectAssets((json.assets ?? []) as ManagedAsset[]);
    },
    [withPhotographerHeaders],
  );

  useEffect(() => {
    if (!photographerId) return;
    setGalleriesReady(false);
    setGalleriesLoadFailed(false);

    void loadGalleries().catch((error) => {
      setGalleriesReady(true);
      setGalleriesLoadFailed(true);
      setErrorNotice(error, "Projekte konnten nicht geladen werden.");
      setSaveStatus("error");
    });
    void loadCustomers().catch((error) => {
      setErrorNotice(error, "Kunden konnten nicht geladen werden.");
    });
  }, [photographerId, loadCustomers, loadGalleries, setErrorNotice]);

  useEffect(() => {
    if (!selectedGalleryId || !photographerId) {
      setPackages([]);
      setProjectAssets([]);
      return;
    }

    void loadPackages(selectedGalleryId).catch((error) => {
      setErrorNotice(error, "Pakete konnten nicht geladen werden.");
    });
    void loadProjectAssets(selectedGalleryId).catch((error) => {
      setErrorNotice(error, "Bilder konnten nicht geladen werden.");
    });
  }, [selectedGalleryId, photographerId, loadPackages, loadProjectAssets, setErrorNotice]);

  useEffect(() => {
    setSelectedFiles([]);
    setFailedUploadKeys([]);
    setDragSelectedFileKey(null);
    setGalleryPassword("");
    setSaveStatus("idle");
  }, [selectedGalleryId]);

  useEffect(() => {
    if (!selectedGallery) {
      setNeverAutoArchive(false);
      setArchiveAfterDays("90");
      setShareCustomerMode("new");
      setShareCustomerId("");
      setShareCustomerName("");
      setShareCustomerEmail("");
      setShareCustomerNote("");
      return;
    }

    setNeverAutoArchive(Boolean(selectedGallery.neverAutoArchive));
    setArchiveAfterDays(String(selectedGallery.archiveAfterDays ?? 90));
    if (selectedGallery.customerId) {
      setShareCustomerMode("existing");
      setShareCustomerId(selectedGallery.customerId);
      setShareCustomerName(selectedGallery.customerName ?? "");
      setShareCustomerEmail(selectedGallery.customerEmail ?? "");
      setShareCustomerNote(selectedGallery.customerNote ?? "");
    } else {
      setShareCustomerMode("new");
      setShareCustomerId("");
      setShareCustomerName("");
      setShareCustomerEmail("");
      setShareCustomerNote("");
    }
  }, [selectedGallery]);

  useEffect(() => {
    if (createCustomerMode !== "existing") return;
    if (createCustomerId) return;
    if (customers.length === 0) return;
    setCreateCustomerId(customers[0].id);
  }, [createCustomerId, createCustomerMode, customers]);

  useEffect(() => {
    if (customers.length > 0) return;
    if (shareCustomerMode === "existing") {
      setShareCustomerMode("new");
      setShareCustomerId("");
    }
  }, [customers.length, shareCustomerMode]);

  useEffect(() => {
    if (shareCustomerMode !== "existing") return;
    if (shareCustomerId) return;
    if (customers.length === 0) return;
    const first = customers[0];
    setShareCustomerId(first.id);
    setShareCustomerName(first.fullName);
    setShareCustomerEmail(first.email);
    setShareCustomerNote(first.note ?? "");
  }, [customers, shareCustomerId, shareCustomerMode]);

  useEffect(() => {
    const input = projectFolderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "true");
    input.setAttribute("directory", "true");
  }, []);

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
    if (createCustomerMode === "existing" && !createCustomerId) {
      setNotice({ type: "error", text: "Bitte wähle einen bestehenden Kunden aus oder wähle „Kunden später zuordnen“." });
      setSaveStatus("error");
      return;
    }
    if (createCustomerMode === "new" && (!createCustomerName.trim() || !createCustomerEmail.trim())) {
      setNotice({ type: "error", text: "Bitte Kundenname und E-Mail ausfüllen oder die Kundenzuordnung deaktivieren." });
      setSaveStatus("error");
      return;
    }

    setLoading(true);
    setSaveStatus("saving");
    setNotice(null);

    try {
      const customerPayload =
        createCustomerMode === "existing" && createCustomerId
          ? { mode: "existing" as const, customerId: createCustomerId }
          : createCustomerMode === "new" && createCustomerName.trim() && createCustomerEmail.trim()
            ? {
                mode: "new" as const,
                fullName: createCustomerName.trim(),
                email: createCustomerEmail.trim(),
                note: createCustomerNote.trim() || undefined,
              }
            : undefined;

      const response = await withPhotographerHeaders("/api/galleries", {
        method: "POST",
        body: JSON.stringify({
          title: galleryTitle,
          description: galleryDescription,
          customer: customerPayload,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        const code = typeof json?.error?.code === "string" ? json.error.code : "";
        const message = typeof json?.error?.message === "string" ? json.error.message : "";
        throw new Error([code, message].filter(Boolean).join(": ") || "Galerie konnte nicht erstellt werden");
      }

      await loadGalleries();
      await loadCustomers();
      setSelectedGalleryId(json.id);
      setFailedUploadKeys([]);
      setNotice(null);
      setSaveStatus("saved");
      setActiveStep("assets");
    } catch (error) {
      setSaveStatus("error");
      setErrorNotice(error, "Das Projekt konnte nicht erstellt werden. Bitte prüfe deine Eingaben.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSelectedGallery() {
    if (!selectedGalleryId || !selectedGallery) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return;
    }

    const confirmed = window.confirm(
      `Projekt wirklich löschen?\n\n${selectedGallery.title}\n\nDieser Schritt kann nicht rückgängig gemacht werden.`,
    );
    if (!confirmed) return;

    setLoading(true);
    setSaveStatus("saving");
    setNotice(null);

    try {
      const response = await withPhotographerHeaders(`/api/galleries/${selectedGalleryId}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.code ?? json?.error?.message ?? "Projekt konnte nicht gelöscht werden");
      }

      await loadGalleries();
      await loadCustomers();
      setPackages([]);
      setProjectAssets([]);
      setSaveStatus("saved");
      setNotice({ type: "muted", text: "Projekt wurde gelöscht." });
    } catch (error) {
      setSaveStatus("error");
      setErrorNotice(error, "Das Projekt konnte nicht gelöscht werden.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAssignCustomer() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return;
    }

    setActiveStep("share");
    setNotice({
      type: "muted",
      text: "Im Schritt „Galerie & Freigabe“ kannst du jetzt den Kunden auswählen oder neu erfassen.",
    });
  }

  async function persistSelectedFiles(options?: { onlyFailed?: boolean }) {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return false;
    }

    const onlyFailed = options?.onlyFailed === true;
    const filesSnapshot = onlyFailed
      ? selectedFiles.filter((file) => failedUploadKeySet.has(fileFingerprint(file)))
      : [...selectedFiles];

    if (filesSnapshot.length === 0) {
      setNotice({ type: "error", text: "Bitte wähle mindestens ein Bild aus." });
      setSaveStatus("error");
      return false;
    }

    const projectId = selectedGalleryId;

    return runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);

      try {
        const uploadedFiles: UploadedAssetFile[] = [];
        const failedFileKeys = new Set<string>();

        for (const file of filesSnapshot) {
          const dimensions = await readImageDimensions(file);
          const formData = new FormData();
          formData.append("file", file);
          formData.append("width", String(dimensions.width));
          formData.append("height", String(dimensions.height));

          const uploadResponse = await withProjectHeaders(projectId, `/api/galleries/${projectId}/assets/upload`, {
            method: "POST",
            body: formData,
          });
          const uploadJson = await uploadResponse.json();

          if (!uploadResponse.ok) {
            const code = uploadJson?.error?.code as string | undefined;
            if (code === "CONTEXT_MISMATCH") {
              throw new Error(code);
            }

            failedFileKeys.add(fileFingerprint(file));
            continue;
          }

          uploadedFiles.push(uploadJson.file as UploadedAssetFile);
        }

        if (uploadedFiles.length === 0) {
          setNotice({
            type: "error",
            text: "Die Bilder konnten nicht gespeichert werden. Bitte versuche es erneut.",
            action: "retry_failed_uploads",
          });
          setFailedUploadKeys(filesSnapshot.map((file) => fileFingerprint(file)));
          setSaveStatus("error");
          return false;
        }

        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/assets/finalize`, {
          method: "POST",
          body: JSON.stringify({ files: uploadedFiles }),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Assets konnten nicht angelegt werden");
        }

        await loadGalleries();
        await loadProjectAssets(projectId);

        if (failedFileKeys.size > 0) {
          setSelectedFiles((previous) =>
            previous.filter((file) => failedFileKeys.has(fileFingerprint(file))),
          );
          setFailedUploadKeys(Array.from(failedFileKeys));
          setNotice({
            type: "error",
            text: `${uploadedFiles.length} Bild(er) wurden hinzugefügt, ${failedFileKeys.size} konnten nicht gespeichert werden.`,
            action: "retry_failed_uploads",
          });
          setSaveStatus("partial");
          return false;
        } else {
          setSelectedFiles([]);
          setFailedUploadKeys([]);
          setNotice(null);
          setSaveStatus("saved");
          return true;
        }
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Die Bilder konnten nicht gespeichert werden. Bitte versuche es erneut.");
        return false;
      } finally {
        setLoading(false);
      }
    });
  }

  async function persistAssetOrder(projectId: string, orderedAssetIds: string[]) {
    if (!projectId) return false;

    const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/assets`, {
      method: "PATCH",
      body: JSON.stringify({
        operation: "reorder",
        orderedAssetIds,
      }),
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error?.code ?? json?.error?.message ?? "Reihenfolge konnte nicht gespeichert werden");
    }

    await loadProjectAssets(projectId);
    await loadGalleries();
    return true;
  }

  async function reorderAssetsByDrag(targetAssetId: string) {
    if (!selectedGalleryId || !dragAssetId || dragAssetId === targetAssetId) return;
    const projectId = selectedGalleryId;

    const fromIndex = projectAssets.findIndex((asset) => asset.id === dragAssetId);
    const toIndex = projectAssets.findIndex((asset) => asset.id === targetAssetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...projectAssets];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    await runWithProjectWriteLock(projectId, async () => {
      setProjectAssets(reordered);
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);

      try {
        await persistAssetOrder(projectId, reordered.map((asset) => asset.id));
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Die Reihenfolge konnte nicht gespeichert werden.");
        await loadProjectAssets(projectId);
      } finally {
        setLoading(false);
        setDragAssetId(null);
      }
    });
  }

  async function setCoverAsset(assetId: string) {
    if (!selectedGalleryId) return;
    const projectId = selectedGalleryId;

    await runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);
      try {
        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/assets`, {
          method: "PATCH",
          body: JSON.stringify({
            operation: "cover",
            assetId,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Cover konnte nicht gespeichert werden");
        }

        await loadGalleries();
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Cover konnte nicht gespeichert werden.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function deleteAsset(assetId: string) {
    if (!selectedGalleryId) return;
    const projectId = selectedGalleryId;

    await runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);
      try {
        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/assets/${assetId}`, {
          method: "DELETE",
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Bild konnte nicht entfernt werden");
        }

        await loadProjectAssets(projectId);
        await loadGalleries();
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Bild konnte nicht entfernt werden.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function handleSeedAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await persistSelectedFiles();
    if (saved) {
      setActiveStep("packages");
    }
  }

  async function handleNext() {
    if (loading) return;

    if (activeStep === "assets" && selectedFiles.length > 0) {
      const saved = await persistSelectedFiles();
      if (saved) {
        setActiveStep("packages");
      }
      return;
    }

    if (activeStep === "assets" && !progress.hasAssets) {
      setNotice({ type: "error", text: "Bitte wähle mindestens ein Bild aus oder füge zuerst Bilder hinzu." });
      setSaveStatus("error");
      return;
    }

    setActiveStep(nextStep(activeStep));
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return;
    }

    const projectId = selectedGalleryId;

    await runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);

      try {
        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/packages`, {
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
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Paket konnte nicht erstellt werden");
        }

        await loadGalleries();
        await loadPackages(projectId);
        setNotice(null);
        setSaveStatus("saved");
        setActiveStep("share");
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Das Paket konnte nicht gespeichert werden. Bitte prüfe die Eingaben.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function handleSaveShareCustomer() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return;
    }

    if (shareCustomerMode === "existing" && !shareCustomerId) {
      setNotice({ type: "error", text: "Bitte wähle einen bestehenden Kunden aus." });
      setSaveStatus("error");
      return;
    }

    if (shareCustomerMode === "new" && (!shareCustomerName.trim() || !shareCustomerEmail.trim())) {
      setNotice({ type: "error", text: "Bitte Name und E-Mail des Kunden ausfüllen." });
      setSaveStatus("error");
      return;
    }

    const projectId = selectedGalleryId;
    await runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);
      try {
        const body =
          shareCustomerMode === "existing"
            ? { mode: "select", customerId: shareCustomerId }
            : {
                mode: "upsert",
                fullName: shareCustomerName.trim(),
                email: shareCustomerEmail.trim(),
                note: shareCustomerNote.trim() || undefined,
              };

        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/customer`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Kunde konnte nicht gespeichert werden");
        }

        await loadCustomers();
        await loadGalleries();
        setSaveStatus("saved");
        setNotice(null);
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Der Kunde konnte nicht gespeichert werden.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function handlePublishGallery() {
    if (!selectedGalleryId) {
      setNotice({ type: "error", text: "Bitte zuerst ein Projekt auswählen." });
      setSaveStatus("error");
      return;
    }
    if (galleryPassword.trim().length < 6) {
      setNotice({ type: "error", text: "Bitte setze ein Kunden-Passwort mit mindestens 6 Zeichen." });
      setSaveStatus("error");
      return;
    }
    if (!customerSelectionIsSaved) {
      setNotice({ type: "error", text: "Bitte zuerst den Kunden mit „Kunde speichern“ übernehmen." });
      setSaveStatus("error");
      return;
    }
    if (!neverAutoArchive && !archiveDaysIsValid) {
      setNotice({ type: "error", text: "Bitte gib eine gültige Archivierungsdauer zwischen 7 und 3650 Tagen ein." });
      setSaveStatus("error");
      return;
    }
    const projectId = selectedGalleryId;
    const normalizedArchiveAfterDays = archiveDaysIsValid ? archiveDaysNumber : 90;

    await runWithProjectWriteLock(projectId, async () => {
      setLoading(true);
      setSaveStatus("saving");
      setNotice(null);

      try {
        const response = await withProjectHeaders(projectId, `/api/galleries/${projectId}/publish`, {
          method: "POST",
          body: JSON.stringify({
            accessPassword: galleryPassword,
            neverAutoArchive,
            archiveAfterDays: normalizedArchiveAfterDays,
          }),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error?.code ?? json?.error?.message ?? "Galerie konnte nicht freigegeben werden");
        }

        await loadGalleries();
        setNotice(null);
        setSaveStatus("saved");
        setActiveStep("summary");
      } catch (error) {
        setSaveStatus("error");
        setErrorNotice(error, "Die Freigabe hat nicht geklappt. Bitte versuche es in einem Moment erneut.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function reloadProjectContext() {
    setLoading(true);
    setNotice(null);
    setGalleriesLoadFailed(false);
    try {
      await Promise.all([loadGalleries(), loadCustomers()]);
      if (selectedGalleryId) {
        await loadPackages(selectedGalleryId);
        await loadProjectAssets(selectedGalleryId);
      }
      setSaveStatus("idle");
    } catch (error) {
      setGalleriesReady(true);
      setGalleriesLoadFailed(true);
      setSaveStatus("error");
      setErrorNotice(error, "Das Projekt konnte nicht neu geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryFailedUploads() {
    if (failedUploadKeys.length === 0) return;
    const saved = await persistSelectedFiles({ onlyFailed: true });
    if (saved) {
      setNotice(null);
    }
  }

  async function handleProjectFolderChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) return;

    const firstPath = files[0].webkitRelativePath || files[0].name;
    const folderName = firstPath.split("/")[0] || "Neues Projekt";

    const manifestFile =
      files.find((file) => file.name === "photopay-project.json") ||
      files.find((file) => file.name === ".photopay-project.json");

    if (!manifestFile) {
      setGalleryTitle(folderName);
      setEntryMode("new");
      setNotice({
        type: "muted",
        text: "Ordner erkannt. Wir haben den Projektnamen übernommen. Bitte mit „Weiter“ das Projekt anlegen.",
      });
      return;
    }

    try {
      const raw = await manifestFile.text();
      const parsed = JSON.parse(raw) as { photographerId?: string; projectId?: string };
      const nextPhotographerId = parsed.photographerId?.trim() ?? "";
      const nextProjectId = parsed.projectId?.trim() ?? "";

      if (!nextPhotographerId || !isUuidLike(nextPhotographerId)) {
        setGalleryTitle(folderName);
        setEntryMode("new");
        setNotice({
          type: "muted",
          text: "Projektdatei gefunden, aber ohne Zuordnung. Wir haben den Projektnamen übernommen.",
        });
        return;
      }

      if (photographerId && nextPhotographerId !== photographerId) {
        setGalleryTitle(folderName);
        setEntryMode("new");
        setNotice({
          type: "muted",
          text: "Dieser Ordner stammt aus einer anderen PhotoPay-Installation. Du kannst ihn hier als neues Projekt anlegen.",
        });
        return;
      }

      setRequestedProjectId(nextProjectId || null);
      setEntryMode("open");
      setActiveStep("create");
      setGalleriesReady(false);
      setGalleriesLoadFailed(false);
      setNotice({
        type: "muted",
        text: "Projektordner geladen. Wir suchen jetzt die zugehörigen Projekte.",
      });
    } catch {
      setGalleryTitle(folderName);
      setEntryMode("new");
      setNotice({
        type: "muted",
        text: "Der Ordner konnte nicht als bestehendes Projekt gelesen werden. Du kannst ihn als neues Projekt anlegen.",
      });
    }
  }

  return (
    <main className="studio-shell">
      <header className="studio-top">
        <div className="studio-top-brand">
          <Link className="studio-brand-link" href="/">
            PhotoPay Studio
          </Link>
          <p className="studio-top-project">
            Projekt: <strong>{currentProjectLabel}</strong>
          </p>
        </div>
        <nav aria-label="Schritte" className="wizard-nav">
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/">
            <span className="wizard-step-label">Start</span>
          </Link>
          {wizardSteps.map((step) => {
            const isEnabled = isStepAccessible(step.id);
            const stepState = getStepState(step.id);
            const stateLabel = stepState === "done" ? "erledigt" : stepState === "active" ? "aktiv" : "offen";

            return (
              <button
                aria-current={stepState === "active" ? "step" : undefined}
                className={`wizard-step wizard-step-${stepState}`}
                disabled={loading || (!isEnabled && stepState !== "active")}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <span className="wizard-step-label">{step.short}</span>
                {stepState === "done" ? (
                  <span
                    aria-label={stateLabel}
                    className={`wizard-step-icon wizard-step-icon-${stepState}`}
                    title={stateLabel}
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
          <Link className="wizard-step wizard-step-open wizard-step-link" href="/settings">
            <span className="wizard-step-label">
              <span aria-hidden="true" className="wizard-step-gear">
                &#9881;
              </span>
              Einstellungen
            </span>
          </Link>
        </nav>
      </header>

      {saveStatus === "saving" || saveStatus === "saved" ? (
        <div className={`save-toast save-toast-${saveStatus}`}>
          <span className="small">{saveStatusText}</span>
        </div>
      ) : null}

      {notice ? (
        <div className={`notice notice-${notice.type}`}>
          <div className="notice-content">
            <span>{notice.text}</span>
            {notice.action === "reload_project" ? (
              <button className="btn btn-secondary btn-inline" disabled={loading} onClick={() => void reloadProjectContext()} type="button">
                Projekt neu laden
              </button>
            ) : null}
            {notice.action === "reload_page" ? (
              <button
                className="btn btn-secondary btn-inline"
                disabled={loading}
                onClick={() => {
                  window.location.reload();
                }}
                type="button"
              >
                Seite neu laden
              </button>
            ) : null}
            {notice.action === "retry_failed_uploads" ? (
              <button className="btn btn-secondary btn-inline" disabled={loading} onClick={() => void handleRetryFailedUploads()} type="button">
                Fehlgeschlagene erneut hochladen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeStep === "create" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>{entryMode === "open" ? "Schritt 1: Projekt öffnen" : "Schritt 1: Projekt anlegen"}</h2>
          {entryMode === "new" ? (
            <p className="helper" style={{ marginBottom: 0 }}>
              Gib deinem Projekt einen Namen, der dir sofort die Verbindung zum Shooting zeigt.
            </p>
          ) : null}

          {entryMode === "open" ? (
            <div className="grid" style={{ gap: "0.75rem" }}>
              <input
                onChange={(event) => {
                  void handleProjectFolderChosen(event);
                }}
                ref={projectFolderInputRef}
                style={{ display: "none" }}
                type="file"
                multiple
              />

              {!galleriesReady ? (
                <div className="notice notice-muted">Projekte werden geladen...</div>
              ) : galleriesLoadFailed ? (
                <div className="grid" style={{ gap: "0.55rem" }}>
                  <div className="notice notice-error">
                    Projekte konnten gerade nicht geladen werden. Bitte versuche es erneut.
                  </div>
                  <div className="toolbar">
                    <button className="btn btn-secondary" disabled={loading} onClick={() => void reloadProjectContext()} type="button">
                      Erneut laden
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => projectFolderInputRef.current?.click()}
                      type="button"
                    >
                      Ordner wählen
                    </button>
                    <button className="btn" disabled={loading} onClick={() => setEntryMode("new")} type="button">
                      Neues Projekt anlegen
                    </button>
                  </div>
                </div>
              ) : galleries.length > 0 ? (
                <div className="grid" style={{ gap: "0.55rem" }}>
                  <div className="grid grid-2" style={{ gap: "0.45rem" }}>
                    <div>
                      <label className="label" htmlFor="open-projects-search">
                        Suchen
                      </label>
                      <input
                        className="input"
                        id="open-projects-search"
                        onChange={(event) => setOpenProjectsSearch(event.target.value)}
                        placeholder="Projekt, Kunde oder E-Mail"
                        value={openProjectsSearch}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="open-projects-sort">
                        Sortieren
                      </label>
                      <select
                        className="select"
                        id="open-projects-sort"
                        onChange={(event) =>
                          setOpenProjectsSort(
                            event.target.value as "newest" | "oldest" | "name_asc" | "name_desc",
                          )
                        }
                        value={openProjectsSort}
                      >
                        <option value="newest">Neueste zuerst</option>
                        <option value="oldest">Älteste zuerst</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="name_desc">Name Z-A</option>
                      </select>
                    </div>
                  </div>

                  <div className="gallery-list">
                    {openStepGalleries.map((gallery) => (
                      <button
                        className={`gallery-item ${selectedGalleryId === gallery.id ? "gallery-item-active" : ""}`}
                        disabled={loading}
                        key={gallery.id}
                        onClick={() => setSelectedGalleryId(gallery.id)}
                        type="button"
                      >
                        <div className="kv" style={{ alignItems: "flex-start" }}>
                          <div className="grid" style={{ gap: "0.35rem" }}>
                            <strong>{gallery.title}</strong>
                            <div className="toolbar" style={{ gap: "0.4rem" }}>
                              <span className={`status ${gallery.status === "published" ? "status-published" : "status-draft"}`}>
                                {gallery.status === "published" ? "Live" : "Entwurf"}
                              </span>
                              {gallery.status === "published" ? (
                                <span className={`status ${toCustomerStatusClass(gallery.customerStatus)}`}>
                                  {toCustomerStatusLabel(gallery.customerStatus)}
                                </span>
                              ) : null}
                            </div>
                            <p className="small muted" style={{ marginBottom: 0 }}>
                              {gallery.customerName ? `${gallery.customerName} (${gallery.customerEmail ?? "ohne E-Mail"})` : "Kein Kunde zugeordnet"}
                            </p>
                            <p className="small muted" style={{ marginBottom: 0 }}>
                              Erstellt: {formatDateTime(gallery.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {openStepGalleries.length === 0 ? (
                    <div className="notice notice-muted">
                      Keine Projekte für diesen Suchbegriff gefunden.
                    </div>
                  ) : null}
                  <div className="toolbar">
                    <button
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => projectFolderInputRef.current?.click()}
                      type="button"
                    >
                      Ordner wählen
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={loading || !selectedGalleryId}
                      onClick={() => void handleDeleteSelectedGallery()}
                      type="button"
                    >
                      Projekt löschen
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={loading || !selectedGalleryId}
                      onClick={handleQuickAssignCustomer}
                      type="button"
                    >
                      Kunde zuordnen
                    </button>
                    <button className="btn btn-secondary" disabled={loading} onClick={() => setEntryMode("new")} type="button">
                      Neues Projekt anlegen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid" style={{ gap: "0.55rem" }}>
                  <div className="notice notice-muted">Es sind noch keine Projekte vorhanden. Lege zuerst ein Projekt an.</div>
                  <div className="toolbar">
                    <button
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => projectFolderInputRef.current?.click()}
                      type="button"
                    >
                      Ordner wählen
                    </button>
                    <button className="btn" disabled={loading} onClick={() => setEntryMode("new")} type="button">
                      Neues Projekt anlegen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <form className="grid" onSubmit={handleCreateGallery} style={{ gap: "0.65rem" }}>
                <div>
                  <label className="label" htmlFor="gallery-title">
                    Projektname
                  </label>
                  <input
                    className="input"
                    id="gallery-title"
                    onChange={(event) => setGalleryTitle(event.target.value)}
                    placeholder="z. B. Babyshooting Moritz 20260329"
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
                    placeholder="optional"
                    value={galleryDescription}
                  />
                </div>

                <div className="grid" style={{ gap: "0.45rem" }}>
                  <label className="label">Kunde (optional)</label>
                  <select
                    className="select"
                    onChange={(event) => {
                      const nextMode = event.target.value as "none" | "existing" | "new";
                      setCreateCustomerMode(nextMode);
                      if (nextMode !== "existing") {
                        setCreateCustomerSearch("");
                      }
                    }}
                    value={createCustomerMode}
                  >
                    <option value="none">Kunden später zuordnen</option>
                    {customers.length > 0 ? <option value="existing">Kunde auswählen</option> : null}
                    <option value="new">Kunde neu erfassen</option>
                  </select>

                  {createCustomerMode === "existing" ? (
                    <div className="grid" style={{ gap: "0.4rem" }}>
                      <label className="label" htmlFor="create-customer-existing">
                        Kunde auswählen
                      </label>
                      <input
                        className="input"
                        id="create-customer-search"
                        onChange={(event) => setCreateCustomerSearch(event.target.value)}
                        placeholder="Kunde suchen (Name oder E-Mail)"
                        value={createCustomerSearch}
                      />
                      <select
                        className="select"
                        id="create-customer-existing"
                        onChange={(event) => setCreateCustomerId(event.target.value)}
                        value={createCustomerId}
                      >
                        <option value="">{createStepCustomers.length > 0 ? "Bitte wählen" : "Keine Treffer"}</option>
                        {createStepCustomers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.fullName} ({customer.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {createCustomerMode === "new" ? (
                    <div className="grid" style={{ gap: "0.45rem" }}>
                      <div className="grid grid-2">
                        <div>
                          <label className="label" htmlFor="create-customer-name">
                            Kundenname
                          </label>
                          <input
                            className="input"
                            id="create-customer-name"
                            onChange={(event) => setCreateCustomerName(event.target.value)}
                            placeholder="z. B. Familie Muster"
                            value={createCustomerName}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="create-customer-email">
                            Kunden-E-Mail
                          </label>
                          <input
                            className="input"
                            id="create-customer-email"
                            onChange={(event) => setCreateCustomerEmail(event.target.value)}
                            placeholder="kunde@example.com"
                            type="email"
                            value={createCustomerEmail}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="create-customer-note">
                          Notiz (optional)
                        </label>
                        <input
                          className="input"
                          id="create-customer-note"
                          onChange={(event) => setCreateCustomerNote(event.target.value)}
                          value={createCustomerNote}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="toolbar" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="btn"
                    disabled={
                      loading ||
                      (createCustomerMode === "existing" && !createCustomerId) ||
                      (createCustomerMode === "new" && (!createCustomerName.trim() || !createCustomerEmail.trim()))
                    }
                    type="submit"
                  >
                    Weiter
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      ) : null}

      {activeStep === "assets" ? (
        <section className="card grid" style={{ gap: "0.75rem" }}>
          <h2 style={{ marginBottom: 0 }}>Schritt 2: Bilder hinzufügen</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Füge die gewünschten Bilder im aktiven Projekt hinzu.
          </p>

          {!progress.hasGallery ? (
            <div className="notice notice-error">Bitte zuerst in Schritt 1 ein Projekt anlegen.</div>
          ) : (
            <>
              <form className="grid" onSubmit={handleSeedAssets} style={{ gap: "0.65rem" }}>
                <div>
                  <input
                    accept="image/*"
                    id="asset-input"
                    multiple
                    onChange={handleAssetFileInput}
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    type="file"
                  />
                  <div
                    className={`dropzone ${isDragOverAssets ? "dropzone-active" : ""}`}
                    onClick={() => {
                      if (loading) return;
                      fileInputRef.current?.click();
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragOverAssets(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setIsDragOverAssets(false);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragOverAssets(true);
                    }}
                    onDrop={handleAssetsDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (loading) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <p className="dropzone-title">Dateien hierhin ziehen oder klicken</p>
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      JPG, PNG, HEIC und weitere Bildformate
                    </p>
                  </div>
                </div>

                {selectedFiles.length > 0 ? (
                  <>
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      Tipp: Du kannst die ausgewählten Bilder per Drag-and-Drop umsortieren.
                    </p>
                    {failedUploadKeys.length > 0 ? (
                      <div className="toolbar" style={{ justifyContent: "flex-start" }}>
                        <button className="btn btn-secondary" disabled={loading} onClick={() => void handleRetryFailedUploads()} type="button">
                          Nur fehlgeschlagene erneut hochladen
                        </button>
                      </div>
                    ) : null}
                    <div className="selected-files">
                      {selectedFilePreviews.map((preview, index) => (
                        <div
                          className={`selected-file-row ${dragSelectedFileKey === preview.key ? "selected-file-row-dragging" : ""} ${failedUploadKeySet.has(preview.key) ? "selected-file-row-failed" : ""}`}
                          draggable
                          key={preview.key}
                          onDragEnd={() => setDragSelectedFileKey(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                          }}
                          onDragStart={() => setDragSelectedFileKey(preview.key)}
                          onDrop={(event) => {
                            event.preventDefault();
                            reorderSelectedFilesByDrag(preview.key);
                          }}
                        >
                        <div className="selected-file-preview-wrap">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={preview.file.name}
                            className="selected-file-preview"
                            src={preview.previewUrl}
                          />
                        </div>
                        <div className="selected-file-main">
                          <div className="selected-file-meta">
                            <span className="small selected-file-name">{preview.file.name}</span>
                            {failedUploadKeySet.has(preview.key) ? <span className="selected-file-badge">Upload fehlgeschlagen</span> : null}
                            <span className="small muted">{formatFileSize(preview.file.size)}</span>
                          </div>
                        </div>
                        <div className="selected-file-actions">
                          <button className="btn btn-secondary" disabled={loading} onClick={() => removeSelectedFile(index)} type="button">
                            Entfernen
                          </button>
                        </div>
                        </div>
                      ))}
                    </div>
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      Ausgewählt: {selectedFiles.length} {selectedFiles.length === 1 ? "Bild" : "Bilder"}.
                    </p>
                  </>
                ) : (
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Noch keine Bilder ausgewählt.
                  </p>
                )}
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
              <div className="notice notice-muted small">Aktives Projekt: {currentProjectLabel}</div>

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
                Hier verwaltest du aktuell Projektpakete.
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
          <h2 style={{ marginBottom: 0 }}>Schritt 4: Galerie & Freigabe</h2>
          <p className="helper" style={{ marginBottom: 0 }}>
            Wenn alles passt, schaltest du das aktive Projekt live und teilst den Link mit deinen Kunden.
          </p>

          {!progress.hasPackages ? (
            <div className="notice notice-error">Bitte zuerst in Schritt 3 ein Paket festlegen.</div>
          ) : (
            <>
              <div className="notice notice-muted small">Aktives Projekt: {currentProjectLabel}</div>

              <div className="grid" style={{ gap: "0.5rem" }}>
                <label className="label" htmlFor="gallery-design">
                  Galerie-Design
                </label>
                <div className="design-switch" id="gallery-design">
                  <button
                    className={`design-chip ${galleryDesign === "clean" ? "design-chip-active" : ""}`}
                    onClick={() => setGalleryDesign("clean")}
                    type="button"
                  >
                    Clean
                  </button>
                  <button
                    className={`design-chip ${galleryDesign === "editorial" ? "design-chip-active" : ""}`}
                    onClick={() => setGalleryDesign("editorial")}
                    type="button"
                  >
                    Editorial
                  </button>
                  <button
                    className={`design-chip ${galleryDesign === "bold" ? "design-chip-active" : ""}`}
                    onClick={() => setGalleryDesign("bold")}
                    type="button"
                  >
                    Bold
                  </button>
                </div>
              </div>

              <div className="grid" style={{ gap: "0.45rem" }}>
                <label className="label">Kunde für diese Freigabe</label>
                <select
                  className="select"
                  onChange={(event) => {
                    const nextMode = event.target.value as "existing" | "new";
                    setShareCustomerMode(nextMode);
                    if (nextMode !== "existing") {
                      setShareCustomerSearch("");
                    }
                  }}
                  value={shareCustomerMode}
                >
                  {customers.length > 0 ? <option value="existing">Kunde auswählen</option> : null}
                  <option value="new">Kunde neu erfassen</option>
                </select>

                {shareCustomerMode === "existing" ? (
                  <div className="grid" style={{ gap: "0.4rem" }}>
                    <label className="label" htmlFor="share-customer-existing">
                      Kunde auswählen
                    </label>
                    <input
                      className="input"
                      id="share-customer-search"
                      onChange={(event) => setShareCustomerSearch(event.target.value)}
                      placeholder="Kunde suchen (Name oder E-Mail)"
                      value={shareCustomerSearch}
                    />
                    <select
                      className="select"
                      id="share-customer-existing"
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setShareCustomerId(nextId);
                        const selected = customers.find((entry) => entry.id === nextId);
                        setShareCustomerName(selected?.fullName ?? "");
                        setShareCustomerEmail(selected?.email ?? "");
                        setShareCustomerNote(selected?.note ?? "");
                      }}
                      value={shareCustomerId}
                    >
                      <option value="">{shareStepCustomers.length > 0 ? "Bitte wählen" : "Keine Treffer"}</option>
                      {shareStepCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.fullName} ({customer.email})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid" style={{ gap: "0.45rem" }}>
                    <div className="grid grid-2">
                      <div>
                        <label className="label" htmlFor="share-customer-name">
                          Kundenname
                        </label>
                        <input
                          className="input"
                          id="share-customer-name"
                          onChange={(event) => setShareCustomerName(event.target.value)}
                          placeholder="z. B. Familie Muster"
                          value={shareCustomerName}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="share-customer-email">
                          Kunden-E-Mail
                        </label>
                        <input
                          className="input"
                          id="share-customer-email"
                          onChange={(event) => setShareCustomerEmail(event.target.value)}
                          placeholder="kunde@example.com"
                          type="email"
                          value={shareCustomerEmail}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label" htmlFor="share-customer-note">
                        Notiz (optional)
                      </label>
                      <input
                        className="input"
                        id="share-customer-note"
                        onChange={(event) => setShareCustomerNote(event.target.value)}
                        value={shareCustomerNote}
                      />
                    </div>
                  </div>
                )}

                <div className="toolbar">
                  <button className="btn btn-secondary" disabled={loading} onClick={() => void handleSaveShareCustomer()} type="button">
                    Kunde speichern
                  </button>
                </div>
              </div>

              <div className="grid" style={{ gap: "0.4rem" }}>
                <label className="label" htmlFor="share-password">
                  Kunden-Passwort
                </label>
                <input
                  className="input"
                  id="share-password"
                  onChange={(event) => setGalleryPassword(event.target.value)}
                  placeholder="Mindestens 6 Zeichen"
                  value={galleryPassword}
                />
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Freigabe-E-Mail: {selectedGallery?.customerEmail ?? "Noch keine Kunden-E-Mail hinterlegt"}
                </p>
                {!selectedGallery?.customerEmail ? (
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Du kannst die Galerie trotzdem veröffentlichen und den Link manuell teilen.
                  </p>
                ) : null}
              </div>

              <div className="grid" style={{ gap: "0.4rem" }}>
                <label className="label">Lebensdauer der Galerie</label>
                <label className="asset-item" style={{ width: "fit-content" }}>
                  <input
                    checked={neverAutoArchive}
                    onChange={(event) => setNeverAutoArchive(event.target.checked)}
                    type="checkbox"
                  />
                  Nie automatisch archivieren
                </label>
                {!neverAutoArchive ? (
                  <div className="grid" style={{ gap: "0.35rem", maxWidth: "260px" }}>
                    <label className="label" htmlFor="archive-days">
                      Automatisch archivieren nach (Tage)
                    </label>
                    <input
                      className="input mono"
                      id="archive-days"
                      max={3650}
                      min={7}
                      onChange={(event) => setArchiveAfterDays(event.target.value)}
                      type="number"
                      value={archiveAfterDays}
                    />
                    {!archiveDaysIsValid ? (
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Bitte einen Wert zwischen 7 und 3650 eingeben.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Diese Galerie bleibt aktiv, bis du sie manuell archivierst.
                  </p>
                )}
              </div>

              {projectAssets.length > 0 ? (
                <div className="grid" style={{ gap: "0.6rem" }}>
                  <h3 style={{ marginBottom: 0 }}>Galerie-Vorschau (Freigabe)</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Hier kannst du Reihenfolge per Drag ändern und ein Cover festlegen.
                  </p>
                  <div className={`share-gallery-grid share-gallery-${galleryDesign}`}>
                    {projectAssets.map((asset) => {
                      const isCover = selectedGallery?.coverAssetId === asset.id;

                      return (
                        <article
                          className={`share-asset-card ${isCover ? "share-asset-card-cover" : ""}`}
                          draggable
                          key={asset.id}
                          onDragEnd={() => setDragAssetId(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                          }}
                          onDragStart={() => setDragAssetId(asset.id)}
                          onDrop={(event) => {
                            event.preventDefault();
                            void reorderAssetsByDrag(asset.id);
                          }}
                        >
                          <div className="share-asset-thumb-wrap">
                            {asset.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt={asset.filename} className="share-asset-thumb" src={asset.previewUrl} />
                            ) : (
                              <div className="project-asset-placeholder small muted">Kein Preview</div>
                            )}
                            {isCover ? <span className="share-cover-badge">Cover</span> : null}
                          </div>
                          <p className="small share-asset-name">{asset.filename}</p>
                          <div className="share-asset-actions">
                            <button
                              className={`btn ${isCover ? "" : "btn-secondary"}`}
                              disabled={loading}
                              onClick={() => {
                                void setCoverAsset(asset.id);
                              }}
                              type="button"
                            >
                              {isCover ? "Cover gesetzt" : "Als Cover"}
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={loading}
                              onClick={() => {
                                void deleteAsset(asset.id);
                              }}
                              type="button"
                            >
                              Entfernen
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="notice notice-muted">
                  Noch keine Bilder im Projekt gespeichert. Bitte zuerst in Schritt 2 Bilder hochladen.
                </div>
              )}

              <div className="toolbar">
                <button
                  className="btn"
                  disabled={
                    loading ||
                    !selectedGalleryId ||
                    galleryPassword.trim().length < 6 ||
                    !customerSelectionIsSaved ||
                    (!neverAutoArchive && !archiveDaysIsValid)
                  }
                  onClick={handlePublishGallery}
                  type="button"
                >
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
            <div className="notice notice-muted">
              <p className="small" style={{ marginBottom: "0.4rem" }}>
                Kunde:{" "}
                <strong>{selectedGallery.customerName ? `${selectedGallery.customerName} (${selectedGallery.customerEmail ?? "ohne E-Mail"})` : "Kein Kunde zugeordnet"}</strong>
              </p>
              <p className="small" style={{ marginBottom: "0.35rem" }}>
                Letzter Zugriff: <strong>{formatDateTime(selectedGallery.lastAccessAt)}</strong>
              </p>
              <p className="small" style={{ marginBottom: "0.35rem" }}>
                Bezahlte Bestellungen: <strong>{selectedGallery.paidOrderCount ?? 0}</strong>
              </p>
              <p className="small" style={{ marginBottom: 0 }}>
                Downloads:{" "}
                <strong>
                  {selectedGallery.downloadedAssetCount ?? 0}/{selectedGallery.purchasedAssetCount ?? 0}
                </strong>
              </p>
            </div>
          ) : null}

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

          {selectedGallery ? (
            <div className="notice notice-muted small">
              Galerie-Lebensdauer:{" "}
              {selectedGallery.neverAutoArchive
                ? "Keine automatische Archivierung"
                : `Automatisch nach ${selectedGallery.archiveAfterDays ?? 90} Tagen`}
            </div>
          ) : null}
        </section>
      ) : null}

      {showGlobalNavigation ? (
        <section className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <button
                className="btn btn-secondary"
                disabled={loading || activeStep === "create"}
                onClick={() => setActiveStep(previousStep(activeStep))}
                type="button"
              >
              Zurück
            </button>

            {activeStep !== "summary" ? (
              <button
                className="btn"
                disabled={loading || !canGoNext}
                onClick={() => {
                  void handleNext();
                }}
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
      ) : null}
    </main>
  );
}
