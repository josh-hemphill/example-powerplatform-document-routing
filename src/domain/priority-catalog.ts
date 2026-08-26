/**
 * Priority catalog rules shared by mock, form-rules, and Admin.
 * Catalog rows live in control data; this module only encodes enforcement.
 */

export const MISSION_CRITICAL_REASON_MIN_LENGTH = 20;
export const DEFAULT_PRIORITY_KEY = 'normal';

export type PriorityColorToken = 'default' | 'info' | 'warning' | 'error';

export interface PriorityLevelRecord {
	id?: string;
	key: string;
	label: string;
	rank: number;
	color: PriorityColorToken;
	requiresReason: boolean;
	minReasonLength: number;
	reasonHint: string;
	active: boolean;
	slaHoursMultiplier: number | null;
}

/**
 * Validates a selected priority key + optional reason against the catalog.
 * Returns a stable API error code, or null when valid.
 */
export function validatePrioritySelection(
	key: string | null | undefined,
	reason: string | null | undefined,
	catalog: readonly PriorityLevelRecord[],
): { code: 'unknown_priority' | 'priority_reason_required'; message: string } | null {
	const trimmedKey = (key ?? DEFAULT_PRIORITY_KEY).trim();
	const row = catalog.find((item) => item.key === trimmedKey);
	if (!row || !row.active) {
		return {
			code: 'unknown_priority',
			message: `Unknown or inactive priority: ${trimmedKey}`,
		};
	}
	if (!row.requiresReason) {
		return null;
	}
	const minLength = Math.max(1, row.minReasonLength || MISSION_CRITICAL_REASON_MIN_LENGTH);
	if ((reason ?? '').trim().length < minLength) {
		return {
			code: 'priority_reason_required',
			message:
				row.reasonHint?.trim()
				|| `Priority “${row.label}” requires a reason of at least ${minLength} characters`,
		};
	}
	return null;
}

/**
 * Looks up an active catalog row by key.
 */
export function findActivePriority(
	key: string | null | undefined,
	catalog: readonly PriorityLevelRecord[],
): PriorityLevelRecord | undefined {
	const trimmed = (key ?? '').trim();
	return catalog.find((item) => item.key === trimmed && item.active);
}
