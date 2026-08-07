/**
 * Helpers for Admin structured chain/member editors and JSON escape hatches.
 */
import type { Approver, ControlChainStep } from '@/client/types.gen';

/**
 * Creates a blank named approval step at the given order.
 */
export function createEmptyChainStep(order: number): ControlChainStep {
	return {
		order,
		assignmentMode: 'named',
		role: 'Approver',
		slaHours: 24,
		assignee: { email: '', displayName: '' },
	};
}

/**
 * Reassigns contiguous 1..n order after insert/remove/reorder.
 */
export function normalizeChainOrders(steps: ControlChainStep[]): ControlChainStep[] {
	return steps.map((step, index) => ({
		...step,
		order: index + 1,
	}));
}

/**
 * Moves a step up or down and re-normalizes order.
 */
export function moveChainStep(
	steps: ControlChainStep[],
	index: number,
	direction: -1 | 1,
): ControlChainStep[] {
	const target = index + direction;
	if (target < 0 || target >= steps.length) {
		return steps;
	}
	const next = [...steps];
	const [item] = next.splice(index, 1);
	next.splice(target, 0, item);
	return normalizeChainOrders(next);
}

export type ParseResult<T>
	= | { ok: true; value: T }
		| { ok: false; error: string };

/**
 * Parses approval-chain JSON from the expert escape hatch.
 */
export function parseChainJson(raw: string): ParseResult<ControlChainStep[]> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return { ok: false, error: 'Approval chain JSON must be an array' };
		}
		return { ok: true, value: normalizeChainOrders(parsed as ControlChainStep[]) };
	}
	catch {
		return { ok: false, error: 'Approval chain JSON is invalid' };
	}
}

/**
 * Parses pool-members JSON from the expert escape hatch.
 */
export function parseMembersJson(raw: string): ParseResult<Approver[]> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return { ok: false, error: 'Members JSON must be an array' };
		}
		return { ok: true, value: parsed as Approver[] };
	}
	catch {
		return { ok: false, error: 'Members JSON is invalid' };
	}
}

/**
 * Creates a blank pool member row.
 */
export function createEmptyMember(): Approver {
	return { email: '', displayName: '' };
}
