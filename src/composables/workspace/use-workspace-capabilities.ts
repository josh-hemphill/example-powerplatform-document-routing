/**
 * Workspace capability flags derived from document state and actor identity.
 */
import type { ComputedRef, Ref } from 'vue';
import type { Document } from '@/client/types.gen';
import { computed } from 'vue';
import { isEmailInPool } from '@/domain/approval-queue';
import {
	canActorAbandonSupersedeSuccessor,
	canActorEditDraft,
	canActorMutateDraft,
	canActorSupersedeDocument,
} from '@/domain/document-access';
import { canActorPublishDocument } from '@/domain/document-authz';

/**
 * Computes which workspace actions the current actor may perform.
 */
export function useWorkspaceCapabilities(options: {
	document: Ref<Document | null | undefined>;
	canAct: Ref<boolean>;
	actorEmail: Ref<string | null | undefined>;
	isAdmin: () => boolean;
	hasPublisherRole: () => boolean;
	activeStep: ComputedRef<Document['approvalSteps'][number] | null>;
	publishDestinationId: Ref<string | null | undefined>;
}) {
	const {
		document,
		canAct,
		actorEmail,
		isAdmin,
		hasPublisherRole,
		activeStep,
		publishDestinationId,
	} = options;

	const canDraft = computed(() => {
		const doc = document.value;
		const actor = actorEmail.value;
		if (!canAct.value || !doc || !actor) {
			return false;
		}
		return canActorEditDraft(
			{
				...doc,
				collaboratorEmails: doc.collaboratorEmails ?? [],
				currentPoolEmails: doc.currentPoolEmails ?? [],
				approvalSteps: doc.approvalSteps ?? [],
			},
			actor,
		);
	});

	const canSubmitApproval = computed(() => {
		const doc = document.value;
		const actor = actorEmail.value;
		if (!canAct.value || !doc || !actor || doc.status !== 'drafting') {
			return false;
		}
		return canActorMutateDraft(
			{
				requesterEmail: doc.requesterEmail,
				authorEmail: doc.authorEmail,
				collaboratorEmails: doc.collaboratorEmails ?? [],
			},
			actor,
		);
	});

	const canClaim = computed(() => {
		const step = activeStep.value;
		const actor = actorEmail.value;
		return Boolean(
			canAct.value
			&& step?.status === 'queued'
			&& actor
			&& isEmailInPool(step.pool ?? [], actor),
		);
	});

	const canRelease = computed(() => {
		const step = activeStep.value;
		const actor = (actorEmail.value || '').toLowerCase();
		return Boolean(
			canAct.value
			&& step?.status === 'pending'
			&& step.assignmentMode === 'pool'
			&& step.approverEmail?.toLowerCase() === actor,
		);
	});

	const canDecide = computed(
		() =>
			Boolean(canAct.value)
			&& activeStep.value?.status === 'pending'
			&& activeStep.value.approverEmail?.toLowerCase()
			=== (actorEmail.value || '').toLowerCase(),
	);

	const canPublish = computed(() => {
		const doc = document.value;
		const actor = actorEmail.value;
		if (!canAct.value || !doc || !actor || !publishDestinationId.value) {
			return false;
		}
		if (doc.status !== 'approved' && doc.status !== 'published') {
			return false;
		}
		const roles = [
			...(hasPublisherRole() ? (['publisher'] as const) : []),
			...(isAdmin() ? (['admin'] as const) : []),
		];
		return canActorPublishDocument(
			{
				...doc,
				collaboratorEmails: doc.collaboratorEmails ?? [],
				currentPoolEmails: doc.currentPoolEmails ?? [],
				approvalSteps: doc.approvalSteps ?? [],
			},
			actor,
			roles,
		);
	});

	const canProcessSla = computed(
		() =>
			Boolean(canAct.value)
			&& document.value?.status === 'in_review'
			&& isAdmin(),
	);

	const canWithdraw = computed(() => {
		const status = document.value?.status;
		const actor = actorEmail.value;
		if (!canAct.value || !document.value || !actor) {
			return false;
		}
		if (status !== 'in_review' && status !== 'rejected' && status !== 'approved') {
			return false;
		}
		return canActorMutateDraft(
			{
				requesterEmail: document.value.requesterEmail,
				authorEmail: document.value.authorEmail,
				collaboratorEmails: document.value.collaboratorEmails ?? [],
			},
			actor,
		);
	});

	const canSupersede = computed(() => {
		const doc = document.value;
		if (!doc) {
			return false;
		}
		return canActorSupersedeDocument(doc, actorEmail.value ?? '', {
			canAct: canAct.value,
			isAdmin: isAdmin(),
		});
	});

	const canAbandonSupersede = computed(() => {
		const doc = document.value;
		if (!doc) {
			return false;
		}
		return canActorAbandonSupersedeSuccessor(doc, actorEmail.value ?? '', {
			canAct: canAct.value,
			isAdmin: isAdmin(),
		});
	});

	return {
		canDraft,
		canSubmitApproval,
		canClaim,
		canRelease,
		canDecide,
		canPublish,
		canProcessSla,
		canWithdraw,
		canSupersede,
		canAbandonSupersede,
	};
}
