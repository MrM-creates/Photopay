"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import type { MouseEventHandler } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import UiIcon from "@/app/components/UiIcon";

export default function AdminDropdown({
  active = false,
  variant = "landing",
  onLinkClick,
}: {
  active?: boolean;
  variant?: "landing" | "wizard";
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const updatePanelPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 220;
    const viewportPadding = 10;
    const nextLeft = Math.min(
      Math.max(viewportPadding, rect.right - panelWidth),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const nextTop = rect.bottom + 8;
    setPanelStyle({
      top: nextTop,
      left: nextLeft,
      minWidth: Math.max(180, Math.floor(rect.width)),
    });
  }, []);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  const triggerClass =
    variant === "wizard"
      ? `wizard-step wizard-step-open wizard-step-link ${active ? "wizard-step-active" : ""}`
      : `landing-menu-link ${active ? "landing-menu-link-active" : ""}`;

  return (
    <div
      className={`landing-menu-dropdown ${variant === "wizard" ? "landing-menu-dropdown-wizard" : ""} ${open ? "landing-menu-dropdown-open" : ""}`}
      ref={containerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${triggerClass} landing-menu-trigger`}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <UiIcon name="admin" /> Admin
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              className="landing-menu-dropdown-panel"
              ref={panelRef}
              role="menu"
              style={{
                display: "grid",
                position: "fixed",
                top: panelStyle.top,
                left: panelStyle.left,
                minWidth: panelStyle.minWidth,
                zIndex: 5000,
              }}
            >
              <Link
                className="landing-menu-dropdown-item"
                href="/settings/packages"
                onClick={(event) => {
                  onLinkClick?.(event);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <UiIcon name="packages" /> Pakete
              </Link>
              <Link
                className="landing-menu-dropdown-item"
                href="/settings/customers"
                onClick={(event) => {
                  onLinkClick?.(event);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <UiIcon name="customers" /> Kunden
              </Link>
              <Link
                className="landing-menu-dropdown-item"
                href="/settings/mailtexts"
                onClick={(event) => {
                  onLinkClick?.(event);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <UiIcon name="mailtexts" /> Mailtexte
              </Link>
              <Link
                className="landing-menu-dropdown-item"
                href="/settings/photographer"
                onClick={(event) => {
                  onLinkClick?.(event);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <UiIcon name="profile" /> Fotograf-Daten
              </Link>
              <Link
                className="landing-menu-dropdown-item"
                href="/settings/email"
                onClick={(event) => {
                  onLinkClick?.(event);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <UiIcon name="emailsetup" /> E-Mail einrichten
              </Link>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
