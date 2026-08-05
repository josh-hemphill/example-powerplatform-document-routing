import type { ApprovalStepStatus } from '../domain/approval-queue';
import type { DocumentStatus } from '../domain/document-status';

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
 * Filters documents for persona-based inbox tabs using the signed-in email.
 */
export function matchesInboxPersona(
	document: PersonaFilterableDocument,
	persona: InboxPersona,
	userEmail: string | undefined,
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
		case 'ready_to_publish':
			return document.status === 'approved';
		default:
			return true;
	}
}
