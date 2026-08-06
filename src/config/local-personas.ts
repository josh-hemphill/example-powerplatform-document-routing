/**
 * Local demo personas shared by the identity switcher and mock principal directory.
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
 * Only the local developer persona includes Admin.
 */
export const LOCAL_DEMO_PERSONAS: LocalDemoPersona[] = [
	{
		label: 'Local developer (Admin)',
		email: appConfig.localDemoUser.email,
		userName: appConfig.localDemoUser.userName,
		roles: ['user', 'author', 'approver', 'publisher', 'admin'],
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
];

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
