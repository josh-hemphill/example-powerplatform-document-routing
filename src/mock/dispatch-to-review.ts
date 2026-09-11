import type { MockDocumentRecord } from './seed-documents.ts';
import { createStepFromInput, syncCurrentApprovalFields } from './approval-engine.ts';
import {
	findControlDocumentType,
	materializeApprovalSteps,
	toDocumentTypeDefinition,
} from './control-store.ts';
import { toApprovalStepInputs } from '../config/document-types.ts';
import { pushHistory } from './document-http.ts';

/**
 * Materializes the type/subtype chain and opens review on a newly created document.
 */
export function dispatchDocumentToReview(
	document: MockDocumentRecord,
	actor: string,
	clock = new Date(),
): void {
	const typeRow = findControlDocumentType(document.documentType);
	if (!typeRow || !typeRow.active) {
		throw new Error(`Unknown document type: ${document.documentType}`);
	}
	const materialized = materializeApprovalSteps(
		typeRow.id,
		document.documentSubtypeId,
	);
	const stepsInput
		= materialized
			?? toApprovalStepInputs(toDocumentTypeDefinition(typeRow).approvalChain);
	if (!stepsInput.length) {
		throw new Error('Approval chain cannot be empty');
	}
	const revision = document.contentRevision;
	document.approvalSteps = stepsInput.map((step, index) =>
		createStepFromInput(step, index + 1, clock, index === 0, revision),
	);
	document.submittedContentRevision = revision;
	document.status = 'in_review';
	document.allowReviewerDraftEdit = true;
	syncCurrentApprovalFields(document);
	pushHistory(
		document,
		actor,
		'submitted_for_approval',
		`Dispatched to review (revision ${revision})`,
	);
}
