"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { evaluateSelection } from "@/lib/pricing";

type GalleryAsset = {
  id: string;
  filename: string;
  previewKey: string;
  watermark: boolean;
};

type GalleryPackage = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  includedCount: number;
  allowExtra: boolean;
  extraUnitPriceCents: number | null;
};

type CartItem = {
  cartPackageItemId: string;
  packageId: string;
  packageName: string;
  selectedAssetIds: string[];
  basePriceCents: number;
  extraUnitPriceCents: number | null;
  selectedCount: number;
  includedCount: number;
  allowExtra: boolean;
  missingCount: number;
  extraCount: number;
  extraCostCents: number;
  lineTotalCents: number;
  selectionStatus: "INCOMPLETE" | "EXACT" | "EXTRA_BLOCKED" | "EXTRA_PRICED";
  checkoutEligible: boolean;
  message: string;
};

type CartResponse = {
  cartId: string;
  status: string;
  customerName: string | null;
  customerEmail: string;
  items: CartItem[];
  subtotalCents: number;
  totalCents: number;
  checkoutEligible: boolean;
};

type GalleryResponse = {
  gallery: {
    id: string;
    publicSlug: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
  };
  assets: GalleryAsset[];
  packages: GalleryPackage[];
};

type Props = {
  publicSlug: string;
};

const EMPTY_ASSETS: GalleryAsset[] = [];
const EMPTY_PACKAGES: GalleryPackage[] = [];

function formatChf(cents: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

function getSelectionStatusText(status: CartItem["selectionStatus"]) {
  switch (status) {
    case "INCOMPLETE":
      return "Unvollstaendig";
    case "EXACT":
      return "Vollstaendig";
    case "EXTRA_BLOCKED":
      return "Zu viele (gesperrt)";
    case "EXTRA_PRICED":
      return "Zusatzbilder";
    default:
      return status;
  }
}

function getSelectionStatusNotice(status: CartItem["selectionStatus"]) {
  switch (status) {
    case "INCOMPLETE":
    case "EXTRA_BLOCKED":
      return "error";
    case "EXACT":
      return "success";
    case "EXTRA_PRICED":
      return "muted";
    default:
      return "muted";
  }
}

function haveSameSelection(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((assetId) => rightSet.has(assetId));
}

export default function PublicGalleryClient({ publicSlug }: Props) {
  const [password, setPassword] = useState("muster123");
  const [galleryAccessToken, setGalleryAccessToken] = useState("");

  const [galleryData, setGalleryData] = useState<GalleryResponse | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");

  const [customerName, setCustomerName] = useState("Anna Muster");
  const [customerEmail, setCustomerEmail] = useState("anna@example.com");

  const [cartId, setCartId] = useState("");
  const [cartToken, setCartToken] = useState("");
  const [cartView, setCartView] = useState<CartResponse | null>(null);
  const [selectionDrafts, setSelectionDrafts] = useState<Record<string, string[]>>({});

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success" | "muted"; text: string } | null>(null);

  const packages = galleryData?.packages ?? EMPTY_PACKAGES;
  const assets = galleryData?.assets ?? EMPTY_ASSETS;

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );
  const liveCartSummary = useMemo(() => {
    if (!cartView) {
      return null;
    }

    const liveItems = cartView.items.map((item) => {
      const selected = selectionDrafts[item.cartPackageItemId] ?? item.selectedAssetIds;
      const evaluation = evaluateSelection({
        selectedCount: selected.length,
        includedCount: item.includedCount,
        allowExtra: item.allowExtra,
        basePriceCents: item.basePriceCents,
        extraUnitPriceCents: item.extraUnitPriceCents,
      });

      return {
        item,
        selected,
        evaluation,
      };
    });

    const unsavedCount = liveItems.filter((entry) => !haveSameSelection(entry.selected, entry.item.selectedAssetIds)).length;
    const blockingCount = liveItems.filter((entry) => !entry.evaluation.checkoutEligible).length;
    const totalCents = liveItems.reduce((sum, entry) => sum + entry.evaluation.lineTotalCents, 0);
    const checkoutEligible = liveItems.length > 0 && unsavedCount === 0 && blockingCount === 0;

    return {
      totalCents,
      unsavedCount,
      blockingCount,
      checkoutEligible,
    };
  }, [cartView, selectionDrafts]);

  useEffect(() => {
    if (!selectedPackageId && packages.length > 0) {
      setSelectedPackageId(packages[0].id);
    }
  }, [packages, selectedPackageId]);

  async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
    const response = await fetch(input, init);
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Request fehlgeschlagen");
    }

    return json;
  }

  async function loadGallery() {
    const json = (await fetchJson(`/api/public/galleries/${publicSlug}`, {
      method: "GET",
    })) as GalleryResponse;

    setGalleryData(json);
    if (json.packages.length > 0) {
      setSelectedPackageId((current) => current || json.packages[0].id);
    }
  }

  async function handleAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const access = await fetchJson(`/api/public/galleries/${publicSlug}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      setGalleryAccessToken(access.galleryAccessToken);
      await loadGallery();
      setNotice({ type: "success", text: "Galerie freigeschaltet." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!galleryData) {
      setNotice({ type: "error", text: "Bitte zuerst Galerie freischalten." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const json = await fetchJson("/api/public/carts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicSlug: galleryData.gallery.publicSlug,
          customerName,
          customerEmail,
        }),
      });

      setCartId(json.cartId);
      setCartToken(json.cartAccessToken);
      window.localStorage.setItem("photopay_last_cart_token", json.cartAccessToken);
      window.localStorage.setItem(`photopay_cart_token_${galleryData.gallery.publicSlug}`, json.cartAccessToken);
      await loadCart(json.cartId, json.cartAccessToken);

      setNotice({ type: "success", text: "Warenkorb erstellt." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  async function loadCart(nextCartId = cartId, nextToken = cartToken) {
    if (!nextCartId || !nextToken) return;

    const json = (await fetchJson(`/api/public/carts/${nextCartId}`, {
      method: "GET",
      headers: {
        "x-cart-token": nextToken,
      },
    })) as CartResponse;

    setCartView(json);
    setSelectionDrafts((previous) => {
      const nextDrafts = { ...previous };
      for (const item of json.items) {
        nextDrafts[item.cartPackageItemId] = item.selectedAssetIds;
      }
      return nextDrafts;
    });
  }

  async function handleAddPackageItem() {
    if (!cartId || !cartToken || !selectedPackageId) {
      setNotice({ type: "error", text: "Bitte zuerst Warenkorb erstellen und Package wählen." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const json = await fetchJson(`/api/public/carts/${cartId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cart-token": cartToken,
        },
        body: JSON.stringify({ packageId: selectedPackageId }),
      });

      setSelectionDrafts((prev) => ({ ...prev, [json.cartPackageItemId]: [] }));
      await loadCart();
      setNotice({ type: "success", text: "Package zum Warenkorb hinzugefügt." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  function toggleAssetSelection(cartPackageItemId: string, assetId: string) {
    setSelectionDrafts((prev) => {
      const current = prev[cartPackageItemId] ?? [];
      const has = current.includes(assetId);
      return {
        ...prev,
        [cartPackageItemId]: has ? current.filter((id) => id !== assetId) : [...current, assetId],
      };
    });
  }

  async function handleSaveSelection(cartPackageItemId: string) {
    if (!cartId || !cartToken) {
      setNotice({ type: "error", text: "Warenkorb nicht bereit." });
      return;
    }

    const assetIds = selectionDrafts[cartPackageItemId] ?? [];
    if (assetIds.length === 0) {
      setNotice({ type: "error", text: "Bitte mindestens ein Bild auswählen." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const json = await fetchJson(`/api/public/carts/${cartId}/items/${cartPackageItemId}/selections`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-cart-token": cartToken,
        },
        body: JSON.stringify({ assetIds }),
      });

      await loadCart();
      setNotice({ type: "success", text: json.message ?? "Auswahl gespeichert." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    if (!cartId || !cartToken) {
      setNotice({ type: "error", text: "Kein aktiver Warenkorb." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const json = await fetchJson(`/api/public/carts/${cartId}/checkout`, {
        method: "POST",
        headers: {
          "x-cart-token": cartToken,
        },
      });

      window.localStorage.setItem("photopay_last_cart_token", cartToken);
      window.localStorage.setItem(`photopay_order_cart_${json.orderId}`, cartToken);
      window.location.href = json.checkoutUrl;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unbekannter Fehler" });
      setLoading(false);
    }
  }

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/studio">Studio</Link>
      </div>

      <section className="card grid" style={{ gap: "0.6rem" }}>
        <div className="kv">
          <h1 style={{ marginBottom: 0 }}>Kundengalerie</h1>
          <span className="status">/{publicSlug || "..."}</span>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Passwort eingeben, Bilder pro Package auswählen, Checkout starten.
        </p>

        {galleryAccessToken ? (
          <div className="notice notice-success small mono">Access token erhalten: {galleryAccessToken.slice(0, 12)}...</div>
        ) : null}
      </section>

      {notice ? <div className={`notice notice-${notice.type}`}>{notice.text}</div> : null}

      <form className="card grid" onSubmit={handleAccess} style={{ gap: "0.6rem" }}>
        <h2 style={{ marginBottom: 0 }}>1. Passwort prüfen</h2>
        <div className="grid grid-2">
          <div>
            <label className="label" htmlFor="customer-password">
              Passwort
            </label>
            <input
              id="customer-password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="toolbar" style={{ alignItems: "end" }}>
            <button className="btn" disabled={loading || !publicSlug} type="submit">
              Zugriff freischalten
            </button>
          </div>
        </div>
      </form>

      {galleryData ? (
        <section className="card grid" style={{ gap: "0.7rem" }}>
          <h2 style={{ marginBottom: 0 }}>{galleryData.gallery.title}</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {galleryData.gallery.description || "Ohne Beschreibung"}
          </p>

          <div className="grid grid-3">
            <div className="notice notice-muted small">Assets: {assets.length}</div>
            <div className="notice notice-muted small">Packages: {packages.length}</div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                void loadGallery().catch((error) => setNotice({ type: "error", text: error.message }));
              }}
              type="button"
            >
              Galerie reload
            </button>
          </div>

          <hr className="hr" />

          <form className="grid grid-2" onSubmit={handleCreateCart} style={{ gap: "0.8rem" }}>
            <div>
              <label className="label" htmlFor="customer-name">
                Name
              </label>
              <input
                id="customer-name"
                className="input"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="customer-email">
                E-Mail
              </label>
              <input
                id="customer-email"
                className="input"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                required
              />
            </div>
            <div className="toolbar">
              <button className="btn" disabled={loading} type="submit">
                Warenkorb erstellen
              </button>
              {cartId ? (
                <button
                  className="btn btn-secondary"
                  onClick={(event) => {
                    event.preventDefault();
                    void loadCart().catch((error) => setNotice({ type: "error", text: error.message }));
                  }}
                  type="button"
                >
                  Warenkorb reload
                </button>
              ) : null}
            </div>
          </form>

          {cartId ? (
            <div className="notice notice-muted small mono">
              cartId: {cartId}
              <br />
              cartToken: {cartToken}
            </div>
          ) : null}

          {cartId ? (
            <>
              <hr className="hr" />

              <div className="grid grid-2">
                <div>
                  <label className="label" htmlFor="package-select">
                    Package hinzufügen
                  </label>
                  <select
                    className="select"
                    id="package-select"
                    onChange={(event) => setSelectedPackageId(event.target.value)}
                    value={selectedPackageId}
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({formatChf(pkg.priceCents)} | {pkg.includedCount} Bilder)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="toolbar" style={{ alignItems: "end" }}>
                  <button className="btn" disabled={loading || !selectedPackage} onClick={handleAddPackageItem} type="button">
                    Zum Warenkorb
                  </button>
                </div>
              </div>

              <hr className="hr" />

              {cartView?.items.length ? (
                <div className="grid" style={{ gap: "0.8rem" }}>
                  {cartView.items.map((item) => {
                    const savedSelected = item.selectedAssetIds;
                    const selected = selectionDrafts[item.cartPackageItemId] ?? savedSelected;
                    const liveEvaluation = evaluateSelection({
                      selectedCount: selected.length,
                      includedCount: item.includedCount,
                      allowExtra: item.allowExtra,
                      basePriceCents: item.basePriceCents,
                      extraUnitPriceCents: item.extraUnitPriceCents,
                    });
                    const hasUnsavedChanges = !haveSameSelection(selected, savedSelected);
                    const statusNoticeClass = getSelectionStatusNotice(liveEvaluation.selectionStatus);

                    return (
                      <article className="card" key={item.cartPackageItemId}>
                        <div className="kv" style={{ marginBottom: "0.45rem" }}>
                          <strong>{item.packageName}</strong>
                          <span className="status">{getSelectionStatusText(liveEvaluation.selectionStatus)}</span>
                        </div>
                        <div className={`notice notice-${statusNoticeClass} small`} style={{ marginBottom: "0.4rem" }}>
                          {liveEvaluation.message}
                        </div>
                        <p className="small muted" style={{ marginBottom: "0.35rem" }}>
                          Auswahl: {selected.length}/{item.includedCount} | Preis aktuell: {formatChf(liveEvaluation.lineTotalCents)}
                        </p>
                        {hasUnsavedChanges ? (
                          <p className="small" style={{ marginBottom: "0.5rem", color: "var(--danger)" }}>
                            Nicht gespeichert. Bitte Auswahl speichern klicken.
                          </p>
                        ) : (
                          <p className="small muted" style={{ marginBottom: "0.5rem" }}>
                            Auswahl gespeichert.
                          </p>
                        )}

                        <div className="asset-list">
                          {assets.map((asset) => {
                            const isSelected = selected.includes(asset.id);
                            return (
                              <label className="asset-item" key={`${item.cartPackageItemId}_${asset.id}`}>
                                <input
                                  checked={isSelected}
                                  onChange={() => toggleAssetSelection(item.cartPackageItemId, asset.id)}
                                  type="checkbox"
                                />
                                <span className="small">{asset.filename}</span>
                              </label>
                            );
                          })}
                        </div>

                        <div className="toolbar" style={{ marginTop: "0.55rem" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              void handleSaveSelection(item.cartPackageItemId);
                            }}
                            disabled={loading}
                            type="button"
                          >
                            Auswahl speichern
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Noch keine Position im Warenkorb.
                </p>
              )}

              {cartView ? (
                <div className="card" style={{ marginTop: "0.4rem" }}>
                  <div className="kv">
                    <strong>Total</strong>
                    <strong>{formatChf(liveCartSummary?.totalCents ?? cartView.totalCents)}</strong>
                  </div>
                  <p className="small muted" style={{ marginTop: "0.35rem", marginBottom: "0.55rem" }}>
                    Checkout moeglich: {liveCartSummary?.checkoutEligible ? "Ja" : "Nein"}
                  </p>
                  {liveCartSummary && liveCartSummary.unsavedCount > 0 ? (
                    <p className="small" style={{ marginTop: 0, color: "var(--danger)" }}>
                      {liveCartSummary.unsavedCount} Paket(e) haben ungespeicherte Aenderungen.
                    </p>
                  ) : null}
                  {liveCartSummary && liveCartSummary.blockingCount > 0 ? (
                    <p className="small" style={{ marginTop: 0, color: "var(--danger)" }}>
                      {liveCartSummary.blockingCount} Paket(e) sind noch unvollstaendig.
                    </p>
                  ) : null}
                  <button className="btn" disabled={!liveCartSummary?.checkoutEligible || loading} onClick={handleCheckout} type="button">
                    Checkout starten
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <p className="muted small" style={{ marginBottom: 0 }}>
            Nach erfolgreicher Passwortprüfung erscheint hier Galerie, Packages und Warenkorb.
          </p>
        </section>
      )}
    </main>
  );
}
