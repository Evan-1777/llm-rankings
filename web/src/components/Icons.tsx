import type { ReactNode } from "react";

const icons = {
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  edit: <path d="M3 13l.6-2.8 7.8-7.8 2.2 2.2-7.8 7.8L3 13zM9.8 4l2.2 2.2" />,
  note: <path d="M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3" />,
  trash: <path d="M3 4.5h10M6 4.5V2.5h4v2M4.5 4.5l.7 9h5.6l.7-9M6.5 7v4M9.5 7v4" />,
  archive: <path d="M2.5 4.5h11v2.5h-11zM3.5 7v6.5h9V7M6.5 9.5h3" />,
  restore: <path d="M3 6.5a5 5 0 1 1 .7 5.2M3 2.5v4h4" />,
  compare: <path d="M2 3.5h12M5.5 3.5v9M10.5 3.5v9M2 12.5h12" />,
  download: <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />,
  lock: <path d="M3.5 6.5h9v7h-9zM5.5 6.5V4.8a2.5 2.5 0 0 1 5 0v1.7" />,
  arrowUp: <path d="M8 13V3M4 7l4-4 4 4" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  arrowRight: <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />,
  arrowLeft: <path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5" />,
  check: <path d="m2.5 8.5 3.5 3 7.5-7.5" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.9 3.9l1 1M11.1 11.1l1 1M12.1 3.9l-1 1M4.9 11.1l-1 1" />
    </>
  ),
  logout: <path d="M6 3H3v10h3M9.5 5.5 12 8l-2.5 2.5M5.5 8H12" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}
