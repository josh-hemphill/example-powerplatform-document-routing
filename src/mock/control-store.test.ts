import { beforeEach, describe, expect, it } from 'vitest';
import {
	activeSubtypesForType,
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
		expect(store.documentTypes.some((type) => type.id === 'ilar')).toBe(true);
		expect(store.approverPools.length).toBeGreaterThan(0);
		expect(store.settings.allowApproverOverride).toBe(false);
	});

	it('materializes ILAR as manager then lead engineers then assigned engineers', () => {
		const steps = materializeApprovalSteps('ilar');
		expect(steps?.map((step) => step.role)).toEqual([
			'Engineering Manager',
			'Lead Engineers',
			'Assigned Engineers',
		]);
		expect(steps?.[0]?.assignmentMode).toBe('named');
		expect(steps?.[1]?.assignmentMode).toBe('pool');
		expect(steps?.[2]?.assignmentMode).toBe('pool');
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

	it('materializes safety SOP own-chain as Quality then Operations', () => {
		const safety = materializeApprovalSteps('sop', 'safety');
		expect(safety?.map((step) => step.role)).toEqual([
			'Quality',
			'Operations Reviewers',
		]);
		const inherited = materializeApprovalSteps('sop', 'operations');
		expect(inherited?.map((step) => step.role)).toEqual([
			'Operations Reviewers',
			'Quality',
		]);
	});

	it('seeds mission-critical in the priority catalog', () => {
		const mission = getControlStore().priorityLevels.find(
			(item) => item.key === 'mission_critical',
		);
		expect(mission?.requiresReason).toBe(true);
		expect(mission?.minReasonLength).toBe(20);
	});

	it('requires subtypes for policy but not announcement', () => {
		expect(activeSubtypesForType('policy').map((item) => item.key)).toEqual([
			'corporate',
			'hr',
		]);
		expect(activeSubtypesForType('announcement')).toEqual([]);
	});

	it('finds control document types by id', () => {
		expect(findControlDocumentType('missing')).toBeUndefined();
		expect(findControlDocumentType('policy')?.label).toBe('Policy');
	});

	it('seeds policy sequenceYear to match POL-2026 demo numbering', () => {
		const policy = findControlDocumentType('policy');
		expect(policy?.nextSequence).toBe(2);
		expect(policy?.sequenceYear).toBe(2026);
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

	it('rejects gapped step orders and materializes sorted by order', async() => {
		const { validateControlChain } = await import('./control-api.ts');
		const poolKey = getControlStore().approverPools[0]?.key;
		expect(poolKey).toBeTruthy();
		expect(
			validateControlChain([
				{ order: 1, assignmentMode: 'pool', role: 'Legal', poolKey },
				{ order: 3, assignmentMode: 'pool', role: 'Legal', poolKey },
			]),
		).toMatch(/contiguous/);

		const type = findControlDocumentType('policy');
		expect(type).toBeTruthy();
		type!.approvalChain = [
			{ order: 2, assignmentMode: 'pool', role: 'Second', poolKey },
			{ order: 1, assignmentMode: 'pool', role: 'First', poolKey },
		];
		const steps = materializeApprovalSteps('policy');
		expect(steps?.[0]?.assignmentMode).toBe('pool');
		expect(type!.approvalChain.map((step) => step.order)).toEqual([2, 1]);
		const { toDocumentTypeDefinition } = await import('./control-store.ts');
		const def = toDocumentTypeDefinition(type!);
		expect(def.approvalChain[0]?.mode).toBe('pool');
		expect(
			def.approvalChain[0] && 'poolRole' in def.approvalChain[0]
				? def.approvalChain[0].poolRole
				: undefined,
		).toBe('First');
	});
});
