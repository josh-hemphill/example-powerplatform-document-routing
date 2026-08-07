import type { DocumentStatus } from '@/domain/document-status';

export type WorkspaceStageId = 'freeform' | 'draft' | 'approval' | 'publish';

/**
 * Returns the stage that should be expanded by default for a document status.
 * Published / superseded / abandoned collapse all authoring stages.
 */
export function primaryWorkspaceStage(
	status: DocumentStatus,
): WorkspaceStageId | null {
	switch (status) {
		case 'requested':
			return 'freeform';
		case 'drafting':
			return 'draft';
		case 'in_review':
		case 'rejected':
			return 'approval';
		case 'approved':
			return 'publish';
		default:
			return null;
	}
}
