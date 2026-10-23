import type { Role, SessionUser } from '../types/index.js';

/**
 * Central permission matrix. Every guarded route calls these helpers so that
 * authorization is enforced server-side (the UI only hides controls as a
 * convenience — it is never the security boundary).
 */
export type Permission =
  | 'project.create'
  | 'project.update.any'
  | 'project.update.own'
  | 'project.update.status'
  | 'project.delete'
  | 'ipr.create'
  | 'ipr.update.any'
  | 'ipr.update.assigned'
  | 'approval.review'
  | 'approval.view.all'
  | 'startup.manage'
  | 'startup.register'
  | 'mentor.manage'
  | 'mentor.update.own'
  | 'funding.manage'
  | 'funding.apply'
  | 'document.upload'
  | 'document.delete.any'
  | 'document.delete.own'
  | 'analytics.view'
  | 'users.manage'
  | 'settings.manage'
  | 'departments.manage';

const MATRIX: Record<Role, Permission[]> = {
  ADMINISTRATOR: [
    'project.create', 'project.update.any', 'project.update.own', 'project.update.status',
    'project.delete', 'ipr.create', 'ipr.update.any', 'ipr.update.assigned',
    'approval.review', 'approval.view.all', 'startup.manage', 'startup.register',
    'mentor.manage', 'mentor.update.own', 'funding.manage', 'funding.apply',
    'document.upload', 'document.delete.any', 'document.delete.own',
    'analytics.view', 'users.manage', 'settings.manage', 'departments.manage',
  ],
  RESEARCHER: [
    'project.create', 'project.update.own', 'project.update.status',
    'ipr.create', 'funding.apply', 'document.upload', 'document.delete.own',
    'analytics.view',
  ],
  IPR_OFFICER: [
    'project.update.own', 'ipr.create', 'ipr.update.assigned',
    'document.upload', 'document.delete.own', 'analytics.view',
  ],
  APPROVAL_MEMBER: ['approval.review', 'document.upload', 'analytics.view'],
  INCUBATION_MANAGER: [
    'startup.manage', 'startup.register', 'mentor.manage', 'mentor.update.own',
    'funding.apply', 'document.upload', 'document.delete.own', 'analytics.view',
  ],
  MENTOR: ['mentor.update.own', 'document.upload', 'document.delete.own'],
};

export function can(user: { role: Role } | undefined | null, permission: Permission): boolean {
  if (!user) return false;
  return MATRIX[user.role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

/** Modules each role is allowed to see in the sidebar / router. */
export const NAV_BY_ROLE: Record<Role, string[]> = {
  ADMINISTRATOR: [
    'dashboard', 'projects', 'ipr', 'approvals', 'startups', 'mentors',
    'funding', 'documents', 'analytics', 'notifications', 'users', 'settings',
  ],
  RESEARCHER: [
    'dashboard', 'projects', 'ipr', 'approvals', 'startups', 'funding',
    'documents', 'analytics', 'notifications', 'settings',
  ],
  IPR_OFFICER: [
    'dashboard', 'projects', 'ipr', 'approvals', 'documents',
    'analytics', 'notifications', 'settings',
  ],
  APPROVAL_MEMBER: [
    'dashboard', 'approvals', 'documents', 'analytics', 'notifications', 'settings',
  ],
  INCUBATION_MANAGER: [
    'dashboard', 'projects', 'startups', 'mentors', 'funding',
    'documents', 'analytics', 'notifications', 'settings',
  ],
  MENTOR: ['dashboard', 'startups', 'documents', 'notifications', 'settings'],
};

export function canAccessModule(user: SessionUser | undefined | null, module: string): boolean {
  if (!user) return false;
  return NAV_BY_ROLE[user.role]?.includes(module) ?? false;
}

/** A researcher may edit a project they own or are a team member on. */
export function ownsProject(
  user: SessionUser,
  project: { principal_investigator_id: number; created_by: number },
  teamMemberUserIds: number[] = [],
): boolean {
  return (
    project.principal_investigator_id === user.id ||
    project.created_by === user.id ||
    teamMemberUserIds.includes(user.id)
  );
}
