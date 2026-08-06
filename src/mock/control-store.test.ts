import { beforeEach, describe, expect, it } from 'vitest';
import {
	findControlDocumentType,
	getControlStore,
	materializeApprovalSteps,
	resetControlStore,
} from './control-store.ts';

describe('control store', () => {
	beforeEach(() => {
		resetControlStore();
	});

	it('seeds document types and pools from the TS mirror', () => {
		const store = getControlStore();
		expect(store.documentTypes.some((type) => type.id === 'policy')).toBe(true);
		expect(store.approverPools.length).toBeGreaterThan(0);
		expect(store.settings.allowApproverOverride).toBe(false);
	});

	it('materializes submit steps from live pool membership', () => {
		const store = getControlStore();
		const legal = store.approverPools.find((pool) => pool.key.includes('legal'));
		expect(legal).toBeTruthy();
		legal!.members.push({
			email: 'new.reviewer@contoso.com',
			displayName: 'New Reviewer',
		});

		const steps = materializeApprovalSteps('policy');
		expect(steps).toBeTruthy();
		const first = steps![0];
		expect(first?.assignmentMode).toBe('pool');
		expect(
			first?.pool?.some(
				(member) => member.email.toLowerCase() === 'new.reviewer@contoso.com',
			),
		).toBe(true);
	});

	it('finds control document types by id', () => {
		expect(findControlDocumentType('missing')).toBeUndefined();
		expect(findControlDocumentType('policy')?.label).toBe('Policy');
	});
});

describe('control chain validation', () => {
	beforeEach(() => {
		resetControlStore();
	});

	it('rejects missing, non-positive, and duplicate step orders', async() => {
		const { validateControlChain } = await import('./control-api.ts');
		const poolKey = getControlStore().approverPools[0]?.key;
		expect(poolKey).toBeTruthy();

		expect(
			validateControlChain([
				{ order: 0, assignmentMode: 'pool', role: 'Legal', poolKey },
			]),
		).toMatch(/order >= 1/);

		expect(
			validateControlChain([
				{ order: 1, assignmentMode: 'pool', role: 'Legal', poolKey },
				{ order: 1, assignmentMode: 'pool', role: 'Legal', poolKey },
			]),
		).toMatch(/Duplicate/);
	});
});
