import type { CSSProperties, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import {
  FileText,
  Upload,
  Download,
  Plus,
  Minus,
  X,
  Trash2,
  Presentation,
  Users,
  Video,
  Bot,
  Square,
  File,
  Check,
  Subtitles,
  Building2,
  Languages,
  Search,
  Home,
  Sparkles,
  Clock,
  Menu,
  ChevronRight,
  ArrowRight,
  Mail,
  Inbox,
  Copy,
  ExternalLink,
  Pencil,
} from "lucide-react";

export {
  FileText,
  Upload,
  Download,
  Plus,
  Minus,
  X,
  Trash2,
  Presentation,
  Users,
  Video,
  Bot,
  Square,
  File,
  Check,
  Subtitles,
  Building2,
  Languages,
  Search,
  Home,
  Sparkles,
  Clock,
  Menu,
  ChevronRight,
  ArrowRight,
  Mail,
  Inbox,
};

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const wrapIcon = (Component: React.ComponentType<LucideProps>, defaultSize = 18) => {
  const IconComp = ({ size = defaultSize, className = "", style, ...props }: IconProps) => (
    <Component className={`icon ${className}`.trim()} size={size} style={style} {...props} />
  );
  IconComp.displayName = `Icon(${Component.displayName || Component.name || "Lucide"})`;
  return IconComp;
};

export const IconDoc = wrapIcon(FileText);
export const IconUpload = wrapIcon(Upload);
export const IconDownload = wrapIcon(Download);
export const IconPlus = wrapIcon(Plus);
export const IconMinus = wrapIcon(Minus);
export const IconClose = wrapIcon(X);
export const IconTrash = wrapIcon(Trash2);
export const IconPresent = wrapIcon(Presentation);
export const IconUsers = wrapIcon(Users);
export const IconVideo = wrapIcon(Video);
export const IconBot = wrapIcon(Bot);
export const IconStop = wrapIcon(Square);
export const IconFile = wrapIcon(File);
export const IconCheck = wrapIcon(Check);
export const IconCaption = wrapIcon(Subtitles);
export const IconBuilding = wrapIcon(Building2);
export const IconTranslate = wrapIcon(Languages);
export const IconSearch = wrapIcon(Search);
export const IconHome = wrapIcon(Home);
export const IconSparkles = wrapIcon(Sparkles);
export const IconClock = wrapIcon(Clock);
export const IconMenu = wrapIcon(Menu, 20);
export const IconChevronRight = wrapIcon(ChevronRight, 16);
export const IconArrowRight = wrapIcon(ArrowRight, 16);
export const IconMail = wrapIcon(Mail);
export const IconInbox = wrapIcon(Inbox);
export const IconCopy = wrapIcon(Copy);
export const IconExternal = wrapIcon(ExternalLink);
export const IconEdit = wrapIcon(Pencil);

export const IconMeetMark = () => (
  <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="8" fill="#c8f169" />
    <path
      d="M6 17V8l6 6 6-6v9"
      fill="none"
      stroke="#1b1633"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

/** Three bars that dance while somebody is speaking. */
export const Equalizer = () => (
  <span className="eq" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);
