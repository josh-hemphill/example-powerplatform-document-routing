import type { MockHttpContext } from '../http.ts';
import { toApprovalStepInputs } from '../../config/document-types.ts';
import {
	canActorMutateDraft,
} from '../../domain/document-access.ts';
import { canActorProcessSla } from '../../domain/document-authz.ts';
import {
	claimStep,
	createStepFromInput,
	decideStep,
	processStepSla,
	releaseStep,
	syncCurrentApprovalFields,
	withdrawAndRevise,
} from '../approval-engine.ts';
import {
	findControlDocumentType,
	getControlStore,
	materializeApprovalSteps,
	recordFlowRun,
	toDocumentTypeDefinition,
} from '../control-store.ts';
import { activeStep, pushHistory } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';
import { resolveSlaClock } from '../sla-clock.ts';

function getEngineErrorCode(error: unknown): string {
	return error instanceof Error && 'code' in error
		? String((error as { code: string }).code)
		: 'invalid_state';
}

export async function handleApprovalRoutes(context: MockHttpContext): Promise<boolean> {
	const {
		method,
		path,
		actor,
		actorRoles,
		isAdmin,
		req,
		res,
		readJson,
		sendJson,
		matchRoute,
	} = context;

	const submitMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/submit-for-approval$/,
	);
	if (method === 'POST' && submitMatch) {
		const document = getDocumentStore().get(submitMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (!canActorMutateDraft(document, actor)) {
			sendJson(res, 403, {
				message: 'Only shared authors/requesters can submit for approval',
				code: 'forbidden',
			});
			return true;
		}
		if (document.status !== 'drafting' || !document.draftBodyMarkdown) {
			sendJson(res, 409, {
				message: 'Document must be drafted before approval',
				code: 'invalid_state',
			});
			return true;
		}

		const typeRow = findControlDocumentType(document.documentType);
		if (!typeRow || !typeRow.active) {
			sendJson(res, 400, {
				message: `Unknown document type: ${document.documentType}`,
				code: 'unknown_document_type',
			});
			return true;
		}

		const body = await readJson<{
			steps?: Array<{
				assignmentMode: 'named' | 'pool';
				role?: string;
				slaHours?: number;
				assignee?: { email: string; displayName: string; role?: string };
				pool?: Array<{ email: string; displayName: string; role?: string }>;
				elevationPool?: Array<{
					email: string;
					displayName: string;
					role?: string;
				}>;
			}>;
			comment?: string;
		}>(req);

		const allowOverride = getControlStore().settings.allowApproverOverride;
		if (body.steps && body.steps.length > 0) {
			if (!allowOverride) {
				sendJson(res, 403, {
					message:
						'Client approval-chain override is disabled; submit uses control tables',
					code: 'forbidden',
				});
				return true;
			}
			if (!isAdmin) {
				sendJson(res, 403, {
					message:
						'Chain override requires the Admin role when allowApproverOverride is enabled',
					code: 'forbidden',
				});
				return true;
			}
		}
		const materialized = materializeApprovalSteps(typeRow.id);
		const stepsInput
			= allowOverride && isAdmin && body.steps && body.steps.length > 0
				? body.steps
				: materialized ?? toApprovalStepInputs(
					toDocumentTypeDefinition(typeRow).approvalChain,
				);

		if (!stepsInput || stepsInput.length === 0) {
			sendJson(res, 400, {
				message: 'Approval chain cannot be empty',
				code: 'empty_approval_chain',
			});
			return true;
		}

		const clock = new Date();
		const revision = document.contentRevision;
		try {
			document.approvalSteps = stepsInput.map((step, index) =>
				createStepFromInput(step, index + 1, clock, index === 0, revision),
			);
		}
		catch(error) {
			sendJson(res, 400, {
				message: error instanceof Error ? error.message : 'Invalid approval steps',
				code: 'validation_error',
			});
			return true;
		}
		document.submittedContentRevision = revision;
		document.status = 'in_review';
		syncCurrentApprovalFields(document);
		pushHistory(
			document,
			actor,
			'submitted_for_approval',
			body.comment ?? `Submitted to approval chain (revision ${revision})`,
		);
		sendJson(res, 200, document);
		return true;
	}

	const withdrawMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/withdraw-and-revise$/,
	);
	if (method === 'POST' && withdrawMatch) {
		const document = getDocumentStore().get(withdrawMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		const body = await readJson<{ comment?: string }>(req);
		try {
			withdrawAndRevise(document, actor);
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			sendJson(res, code === 'forbidden' ? 403 : 409, {
				message: error instanceof Error ? error.message : 'Withdraw failed',
				code,
			});
			return true;
		}
		pushHistory(
			document,
			actor,
			'withdrawn_for_revise',
			body.comment ?? 'Withdrawn for revision; approval steps cleared',
		);
		sendJson(res, 200, document);
		return true;
	}

	const slaMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/approvals\/process-sla$/,
	);
	if (method === 'POST' && slaMatch) {
		const document = getDocumentStore().get(slaMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		const roles = actorRoles;
		if (!canActorProcessSla(roles, actor)) {
			sendJson(res, 403, {
				message:
					'SLA processing requires Admin or a Flow/service principal',
				code: 'forbidden',
			});
			return true;
		}
		const body = await readJson<{ now?: string }>(req);
		let clock: Date;
		try {
			clock = resolveSlaClock(body.now);
		}
		catch(error) {
			sendJson(res, 400, {
				message: error instanceof Error ? error.message : 'Invalid now',
				code: 'validation_error',
			});
			return true;
		}
		const step = activeStep(document);
		if (step) {
			const result = processStepSla(step, clock);
			if (result.changed && result.message) {
				pushHistory(
					document,
					'system@sla-processor',
					'sla_elevated',
					result.message,
				);
				recordFlowRun(
					'Document Routing — SLA sweeper',
					'succeeded',
					result.message,
				);
			}
		}
		syncCurrentApprovalFields(document);
		sendJson(res, 200, document);
		return true;
	}

	const claimMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/claim$/,
	);
	if (method === 'POST' && claimMatch) {
		const document = getDocumentStore().get(claimMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		const step = document.approvalSteps.find((item) => item.id === claimMatch[2]);
		if (!step) {
			sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' });
			return true;
		}
		const active = activeStep(document);
		if (!active || active.id !== step.id) {
			sendJson(res, 409, {
				message: 'Only the current active step can be claimed',
				code: 'invalid_state',
			});
			return true;
		}
		const body = await readJson<{ comment?: string }>(req);
		try {
			claimStep(step, actor, new Date());
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			sendJson(res, code === 'forbidden' ? 403 : 409, {
				message: error instanceof Error ? error.message : 'Claim failed',
				code,
			});
			return true;
		}
		syncCurrentApprovalFields(document);
		pushHistory(
			document,
			actor,
			'claimed',
			body.comment ?? `Claimed step ${step.order}`,
		);
		sendJson(res, 200, document);
		return true;
	}

	const releaseMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/release$/,
	);
	if (method === 'POST' && releaseMatch) {
		const document = getDocumentStore().get(releaseMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (document.status !== 'in_review') {
			sendJson(res, 409, {
				message: 'Document is not in review',
				code: 'invalid_state',
			});
			return true;
		}
		const step = document.approvalSteps.find(
			(item) => item.id === releaseMatch[2],
		);
		if (!step) {
			sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' });
			return true;
		}
		const active = activeStep(document);
		if (!active || active.id !== step.id) {
			sendJson(res, 409, {
				message: 'Only the current active step can be released',
				code: 'invalid_state',
			});
			return true;
		}
		const body = await readJson<{ comment?: string }>(req);
		try {
			releaseStep(step, actor);
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			sendJson(res, code === 'forbidden' ? 403 : 409, {
				message: error instanceof Error ? error.message : 'Release failed',
				code,
			});
			return true;
		}
		syncCurrentApprovalFields(document);
		pushHistory(
			document,
			actor,
			'released',
			body.comment ?? `Released step ${step.order} back to queue`,
		);
		sendJson(res, 200, document);
		return true;
	}

	const decisionMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/decision$/,
	);
	if (method === 'POST' && decisionMatch) {
		const document = getDocumentStore().get(decisionMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (document.status !== 'in_review') {
			sendJson(res, 409, {
				message: 'Document is not awaiting approval',
				code: 'invalid_state',
			});
			return true;
		}

		const step = document.approvalSteps.find(
			(item) => item.id === decisionMatch[2],
		);
		if (!step) {
			sendJson(res, 404, {
				message: 'Approval step not found',
				code: 'not_found',
			});
			return true;
		}

		const active = activeStep(document);
		if (!active || active.id !== step.id || step.status !== 'pending') {
			sendJson(res, 409, {
				message: 'Only a claimed/named pending step can be decided',
				code: 'invalid_state',
			});
			return true;
		}

		const body = await readJson<{
			decision: string;
			comment?: string;
		}>(req);

		const isLastStep = !document.approvalSteps.some(
			(item) => item.order === step.order + 1,
		);

		try {
			decideStep(
				document,
				step,
				actor,
				body.decision,
				new Date(),
				body.comment,
			);
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			const status
				= code === 'forbidden'
					? 403
					: code === 'validation_error'
						? 400
						: 409;
			sendJson(res, status, {
				message: error instanceof Error ? error.message : 'Decision failed',
				code,
			});
			return true;
		}

		const historyAction
			= body.decision === 'reject'
				? 'rejected'
				: isLastStep
					? 'fully_approved'
					: 'step_approved';
		pushHistory(
			document,
			actor,
			historyAction,
			body.comment
			?? (body.decision === 'reject'
				? 'Rejected in approval chain'
				: isLastStep
					? 'All approval steps completed'
					: `Approved step ${step.order}`),
		);
		sendJson(res, 200, document);
		return true;
	}

	return false;
}
