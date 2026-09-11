/**
 * Local demo personas shared by the identity switcher and mock principal directory.
 * DEV / standalone only — hosted production uses Dataverse security roles.
 */
import type { DocumentRoutingRole } from '../domain/security-roles.ts';
import { appConfig } from './app.config.ts';

export interface LocalDemoPersona {
	label: string;
	email: string;
	userName: string;
	roles: DocumentRoutingRole[];
}

/**
 * DEV/standalone personas for collaborative draft / approval demos.
 * The primary persona uses `appConfig.localDemoUser` (email / name / roles),
 * overridable via `VITE_LOCAL_DEMO_*` in `.env.local`.
 */
export const LOCAL_DEMO_PERSONAS: LocalDemoPersona[] = [
	{
		label: appConfig.localDemoUser.roles.includes('admin')
			? 'Local developer (Admin)'
			: 'Local developer',
		email: appConfig.localDemoUser.email,
		userName: appConfig.localDemoUser.userName,
		roles: [...appConfig.localDemoUser.roles],
	},
	{
		label: 'Jordan Legal (pool)',
		email: 'jordan.legal@contoso.com',
		userName: 'Jordan Legal',
		roles: ['user', 'approver'],
	},
	{
		label: 'Alex Requester',
		email: 'alex.requester@contoso.com',
		userName: 'Alex Requester',
		roles: ['user'],
	},
	{
		label: 'Casey Author',
		email: 'casey.author@contoso.com',
		userName: 'Casey Author',
		roles: ['user', 'author'],
	},
	{
		label: 'Sam Compliance (named)',
		email: 'sam.compliance@contoso.com',
		userName: 'Sam Compliance',
		roles: ['user', 'approver'],
	},
	{
		label: 'Lee Eng Manager (named)',
		email: 'lee.engmgr@contoso.com',
		userName: 'Lee Engineering',
		roles: ['user', 'approver'],
	},
	{
		label: 'Quinn Lead (pool)',
		email: 'quinn.lead@contoso.com',
		userName: 'Quinn Lead',
		roles: ['user', 'approver'],
	},
];

/**
 * True when `email` matches a local demo persona (case-insensitive).
 * Used so DEV Local Play can grant `.env.local` admin roles to the host UPN.
 */
export function isKnownLocalDemoEmail(email: string | null | undefined): boolean {
	const normalized = email?.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	return LOCAL_DEMO_PERSONAS.some(
		(persona) => persona.email.toLowerCase() === normalized,
	);
}

/**
 * Persona switcher rows: demo directory plus the hosted UPN when it is not already listed.
 */
export function demoPersonaSwitcherItems(host?: {
	email?: string;
	userName?: string;
	roles?: readonly DocumentRoutingRole[];
}): LocalDemoPersona[] {
	const hostEmail = host?.email?.trim();
	if (!hostEmail || isKnownLocalDemoEmail(hostEmail)) {
		return [...LOCAL_DEMO_PERSONAS];
	}
	const hostName = host?.userName?.trim() || hostEmail;
	const hostRoles = host?.roles?.length ? [...host.roles] : (['user'] as const);
	return [
		{
			label: `${hostName} (host)`,
			email: hostEmail,
			userName: hostName,
			roles: [...hostRoles],
		},
		...LOCAL_DEMO_PERSONAS,
	];
}

/**
 * Resolves mock/server-side roles for an actor email (ignores client role headers).
 * Unknown emails receive user-only — least privilege until Dataverse mapping exists.
 */
export function resolvePrincipalRolesByEmail(
	email: string,
): DocumentRoutingRole[] {
	const lower = email.trim().toLowerCase();
	if (!lower) {
		return ['user'];
	}
	const persona = LOCAL_DEMO_PERSONAS.find(
		(item) => item.email.toLowerCase() === lower,
	);
	if (persona) {
		return [...persona.roles];
	}
	return ['user'];
}
