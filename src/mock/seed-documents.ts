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
		| 'published';

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
	dueAt: string | null;
	claimedAt: string | null;
	elevated: boolean;
	elevatedAt: string | null;
	comment: string | null;
	decidedAt: string | null;
}

export interface MockDocumentRecord {
	id: string;
	title: string;
	documentType: string;
	status: MockDocumentStatus;
	requesterEmail: string;
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
				dueAt: overdueDueAt,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				comment: null,
				decidedAt: null,
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
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				comment: null,
				decidedAt: null,
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

	syncCurrentApprovalFields(queuedPool);
	return [requested, drafting, queuedPool];
}
