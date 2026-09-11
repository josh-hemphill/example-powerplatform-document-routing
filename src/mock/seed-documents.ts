import type { ApproverPerson } from '../domain/approval-queue.ts';
import type {
	AuthorityLevel,
	CommentPolicy,
	ReviewCommentRecord,
} from '../domain/review-comments.ts';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/app.config.ts';
import {
	addHoursIso,

} from '../domain/approval-queue.ts';
import { DEFAULT_COMMENT_POLICY, seedAuthorityForRole } from '../domain/review-comments.ts';
import { syncCurrentApprovalFields } from './approval-engine.ts';

export type MockDocumentStatus
	= | 'requested'
		| 'drafting'
		| 'in_review'
		| 'approved'
		| 'rejected'
		| 'published'
		| 'superseded'
		| 'abandoned';

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
	authorityLevel: AuthorityLevel;
	commentPolicy: CommentPolicy;
}

export interface MockDocumentRecord {
	id: string;
	title: string;
	documentType: string;
	status: MockDocumentStatus;
	requesterEmail: string;
	/** Author collaboration team shared for co-editing before submit. */
	collaboratorEmails: string[];
	priority: string;
	priorityReason: string | null;
	documentSubtypeId: string | null;
	typeFieldValues?: Record<string, string>;
	allowReviewerDraftEdit?: boolean;
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
	reviewComments: ReviewCommentRecord[];
	history: Array<{
		id: string;
		at: string;
		actorEmail: string;
		action: string;
		message: string;
		reviewCommentId?: string | null;
	}>;
	publishedPdfUrl: string | null;
	sharePointItemId: string | null;
	requestedPublishSiteUrl: string | null;
	requestedLibraryName: string | null;
}

const stamp = (): string => new Date().toISOString();

const LEGAL_POOL: ApproverPerson[] = [
	{ displayName: 'Jordan Legal', email: 'jordan.legal@contoso.com' },
	{ displayName: 'Avery Counsel', email: 'avery.counsel@contoso.com' },
];

const LEGAL_ELEVATION: ApproverPerson[] = [
	{
		displayName: 'Pat Chief Counsel',
		email: 'pat.counsel@contoso.com',
		role: 'Elevated Legal',
	},
];

const COMPLIANCE_POOL: ApproverPerson[] = [
	{ displayName: 'Sam Compliance', email: 'sam.compliance@contoso.com' },
];

const COMPLIANCE_ELEVATION: ApproverPerson[] = [
	{
		displayName: 'Chris Compliance Lead',
		email: 'chris.compliance@contoso.com',
		role: 'Elevated Compliance',
	},
];

const LEAD_ENGINEER_POOL: ApproverPerson[] = [
	{ displayName: 'Quinn Lead', email: 'quinn.lead@contoso.com' },
	{ displayName: 'Reese Lead', email: 'reese.lead@contoso.com' },
];

const LEAD_ENGINEER_ELEVATION: ApproverPerson[] = [
	{
		displayName: 'Sasha Principal',
		email: 'sasha.principal@contoso.com',
		role: 'Elevated Lead Engineer',
	},
];

const ASSIGNED_ENGINEER_POOL: ApproverPerson[] = [
	{ displayName: 'Casey Author', email: 'casey.author@contoso.com' },
	{ displayName: 'Jamie Engineer', email: 'jamie.engineer@contoso.com' },
];

const ASSIGNED_ENGINEER_ELEVATION: ApproverPerson[] = [
	{
		displayName: 'Quinn Lead',
		email: 'quinn.lead@contoso.com',
		role: 'Elevated Assigned Engineer',
	},
];

const ENG_MANAGER_ELEVATION: ApproverPerson[] = [
	{
		displayName: 'Dana Director of Engineering',
		email: 'dana.director@contoso.com',
		role: 'Elevated Engineering Manager',
	},
];

/**
 * Seeds demo documents across workflow states so local Vite play can exercise
 * every inbox persona and approval path (claim, decide, elevate, publish, supersede).
 * Mock-only — production Dataverse never uses this file.
 */
export function createSeedDocuments(): MockDocumentRecord[] {
	const createdAt = stamp();
	const overdueDueAt = addHoursIso(-1);
	const futureDueAt = addHoursIso(24);
	const demoEmail = appConfig.localDemoUser.email;
	const collab = [demoEmail, 'casey.author@contoso.com', 'alex.requester@contoso.com'];
	const publishSite = appConfig.sharePoint.siteUrl;
	const publishLibrary = appConfig.sharePoint.libraryName;

	const requested: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Q3 Travel Policy Update',
		documentType: 'policy',
		status: 'requested',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'mission_critical',
		priorityReason:
			'Executive deadline: board packet depends on this travel policy by Friday.',
		documentSubtypeId: 'corporate',
		reviewComments: [],
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
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const drafting: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Laptop Refresh SOP',
		documentType: 'sop',
		status: 'drafting',
		requesterEmail: 'pat.manager@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'operations',
		reviewComments: [],
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
		authorEmail: demoEmail,
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
				actorEmail: demoEmail,
				action: 'draft_updated',
				message: 'Draft content saved',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const queuedPool: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Expense Policy Clarification',
		documentType: 'policy',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'high',
		priorityReason: null,
		documentSubtypeId: 'corporate',
		reviewComments: [],
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
		authorEmail: demoEmail,
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
				pool: [...LEGAL_POOL],
				elevationPool: [...LEGAL_ELEVATION],
				slaHours: 8,
				activateDueAt: overdueDueAt,
				dueAt: overdueDueAt,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
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
				pool: [...COMPLIANCE_POOL],
				elevationPool: [...COMPLIANCE_ELEVATION],
				slaHours: 24,
				activateDueAt: null,
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
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
				actorEmail: demoEmail,
				action: 'submitted_for_approval',
				message: 'Submitted to approval chain (Legal pool is open; SLA already due for demo)',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const pendingNamed: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Vendor Onboarding Checklist',
		documentType: 'sop',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'operations',
		reviewComments: [],
		currentApproverEmail: demoEmail,
		currentStepStatus: 'pending',
		currentStepDueAt: futureDueAt,
		currentStepElevated: false,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Checklist for onboarding new software vendors.',
		draftBodyMarkdown: `# Vendor Onboarding Checklist

1. Security questionnaire
2. Legal review
3. Procurement approval
`,
		draftSummary: 'Vendor onboarding steps',
		authorEmail: 'casey.author@contoso.com',
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
				assignmentMode: 'named',
				approverEmail: demoEmail,
				approverDisplayName: appConfig.localDemoUser.userName,
				role: 'Author lead',
				status: 'pending',
				pool: [
					{
						displayName: appConfig.localDemoUser.userName,
						email: demoEmail,
					},
				],
				elevationPool: [...LEGAL_ELEVATION],
				slaHours: 24,
				activateDueAt: futureDueAt,
				dueAt: futureDueAt,
				claimedAt: createdAt,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
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
				actorEmail: 'casey.author@contoso.com',
				action: 'submitted_for_approval',
				message: 'Submitted — waiting on local developer (named pending)',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const elevatedPool: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Incident Response Playbook',
		documentType: 'sop',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'high',
		priorityReason: null,
		documentSubtypeId: 'safety',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: 'queued',
		currentStepDueAt: overdueDueAt,
		currentStepElevated: true,
		currentPoolEmails: ['pat.counsel@contoso.com'],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Escalate overdue legal review of the IR playbook.',
		draftBodyMarkdown: `# Incident Response Playbook

## Detection
## Containment
## Recovery
`,
		draftSummary: 'IR playbook (elevated SLA demo)',
		authorEmail: demoEmail,
		contentRevision: 3,
		submittedContentRevision: 3,
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
				pool: [...LEGAL_ELEVATION],
				elevationPool: [...LEGAL_ELEVATION],
				slaHours: 4,
				activateDueAt: overdueDueAt,
				dueAt: overdueDueAt,
				claimedAt: null,
				elevated: true,
				elevatedAt: createdAt,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: null,
				decidedAt: null,
				submittedRevision: 3,
				approvedRevision: null,
			},
		],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'system@sla-processor',
				action: 'sla_elevated',
				message: 'SLA breached — elevated to chief counsel pool',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const readyToPublish: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Accessibility Standards',
		documentType: 'policy',
		status: 'approved',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'corporate',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Publish WCAG-aligned accessibility standards.',
		draftBodyMarkdown: `# Accessibility Standards

All public sites must meet WCAG 2.2 AA.
`,
		draftSummary: 'WCAG 2.2 AA standards',
		authorEmail: demoEmail,
		contentRevision: 4,
		submittedContentRevision: 4,
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
				assignmentMode: 'named',
				approverEmail: 'sam.compliance@contoso.com',
				approverDisplayName: 'Sam Compliance',
				role: 'Compliance',
				status: 'approved',
				pool: [...COMPLIANCE_POOL],
				elevationPool: [...COMPLIANCE_ELEVATION],
				slaHours: 24,
				activateDueAt: createdAt,
				dueAt: createdAt,
				claimedAt: createdAt,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: 'Looks good',
				decidedAt: createdAt,
				submittedRevision: 4,
				approvedRevision: 4,
			},
		],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'sam.compliance@contoso.com',
				action: 'approved',
				message: 'Fully approved — ready for SharePoint publish',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const rejected: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Gift Policy Amendment',
		documentType: 'policy',
		status: 'rejected',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'low',
		priorityReason: null,
		documentSubtypeId: 'hr',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Raise gift threshold to $100.',
		draftBodyMarkdown: `# Gift Policy Amendment

Threshold raised to $100 without further controls.
`,
		draftSummary: 'Gift threshold change (rejected demo)',
		authorEmail: demoEmail,
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
				assignmentMode: 'named',
				approverEmail: 'sam.compliance@contoso.com',
				approverDisplayName: 'Sam Compliance',
				role: 'Compliance',
				status: 'rejected',
				pool: [...COMPLIANCE_POOL],
				elevationPool: [...COMPLIANCE_ELEVATION],
				slaHours: 24,
				activateDueAt: createdAt,
				dueAt: createdAt,
				claimedAt: createdAt,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Legal Reviewers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: 'Need manager attestation language before approval',
				decidedAt: createdAt,
				submittedRevision: 2,
				approvedRevision: null,
			},
		],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'sam.compliance@contoso.com',
				action: 'rejected',
				message: 'Rejected — revise and resubmit',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const publishedPriorId = randomUUID();
	const successorId = randomUUID();

	const publishedPrior: MockDocumentRecord = {
		id: publishedPriorId,
		title: 'Remote Work Policy',
		documentType: 'policy',
		status: 'published',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...collab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'corporate',
		reviewComments: [],
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
		authorEmail: demoEmail,
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
				actorEmail: demoEmail,
				action: 'published',
				message: 'Published POL-2026-00001 v1',
			},
		],
		publishedPdfUrl: `${publishSite}/${encodeURIComponent(publishLibrary)}/POL-2026-00001-v1.pdf`,
		sharePointItemId: randomUUID(),
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const supersedeDraft: MockDocumentRecord = {
		id: successorId,
		title: 'Remote Work Policy (v2 draft)',
		documentType: 'policy',
		status: 'drafting',
		requesterEmail: demoEmail,
		collaboratorEmails: [...collab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'corporate',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Allow four remote days with quarterly manager review.',
		draftBodyMarkdown: `# Remote Work Policy

Employees may work remotely up to four days per week with quarterly manager review.
`,
		draftSummary: 'Remote work v2 supersede draft',
		authorEmail: demoEmail,
		contentRevision: 1,
		submittedContentRevision: null,
		publishedContentRevision: null,
		documentNumber: null,
		documentVersion: null,
		supersedesDocumentId: publishedPriorId,
		supersededByDocumentId: null,
		publishedAt: null,
		approvalSteps: [],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: demoEmail,
				action: 'supersede_started',
				message: 'Started superseding POL-2026-00001 v1',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const abandonedSuccessor: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Code of Conduct (abandoned revise)',
		documentType: 'policy',
		status: 'abandoned',
		requesterEmail: demoEmail,
		collaboratorEmails: [...collab],
		priority: 'low',
		priorityReason: null,
		documentSubtypeId: 'hr',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Abandoned supersede attempt for demo.',
		draftBodyMarkdown: `# Code of Conduct

Draft abandoned.
`,
		draftSummary: 'Abandoned successor demo',
		authorEmail: demoEmail,
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
				actorEmail: demoEmail,
				action: 'abandoned',
				message: 'Successor abandoned without publish',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const myRequest: MockDocumentRecord = {
		id: randomUUID(),
		title: 'My request — Parking permit FAQ',
		documentType: 'sop',
		status: 'requested',
		requesterEmail: demoEmail,
		collaboratorEmails: [demoEmail, 'casey.author@contoso.com'],
		priority: 'low',
		priorityReason: null,
		documentSubtypeId: 'operations',
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'FAQ for campus parking permits (demo: My requests persona).',
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
				actorEmail: demoEmail,
				action: 'requested',
				message: 'Submitted by local developer',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const ilarLeadPool: ApproverPerson[] = [
		...LEAD_ENGINEER_POOL,
		{ displayName: appConfig.localDemoUser.userName, email: demoEmail },
	];
	const ilarEngineerCollab = [
		demoEmail,
		'casey.author@contoso.com',
		'jamie.engineer@contoso.com',
	];
	const ilarChangeDraft = `# Standardize hotfix rollback checklist

## Intermediate Liaison Action Request
Hotfixes skip the rollback rehearsal used for planned releases. Capture the gap as an official process change.

## Current process
- Hotfix owners post in Slack and ship from \`main\` when severity is high.
- Rollback steps live in individual runbooks and are often skipped.

## Proposed process change
- Require the same rollback checklist as planned releases before any hotfix merge.
- Record owner, rehearsal time, and go/no-go in the official change record.

## Impact and rollout
- Applies to all production services.
- Lead engineers assign an individual engineer to finish the official change document.

## Official change record
- Change owner: Casey Author
- Effective date: pending assignment
- Systems / SOPs affected: release SOP, on-call runbooks
- Verification: one hotfix dry-run using the new checklist
`;

	const ilarRequested: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Standardize hotfix rollback checklist',
		documentType: 'ilar',
		status: 'requested',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...ilarEngineerCollab],
		priority: 'high',
		priorityReason: null,
		documentSubtypeId: 'sop',
		typeFieldValues: { relevantSystems: 'ci_release' },
		allowReviewerDraftEdit: true,
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
			'Hotfixes skip the rollback rehearsal used for planned releases. Please open an ILAR so engineering can turn this into an official process change.',
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
				message: 'ILAR submitted — routes to the engineering manager first',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const ilarPendingManager: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Require pairing for production schema changes',
		documentType: 'ilar',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...ilarEngineerCollab],
		priority: 'high',
		priorityReason: null,
		documentSubtypeId: 'sop',
		typeFieldValues: { relevantSystems: 'dataverse' },
		allowReviewerDraftEdit: true,
		reviewComments: [],
		currentApproverEmail: 'lee.engmgr@contoso.com',
		currentStepStatus: 'pending',
		currentStepDueAt: futureDueAt,
		currentStepElevated: false,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
			'A solo schema migrate locked checkout for 40 minutes. Request a process change that requires pairing plus a documented rollback before production schema work.',
		draftBodyMarkdown: `# Require pairing for production schema changes

## Intermediate Liaison Action Request
A solo schema migrate locked checkout for 40 minutes. Require pairing plus a documented rollback before production schema work.

## Current process
- An on-call engineer can apply schema changes alone.

## Proposed process change
- Pairing required for production schema changes.
- Official change record must list rollback owner before migrate.

## Impact and rollout
- Database platform and checkout services.

## Official change record
- Change owner:
- Effective date:
- Systems / SOPs affected: schema migrate SOP
- Verification:
`,
		draftSummary: 'ILAR: pair on production schema changes',
		authorEmail: 'casey.author@contoso.com',
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
				assignmentMode: 'named',
				approverEmail: 'lee.engmgr@contoso.com',
				approverDisplayName: 'Lee Engineering',
				role: 'Engineering Manager',
				status: 'pending',
				pool: [
					{
						displayName: 'Lee Engineering',
						email: 'lee.engmgr@contoso.com',
					},
				],
				elevationPool: [...ENG_MANAGER_ELEVATION],
				slaHours: 16,
				activateDueAt: futureDueAt,
				dueAt: futureDueAt,
				claimedAt: createdAt,
				elevated: false,
				elevatedAt: null,
				authorityLevel: 'authoritative',
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: null,
				decidedAt: null,
				submittedRevision: 2,
				approvedRevision: null,
			},
			{
				id: randomUUID(),
				order: 2,
				assignmentMode: 'pool',
				approverEmail: null,
				approverDisplayName: null,
				role: 'Lead Engineers',
				status: 'waiting',
				pool: [...ilarLeadPool],
				elevationPool: [...LEAD_ENGINEER_ELEVATION],
				slaHours: 24,
				activateDueAt: null,
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Lead Engineers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: null,
				decidedAt: null,
				submittedRevision: 2,
				approvedRevision: null,
			},
			{
				id: randomUUID(),
				order: 3,
				assignmentMode: 'pool',
				approverEmail: null,
				approverDisplayName: null,
				role: 'Assigned Engineers',
				status: 'waiting',
				pool: [...ASSIGNED_ENGINEER_POOL],
				elevationPool: [...ASSIGNED_ENGINEER_ELEVATION],
				slaHours: 48,
				activateDueAt: null,
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Assigned Engineers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
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
				actorEmail: 'casey.author@contoso.com',
				action: 'submitted_for_approval',
				message: 'Submitted — waiting on engineering manager before lead assignment',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const ilarLeadQueued: MockDocumentRecord = {
		id: randomUUID(),
		title: 'Retire ad-hoc deploy Slack channel',
		documentType: 'ilar',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: [...ilarEngineerCollab],
		priority: 'normal',
		priorityReason: null,
		documentSubtypeId: 'work_instruction',
		typeFieldValues: { relevantSystems: 'ci_release' },
		allowReviewerDraftEdit: true,
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: 'queued',
		currentStepDueAt: futureDueAt,
		currentStepElevated: false,
		currentPoolEmails: [
			'quinn.lead@contoso.com',
			'reese.lead@contoso.com',
			demoEmail,
		],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
			'Ad-hoc deploys are still coordinated in Slack. Turn that into an official change that routes every production deploy through the change record.',
		draftBodyMarkdown: ilarChangeDraft.replace(
			'Standardize hotfix rollback checklist',
			'Retire ad-hoc deploy Slack channel',
		).replace(
			'Hotfixes skip the rollback rehearsal used for planned releases. Capture the gap as an official process change.',
			'Ad-hoc deploys are still coordinated in Slack. Route every production deploy through the official change record.',
		),
		draftSummary: 'ILAR: official change for production deploys',
		authorEmail: demoEmail,
		contentRevision: 3,
		submittedContentRevision: 3,
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
				assignmentMode: 'named',
				approverEmail: 'lee.engmgr@contoso.com',
				approverDisplayName: 'Lee Engineering',
				role: 'Engineering Manager',
				status: 'approved',
				pool: [
					{
						displayName: 'Lee Engineering',
						email: 'lee.engmgr@contoso.com',
					},
				],
				elevationPool: [...ENG_MANAGER_ELEVATION],
				slaHours: 16,
				activateDueAt: createdAt,
				dueAt: createdAt,
				claimedAt: createdAt,
				elevated: false,
				elevatedAt: null,
				authorityLevel: 'authoritative',
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: 'Scoped — lead engineers should assign an owner to finish the official change.',
				decidedAt: createdAt,
				submittedRevision: 3,
				approvedRevision: 3,
			},
			{
				id: randomUUID(),
				order: 2,
				assignmentMode: 'pool',
				approverEmail: null,
				approverDisplayName: null,
				role: 'Lead Engineers',
				status: 'queued',
				pool: [...ilarLeadPool],
				elevationPool: [...LEAD_ENGINEER_ELEVATION],
				slaHours: 24,
				activateDueAt: futureDueAt,
				dueAt: futureDueAt,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Lead Engineers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: null,
				decidedAt: null,
				submittedRevision: 3,
				approvedRevision: null,
			},
			{
				id: randomUUID(),
				order: 3,
				assignmentMode: 'pool',
				approverEmail: null,
				approverDisplayName: null,
				role: 'Assigned Engineers',
				status: 'waiting',
				pool: [...ASSIGNED_ENGINEER_POOL],
				elevationPool: [...ASSIGNED_ENGINEER_ELEVATION],
				slaHours: 48,
				activateDueAt: null,
				dueAt: null,
				claimedAt: null,
				elevated: false,
				elevatedAt: null,
				authorityLevel: seedAuthorityForRole('Assigned Engineers'),
				commentPolicy: DEFAULT_COMMENT_POLICY,
				comment: null,
				decidedAt: null,
				submittedRevision: 3,
				approvedRevision: null,
			},
		],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail: 'lee.engmgr@contoso.com',
				action: 'approved',
				message: 'Engineering manager approved — lead engineer pool can assign an owner',
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: publishSite,
		requestedLibraryName: publishLibrary,
	};

	const giftStep = rejected.approvalSteps[0]!;
	const giftCommentId = randomUUID();
	const giftCommentBody = 'Need manager attestation language before approval';
	giftStep.authorityLevel = 'authoritative';
	giftStep.comment = giftCommentBody;
	rejected.reviewComments = [
		{
			id: giftCommentId,
			kind: 'decision',
			authorityLevel: 'authoritative',
			status: 'open',
			body: giftCommentBody,
			actorEmail: 'sam.compliance@contoso.com',
			actorDisplayName: 'Sam Compliance',
			role: 'Compliance',
			sourceStepId: giftStep.id,
			sourceStepOrder: 1,
			submittedContentRevision: 2,
			inReplyTo: null,
			createdAt,
		},
	];
	rejected.history = [
		{
			id: randomUUID(),
			at: createdAt,
			actorEmail: 'sam.compliance@contoso.com',
			action: 'rejected',
			message: 'Rejected by Compliance',
			reviewCommentId: giftCommentId,
		},
	];

	syncCurrentApprovalFields(queuedPool);
	syncCurrentApprovalFields(pendingNamed);
	syncCurrentApprovalFields(elevatedPool);
	syncCurrentApprovalFields(readyToPublish);
	syncCurrentApprovalFields(rejected);
	syncCurrentApprovalFields(ilarPendingManager);
	syncCurrentApprovalFields(ilarLeadQueued);

	const seeded = [
		requested,
		drafting,
		queuedPool,
		pendingNamed,
		elevatedPool,
		readyToPublish,
		rejected,
		publishedPrior,
		supersedeDraft,
		abandonedSuccessor,
		myRequest,
		ilarRequested,
		ilarPendingManager,
		ilarLeadQueued,
	];
	for (const document of seeded) {
		for (const step of document.approvalSteps) {
			step.authorityLevel = seedAuthorityForRole(step.role);
			step.commentPolicy = DEFAULT_COMMENT_POLICY;
		}
	}
	// Gift Policy rejection is authoritative Compliance feedback (do not infer-overwrite).
	rejected.approvalSteps[0]!.authorityLevel = 'authoritative';
	// ILAR engineering-manager intake is authoritative (do not infer-overwrite).
	ilarPendingManager.approvalSteps[0]!.authorityLevel = 'authoritative';
	ilarLeadQueued.approvalSteps[0]!.authorityLevel = 'authoritative';

	return seeded;
}
