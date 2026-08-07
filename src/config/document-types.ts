/**
 * Bundled document-type **seed** and template helpers for local demo / first boot.
 *
 * Runtime policy (labels, chains, pools, destinations) should come from the control API
 * (`listDocumentTypes` / Admin). Prefer API items in UI; use `findDocumentType` /
 * `getDocumentType` only as offline fallback when the control store is empty or a type
 * id is missing from the API response.
 */
import type { ApproverPerson } from '../domain/approval-queue.ts';

export type { ApproverPerson };

export interface NamedApprovalStepTemplate {
	mode: 'named';
	displayName: string;
	email: string;
	role: string;
	/** Optional SLA; when set, overdue named steps can elevate into elevationPool. */
	slaHours?: number;
	elevationPool?: ApproverPerson[];
}

export interface PoolApprovalStepTemplate {
	mode: 'pool';
	poolRole: string;
	pool: ApproverPerson[];
	/** Hours until timeout from queue activation (and again after elevation). */
	slaHours: number;
	/** Merged into the pool when SLA expires without a claim/decision. */
	elevationPool?: ApproverPerson[];
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
			'developer@example.com',
			'casey.author@contoso.com',
			'alex.requester@contoso.com',
		],
		approvalChain: [
			{
				mode: 'pool',
				poolRole: 'Legal Reviewers',
				slaHours: 8,
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
				elevationPool: [
					{
						displayName: 'Chris Compliance Lead',
						email: 'chris.compliance@contoso.com',
						role: 'Elevated Compliance',
					},
				],
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
			'developer@example.com',
			'casey.author@contoso.com',
		],
		approvalChain: [
			{
				mode: 'pool',
				poolRole: 'Operations Reviewers',
				slaHours: 4,
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
		authorTeamEmails: ['developer@example.com', 'casey.author@contoso.com'],
		approvalChain: [
			{
				mode: 'named',
				displayName: 'Morgan Communications',
				email: 'morgan.comms@contoso.com',
				role: 'Communications',
				slaHours: 12,
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
		if (step.mode === 'named') {
			return {
				assignmentMode: 'named' as const,
				role: step.role,
				slaHours: step.slaHours,
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
