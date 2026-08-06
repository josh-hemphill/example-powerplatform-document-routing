/**
 * Maps Dataverse security role names to app role tokens used for UI + mock gating.
 */

/** App role tokens (UI + mock headers). Enforcement is Dataverse / service identity when hosted. */
export type DocumentRoutingRole
	= | 'user'
		| 'author'
		| 'approver'
		| 'publisher'
		| 'admin';

/** Canonical Dataverse role display names (see deploy/SECURITY_ROLES.md). */
export const DATAVERSE_SECURITY_ROLE_NAMES = {
	user: 'Document Routing User',
	author: 'Document Routing Author',
	approver: 'Document Routing Approver',
	publisher: 'Document Routing Publisher',
	admin: 'Document Routing Admin',
} as const;

const NORMALIZED_ROLE_ALIASES: Record<string, DocumentRoutingRole> = {
	'user': 'user',
	'author': 'author',
	'approver': 'approver',
	'publisher': 'publisher',
	'admin': 'admin',
	'document routing user': 'user',
	'document routing author': 'author',
	'document routing approver': 'approver',
	'document routing publisher': 'publisher',
	'document routing admin': 'admin',
};

const ROLE_PRIORITY: DocumentRoutingRole[] = [
	'user',
	'author',
	'approver',
	'publisher',
	'admin',
];

/**
 * Maps Dataverse (or mock) security role names to Document Routing role tokens.
 * Unknown names are ignored. Includes `user` whenever any recognized role is present.
 */
export function mapDataverseSecurityRoles(
	roleNames: readonly string[],
): DocumentRoutingRole[] {
	const found = new Set<DocumentRoutingRole>();
	for (const raw of roleNames) {
		const key = raw.trim().toLowerCase();
		if (!key) {
			continue;
		}
		const mapped = NORMALIZED_ROLE_ALIASES[key];
		if (mapped) {
			found.add(mapped);
		}
	}
	if (found.size === 0) {
		return [];
	}
	found.add('user');
	return ROLE_PRIORITY.filter((role) => found.has(role));
}

/**
 * Default roles for a hosted principal before Dataverse role resolution completes.
 * Never includes publisher, approver, or admin.
 */
export function defaultHostedRoles(): DocumentRoutingRole[] {
	return ['user'];
}

/**
 * Resolves effective hosted roles from optional Dataverse role names.
 * Empty / unresolved input yields {@link defaultHostedRoles}.
 */
export function resolveHostedRoles(
	roleNames: readonly string[] | undefined | null,
): DocumentRoutingRole[] {
	if (!roleNames?.length) {
		return defaultHostedRoles();
	}
	const mapped = mapDataverseSecurityRoles(roleNames);
	return mapped.length > 0 ? mapped : defaultHostedRoles();
}
