import type { MeetingStatus, Role } from "./types";

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  created: "Chưa bắt đầu",
  bot_joining: "Đang kết nối bot",
  live: "Đang họp",
  ended: "Đã kết thúc",
  processing: "Đang tạo biên bản",
  ready: "Hoàn tất",
  bot_failed: "Bot không vào được",
};

export const ROLE_LABEL: Record<Role, string> = {
  host: "Chủ trì",
  cohost: "Đồng chủ trì",
  member: "Thành viên",
};

export function canManage(role: Role): boolean {
  return role === "host" || role === "cohost";
}

export function dateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
