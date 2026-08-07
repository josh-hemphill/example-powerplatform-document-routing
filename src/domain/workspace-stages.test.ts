import { describe, expect, it } from 'vitest';
import { primaryWorkspaceStage } from '@/domain/workspace-stages';

describe('primaryWorkspaceStage', () => {
	it('maps authoring statuses to the active stage', () => {
		expect(primaryWorkspaceStage('requested')).toBe('freeform');
		expect(primaryWorkspaceStage('drafting')).toBe('draft');
		expect(primaryWorkspaceStage('in_review')).toBe('approval');
		expect(primaryWorkspaceStage('rejected')).toBe('approval');
		expect(primaryWorkspaceStage('approved')).toBe('publish');
	});

	it('collapses stages for terminal published lifecycle statuses', () => {
		expect(primaryWorkspaceStage('published')).toBeNull();
		expect(primaryWorkspaceStage('superseded')).toBeNull();
		expect(primaryWorkspaceStage('abandoned')).toBeNull();
	});
});
