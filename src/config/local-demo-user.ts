/**
 * Local DEV demo identity (Vite standalone only).
 * Kept separate from `app.config` so document-type seeds can reference it
 * without an `app.config` ↔ `document-types` import cycle.
 */
import type { DocumentRoutingRole } from '../domain/security-roles.ts';
import { mapDataverseSecurityRoles } from '../domain/security-roles.ts';

export interface LocalDemoUser {
	userName: string;
	email: string;
	/**
	 * Roles for the primary local demo persona (DEV / standalone Vite only).
	 * Override with `VITE_LOCAL_DEMO_ROLES` (comma-separated tokens or Dataverse display names).
	 */
	roles: DocumentRoutingRole[];
}

const DEFAULT_LOCAL_DEMO_ROLES: DocumentRoutingRole[] = [
	'user',
	'author',
	'approver',
	'publisher',
	'admin',
];

/**
 * Vite only inlines `import.meta.env.VITE_*` when those names appear as static
 * property access. Copying `import.meta` into a variable and reading `env[key]`
 * stays empty in the browser bundle, so `.env.local` would never grant admin.
 */
function nonEmptyEnv(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parses `VITE_LOCAL_DEMO_ROLES` into app role tokens; empty/invalid → undefined (use defaults).
 */
export function parseLocalDemoRoles(
	raw: string | undefined,
): DocumentRoutingRole[] | undefined {
	if (!raw?.trim()) {
		return undefined;
	}
	const parts = raw.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
	const mapped = mapDataverseSecurityRoles(parts);
	return mapped.length > 0 ? mapped : undefined;
}

/**
 * Resolves the primary local demo persona from `VITE_LOCAL_DEMO_*` (or defaults).
 */
export function resolveLocalDemoUser(): LocalDemoUser {
	return {
		userName: nonEmptyEnv(import.meta.env?.VITE_LOCAL_DEMO_USER_NAME) ?? 'Local Developer',
		email: nonEmptyEnv(import.meta.env?.VITE_LOCAL_DEMO_EMAIL) ?? 'developer@example.com',
		roles:
			parseLocalDemoRoles(nonEmptyEnv(import.meta.env?.VITE_LOCAL_DEMO_ROLES))
			?? [...DEFAULT_LOCAL_DEMO_ROLES],
	};
}

/** Primary local demo persona for Vite standalone play and mock seeds. */
export const localDemoUser: LocalDemoUser = resolveLocalDemoUser();
