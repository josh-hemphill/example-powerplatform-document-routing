import { describe, expect, it } from 'vitest';
import {
	createEmptyChainStep,
	createEmptyRequestField,
	createEmptySubtype,
	editorRowKey,
	moveChainStep,
	normalizeChainOrders,
	parseChainJson,
	parseMembersJson,
} from '@/domain/control-editors';

describe('control editors helpers', () => {
	it('normalizes step orders to contiguous 1..n in place', () => {
		const first = { ...createEmptyChainStep(9), role: 'A' };
		const second = { ...createEmptyChainStep(2), role: 'B' };
		const steps = [first, second];
		const normalized = normalizeChainOrders(steps);
		expect(normalized.map((step) => step.order)).toEqual([1, 2]);
		expect(normalized[0]).toBe(first);
		expect(normalized[1]).toBe(second);
	});

	it('moves steps and keeps object identity for stable keys', () => {
		const a = { ...createEmptyChainStep(1), role: 'A' };
		const b = { ...createEmptyChainStep(2), role: 'B' };
		const c = { ...createEmptyChainStep(3), role: 'C' };
		const keyA = editorRowKey(a);
		const moved = moveChainStep([a, b, c], 0, 1);
		expect(moved.map((step) => step.role)).toEqual(['B', 'A', 'C']);
		expect(moved.map((step) => step.order)).toEqual([1, 2, 3]);
		expect(moved[1]).toBe(a);
		expect(editorRowKey(moved[1])).toBe(keyA);
	});

	it('defaults new steps to standard authority and required_on_reject', () => {
		const step = createEmptyChainStep(1);
		expect(step.authorityLevel).toBe('standard');
		expect(step.commentPolicy).toBe('required_on_reject');
	});

	it('creates a select intake field with one starter option', () => {
		const field = createEmptyRequestField('relevantSystems');
		expect(field.kind).toBe('select');
		expect(field.key).toBe('relevantSystems');
		expect(field.options?.length).toBe(1);
	});

	it('creates a client-only subtype id until POST', () => {
		const subtype = createEmptySubtype('policy', 'hr');
		expect(subtype.id.startsWith('new:')).toBe(true);
		expect(subtype.documentTypeId).toBe('policy');
		expect(subtype.usesOwnChain).toBe(false);
	});

	it('parses valid chain JSON', () => {
		const result = parseChainJson(JSON.stringify([createEmptyChainStep(1)]));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toHaveLength(1);
		}
	});

	it('rejects invalid chain JSON', () => {
		expect(parseChainJson('{').ok).toBe(false);
		expect(parseChainJson('{}').ok).toBe(false);
	});

	it('parses and rejects members JSON', () => {
		expect(parseMembersJson('[{"email":"a@b.com","displayName":"A"}]').ok).toBe(true);
		expect(parseMembersJson('nope').ok).toBe(false);
	});
});
