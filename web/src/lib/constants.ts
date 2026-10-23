export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED_FOR_CORRECTION: 'Returned for Correction',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ON_HOLD: 'On Hold',
  UNDER_EVALUATION: 'Under Evaluation',
  APPROVED_FOR_FILING: 'Approved for Filing',
  FILED: 'Filed',
  UNDER_EXAMINATION: 'Under Examination',
  GRANTED: 'Granted',
  CLOSED: 'Closed',
  PENDING: 'Pending',
  IN_REVIEW: 'In Review',
  CANCELLED: 'Cancelled',
  APPLIED: 'Applied',
  INCUBATION: 'Incubation',
  SEED: 'Seed',
  GROWTH: 'Growth',
  GRADUATED: 'Graduated',
  ARCHIVED: 'Archived',
  REQUESTED: 'Requested',
  SUBMITTED_FUNDING: 'Submitted',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  UPCOMING: 'Upcoming',
  OPEN: 'Open',
  CLOSED_OPP: 'Closed',
  COMPLETED_MS: 'Completed',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
};

export const STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  RETURNED_FOR_CORRECTION: 'warning',
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  ON_HOLD: 'warning',
  UNDER_EVALUATION: 'info',
  APPROVED_FOR_FILING: 'violet',
  FILED: 'info',
  UNDER_EXAMINATION: 'violet',
  GRANTED: 'success',
  CLOSED: 'neutral',
  PENDING: 'warning',
  IN_REVIEW: 'info',
  CANCELLED: 'neutral',
  APPLIED: 'neutral',
  INCUBATION: 'info',
  SEED: 'violet',
  GROWTH: 'success',
  GRADUATED: 'success',
  ARCHIVED: 'neutral',
  REQUESTED: 'warning',
  PARTIALLY_RECEIVED: 'info',
  RECEIVED: 'success',
  UPCOMING: 'info',
  OPEN: 'success',
  IN_PROGRESS: 'info',
  BLOCKED: 'danger',
};

export const IPR_TYPE_LABELS: Record<string, string> = {
  PATENT: 'Patent',
  COPYRIGHT: 'Copyright',
  TRADEMARK: 'Trademark',
  OTHER: 'Other',
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  RESEARCH_PROPOSAL: 'Research Proposal',
  RESEARCH_REPORT: 'Research Report',
  IPR_DOCUMENT: 'IPR Document',
  APPROVAL_LETTER: 'Approval Letter',
  FUNDING_DOCUMENT: 'Funding Document',
  STARTUP_DOCUMENT: 'Startup Document',
  PUBLICATION: 'Publication',
  OTHER: 'Other',
};

export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  DEADLINE: 'Upcoming Deadlines',
  OVERDUE: 'Overdue Tasks',
  NEW_APPROVAL: 'New Approval Assignments',
  APPROVAL_DECISION: 'Approval Decisions',
  RETURNED_FOR_CORRECTION: 'Returned for Correction',
  PROJECT_MILESTONE: 'Project Milestones',
  STARTUP_MILESTONE: 'Startup Milestones',
  FUNDING_DEADLINE: 'Funding Deadlines',
  SYSTEM: 'System',
};

export const PRIORITY_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export function label(status?: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function tone(status?: string | null): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet' {
  if (!status) return 'neutral';
  return STATUS_TONES[status] ?? 'neutral';
}
