import type { ProjectStatus, IprStatus } from '../types/index.js';

/**
 * Explicit workflow state machines. Only the transitions listed here are
 * permitted; anything else is rejected with HTTP 409 by the API.
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['SUBMITTED', 'ON_HOLD'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT', 'ON_HOLD'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'ON_HOLD'],
  RETURNED_FOR_CORRECTION: ['SUBMITTED', 'DRAFT'],
  APPROVED: ['ACTIVE', 'ON_HOLD'],
  ACTIVE: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: ['ACTIVE', 'UNDER_REVIEW', 'COMPLETED'],
  REJECTED: ['DRAFT'],
  COMPLETED: [],
};

export const IPR_TRANSITIONS: Record<IprStatus, IprStatus[]> = {
  DRAFT: ['UNDER_EVALUATION', 'CLOSED'],
  UNDER_EVALUATION: ['APPROVED_FOR_FILING', 'REJECTED', 'CLOSED'],
  APPROVED_FOR_FILING: ['FILED', 'CLOSED'],
  FILED: ['UNDER_EXAMINATION', 'GRANTED', 'REJECTED'],
  UNDER_EXAMINATION: ['GRANTED', 'REJECTED'],
  GRANTED: ['CLOSED'],
  REJECTED: ['CLOSED', 'DRAFT'],
  CLOSED: [],
};

export const APPROVAL_STAGE_ORDER: Record<'PROJECT' | 'IPR' | 'STARTUP', string[]> = {
  PROJECT: ['Departmental Scrutiny', 'Ethics & Compliance Review', 'Funding Assessment', 'Final Approval'],
  IPR: ['IPR Officer Evaluation', 'Technical Review Committee', 'Filing Authorisation'],
  STARTUP: ['Eligibility Screening', 'Incubation Committee Review', 'Mentor Allocation'],
};

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionIpr(from: IprStatus, to: IprStatus): boolean {
  return IPR_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that make a project eligible to spawn an IPR record. */
export const IPR_ELIGIBLE_PROJECT_STATUSES: ProjectStatus[] = ['APPROVED', 'ACTIVE', 'COMPLETED'];

/** Statuses that make a project eligible for startup incubation. */
export const INCUBATION_ELIGIBLE_PROJECT_STATUSES: ProjectStatus[] = ['APPROVED', 'ACTIVE', 'COMPLETED'];

/** Returns the next stage after the given one, or null when at the end. */
export function nextStage(stages: string[], current: string): string | null {
  const idx = stages.indexOf(current);
  if (idx === -1 || idx === stages.length - 1) return null;
  return stages[idx + 1];
}
