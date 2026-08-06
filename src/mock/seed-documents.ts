import type { ApproverPerson } from '../domain/approval-queue.ts';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/app.config.ts';
import {
	addHoursIso,

} from '../domain/approval-queue.ts';
import { syncCurrentApprovalFields } from './approval-engine.ts';

export type MockDocumentStatus
	= | 'requested'
		| 'drafting'
		| 'in_review'
		| 'approved'
		| 'rejected'
		| 'published'
		| 'superseded';

export interface MockApprovalStep {
	id: string;
	order: number;
	assignmentMode: 'named' | 'pool';
	approverEmail: string | null;
	approverDisplayName: string | null;
	role: string | null;
	status: 'waiting' | 'queued' | 'pending' | 'approved' | 'rejected' | 'skipped';
	pool: ApproverPerson[];
	elevationPool: ApproverPerson[];
	slaHours: number | null;
	/** Immutable SLA deadline set when the step activates (claim/release must not move). */
	activateDueAt: string | null;
	/** Denormalized mirror of activateDueAt for inbox filters. */
	dueAt: string | null;
	claimedAt: string | null;
	elevated: boolean;
	elevatedAt: string | null;
	comment: string | null;
	decidedAt: string | null;
	/** Document contentRevision frozen at submit. */
	submittedRevision: number | null;
	/** Set when this step approves. */
	approvedRevision: number | null;
}

export interface MockDocumentRecord {
	id: string;
	title: string;
	documentType: string;
	status: MockDocumentStatus;
	requesterEmail: string;
	/** Author collaboration team shared for co-editing before submit. */
	collaboratorEmails: string[];
	priority: 'low' | 'normal' | 'high';
	currentApproverEmail: string | null;
	currentStepStatus: MockApprovalStep['status'] | null;
	currentStepDueAt: string | null;
	currentStepElevated: boolean | null;
	currentPoolEmails: string[];
	createdAt: string;
	updatedAt: string;
	freeformRequest: string;
	draftBodyMarkdown: string | null;
	draftSummary: string | null;
	authorEmail: string | null;
	/** Incremented on each draft save. */
	contentRevision: number;
	/** Revision frozen at submit-for-approval. */
	submittedContentRevision: number | null;
	/** Revision of the currently published artifact (idempotency key). */
	publishedContentRevision: number | null;
	/** Human-facing controlled number (assigned on first publish). */
	documentNumber: string | null;
	/** Controlled version (1 on first publish). */
	documentVersion: number | null;
	supersedesDocumentId: string | null;
	supersededByDocumentId: string | null;
	publishedAt: string | null;
	approvalSteps: MockApprovalStep[];
	history: Array<{
		id: string;
		at: string;
		actorEmail: string;
		action: string;
		message: string;
	}>;
	publishedPdfUrl: string | null;
	sharePointItemId: string | null;
	requestedPublishSiteUrl: string | null;
	requestedLibraryName: string | null;
}

const stamp = (): string => new Date().toISOString();

/**
 * Seeds demo documents across types, including an open pool queue past SLA.
 */
export function createSeedDocuments(): MockDocumentRecord[] {
	const createdAt = stamp();
	const overdueDueAt = addHoursIso(-1);

	const requested: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Q3 Travel Policy Update',
		documentType: 'policy',
		status: 'requested',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['developer@example.com', 'casey.author@contoso.com', 'alex.requester@contoso.com'],
		priority: 'high',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
      'Please draft an updated travel policy covering economy class defaults, manager pre-approval above $1,500, and green travel options for trips under 4 hours.',
		draftBodyMarkdown: null,
		draftSummary: null,
		authorEmail: null,
		contentRevision: 0,
		submittedContentRevision: null,
		publishedContentRevision: null,
		documentNumber: null,
		documentVersion: null,
		supersedesDocumentId: null,
		supersededByDocumentId: null,
		publishedAt: null,
		approvalSteps: [],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'alex.requester@contoso.com',
				action: 'requested',
				message: 'Freeform request submitted',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
		requestedLibraryName: appConfig.sharePoint.libraryName,
	};

	const drafting: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Laptop Refresh SOP',
		documentType: 'sop',
		status: 'drafting',
		requesterEmail: 'pat.manager@contoso.com',
		collaboratorEmails: ['developer@example.com', 'casey.author@contoso.com', 'alex.requester@contoso.com'],
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
      'Document the 36-month laptop refresh process for corporate devices, including inventory checks and return shipping.',
		draftBodyMarkdown: `# Laptop Refresh SOP

## Overview
Document the 36-month laptop refresh process for corporate devices.

## Procedure
1. Confirm asset age in Intune
2. Order replacement
3. Image and ship
`,
		draftSummary: 'Corporate laptop refresh procedure',
		authorEmail: appConfig.localDemoUser.email,
		contentRevision: 1,
		submittedContentRevision: null,
		publishedContentRevision: null,
		documentNumber: null,
		documentVersion: null,
		supersedesDocumentId: null,
		supersededByDocumentId: null,
		publishedAt: null,
		approvalSteps: [],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'pat.manager@contoso.com',
				action: 'requested',
				message: 'Freeform request submitted',
			},
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: appConfig.localDemoUser.email,
				action: 'draft_updated',
				message: 'Draft content saved',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
		requestedLibraryName: appConfig.sharePoint.libraryName,
	};

	const queuedPool: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Expense Policy Clarification',
		documentType: 'policy',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['developer@example.com', 'casey.author@contoso.com', 'alex.requester@contoso.com'],
		priority: 'high',
		currentApproverEmail: null,
		currentStepStatus: 'queued',
		currentStepDueAt: overdueDueAt,
		currentStepElevated: false,
		currentPoolEmails: [
			'jordan.legal@contoso.com',
			'avery.counsel@contoso.com',
		],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Clarify meal caps for customer visits.',
		draftBodyMarkdown: `# Expense Policy Clarification

Meal caps for customer visits are $75 / person.
`,
		draftSummary: 'Meal cap clarification',
		authorEmail: appConfig.localDemoUser.email,
		contentRevision: 2,
		submittedContentRevision: 2,
		publishedContentRevision: null,
		documentNumber: null,
		documentVersion: null,
		supersedesDocumentId: null,
		supersededByDocumentId: null,
		publishedAt: null,
		approvalSteps: [
			{
				id: randomUUID(),
				order: 1,
				assignmentMode: 'pool',
				approverEmail: null,
				approverDisplayName: null,
				role: 'Legal Reviewers',
				status: 'queued',
				pool: [
					{
						displayName: 'Jordan Legal',
						email: 'jordan.legal@contoso.com',
					},
					{
						displayName: 'Avery Counsel',
						email: 'avery.counsel@contoso.com',
					},
				],
				elevationPool: [
					{
						displayName: 'Pat Chief Counsel',
						email: 'pat.counsel@contoso.com',
						role: 'Elevated Legal',
					},
				],
				slaHours: 8,
				activateDueAt: overdueDueAt,
				dueAt: overdueDueAt,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				comment: null,
				decidedAt: null,
				submittedRevision: 2,
				approvedRevision: null,
			},
			{
				id: randomUUID(),
				order: 2,
				assignmentMode: 'named',
				approverEmail: 'sam.compliance@contoso.com',
				approverDisplayName: 'Sam Compliance',
				role: 'Compliance',
				status: 'waiting',
				pool: [
					{
						displayName: 'Sam Compliance',
						email: 'sam.compliance@contoso.com',
					},
				],
				elevationPool: [
					{
						displayName: 'Chris Compliance Lead',
						email: 'chris.compliance@contoso.com',
						role: 'Elevated Compliance',
					},
				],
				slaHours: 24,
				activateDueAt: null,
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				comment: null,
				decidedAt: null,
				submittedRevision: 2,
				approvedRevision: null,
			},
		],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: appConfig.localDemoUser.email,
				action: 'submitted_for_approval',
				message: 'Submitted to approval chain (Legal pool is open; SLA already due for demo)',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
		requestedLibraryName: appConfig.sharePoint.libraryName,
	};

	const published: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Remote Work Policy',
		documentType: 'policy',
		status: 'published',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['developer@example.com', 'casey.author@contoso.com', 'alex.requester@contoso.com'],
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Publish a controlled remote work policy for Contoso employees.',
		draftBodyMarkdown: `# Remote Work Policy

Employees may work remotely up to three days per week with manager approval.
`,
		draftSummary: 'Remote work eligibility and expectations',
		authorEmail: appConfig.localDemoUser.email,
		contentRevision: 3,
		submittedContentRevision: 3,
		publishedContentRevision: 3,
		documentNumber: 'POL-2026-00001',
		documentVersion: 1,
		supersedesDocumentId: null,
		supersededByDocumentId: null,
		publishedAt: createdAt,
		approvalSteps: [],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: appConfig.localDemoUser.email,
				action: 'published',
				message: 'Published POL-2026-00001 v1',
			},
		],
		publishedPdfUrl: `${appConfig.sharePoint.siteUrl}/${encodeURIComponent(appConfig.sharePoint.libraryName)}/POL-2026-00001-v1.pdf`,
		sharePointItemId: randomUUID(),
		requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
		requestedLibraryName: appConfig.sharePoint.libraryName,
	};

	syncCurrentApprovalFields(queuedPool);
	return [requested, drafting, queuedPool, published];
}
