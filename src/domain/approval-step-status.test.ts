import { describe, expect, it } from 'vitest';
import { APPROVAL_STEP_STATUS_LABELS } from '@/domain/approval-queue';

describe('approval step status labels', () => {
	it('humanizes every step status token', () => {
		expect(APPROVAL_STEP_STATUS_LABELS.waiting).toBe('Waiting');
		expect(APPROVAL_STEP_STATUS_LABELS.queued).toBe('In queue');
		expect(APPROVAL_STEP_STATUS_LABELS.pending).toBe('Pending decision');
		expect(APPROVAL_STEP_STATUS_LABELS.approved).toBe('Approved');
		expect(APPROVAL_STEP_STATUS_LABELS.rejected).toBe('Rejected');
		expect(APPROVAL_STEP_STATUS_LABELS.skipped).toBe('Skipped');
	});
});
