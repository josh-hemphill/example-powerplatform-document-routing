/**
 * Bundled document-type **seed** and template helpers for local demo / first boot.
 *
 * Runtime policy (labels, chains, pools, destinations) should come from the control API
 * (`listDocumentTypes` / Admin). Prefer API items in UI; use `findDocumentType` /
 * `getDocumentType` only as offline fallback when the control store is empty or a type
 * id is missing from the API response.
 */
import type { ApproverPerson } from '../domain/approval-queue.ts';
import type { AuthorityLevel, CommentPolicy } from '../domain/review-comments.ts';
import { DEFAULT_COMMENT_POLICY, seedAuthorityForRole } from '../domain/review-comments.ts';
import { localDemoUser } from './local-demo-user.ts';

export type { ApproverPerson };

export interface NamedApprovalStepTemplate {
	mode: 'named';
	displayName: string;
	email: string;
	role: string;
	/** Optional SLA; when set, overdue named steps can elevate into elevationPool. */
	slaHours?: number;
	elevationPool?: ApproverPerson[];
	authorityLevel?: AuthorityLevel;
	commentPolicy?: CommentPolicy;
}

export interface PoolApprovalStepTemplate {
	mode: 'pool';
	poolRole: string;
	pool: ApproverPerson[];
	/** Hours until timeout from queue activation (and again after elevation). */
	slaHours: number;
	/** Merged into the pool when SLA expires without a claim/decision. */
	elevationPool?: ApproverPerson[];
	authorityLevel?: AuthorityLevel;
	commentPolicy?: CommentPolicy;
}

export type ApprovalStepTemplate
	= | NamedApprovalStepTemplate
		| PoolApprovalStepTemplate;

/** @deprecated Prefer ApprovalStepTemplate; kept for simple named-only edits. */
export interface ApproverTemplate {
	displayName: string;
	email: string;
	role: string;
}

export interface DocumentSubtypeDefinition {
	key: string;
	label: string;
	description: string;
	requestHint?: string;
	draftScaffold?: string;
	numberPrefix?: string;
	usesOwnChain?: boolean;
	approvalChain?: ApprovalStepTemplate[];
}

export interface DocumentTypeDefinition {
	id: string;
	label: string;
	description: string;
	requestHint: string;
	draftTemplate: string;
	folderPath?: string;
	/**
	 * Emails shared on create so peers can co-edit requested/drafting documents
	 * (mirrors Dataverse author collaboration team).
	 */
	authorTeamEmails?: string[];
	approvalChain: ApprovalStepTemplate[];
	subtypes?: DocumentSubtypeDefinition[];
}

export const documentTypes: DocumentTypeDefinition[] = [
	{
		id: 'policy',
		label: 'Policy',
		description: 'Corporate or departmental policy documents',
		requestHint:
      'Describe the policy outcome, who it applies to, and any must-have controls or exceptions.',
		draftTemplate: `# {{title}}

## Purpose
Summarize why this policy exists.

## Scope
Who and what this policy covers.

## Policy
- 

## Related request
{{request}}
`,
		folderPath: '/Policies',
		authorTeamEmails: [
			localDemoUser.email,
			'casey.author@contoso.com',
			'alex.requester@contoso.com',
		],
		approvalChain: [
			{
				mode: 'pool',
				poolRole: 'Legal Reviewers',
				slaHours: 8,
				authorityLevel: 'authoritative',
				commentPolicy: 'required_on_reject',
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
			},
			{
				mode: 'named',
				displayName: 'Sam Compliance',
				email: 'sam.compliance@contoso.com',
				role: 'Compliance',
				slaHours: 24,
				authorityLevel: 'authoritative',
				commentPolicy: 'required_on_reject',
				elevationPool: [
					{
						displayName: 'Chris Compliance Lead',
						email: 'chris.compliance@contoso.com',
						role: 'Elevated Compliance',
					},
				],
			},
		],
		subtypes: [
			{
				key: 'corporate',
				label: 'Corporate',
				description: 'Company-wide policy',
			},
			{
				key: 'hr',
				label: 'HR',
				description: 'People / HR policy',
			},
		],
	},
	{
		id: 'sop',
		label: 'SOP',
		description: 'Standard operating procedure / how-to',
		requestHint:
      'Describe the process steps that need documenting, systems involved, and the owning team.',
		draftTemplate: `# {{title}}

## Overview
{{request}}

## Prerequisites
- 

## Procedure
1. 

## Verification
- 
`,
		folderPath: '/SOPs',
		authorTeamEmails: [
			localDemoUser.email,
			'casey.author@contoso.com',
		],
		approvalChain: [
			{
				mode: 'pool',
				poolRole: 'Operations Reviewers',
				slaHours: 4,
				authorityLevel: 'standard',
				commentPolicy: 'required_on_reject',
				pool: [
					{
						displayName: 'Casey Operations',
						email: 'casey.ops@contoso.com',
					},
					{
						displayName: 'Taylor Ops',
						email: 'taylor.ops@contoso.com',
					},
				],
				elevationPool: [
					{
						displayName: 'Jamie Ops Lead',
						email: 'jamie.ops@contoso.com',
					},
				],
			},
			{
				mode: 'named',
				displayName: 'Riley QA',
				email: 'riley.qa@contoso.com',
				role: 'Quality',
				slaHours: 8,
				authorityLevel: 'standard',
				commentPolicy: 'required_on_reject',
			},
		],
		subtypes: [
			{
				key: 'operations',
				label: 'Operations',
				description: 'Day-to-day operational procedure',
			},
			{
				key: 'safety',
				label: 'Safety',
				description: 'Safety-critical SOP with its own QA-first chain',
				usesOwnChain: true,
				approvalChain: [
					{
						mode: 'named',
						displayName: 'Riley QA',
						email: 'riley.qa@contoso.com',
						role: 'Quality',
						slaHours: 8,
						authorityLevel: 'standard',
						commentPolicy: 'required_on_reject',
					},
					{
						mode: 'pool',
						poolRole: 'Operations Reviewers',
						slaHours: 4,
						authorityLevel: 'standard',
						commentPolicy: 'required_on_reject',
						pool: [
							{
								displayName: 'Casey Operations',
								email: 'casey.ops@contoso.com',
							},
							{
								displayName: 'Taylor Ops',
								email: 'taylor.ops@contoso.com',
							},
						],
						elevationPool: [
							{
								displayName: 'Jamie Ops Lead',
								email: 'jamie.ops@contoso.com',
							},
						],
					},
				],
			},
		],
	},
	{
		id: 'announcement',
		label: 'Announcement',
		description: 'Org-wide or team announcement for publication',
		requestHint:
      'Paste talking points, audience, publish date, and any links that must appear.',
		draftTemplate: `# {{title}}

{{request}}

## Call to action
- 
`,
		folderPath: '/Announcements',
		authorTeamEmails: [localDemoUser.email, 'casey.author@contoso.com'],
		approvalChain: [
			{
				mode: 'named',
				displayName: 'Morgan Communications',
				email: 'morgan.comms@contoso.com',
				role: 'Communications',
				slaHours: 12,
				authorityLevel: 'standard',
				commentPolicy: 'required_on_reject',
			},
		],
	},
	{
		id: 'ilar',
		label: 'ILAR',
		description:
			'Intermediate Lesson Action Request — process-change request that becomes an official change document',
		requestHint:
			'Describe the process gap or lesson, the change you want, who is affected, and any deadline or risk.',
		draftTemplate: `# {{title}}

## Intermediate Lesson Action Request
{{request}}

## Current process
- 

## Proposed process change
- 

## Impact and rollout
- 

## Official change record
- Change owner:
- Effective date:
- Systems / SOPs affected:
- Verification:
`,
		folderPath: '/Process-Changes',
		authorTeamEmails: [
			localDemoUser.email,
			'casey.author@contoso.com',
			'jamie.engineer@contoso.com',
		],
		approvalChain: [
			{
				mode: 'named',
				displayName: 'Lee Engineering',
				email: 'lee.engmgr@contoso.com',
				role: 'Engineering Manager',
				slaHours: 16,
				authorityLevel: 'authoritative',
				commentPolicy: 'required_on_reject',
				elevationPool: [
					{
						displayName: 'Dana Director of Engineering',
						email: 'dana.director@contoso.com',
						role: 'Elevated Engineering Manager',
					},
				],
			},
			{
				mode: 'pool',
				poolRole: 'Lead Engineers',
				slaHours: 24,
				authorityLevel: 'standard',
				commentPolicy: 'required_on_reject',
				pool: [
					{
						displayName: 'Quinn Lead',
						email: 'quinn.lead@contoso.com',
					},
					{
						displayName: 'Reese Lead',
						email: 'reese.lead@contoso.com',
					},
					{
						displayName: localDemoUser.userName,
						email: localDemoUser.email,
					},
				],
				elevationPool: [
					{
						displayName: 'Sasha Principal',
						email: 'sasha.principal@contoso.com',
						role: 'Elevated Lead Engineer',
					},
				],
			},
			{
				mode: 'pool',
				poolRole: 'Assigned Engineers',
				slaHours: 48,
				authorityLevel: 'standard',
				commentPolicy: 'required_on_reject',
				pool: [
					{
						displayName: 'Casey Author',
						email: 'casey.author@contoso.com',
					},
					{
						displayName: 'Jamie Engineer',
						email: 'jamie.engineer@contoso.com',
					},
				],
				elevationPool: [
					{
						displayName: 'Quinn Lead',
						email: 'quinn.lead@contoso.com',
						role: 'Elevated Assigned Engineer',
					},
				],
			},
		],
	},
];

export const DEFAULT_DOCUMENT_TYPE_ID = documentTypes[0].id;

/**
 * Looks up a document type by id; returns undefined when unknown.
 */
export function findDocumentType(
	id: string | null | undefined,
): DocumentTypeDefinition | undefined {
	if (!id) {
		return undefined;
	}
	return documentTypes.find((type) => type.id === id);
}

/**
 * Seed-config lookup with default fallback for display/offline only.
 * Prefer control API types in UI; use `findDocumentType` when absence must be explicit.
 */
export function getDocumentType(
	id: string | null | undefined,
): DocumentTypeDefinition {
	return findDocumentType(id) ?? documentTypes[0];
}

/**
 * Looks up a bundled subtype by type id and subtype key.
 */
export function findDocumentSubtype(
	typeId: string | null | undefined,
	subtypeId: string | null | undefined,
): DocumentSubtypeDefinition | undefined {
	if (!typeId || !subtypeId) {
		return undefined;
	}
	return findDocumentType(typeId)?.subtypes?.find(
		(subtype) => subtype.key === subtypeId,
	);
}

/**
 * Formats `Policy · HR` when a subtype label is present.
 */
export function formatTypeSubtypeLabel(
	typeLabel: string,
	subtypeLabel?: string | null,
): string {
	const subtype = subtypeLabel?.trim();
	if (!subtype) {
		return typeLabel;
	}
	return `${typeLabel} · ${subtype}`;
}

/**
 * Builds a draft Markdown body from the type template.
 */
export function buildDraftFromTemplate(
	type: DocumentTypeDefinition,
	title: string,
	request: string,
): string {
	return type.draftTemplate
		.replaceAll('{{title}}', title)
		.replaceAll('{{request}}', request);
}

/**
 * Maps config approval templates into OpenAPI submit step payloads.
 */
export function toApprovalStepInputs(chain: ApprovalStepTemplate[]) {
	return chain.map((step) => {
		const role = step.mode === 'named' ? step.role : step.poolRole;
		const authorityLevel = step.authorityLevel ?? seedAuthorityForRole(role);
		const commentPolicy = step.commentPolicy ?? DEFAULT_COMMENT_POLICY;
		if (step.mode === 'named') {
			return {
				assignmentMode: 'named' as const,
				role: step.role,
				slaHours: step.slaHours,
				authorityLevel,
				commentPolicy,
				assignee: {
					displayName: step.displayName,
					email: step.email,
					role: step.role,
				},
				elevationPool: step.elevationPool,
			};
		}

		return {
			assignmentMode: 'pool' as const,
			role: step.poolRole,
			slaHours: step.slaHours,
			authorityLevel,
			commentPolicy,
			pool: step.pool,
			elevationPool: step.elevationPool,
		};
	});
}

/**
 * Select items for Vuetify selects.
 */
export function documentTypeSelectItems(): Array<{
	title: string;
	value: string;
	subtitle: string;
}> {
	return documentTypes.map((type) => ({
		title: type.label,
		value: type.id,
		subtitle: type.description,
	}));
}
