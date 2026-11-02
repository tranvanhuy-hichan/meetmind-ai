export type Role = "host" | "cohost" | "member";

export type MeetingStatus =
  | "created"
  | "bot_joining"
  | "live"
  | "ended"
  | "processing"
  | "ready"
  | "bot_failed";

export interface User {
  id: string;
  email: string;
  name: string;
}

export type OrgRole = "owner" | "admin" | "member";

export interface OrgSummary {
  id: string;
  name: string;
  role: OrgRole;
  created_at: string | null;
  member_count: number;
}

export interface OrgMemberInfo {
  user_id: string;
  name: string;
  email: string;
  role: OrgRole;
}

export interface OrgPending {
  id: string;
  email: string;
  role: OrgRole;
  created_at: string | null;
}

export interface OrgDetail extends Omit<OrgSummary, "member_count"> {
  members: OrgMemberInfo[];
  pending: OrgPending[];
}

export interface InviteResult {
  added: string[];
  invited: string[];
  skipped: string[];
  email_failed: string[];
}

export type Platform = "meet" | "zoom";

export interface MeetingSummary {
  id: string;
  org_id: string;
  title: string;
  status: MeetingStatus;
  meet_url: string | null;
  platform: Platform;
  invite_code: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  role: Role;
}

export interface Participant {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  display_lang: string | null;
}

export interface DocumentInfo {
  id: string;
  meeting_id: string;
  uploader_id: string;
  name: string;
  mime: string;
  size: number;
  page_count: number;
  allow_download: boolean;
  order_idx: number;
}

export interface Segment {
  id: string;
  meeting_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
  lang: string;
  is_final: boolean;
  source: string;
  translation?: string | null;
}

/** Reading position: page (1-based) plus the fraction of that page above the top edge of the view. */
export interface Position {
  doc_id: string;
  page: number;
  y_ratio: number;
  zoom: number;
}

export interface PresenterRef {
  user_id: string;
  name: string;
}

export interface PresenterState extends PresenterRef {
  position: Position | null;
  seq: number;
}

export interface MeetingDetail {
  meeting: MeetingSummary;
  me: { user_id: string; name: string; role: Role; display_lang: string | null };
  participants: Participant[];
  documents: DocumentInfo[];
  presenter: PresenterState | null;
  online: { user_id: string; name: string }[];
  has_minutes: boolean;
}

export interface Decision {
  text: string;
  evidence_segment_id: string | null;
}

export interface ActionItem {
  task: string;
  owner: string;
  due_date: string;
  evidence_segment_id: string | null;
}

export interface MinutesData {
  summary: string;
  topics: string[];
  decisions: Decision[];
  action_items: ActionItem[];
}

export interface MinutesResponse {
  minutes: MinutesData;
  status: "draft" | "final";
  updated_at: string | null;
}

export interface Language {
  code: string;
  label: string;
}
