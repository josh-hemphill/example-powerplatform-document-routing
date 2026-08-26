import type { ApproverPerson } from '../domain/approval-queue.ts';
import type { MockApprovalStep, MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	addHoursIso,
	isEmailInPool,
	isSlaOverdue,
	mergeApproverPools,
} from '../domain/approval-queue.ts';
import { shortDecisionHistoryMessage } from '../domain/history-actions.ts';
import {
	DEFAULT_AUTHORITY_LEVEL,
	DEFAULT_COMMENT_POLICY,
	isCommentRequired,
	seedAuthorityForRole,
} from '../domain/review-comments.ts';

const nowIso = (clock?: Date): string => (clock ?? new Date()).toISOString();

export interface EngineError extends Error {
	code:
		| 'invalid_state'
		| 'forbidden'
		| 'validation_error'
		| 'comment_required'
		| 'open_authoritative_comments'
		| 'response_required';
}

/**
 * Throws an engine error with a stable API code.
 */
export function engineError(
	message: string,
	code: EngineError['code'],
): EngineError {
	return Object.assign(new Error(message), { code });
}

/**
 * Syncs summary-facing current-* fields from the active approval step.
 */
export function syncCurrentApprovalFields(document: MockDocumentRecord): void {
	const active = document.approvalSteps.find(
		(step) => step.status === 'queued' || step.status === 'pending',
	);
	document.currentApproverEmail = active?.approverEmail ?? null;
	document.currentStepStatus = active?.status ?? null;
	document.currentStepDueAt = active?.dueAt ?? null;
	document.currentStepElevated = active ? active.elevated : null;
	document.currentPoolEmails
		= active?.assignmentMode === 'pool'
			? active.pool.map((member) => member.email)
			: [];
}

function setActivateDeadline(step: MockApprovalStep, clock: Date): void {
	const due = step.slaHours ? addHoursIso(step.slaHours, clock) : null;
	step.activateDueAt = due;
	step.dueAt = due;
}

export function createStepFromInput(
	input: {
		assignmentMode: 'named' | 'pool';
		role?: string;
		slaHours?: number;
		assignee?: ApproverPerson;
		pool?: ApproverPerson[];
		elevationPool?: ApproverPerson[];
		authorityLevel?: MockApprovalStep['authorityLevel'];
		commentPolicy?: MockApprovalStep['commentPolicy'];
	},
	order: number,
	clock: Date,
	isActive: boolean,
	submittedRevision: number,
): MockApprovalStep {
	const slaHours = input.slaHours ?? null;
	if (slaHours !== null && slaHours <= 0) {
		throw engineError('slaHours must be greater than 0', 'validation_error');
	}
	const role = input.role ?? input.assignee?.role ?? null;
	const authorityLevel = input.authorityLevel ?? seedAuthorityForRole(role);
	const commentPolicy = input.commentPolicy ?? DEFAULT_COMMENT_POLICY;
	if (input.assignmentMode === 'named') {
		if (!input.assignee) {
			throw engineError('Named approval steps require an assignee', 'validation_error');
		}
		const step: MockApprovalStep = {
			id: randomUUID(),
			order,
			assignmentMode: 'named',
			approverEmail: input.assignee.email,
			approverDisplayName: input.assignee.displayName,
			role,
			status: isActive ? 'pending' : 'waiting',
			pool: [input.assignee],
			elevationPool: input.elevationPool ?? [],
			slaHours,
			activateDueAt: null,
			dueAt: null,
			claimedAt: null,
			elevated: false,
			elevatedAt: null,
			comment: null,
			decidedAt: null,
			approvedRevision: null,
			submittedRevision,
			authorityLevel,
			commentPolicy,
		};
		if (isActive) {
			setActivateDeadline(step, clock);
		}
		return step;
	}

	if (!input.pool?.length) {
		throw engineError('Pool approval steps require at least one pool member', 'validation_error');
	}

	const step: MockApprovalStep = {
		id: randomUUID(),
		order,
		assignmentMode: 'pool',
		approverEmail: null,
		approverDisplayName: null,
		role,
		status: isActive ? 'queued' : 'waiting',
		pool: input.pool,
		elevationPool: input.elevationPool ?? [],
		slaHours,
		activateDueAt: null,
		dueAt: null,
		claimedAt: null,
		elevated: false,
		elevatedAt: null,
		comment: null,
		decidedAt: null,
		approvedRevision: null,
		submittedRevision,
		authorityLevel,
		commentPolicy,
	};
	if (isActive) {
		setActivateDeadline(step, clock);
	}
	return step;
}

/**
 * Activates the next waiting step after an approval (sets immutable activateDueAt).
 */
export function activateStep(step: MockApprovalStep, clock: Date): void {
	if (step.assignmentMode === 'pool') {
		step.status = 'queued';
		step.approverEmail = null;
		step.approverDisplayName = null;
		step.claimedAt = null;
	}
	else {
		step.status = 'pending';
	}
	setActivateDeadline(step, clock);
}

/**
 * Claims a queued pool step without extending the SLA deadline.
 */
export function claimStep(
	step: MockApprovalStep,
	actorEmail: string,
	clock: Date,
): void {
	if (step.assignmentMode !== 'pool' || step.status !== 'queued') {
		throw engineError('Only queued pool steps can be claimed', 'invalid_state');
	}
	if (!isEmailInPool(step.pool, actorEmail)) {
		throw engineError('Actor is not in the eligible pool', 'forbidden');
	}
	const member = step.pool.find(
		(item) => item.email.toLowerCase() === actorEmail.toLowerCase(),
	)!;
	step.status = 'pending';
	step.approverEmail = member.email;
	step.approverDisplayName = member.displayName;
	step.claimedAt = nowIso(clock);
	// Preserve activateDueAt / dueAt — claim must not extend absolute SLA.
}

/**
 * Releases a claimed pool step back to the queue without moving the SLA deadline.
 */
export function releaseStep(step: MockApprovalStep, actorEmail: string): void {
	if (step.assignmentMode !== 'pool' || step.status !== 'pending') {
		throw engineError('Only claimed pool steps can be released', 'invalid_state');
	}
	if (step.approverEmail?.toLowerCase() !== actorEmail.toLowerCase()) {
		throw engineError('Only the claimer can release this step', 'forbidden');
	}
	step.status = 'queued';
	step.approverEmail = null;
	step.approverDisplayName = null;
	step.claimedAt = null;
}

/**
 * Elevates overdue active steps.
 * Named overdue steps convert to an elevated pool queue (chosen Phase 3 semantics).
 * Claim/release-style requeue never extends activateDueAt; elevation starts a new window once.
 */
/**
 * Elevates or requeues an overdue active step.
 *
 * Named steps without an elevation pool: intentional no-op when overdue (no
 * silent reassignment). Configure `elevationPool` / `elevationPoolKey` to escalate.
 * Claimed pool steps without elevation members are returned to the queue without
 * extending `activateDueAt`.
 */
export function processStepSla(
	step: MockApprovalStep,
	clock: Date,
): { changed: boolean; message: string | null } {
	if (step.status !== 'queued' && step.status !== 'pending') {
		return { changed: false, message: null };
	}

	const deadline = step.activateDueAt ?? step.dueAt;
	if (!isSlaOverdue(deadline, clock)) {
		return { changed: false, message: null };
	}

	const hadElevationMembers = (step.elevationPool?.length ?? 0) > 0;
	const roleLabel = step.role ?? 'step';

	// First elevation: merge elevation pool; named → elevated pool queue.
	if (!step.elevated && hadElevationMembers) {
		step.pool = mergeApproverPools(step.pool, step.elevationPool);
		step.elevated = true;
		step.elevatedAt = nowIso(clock);

		if (step.assignmentMode === 'named') {
			step.assignmentMode = 'pool';
		}

		step.status = 'queued';
		step.approverEmail = null;
		step.approverDisplayName = null;
		step.claimedAt = null;
		// New activation window for the elevated queue only.
		setActivateDeadline(step, clock);

		return {
			changed: true,
			message: `SLA breached; converted to elevated pool queue (${roleLabel} ${step.order})`,
		};
	}

	// Overdue claimed pool step: return to queue without moving the deadline.
	if (step.assignmentMode === 'pool' && step.status === 'pending') {
		step.status = 'queued';
		step.approverEmail = null;
		step.approverDisplayName = null;
		step.claimedAt = null;
		return {
			changed: true,
			message: `SLA breached; returned to pool without extending deadline (${roleLabel} ${step.order})`,
		};
	}

	// Already elevated / no elevation pool, and already queued: no mutation.
	return { changed: false, message: null };
}

const ALLOWED_DECISIONS = new Set(['approve', 'reject']);

/**
 * Builds a display name from an email local-part when none is supplied.
 */
export function displayNameFromEmail(email: string): string {
	const local = email.split('@')[0] ?? email;
	return local
		.split(/[._-]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ') || email;
}

/**
 * Inserts a decision review comment and returns its id, or null when there is no body.
 */
export function insertDecisionReviewComment(
	document: MockDocumentRecord,
	step: MockApprovalStep,
	actorEmail: string,
	clock: Date,
	body: string | undefined,
): string | null {
	const trimmed = body?.trim() ?? '';
	if (!trimmed) {
		return null;
	}
	const id = randomUUID();
	document.reviewComments ??= [];
	document.reviewComments.push({
		id,
		kind: 'decision',
		authorityLevel: step.authorityLevel ?? DEFAULT_AUTHORITY_LEVEL,
		status: 'open',
		body: trimmed,
		actorEmail,
		actorDisplayName: step.approverDisplayName ?? displayNameFromEmail(actorEmail),
		role: step.role,
		sourceStepId: step.id,
		sourceStepOrder: step.order,
		submittedContentRevision: step.submittedRevision ?? document.submittedContentRevision,
		inReplyTo: null,
		createdAt: nowIso(clock),
	});
	return id;
}

/**
 * Records an approve/reject decision for the active pending assignee.
 */
export function decideStep(
	document: MockDocumentRecord,
	step: MockApprovalStep,
	actorEmail: string,
	decision: string,
	clock: Date,
	comment?: string,
): string | null {
	if (!ALLOWED_DECISIONS.has(decision)) {
		throw engineError('decision must be approve or reject', 'validation_error');
	}
	if (document.status !== 'in_review') {
		throw engineError('Document is not awaiting approval', 'invalid_state');
	}
	if (step.status !== 'pending') {
		throw engineError('Only a claimed/named pending step can be decided', 'invalid_state');
	}
	if (step.approverEmail?.toLowerCase() !== actorEmail.toLowerCase()) {
		throw engineError('Only the assigned/claimed approver can decide this step', 'forbidden');
	}

	const typedDecision = decision as 'approve' | 'reject';
	if (isCommentRequired(step, typedDecision) && !(comment ?? '').trim()) {
		throw engineError(
			'This step requires a comment for the selected decision',
			'comment_required',
		);
	}

	const reviewCommentId = insertDecisionReviewComment(
		document,
		step,
		actorEmail,
		clock,
		comment,
	);
	step.comment = comment?.trim() ? comment.trim() : null;
	step.decidedAt = nowIso(clock);

	if (typedDecision === 'reject') {
		step.status = 'rejected';
		document.status = 'rejected';
		syncCurrentApprovalFields(document);
		return reviewCommentId;
	}

	step.status = 'approved';
	step.approvedRevision = step.submittedRevision;
	const next = document.approvalSteps.find((item) => item.order === step.order + 1);
	if (next) {
		activateStep(next, clock);
	}
	else {
		document.status = 'approved';
	}
	syncCurrentApprovalFields(document);
	return reviewCommentId;
}

/**
 * Withdraws an in-flight or rejected/approved review back to drafting and clears steps.
 * Review comments are retained.
 */
export function withdrawAndRevise(
	document: MockDocumentRecord,
	actorEmail: string,
): void {
	const status = document.status;
	if (status !== 'in_review' && status !== 'rejected' && status !== 'approved') {
		throw engineError(
			'Only in_review, rejected, or approved documents can be withdrawn for revise',
			'invalid_state',
		);
	}

	const email = actorEmail.trim().toLowerCase();
	const canWithdraw
		= document.requesterEmail.toLowerCase() === email
			|| document.authorEmail?.toLowerCase() === email
			|| document.collaboratorEmails.some((item) => item.toLowerCase() === email);
	if (!canWithdraw) {
		throw engineError('Only requester, author, or collaborators can withdraw and revise', 'forbidden');
	}

	document.approvalSteps = [];
	document.status = 'drafting';
	document.submittedContentRevision = null;
	syncCurrentApprovalFields(document);
}

export { shortDecisionHistoryMessage };
