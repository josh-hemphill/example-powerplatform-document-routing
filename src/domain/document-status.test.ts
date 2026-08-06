import { describe, expect, it } from 'vitest';
import {
	DOCUMENT_STATUS_LABELS,
	getWorkflowStageIndex,
} from '@/domain/document-status';

describe('document workflow stages', () => {
	it('maps statuses onto the publishing pipeline', () => {
		expect(getWorkflowStageIndex('requested')).toBe(0);
		expect(getWorkflowStageIndex('drafting')).toBe(1);
		expect(getWorkflowStageIndex('in_review')).toBe(2);
		expect(getWorkflowStageIndex('approved')).toBe(3);
		expect(getWorkflowStageIndex('published')).toBe(4);
	});

	it('keeps rejected documents on the approval stage', () => {
		expect(getWorkflowStageIndex('rejected')).toBe(2);
	});

	it('maps superseded onto the published stage', () => {
		expect(getWorkflowStageIndex('superseded')).toBe(4);
		expect(DOCUMENT_STATUS_LABELS.superseded).toBe('Superseded');
	});

	it('exposes human-readable labels', () => {
		expect(DOCUMENT_STATUS_LABELS.published).toBe('Published');
	});
});
