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

type LocalDemoEnvKey
	= | 'VITE_LOCAL_DEMO_EMAIL'
		| 'VITE_LOCAL_DEMO_USER_NAME'
		| 'VITE_LOCAL_DEMO_ROLES';

const DEFAULT_LOCAL_DEMO_ROLES: DocumentRoutingRole[] = [
	'user',
	'author',
	'approver',
	'publisher',
	'admin',
];

function env(key: LocalDemoEnvKey): string | undefined {
	try {
		const meta = import.meta as ImportMeta & {
			env?: Partial<Record<LocalDemoEnvKey, string>>;
		};
		const value = meta.env?.[key];
		return typeof value === 'string' && value.trim().length > 0
			? value.trim()
			: undefined;
	}
	catch {
		return undefined;
	}
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
		userName: env('VITE_LOCAL_DEMO_USER_NAME') ?? 'Local Developer',
		email: env('VITE_LOCAL_DEMO_EMAIL') ?? 'developer@example.com',
		roles:
			parseLocalDemoRoles(env('VITE_LOCAL_DEMO_ROLES'))
			?? [...DEFAULT_LOCAL_DEMO_ROLES],
	};
}

/** Primary local demo persona for Vite standalone play and mock seeds. */
export const localDemoUser: LocalDemoUser = resolveLocalDemoUser();
