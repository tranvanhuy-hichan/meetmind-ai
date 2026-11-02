import type { ReactNode } from "react";
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
};

interface IconProps {
  size?: number;
  className?: string;
}

export const IconDoc = ({ size = 18, className = "" }: IconProps) => (
  <FileText className={`icon ${className}`.trim()} size={size} />
);
export const IconUpload = ({ size = 18, className = "" }: IconProps) => (
  <Upload className={`icon ${className}`.trim()} size={size} />
);
export const IconDownload = ({ size = 18, className = "" }: IconProps) => (
  <Download className={`icon ${className}`.trim()} size={size} />
);
export const IconPlus = ({ size = 18, className = "" }: IconProps) => (
  <Plus className={`icon ${className}`.trim()} size={size} />
);
export const IconMinus = ({ size = 18, className = "" }: IconProps) => (
  <Minus className={`icon ${className}`.trim()} size={size} />
);
export const IconClose = ({ size = 18, className = "" }: IconProps) => (
  <X className={`icon ${className}`.trim()} size={size} />
);
export const IconTrash = ({ size = 18, className = "" }: IconProps) => (
  <Trash2 className={`icon ${className}`.trim()} size={size} />
);
export const IconPresent = ({ size = 18, className = "" }: IconProps) => (
  <Presentation className={`icon ${className}`.trim()} size={size} />
);
export const IconUsers = ({ size = 18, className = "" }: IconProps) => (
  <Users className={`icon ${className}`.trim()} size={size} />
);
export const IconVideo = ({ size = 18, className = "" }: IconProps) => (
  <Video className={`icon ${className}`.trim()} size={size} />
);
export const IconBot = ({ size = 18, className = "" }: IconProps) => (
  <Bot className={`icon ${className}`.trim()} size={size} />
);
export const IconStop = ({ size = 18, className = "" }: IconProps) => (
  <Square className={`icon ${className}`.trim()} size={size} />
);
export const IconFile = ({ size = 18, className = "" }: IconProps) => (
  <File className={`icon ${className}`.trim()} size={size} />
);
export const IconCheck = ({ size = 18, className = "" }: IconProps) => (
  <Check className={`icon ${className}`.trim()} size={size} />
);
export const IconCaption = ({ size = 18, className = "" }: IconProps) => (
  <Subtitles className={`icon ${className}`.trim()} size={size} />
);
export const IconBuilding = ({ size = 18, className = "" }: IconProps) => (
  <Building2 className={`icon ${className}`.trim()} size={size} />
);
export const IconTranslate = ({ size = 18, className = "" }: IconProps) => (
  <Languages className={`icon ${className}`.trim()} size={size} />
);
export const IconSearch = ({ size = 18, className = "" }: IconProps) => (
  <Search className={`icon ${className}`.trim()} size={size} />
);
export const IconHome = ({ size = 18, className = "" }: IconProps) => (
  <Home className={`icon ${className}`.trim()} size={size} />
);
export const IconSparkles = ({ size = 18, className = "" }: IconProps) => (
  <Sparkles className={`icon ${className}`.trim()} size={size} />
);
export const IconClock = ({ size = 18, className = "" }: IconProps) => (
  <Clock className={`icon ${className}`.trim()} size={size} />
);
export const IconMenu = ({ size = 20, className = "" }: IconProps) => (
  <Menu className={`icon ${className}`.trim()} size={size} />
);
export const IconChevronRight = ({ size = 16, className = "" }: IconProps) => (
  <ChevronRight className={`icon ${className}`.trim()} size={size} />
);
export const IconArrowRight = ({ size = 16, className = "" }: IconProps) => (
  <ArrowRight className={`icon ${className}`.trim()} size={size} />
);

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
