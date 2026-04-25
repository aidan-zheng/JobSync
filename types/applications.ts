export type ApplicationStatus =
  | "draft"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted";

export type LocationType = "remote" | "hybrid" | "on_site";
export type SalaryType =
  | "hourly"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";

export type Confidence = "high" | "medium" | "low";

export function parseConfidenceNum(c: Confidence | string | null | undefined): number {
  if (c === "high") return 3;
  if (c === "low") return 1;
  return 2;
}

export function parseConfidenceString(n: number | null | undefined): Confidence {
  if (n === 3) return "high";
  if (n === 1) return "low";
  return "medium";
}

export interface Application {
  id: number;
  application_id: number;
  updated_at: string;
  company_name: string;
  job_title: string;
  compensation_amount: number | null;
  salary_type: SalaryType | null;
  notes: string | null;
  location_type: LocationType | null;
  location: string | null;
  date_applied: string;
  contact_person: string | null;
  status: ApplicationStatus;
}

export interface ApplicationEmail {
  id: string;
  link_id: number;
  application_id: string;
  subject: string;
  sender: string;
  received_date: string;
  confidence: Confidence;
  linked: boolean;
}

export interface FullEmail {
  id: number;
  user_id: string;
  from_email: string | null;
  subject: string | null;
  body: string | null;
  received_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  created_at: string | null;
}

export type SourceType = "scrape" | "email" | "manual";

export type ApplicationFieldName =
  | "compensation_amount"
  | "salary_type"
  | "salary_per_hour"
  | "salary_yearly"
  | "location_type"
  | "location"
  | "contact_person"
  | "status"
  | "date_applied"
  | "notes";

export interface ApplicationFieldEvent {
  id: number;
  application_id: number;
  source_type: SourceType | null;
  email_id: number | null;
  field_name: ApplicationFieldName;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_location_type: LocationType | null;
  value_status: ApplicationStatus | null;
  event_time: string;
  confidence: number | null;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  application_id: string;
  event_type: "scraped" | "email_update" | "manual_update" | "status_change";
  description: string;
  field_label: string | null;
  value_label: string | null;
  detail: string | null;
  confidence: Confidence | null;
  link_url: string | null;
  link_label: string | null;
  created_at: string;
  email_id: number | null;
  email_subject: string | null;
  email_sender: string | null;
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

const STATUS_COLOR = "#404040";
export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: STATUS_COLOR,
  applied: STATUS_COLOR,
  interviewing: STATUS_COLOR,
  offer: STATUS_COLOR,
  rejected: STATUS_COLOR,
  withdrawn: STATUS_COLOR,
  ghosted: STATUS_COLOR,
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-Site",
};

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  hourly: "Hourly",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
