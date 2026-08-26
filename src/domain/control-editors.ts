/**
 * Helpers for Admin structured chain/member editors and JSON escape hatches.
 */
import type { Approver, ControlChainStep, DocumentSubtype } from '@/client/types.gen';

let nextEditorRowKey = 1;
const editorRowKeys = new WeakMap<object, number>();

/**
 * Stable Vue key for a row object identity (survives reorder when refs are kept).
 */
export function editorRowKey(row: object): number {
	const existing = editorRowKeys.get(row);
	if (existing != null) {
		return existing;
	}
	const key = nextEditorRowKey;
	nextEditorRowKey += 1;
	editorRowKeys.set(row, key);
	return key;
}

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
		authorityLevel: 'standard',
		commentPolicy: 'required_on_reject',
	};
}

/**
 * Reassigns contiguous 1..n order in place so object identity (and Vue keys) stay stable.
 */
export function normalizeChainOrders(steps: ControlChainStep[]): ControlChainStep[] {
	for (let index = 0; index < steps.length; index += 1) {
		steps[index].order = index + 1;
	}
	return steps;
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

/**
 * Creates a blank subtype row for the Admin type editor (client-only id until POST).
 */
export function createEmptySubtype(documentTypeId: string, key = 'new_subtype'): DocumentSubtype {
	return {
		id: `new:${crypto.randomUUID()}`,
		key,
		label: 'New subtype',
		description: '',
		documentTypeId,
		active: true,
		requestHint: null,
		draftScaffold: null,
		numberPrefix: null,
		usesOwnChain: false,
		approvalChain: [],
	};
}
