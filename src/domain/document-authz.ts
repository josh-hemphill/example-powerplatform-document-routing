/**
 * Privileged document actions beyond basic list/get access.
 */
import type { AccessibleDocument } from './document-access.ts';
import { canActorAccessDocument } from './document-access.ts';

/** Well-known Flow/service principal used in mock history for SLA elevation. */
export const SLA_SERVICE_ACTOR_EMAIL = 'system@sla-processor';

/**
 * True when the actor may publish: Publisher or Admin role plus case access.
 */
export function canActorPublishDocument(
	document: AccessibleDocument,
	actorEmail: string,
	roles: readonly string[],
): boolean {
	const normalized = roles.map((role) => role.trim().toLowerCase()).filter(Boolean);
	const hasPublishRole
		= normalized.includes('publisher') || normalized.includes('admin');
	if (!hasPublishRole) {
		return false;
	}
	return canActorAccessDocument(document, actorEmail);
}

/**
 * True when the actor may run SLA processing (Admin, service role, or Flow UPN).
 */
export function canActorProcessSla(
	roles: readonly string[],
	actorEmail: string,
): boolean {
	const normalized = roles.map((role) => role.trim().toLowerCase()).filter(Boolean);
	if (normalized.includes('admin') || normalized.includes('service')) {
		return true;
	}
	return actorEmail.trim().toLowerCase() === SLA_SERVICE_ACTOR_EMAIL;
}
