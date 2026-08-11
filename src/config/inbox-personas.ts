import type { ApprovalStepStatus } from '../domain/approval-queue.ts';
import type { DocumentStatus } from '../domain/document-status.ts';

export type InboxPersona
	= | 'all'
		| 'waiting_on_me'
		| 'available_in_pool'
		| 'my_requests'
		| 'needs_draft'
		| 'ready_to_publish';

export interface PersonaFilterItem {
	title: string;
	value: InboxPersona;
	description: string;
}

export const INBOX_PERSONAS: PersonaFilterItem[] = [
	{
		title: 'All',
		value: 'all',
		description: 'Everything in the routing queue',
	},
	{
		title: 'Waiting on me',
		value: 'waiting_on_me',
		description: 'Named or claimed steps assigned to me',
	},
	{
		title: 'Available in my pool',
		value: 'available_in_pool',
		description: 'Queued pool steps I can claim',
	},
	{
		title: 'My requests',
		value: 'my_requests',
		description: 'Items I submitted',
	},
	{
		title: 'Needs draft',
		value: 'needs_draft',
		description: 'Requested items awaiting an author',
	},
	{
		title: 'Ready to publish',
		value: 'ready_to_publish',
		description: 'Fully approved and ready for SharePoint',
	},
];

export interface PersonaFilterableDocument {
	status: DocumentStatus;
	requesterEmail: string;
	currentApproverEmail?: string | null;
	currentStepStatus?: ApprovalStepStatus | null;
	currentPoolEmails?: string[] | null;
	authorEmail?: string | null;
	collaboratorEmails?: string[] | null;
}

/**
 * Suggests an actionable persona from the current list (waiting on me, then pool).
 * Returns null when nothing actionable is found.
 */
export function suggestInboxPersona(
	documents: PersonaFilterableDocument[],
	userEmail: string | undefined,
): InboxPersona | null {
	const email = userEmail?.toLowerCase();
	if (!email || documents.length === 0) {
		return null;
	}
	if (
		documents.some(
			(item) =>
				item.currentStepStatus === 'pending'
				&& item.currentApproverEmail?.toLowerCase() === email,
		)
	) {
		return 'waiting_on_me';
	}
	if (
		documents.some(
			(item) =>
				item.currentStepStatus === 'queued'
				&& item.currentPoolEmails?.some((member) => member.toLowerCase() === email),
		)
	) {
		return 'available_in_pool';
	}
	return null;
}

/**
 * Filters documents for persona-based inbox tabs using the signed-in email.
 */
export function matchesInboxPersona(
	document: PersonaFilterableDocument,
	persona: InboxPersona,
	userEmail: string | undefined,
	roles: readonly string[] = [],
): boolean {
	const email = userEmail?.toLowerCase();

	switch (persona) {
		case 'all':
			return true;
		case 'waiting_on_me':
			return Boolean(
				email
				&& document.currentApproverEmail?.toLowerCase() === email
				// Treat missing status as pending for older/partial payloads; never match queued.
				&& (document.currentStepStatus == null
					|| document.currentStepStatus === 'pending'),
			);
		case 'available_in_pool':
			return Boolean(
				email
				&& document.currentStepStatus === 'queued'
				&& document.currentPoolEmails?.some(
					(member) => member.toLowerCase() === email,
				),
			);
		case 'my_requests':
			return Boolean(email && document.requesterEmail.toLowerCase() === email);
		case 'needs_draft': {
			if (document.status !== 'requested' && document.status !== 'drafting') {
				return false;
			}
			if (!email) {
				return false;
			}
			const isCollaborator = document.collaboratorEmails?.some(
				(member) => member.toLowerCase() === email,
			);
			return Boolean(
				isCollaborator
				|| document.requesterEmail.toLowerCase() === email
				|| document.authorEmail?.toLowerCase() === email,
			);
		}
		case 'ready_to_publish': {
			if (document.status !== 'approved') {
				return false;
			}
			const normalized = roles.map((role) => role.trim().toLowerCase());
			return normalized.includes('publisher') || normalized.includes('admin');
		}
		default:
			return true;
	}
}
