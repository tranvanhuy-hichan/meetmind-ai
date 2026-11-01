import type { ReactNode } from "react";

/** Small line icons (16px), drawn here so the app needs no icon package. */
function Svg({ children, size }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      {children}
    </svg>
  );
}

export const IconDoc = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);
export const IconUpload = () => (
  <Svg>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
  </Svg>
);
export const IconPlus = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconMinus = () => (
  <Svg>
    <path d="M5 12h14" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconTrash = () => (
  <Svg>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconPresent = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="12" rx="1" />
    <path d="M12 16v4M8 20h8" />
  </Svg>
);
export const IconUsers = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.8c2 .6 3.5 2.4 3.5 5.2" />
  </Svg>
);
export const IconVideo = () => (
  <Svg>
    <rect x="3" y="6" width="12" height="12" rx="1.5" />
    <path d="M15 10.5l6-3.5v10l-6-3.5" />
  </Svg>
);
export const IconBot = () => (
  <Svg>
    <rect x="5" y="8" width="14" height="11" rx="2" />
    <path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6" />
  </Svg>
);
export const IconStop = () => (
  <Svg>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Svg>
);
export const IconFile = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
export const IconCheck = () => (
  <Svg>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconCaption = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 11h4M13 11h4M7 15h7" />
  </Svg>
);
export const IconBuilding = () => (
  <Svg>
    <path d="M4 21V5l8-2v18M12 9h8v12M4 21h16M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2" />
  </Svg>
);
export const IconTranslate = () => (
  <Svg>
    <path d="M4 6h9M8.5 4v2M6 6c0 3 2.5 6 6 7M12 6c0 3-3 6-7 7M13 20l4-9 4 9M14.5 17h5" />
  </Svg>
);
export const IconMeetMark = () => (
  <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="8" fill="#c8f169" />
    <path d="M6 17V8l6 6 6-6v9" fill="none" stroke="#1b1633" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One of eight solid colours, stable for a given name. */
export function avatarClass(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `av-${h % 8}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}
