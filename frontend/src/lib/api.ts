import { clearToken, getToken, loginUrl } from "./auth";
import type {
  InviteResult,
  Language,
  MeetingDetail,
  MeetingSummary,
  Platform,
  MinutesData,
  MinutesResponse,
  OrgDetail,
  OrgSummary,
  Segment,
  User,
  DocumentInfo,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  const resp = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!resp.ok) {
    let message = `Lỗi ${resp.status}`;
    try {
      const body = await resp.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = "Dữ liệu nhập chưa hợp lệ";
    } catch {
      /* body was not JSON */
    }
    if (resp.status === 401 && !path.startsWith("/api/auth/")) {
      clearToken();
      if (typeof window !== "undefined") window.location.href = loginUrl();
    }
    throw new ApiError(resp.status, message);
  }
  return resp;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await raw(path, init)).json() as Promise<T>;
}

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export interface AppConfig {
  demo: boolean;
  google_client_id: string | null;
  email_code: boolean;
  meet_rooms: boolean;
  zoom_rooms: boolean;
}

/** Which platforms MeetMind can create a room on by itself. */
export type Rooms = Record<Platform, boolean>;
export const NO_ROOMS: Rooms = { meet: false, zoom: false };

export interface Session {
  token: string;
  user: User;
}

export const api = {
  requestCode: (email: string) =>
    json<{ sent: boolean; dev_code: string | null }>("/api/auth/request-code", { method: "POST", ...body({ email }) }),
  verifyCode: (email: string, code: string, name: string | null) =>
    json<Session>("/api/auth/verify", { method: "POST", ...body({ email, code, name }) }),
  me: () => json<User>("/api/me"),
  updateMe: (name: string) => json<User>("/api/me", { method: "PATCH", ...body({ name }) }),

  listOrgs: () => json<OrgSummary[]>("/api/orgs"),
  createOrg: (name: string) => json<OrgSummary>("/api/orgs", { method: "POST", ...body({ name }) }),
  renameOrg: (id: string, name: string) => json<{ id: string; name: string }>(`/api/orgs/${id}`, { method: "PATCH", ...body({ name }) }),
  getOrg: (id: string) => json<OrgDetail>(`/api/orgs/${id}`),
  inviteToOrg: (id: string, emails: string[], role: string) =>
    json<InviteResult>(`/api/orgs/${id}/invitations`, { method: "POST", ...body({ emails, role }) }),
  revokeOrgInvite: (id: string, invitationId: string) => raw(`/api/orgs/${id}/invitations/${invitationId}`, { method: "DELETE" }),
  setOrgRole: (id: string, userId: string, role: string) =>
    json(`/api/orgs/${id}/members/${userId}`, { method: "PUT", ...body({ role }) }),
  removeOrgMember: (id: string, userId: string) => raw(`/api/orgs/${id}/members/${userId}`, { method: "DELETE" }),
  languages: () => json<Language[]>("/api/languages"),
  config: () => json<AppConfig>("/api/config"),
  googleLogin: (credential: string) => json<Session>("/api/auth/google", { method: "POST", ...body({ credential }) }),

  listMeetings: () => json<MeetingSummary[]>("/api/meetings"),
  createMeeting: (org_id: string, title: string, meet_url: string | null, scheduled_at: string | null, platform: Platform = "meet") =>
    json<MeetingSummary>("/api/meetings", { method: "POST", ...body({ org_id, title, meet_url, scheduled_at, platform }) }),
  inviteToMeeting: (id: string, emails: string[]) =>
    json<InviteResult>(`/api/meetings/${id}/invitations`, { method: "POST", ...body({ emails }) }),
  joinMeeting: (invite_code: string) =>
    json<MeetingSummary>("/api/meetings/join", { method: "POST", ...body({ invite_code }) }),
  getMeeting: (id: string) => json<MeetingDetail>(`/api/meetings/${id}`),
  zoomSdk: (id: string) =>
    json<{ sdk_key: string; signature: string; meeting_number: string; password: string; user_name: string }>(`/api/meetings/${id}/zoom-sdk`),
  setMeetUrl: (id: string, meet_url: string | null) =>
    json<MeetingSummary>(`/api/meetings/${id}`, { method: "PATCH", ...body({ meet_url }) }),
  createMeetRoom: (id: string) => json<{ authorize_url: string }>(`/api/meetings/${id}/meet-room`, { method: "POST" }),
  startMeeting: (id: string) => json(`/api/meetings/${id}/start`, { method: "POST" }),
  endMeeting: (id: string) => json(`/api/meetings/${id}/end`, { method: "POST" }),
  setRole: (id: string, userId: string, role: string) =>
    json(`/api/meetings/${id}/participants/${userId}`, { method: "PUT", ...body({ role }) }),

  uploadDocument: async (meetingId: string, file: File): Promise<DocumentInfo> => {
    const form = new FormData();
    form.append("file", file);
    return json<DocumentInfo>(`/api/meetings/${meetingId}/documents`, { method: "POST", body: form });
  },
  setAllowDownload: (docId: string, allow_download: boolean) =>
    json<DocumentInfo>(`/api/documents/${docId}`, { method: "PATCH", ...body({ allow_download }) }),
  deleteDocument: (docId: string) => raw(`/api/documents/${docId}`, { method: "DELETE" }),
  fetchPdf: async (docId: string): Promise<ArrayBuffer> => (await raw(`/api/documents/${docId}/file`)).arrayBuffer(),
  downloadOriginal: async (docId: string, name: string) => saveBlob(await (await raw(`/api/documents/${docId}/download`)).blob(), name),

  transcript: (id: string, lang: string | null) =>
    json<{ lang: string | null; segments: Segment[] }>(
      `/api/meetings/${id}/transcript${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`,
    ),
  translateTranscript: (id: string, lang: string) =>
    json(`/api/meetings/${id}/transcript/translate?lang=${encodeURIComponent(lang)}`, { method: "POST" }),

  getMinutes: (id: string) => json<MinutesResponse | null>(`/api/meetings/${id}/minutes`),
  generateMinutes: (id: string) => json<MinutesResponse>(`/api/meetings/${id}/minutes/generate`, { method: "POST" }),
  saveMinutes: (id: string, minutes: MinutesData, status: "draft" | "final") =>
    json<MinutesResponse>(`/api/meetings/${id}/minutes`, { method: "PUT", ...body({ minutes, status }) }),
  exportMinutes: async (id: string, format: "docx" | "md", title: string) =>
    saveBlob(await (await raw(`/api/meetings/${id}/minutes/export?format=${format}`)).blob(), `Bien-ban-${title}.${format}`),
};

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function socketUrl(meetingId: string, token: string): string {
  return `${API_BASE.replace(/^http/, "ws")}/ws/meetings/${meetingId}?token=${encodeURIComponent(token)}`;
}
