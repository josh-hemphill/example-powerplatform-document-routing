import { describe, expect, it } from 'vitest';
import {
	createEmptyChainStep,
	moveChainStep,
	normalizeChainOrders,
	parseChainJson,
	parseMembersJson,
} from '@/domain/control-editors';

describe('control editors helpers', () => {
	it('normalizes step orders to contiguous 1..n', () => {
		const steps = [
			{ ...createEmptyChainStep(9), role: 'A' },
			{ ...createEmptyChainStep(2), role: 'B' },
		];
		expect(normalizeChainOrders(steps).map((step) => step.order)).toEqual([1, 2]);
	});

	it('moves steps and reorders', () => {
		const steps = [
			{ ...createEmptyChainStep(1), role: 'A' },
			{ ...createEmptyChainStep(2), role: 'B' },
			{ ...createEmptyChainStep(3), role: 'C' },
		];
		const moved = moveChainStep(steps, 0, 1);
		expect(moved.map((step) => step.role)).toEqual(['B', 'A', 'C']);
		expect(moved.map((step) => step.order)).toEqual([1, 2, 3]);
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
