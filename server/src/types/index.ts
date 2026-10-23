export const ROLES = [
  'ADMINISTRATOR',
  'RESEARCHER',
  'IPR_OFFICER',
  'APPROVAL_MEMBER',
  'INCUBATION_MANAGER',
  'MENTOR',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: 'Administrator',
  RESEARCHER: 'Researcher',
  IPR_OFFICER: 'IPR Officer',
  APPROVAL_MEMBER: 'Approval Committee Member',
  INCUBATION_MANAGER: 'Incubation Manager',
  MENTOR: 'Mentor',
};

export const PROJECT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_CORRECTION',
  'ACTIVE',
  'COMPLETED',
  'ON_HOLD',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const IPR_STATUSES = [
  'DRAFT',
  'UNDER_EVALUATION',
  'APPROVED_FOR_FILING',
  'FILED',
  'UNDER_EXAMINATION',
  'GRANTED',
  'REJECTED',
  'CLOSED',
] as const;
export type IprStatus = (typeof IPR_STATUSES)[number];

export const IPR_TYPES = ['PATENT', 'COPYRIGHT', 'TRADEMARK', 'OTHER'] as const;
export type IprType = (typeof IPR_TYPES)[number];

export const APPROVAL_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_CORRECTION',
  'CANCELLED',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STARTUP_STAGES = [
  'APPLIED',
  'UNDER_REVIEW',
  'INCUBATION',
  'SEED',
  'GROWTH',
  'GRADUATED',
  'REJECTED',
] as const;
export type StartupStage = (typeof STARTUP_STAGES)[number];

export const DOCUMENT_CATEGORIES = [
  'RESEARCH_PROPOSAL',
  'RESEARCH_REPORT',
  'IPR_DOCUMENT',
  'APPROVAL_LETTER',
  'FUNDING_DOCUMENT',
  'STARTUP_DOCUMENT',
  'PUBLICATION',
  'OTHER',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const NOTIFICATION_CATEGORIES = [
  'DEADLINE',
  'OVERDUE',
  'NEW_APPROVAL',
  'APPROVAL_DECISION',
  'RETURNED_FOR_CORRECTION',
  'PROJECT_MILESTONE',
  'STARTUP_MILESTONE',
  'FUNDING_DEADLINE',
  'SYSTEM',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface SessionUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  department_id: number | null;
  department_name: string | null;
  designation: string | null;
  status: string;
}

export interface AuthedRequest {
  user?: SessionUser;
}
