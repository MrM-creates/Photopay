import type { SVGProps } from "react";

export type UiIconName =
  | "home"
  | "project"
  | "images"
  | "gallery"
  | "summary"
  | "admin"
  | "packages"
  | "customers"
  | "mailtexts";

function iconPath(name: UiIconName) {
  switch (name) {
    case "home":
      return (
        <>
          <path d="M3.5 10.5L12 3l8.5 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-6h5v6" />
        </>
      );
    case "project":
      return (
        <>
          <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
        </>
      );
    case "images":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M7 15l3-3 3 3 4-4 3.5 3.5" />
          <circle cx="9" cy="9" r="1.2" />
        </>
      );
    case "gallery":
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.2" />
          <rect x="13" y="4" width="7" height="7" rx="1.2" />
          <rect x="4" y="13" width="7" height="7" rx="1.2" />
          <rect x="13" y="13" width="7" height="7" rx="1.2" />
        </>
      );
    case "summary":
      return (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </>
      );
    case "admin":
      return (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 14.2a1 1 0 0 0 .2-1.1l-1-1.7 1-1.7a1 1 0 0 0-.2-1.1l-1.1-1.1a1 1 0 0 0-1.1-.2l-1.7 1-1.7-1a1 1 0 0 0-1.1.2L9.6 6a1 1 0 0 0-.2 1.1l1 1.7-1 1.7a1 1 0 0 0 .2 1.1l1.1 1.1a1 1 0 0 0 1.1.2l1.7-1 1.7 1a1 1 0 0 0 1.1-.2Z" />
        </>
      );
    case "packages":
      return (
        <>
          <path d="M4.5 8.5 12 4l7.5 4.5V17L12 21l-7.5-4Z" />
          <path d="M12 4v17" />
          <path d="M4.5 8.5 12 13l7.5-4.5" />
        </>
      );
    case "customers":
      return (
        <>
          <circle cx="9" cy="9" r="2.7" />
          <path d="M4.8 18.5c.9-2.3 2.6-3.5 4.2-3.5s3.3 1.2 4.2 3.5" />
          <circle cx="16.8" cy="10" r="2.1" />
          <path d="M14.5 18.5c.6-1.8 1.8-2.8 3.1-2.8 1 0 2 .6 2.8 1.8" />
        </>
      );
    case "mailtexts":
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="M4.5 7l7.5 6 7.5-6" />
        </>
      );
    default:
      return null;
  }
}

export default function UiIcon({ name, className, ...props }: { name: UiIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `ui-icon ${className}` : "ui-icon"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {iconPath(name)}
    </svg>
  );
}
