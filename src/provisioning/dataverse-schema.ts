/**
 * Declarative Dataverse schema for Document Routing.
 *
 * Collaboration model (Phase 1 default): **user-owned** document rows shared at
 * create-time with the document type’s author collaboration team/group so peers
 * can read/co-edit drafts before submit. Approvals and publish remain role-gated.
 *
 * SLA model: `activatedueat` is set when a step becomes active and must not move
 * on claim/release. Named-step elevation converts the step to an elevated pool
 * queue (see `elevationsemantics`).
 */

export type DataverseColumnType
	= | 'string'
		| 'memo'
		| 'integer'
		| 'decimal'
		| 'boolean'
		| 'datetime'
		| 'choice'
		| 'lookup';

export interface DataverseChoiceOption {
	value: number;
	label: string;
}

export interface DataverseColumnDefinition {
	/** Logical name without publisher prefix (prefix is applied at generate time). */
	schemaName: string;
	displayName: string;
	description?: string;
	type: DataverseColumnType;
	required?: boolean;
	maxLength?: number;
	precision?: number;
	/** For choice columns */
	options?: DataverseChoiceOption[];
	/** For lookup columns — target table schema name without prefix */
	targetTable?: string;
	/** Primary name column for the table */
	isPrimaryName?: boolean;
}

export interface DataverseTableDefinition {
	schemaName: string;
	displayName: string;
	displayNamePlural: string;
	description: string;
	ownership: 'user' | 'organization';
	columns: DataverseColumnDefinition[];
}

export interface EnvironmentVariableDefinition {
	schemaName: string;
	displayName: string;
	description: string;
	/** Connection profile path used to seed default value, e.g. sharePoint.siteUrl */
	defaultFrom?: string;
	type: 'string' | 'json';
}

export interface DataverseSchema {
	tables: DataverseTableDefinition[];
	environmentVariables: EnvironmentVariableDefinition[];
}

export const DEFAULT_OPTION_VALUE_PREFIX = 72_700;

/** Align document title length with OpenAPI / UI validation. */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/**
 * Builds choice option values from a publisher option-value prefix (e.g. 72700 → 727000000+).
 */
export function choiceOptionsFromPrefix(
	optionValuePrefix: number,
	entries: Array<{ offset: number; label: string }>,
): DataverseChoiceOption[] {
	const base = optionValuePrefix * 10_000;
	return entries.map((entry) => ({
		value: base + entry.offset,
		label: entry.label,
	}));
}

function buildChoiceSets(optionValuePrefix: number): {
	documentStatuses: DataverseChoiceOption[];
	priorities: DataverseChoiceOption[];
	stepStatuses: DataverseChoiceOption[];
	assignmentModes: DataverseChoiceOption[];
	elevationSemantics: DataverseChoiceOption[];
	chainStepModes: DataverseChoiceOption[];
	authorityLevels: DataverseChoiceOption[];
	commentPolicies: DataverseChoiceOption[];
	reviewCommentKinds: DataverseChoiceOption[];
	reviewCommentStatuses: DataverseChoiceOption[];
	priorityColors: DataverseChoiceOption[];
} {
	return {
		documentStatuses: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 0, label: 'requested' },
			{ offset: 1, label: 'drafting' },
			{ offset: 2, label: 'in_review' },
			{ offset: 3, label: 'approved' },
			{ offset: 4, label: 'rejected' },
			{ offset: 5, label: 'published' },
			{ offset: 6, label: 'superseded' },
		]),
		priorities: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 10, label: 'low' },
			{ offset: 11, label: 'normal' },
			{ offset: 12, label: 'high' },
			{ offset: 13, label: 'mission_critical' },
		]),
		stepStatuses: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 20, label: 'waiting' },
			{ offset: 21, label: 'queued' },
			{ offset: 22, label: 'pending' },
			{ offset: 23, label: 'approved' },
			{ offset: 24, label: 'rejected' },
			{ offset: 25, label: 'skipped' },
		]),
		assignmentModes: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 30, label: 'named' },
			{ offset: 31, label: 'pool' },
		]),
		elevationSemantics: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 40, label: 'convert_to_elevated_pool' },
			{ offset: 41, label: 'reassign_escalation_owner' },
		]),
		chainStepModes: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 50, label: 'named' },
			{ offset: 51, label: 'pool' },
		]),
		authorityLevels: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 60, label: 'advisory' },
			{ offset: 61, label: 'standard' },
			{ offset: 62, label: 'authoritative' },
		]),
		commentPolicies: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 70, label: 'optional' },
			{ offset: 71, label: 'required_on_reject' },
			{ offset: 72, label: 'required_on_decision' },
		]),
		reviewCommentKinds: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 80, label: 'decision' },
			{ offset: 81, label: 'submission' },
			{ offset: 82, label: 'author_response' },
			{ offset: 83, label: 'acknowledgement' },
		]),
		reviewCommentStatuses: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 90, label: 'open' },
			{ offset: 91, label: 'addressed' },
			{ offset: 92, label: 'acknowledged' },
			{ offset: 93, label: 'voided' },
		]),
		priorityColors: choiceOptionsFromPrefix(optionValuePrefix, [
			{ offset: 100, label: 'default' },
			{ offset: 101, label: 'info' },
			{ offset: 102, label: 'warning' },
			{ offset: 103, label: 'error' },
		]),
	};
}

/**
 * Returns the Document Routing Dataverse schema for a publisher prefix.
 */
export function buildDataverseSchema(
	prefix: string,
	optionValuePrefix: number = DEFAULT_OPTION_VALUE_PREFIX,
): DataverseSchema {
	const p = prefix.toLowerCase();
	const {
		documentStatuses,
		stepStatuses,
		assignmentModes,
		elevationSemantics,
		chainStepModes,
		authorityLevels,
		commentPolicies,
		reviewCommentKinds,
		reviewCommentStatuses,
		priorityColors,
	} = buildChoiceSets(optionValuePrefix);

	const tables: DataverseTableDefinition[] = [
		{
			schemaName: 'publishdestination',
			displayName: 'Document Routing Publish Destination',
			displayNamePlural: 'Document Routing Publish Destinations',
			description:
				'Allowlisted SharePoint site/library/folder roots for PDF publish (HTTPS / vanity hosts OK)',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 200,
					isPrimaryName: true,
				},
				{
					schemaName: 'siteurl',
					displayName: 'Site URL',
					description: 'HTTPS site URL; custom / vanity domains allowed',
					type: 'string',
					required: true,
					maxLength: 2000,
				},
				{
					schemaName: 'libraryname',
					displayName: 'Library Name',
					type: 'string',
					required: true,
					maxLength: 400,
				},
				{
					schemaName: 'folderpath',
					displayName: 'Folder Path',
					description: 'Root folder under the library (leading slash)',
					type: 'string',
					maxLength: 1000,
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
			],
		},
		{
			schemaName: 'approverpool',
			displayName: 'Document Routing Approver Pool',
			displayNamePlural: 'Document Routing Approver Pools',
			description: 'Named approval pool (e.g. Legal Reviewers) used by chain templates',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 200,
					isPrimaryName: true,
				},
				{
					schemaName: 'description',
					displayName: 'Description',
					type: 'memo',
					maxLength: 4000,
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
			],
		},
		{
			schemaName: 'approverpoolmember',
			displayName: 'Document Routing Approver Pool Member',
			displayNamePlural: 'Document Routing Approver Pool Members',
			description:
				'Pool membership. Prefer systemuser when available; email/UPN denormalized for inbox filters.',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 200,
					isPrimaryName: true,
				},
				{
					schemaName: 'pool',
					displayName: 'Pool',
					type: 'lookup',
					required: true,
					targetTable: 'approverpool',
				},
				{
					schemaName: 'displayname',
					displayName: 'Display Name',
					type: 'string',
					required: true,
					maxLength: 400,
				},
				{
					schemaName: 'email',
					displayName: 'Email',
					description: 'Canonical email / UPN used for pool eligibility checks',
					type: 'string',
					required: true,
					maxLength: 320,
				},
				{
					schemaName: 'role',
					displayName: 'Role Label',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
			],
		},
		{
			schemaName: 'documenttype',
			displayName: 'Document Routing Document Type',
			displayNamePlural: 'Document Routing Document Types',
			description:
				'Control record for type label, draft scaffold, default destination, and policy version',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					description: 'Stable type id (e.g. policy, sop)',
					type: 'string',
					required: true,
					maxLength: 100,
					isPrimaryName: true,
				},
				{
					schemaName: 'label',
					displayName: 'Label',
					type: 'string',
					required: true,
					maxLength: 200,
				},
				{
					schemaName: 'description',
					displayName: 'Description',
					type: 'memo',
					maxLength: 4000,
				},
				{
					schemaName: 'requesthint',
					displayName: 'Request Hint',
					type: 'memo',
					maxLength: 4000,
				},
				{
					schemaName: 'draftscaffold',
					displayName: 'Draft Scaffold',
					description: 'Markdown template with {{title}} / {{request}} placeholders',
					type: 'memo',
					maxLength: 100_000,
				},
				{
					schemaName: 'defaultfolderpath',
					displayName: 'Default Folder Path',
					type: 'string',
					maxLength: 1000,
				},
				{
					schemaName: 'defaultdestination',
					displayName: 'Default Publish Destination',
					type: 'lookup',
					targetTable: 'publishdestination',
				},
				{
					schemaName: 'authorteamexternalid',
					displayName: 'Author Collaboration Team Id',
					description:
						'Access team / Entra group id shared on create for collaborative drafting',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'policyversion',
					displayName: 'Policy Version',
					type: 'integer',
					required: true,
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
				{
					schemaName: 'numberprefix',
					displayName: 'Number Prefix',
					description: 'Controlled document number prefix (e.g. POL)',
					type: 'string',
					maxLength: 20,
				},
				{
					schemaName: 'numberpattern',
					displayName: 'Number Pattern',
					description: 'Template with {prefix}, {yyyy}, {seq:N}',
					type: 'string',
					maxLength: 100,
				},
				{
					schemaName: 'nextsequence',
					displayName: 'Next Sequence',
					description: 'Next sequence value for document number allocation',
					type: 'integer',
					required: true,
				},
			],
		},
		{
			schemaName: 'approvalchainstep',
			displayName: 'Document Routing Approval Chain Step',
			displayNamePlural: 'Document Routing Approval Chain Steps',
			description: 'Ordered template step for a document type (named or pool + SLA)',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 200,
					isPrimaryName: true,
				},
				{
					schemaName: 'documenttype',
					displayName: 'Document Type',
					type: 'lookup',
					required: true,
					targetTable: 'documenttype',
				},
				{
					schemaName: 'steporder',
					displayName: 'Step Order',
					type: 'integer',
					required: true,
				},
				{
					schemaName: 'assignmentmode',
					displayName: 'Assignment Mode',
					type: 'choice',
					required: true,
					options: chainStepModes,
				},
				{
					schemaName: 'role',
					displayName: 'Role',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'namedapproveremail',
					displayName: 'Named Approver Email',
					type: 'string',
					maxLength: 320,
				},
				{
					schemaName: 'namedapproverdisplayname',
					displayName: 'Named Approver Display Name',
					type: 'string',
					maxLength: 400,
				},
				{
					schemaName: 'pool',
					displayName: 'Approver Pool',
					type: 'lookup',
					targetTable: 'approverpool',
				},
				{
					schemaName: 'elevationpool',
					displayName: 'Elevation Pool',
					type: 'lookup',
					targetTable: 'approverpool',
				},
				{
					schemaName: 'slahours',
					displayName: 'SLA Hours',
					type: 'decimal',
					precision: 2,
				},
				{
					schemaName: 'elevationsemantics',
					displayName: 'Elevation Semantics',
					description:
						'On SLA breach for named steps: convert_to_elevated_pool (default) or reassign_escalation_owner',
					type: 'choice',
					options: elevationSemantics,
				},
				{
					schemaName: 'authoritylevel',
					displayName: 'Authority Level',
					description: 'Frozen onto runtime steps and review comments at submit',
					type: 'choice',
					required: true,
					options: authorityLevels,
				},
				{
					schemaName: 'commentpolicy',
					displayName: 'Comment Policy',
					description: 'When a decision comment is required (enforced server-side)',
					type: 'choice',
					required: true,
					options: commentPolicies,
				},
				{
					schemaName: 'documentsubtype',
					displayName: 'Document Subtype',
					description: 'When set, this template step belongs to a subtype-owned chain',
					type: 'lookup',
					targetTable: 'documentsubtype',
				},
			],
		},
		{
			schemaName: 'appsetting',
			displayName: 'Document Routing App Setting',
			displayNamePlural: 'Document Routing App Settings',
			description: 'Feature flags and org-wide routing settings (Admin page)',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Key',
					type: 'string',
					required: true,
					maxLength: 200,
					isPrimaryName: true,
				},
				{
					schemaName: 'value',
					displayName: 'Value',
					description: 'String or JSON value depending on key',
					type: 'memo',
					maxLength: 50_000,
				},
				{
					schemaName: 'description',
					displayName: 'Description',
					type: 'memo',
					maxLength: 4000,
				},
			],
		},
		{
			schemaName: 'document',
			displayName: 'Document Routing Document',
			displayNamePlural: 'Document Routing Documents',
			description:
				'Case record for freeform request → collaborative draft → approvals → publish. User-owned; shared with author team while drafting.',
			ownership: 'user',
			columns: [
				{
					schemaName: 'title',
					displayName: 'Title',
					type: 'string',
					required: true,
					maxLength: DOCUMENT_TITLE_MAX_LENGTH,
					isPrimaryName: true,
				},
				{
					schemaName: 'documenttypeid',
					displayName: 'Document Type Id',
					description: 'Stable type key (mirrors documenttype.name); prefer typedocument lookup when set',
					type: 'string',
					required: true,
					maxLength: 100,
				},
				{
					schemaName: 'typedocument',
					displayName: 'Document Type',
					type: 'lookup',
					targetTable: 'documenttype',
				},
				{
					schemaName: 'status',
					displayName: 'Status',
					type: 'choice',
					required: true,
					options: documentStatuses,
				},
				{
					schemaName: 'freeformrequest',
					displayName: 'Freeform Request',
					type: 'memo',
					required: true,
					maxLength: 100_000,
				},
				{
					schemaName: 'priority',
					displayName: 'Priority',
					description:
						'Catalog key matching prioritylevel.key (string, not a closed choice). Existing orgs with a choice column should dual-read until migrated.',
					type: 'string',
					maxLength: 64,
				},
				{
					schemaName: 'priorityreason',
					displayName: 'Priority Reason',
					description: 'Required when the catalog row requiresReason (e.g. mission_critical)',
					type: 'memo',
					maxLength: 10_000,
				},
				{
					schemaName: 'documentsubtypeid',
					displayName: 'Document Subtype Id',
					description: 'Stable subtype key (mirrors documentsubtype.key)',
					type: 'string',
					maxLength: 100,
				},
				{
					schemaName: 'typedocumentsubtype',
					displayName: 'Document Subtype',
					type: 'lookup',
					targetTable: 'documentsubtype',
				},
				{
					schemaName: 'requesteremail',
					displayName: 'Requester Email',
					type: 'string',
					required: true,
					maxLength: 320,
				},
				{
					schemaName: 'authoremail',
					displayName: 'Author Email',
					type: 'string',
					maxLength: 320,
				},
				{
					schemaName: 'draftbodymarkdown',
					displayName: 'Draft Body Markdown',
					type: 'memo',
					maxLength: 200_000,
				},
				{
					schemaName: 'draftsummary',
					displayName: 'Draft Summary',
					type: 'memo',
					maxLength: 10_000,
				},
				{
					schemaName: 'contentrevision',
					displayName: 'Content Revision',
					description: 'Incremented on each draft save; frozen into approvals on submit',
					type: 'integer',
					required: true,
				},
				{
					schemaName: 'submittedcontentrevision',
					displayName: 'Submitted Content Revision',
					description: 'contentRevision frozen at submit-for-approval',
					type: 'integer',
				},
				{
					schemaName: 'publishedcontentrevision',
					displayName: 'Published Content Revision',
					description: 'contentRevision of the artifact currently published',
					type: 'integer',
				},
				{
					schemaName: 'documentnumber',
					displayName: 'Document Number',
					description: 'Human-facing controlled number assigned on first publish',
					type: 'string',
					maxLength: 100,
				},
				{
					schemaName: 'documentversion',
					displayName: 'Document Version',
					description: 'Controlled version (1 on first publish; increments on superseding publish)',
					type: 'integer',
				},
				{
					schemaName: 'supersedesdocument',
					displayName: 'Supersedes Document',
					description: 'Prior published document this case will replace',
					type: 'lookup',
					targetTable: 'document',
				},
				{
					schemaName: 'supersededbydocument',
					displayName: 'Superseded By Document',
					description: 'Successor document that replaced this one',
					type: 'lookup',
					targetTable: 'document',
				},
				{
					schemaName: 'publishedat',
					displayName: 'Published At',
					description: 'When this controlled version was published',
					type: 'datetime',
				},
				{
					schemaName: 'policyversion',
					displayName: 'Policy Version Applied',
					description: 'documenttype.policyversion captured at submit-for-approval',
					type: 'integer',
				},
				{
					schemaName: 'currentapproveremail',
					displayName: 'Current Approver Email',
					type: 'string',
					maxLength: 320,
				},
				{
					schemaName: 'currentstepstatus',
					displayName: 'Current Step Status',
					type: 'choice',
					options: stepStatuses,
				},
				{
					schemaName: 'currentstepdueat',
					displayName: 'Current Step Due At',
					type: 'datetime',
				},
				{
					schemaName: 'currentstepelevated',
					displayName: 'Current Step Elevated',
					type: 'boolean',
				},
				{
					schemaName: 'currentpoolemails',
					displayName: 'Current Pool Emails JSON',
					description: 'JSON array of emails eligible to claim the active pool step',
					type: 'memo',
					maxLength: 10_000,
				},
				{
					schemaName: 'publishdestination',
					displayName: 'Publish Destination',
					type: 'lookup',
					targetTable: 'publishdestination',
				},
				{
					schemaName: 'publishfolderoverride',
					displayName: 'Publish Folder Override',
					description: 'Optional relative folder under the allowlisted destination root',
					type: 'string',
					maxLength: 1000,
				},
				{
					schemaName: 'publishedpdfurl',
					displayName: 'Published PDF URL',
					type: 'string',
					maxLength: 2000,
				},
				{
					schemaName: 'sharepointitemid',
					displayName: 'SharePoint Item Id',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'requestedpublishsiteurl',
					displayName: 'Requested Publish Site URL (legacy soft preference)',
					description: 'Soft preference only; trusted publish uses publishdestination lookup',
					type: 'string',
					maxLength: 2000,
				},
				{
					schemaName: 'requestedlibraryname',
					displayName: 'Requested Library Name (legacy soft preference)',
					type: 'string',
					maxLength: 400,
				},
				{
					schemaName: 'requestedfolderpath',
					displayName: 'Requested Folder Path (legacy soft preference)',
					type: 'string',
					maxLength: 1000,
				},
				{
					schemaName: 'requestedfilename',
					displayName: 'Requested File Name',
					type: 'string',
					maxLength: 400,
				},
			],
		},
		{
			schemaName: 'approvalstep',
			displayName: 'Document Routing Approval Step',
			displayNamePlural: 'Document Routing Approval Steps',
			description: 'Named or pool approval step with immutable activate SLA deadline',
			ownership: 'user',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 400,
					isPrimaryName: true,
				},
				{
					schemaName: 'document',
					displayName: 'Document',
					type: 'lookup',
					required: true,
					targetTable: 'document',
				},
				{
					schemaName: 'order',
					displayName: 'Order',
					type: 'integer',
					required: true,
				},
				{
					schemaName: 'assignmentmode',
					displayName: 'Assignment Mode',
					type: 'choice',
					required: true,
					options: assignmentModes,
				},
				{
					schemaName: 'approveremail',
					displayName: 'Approver Email',
					type: 'string',
					maxLength: 320,
				},
				{
					schemaName: 'approverdisplayname',
					displayName: 'Approver Display Name',
					type: 'string',
					maxLength: 400,
				},
				{
					schemaName: 'role',
					displayName: 'Role',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'status',
					displayName: 'Status',
					type: 'choice',
					required: true,
					options: stepStatuses,
				},
				{
					schemaName: 'pooljson',
					displayName: 'Pool JSON',
					type: 'memo',
					maxLength: 50_000,
				},
				{
					schemaName: 'elevationpooljson',
					displayName: 'Elevation Pool JSON',
					type: 'memo',
					maxLength: 50_000,
				},
				{
					schemaName: 'slahours',
					displayName: 'SLA Hours',
					type: 'decimal',
					precision: 2,
				},
				{
					schemaName: 'activatedueat',
					displayName: 'Activate Due At',
					description:
						'Immutable SLA deadline from step activation; claim/release must not move this',
					type: 'datetime',
				},
				{
					schemaName: 'dueat',
					displayName: 'Due At (denormalized)',
					description: 'Mirrors activatedueat for inbox filters; do not extend on claim',
					type: 'datetime',
				},
				{
					schemaName: 'claimedat',
					displayName: 'Claimed At',
					type: 'datetime',
				},
				{
					schemaName: 'elevated',
					displayName: 'Elevated',
					type: 'boolean',
				},
				{
					schemaName: 'elevatedat',
					displayName: 'Elevated At',
					type: 'datetime',
				},
				{
					schemaName: 'elevationsemantics',
					displayName: 'Elevation Semantics',
					type: 'choice',
					options: elevationSemantics,
				},
				{
					schemaName: 'approvedrevision',
					displayName: 'Approved Content Revision',
					description: 'Document contentRevision this step approved',
					type: 'integer',
				},
				{
					schemaName: 'comment',
					displayName: 'Comment',
					type: 'memo',
					maxLength: 10_000,
				},
				{
					schemaName: 'decidedat',
					displayName: 'Decided At',
					type: 'datetime',
				},
				{
					schemaName: 'submittedrevision',
					displayName: 'Submitted Content Revision',
					description: 'Document contentRevision frozen at submit for this step',
					type: 'integer',
				},
				{
					schemaName: 'authoritylevel',
					displayName: 'Authority Level',
					type: 'choice',
					required: true,
					options: authorityLevels,
				},
				{
					schemaName: 'commentpolicy',
					displayName: 'Comment Policy',
					type: 'choice',
					required: true,
					options: commentPolicies,
				},
			],
		},
		{
			schemaName: 'historyevent',
			displayName: 'Document Routing History Event',
			displayNamePlural: 'Document Routing History Events',
			description: 'Audit trail entries for a document case',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 400,
					isPrimaryName: true,
				},
				{
					schemaName: 'document',
					displayName: 'Document',
					type: 'lookup',
					required: true,
					targetTable: 'document',
				},
				{
					schemaName: 'at',
					displayName: 'At',
					type: 'datetime',
					required: true,
				},
				{
					schemaName: 'actoremail',
					displayName: 'Actor Email',
					type: 'string',
					maxLength: 320,
				},
				{
					schemaName: 'action',
					displayName: 'Action',
					type: 'string',
					required: true,
					maxLength: 200,
				},
				{
					schemaName: 'message',
					displayName: 'Message',
					type: 'memo',
					maxLength: 10_000,
				},
				{
					schemaName: 'reviewcomment',
					displayName: 'Review Comment',
					description: 'Optional link to the reviewcomment written with this audit row',
					type: 'lookup',
					targetTable: 'reviewcomment',
				},
			],
		},
		{
			schemaName: 'prioritylevel',
			displayName: 'Document Routing Priority Level',
			displayNamePlural: 'Document Routing Priority Levels',
			description: 'Admin-owned priority catalog (key, rank, reason policy)',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Key',
					type: 'string',
					required: true,
					maxLength: 64,
					isPrimaryName: true,
				},
				{
					schemaName: 'label',
					displayName: 'Label',
					type: 'string',
					required: true,
					maxLength: 200,
				},
				{
					schemaName: 'rank',
					displayName: 'Rank',
					description: 'Higher is more urgent; inbox secondary-sorts by rank descending',
					type: 'integer',
					required: true,
				},
				{
					schemaName: 'color',
					displayName: 'Color',
					type: 'choice',
					required: true,
					options: priorityColors,
				},
				{
					schemaName: 'requiresreason',
					displayName: 'Requires Reason',
					type: 'boolean',
					required: true,
				},
				{
					schemaName: 'minreasonlength',
					displayName: 'Min Reason Length',
					type: 'integer',
				},
				{
					schemaName: 'reasonhint',
					displayName: 'Reason Hint',
					type: 'memo',
					maxLength: 2000,
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
				{
					schemaName: 'slahoursmultiplier',
					displayName: 'SLA Hours Multiplier',
					description: 'Stored unused in v1; do not apply to activatedueat',
					type: 'decimal',
					precision: 2,
				},
			],
		},
		{
			schemaName: 'documentsubtype',
			displayName: 'Document Routing Document Subtype',
			displayNamePlural: 'Document Routing Document Subtypes',
			description: 'Optional subtype of a document type (chain/scaffold/hint overrides)',
			ownership: 'organization',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Key',
					type: 'string',
					required: true,
					maxLength: 64,
					isPrimaryName: true,
				},
				{
					schemaName: 'label',
					displayName: 'Label',
					type: 'string',
					required: true,
					maxLength: 200,
				},
				{
					schemaName: 'description',
					displayName: 'Description',
					type: 'memo',
					maxLength: 4000,
				},
				{
					schemaName: 'documenttype',
					displayName: 'Document Type',
					type: 'lookup',
					required: true,
					targetTable: 'documenttype',
				},
				{
					schemaName: 'active',
					displayName: 'Active',
					type: 'boolean',
					required: true,
				},
				{
					schemaName: 'requesthint',
					displayName: 'Request Hint Override',
					type: 'memo',
					maxLength: 4000,
				},
				{
					schemaName: 'draftscaffold',
					displayName: 'Draft Scaffold Override',
					type: 'memo',
					maxLength: 50_000,
				},
				{
					schemaName: 'numberprefix',
					displayName: 'Number Prefix Override',
					type: 'string',
					maxLength: 20,
				},
				{
					schemaName: 'usesownchain',
					displayName: 'Uses Own Chain',
					type: 'boolean',
					required: true,
				},
			],
		},
		{
			schemaName: 'reviewcomment',
			displayName: 'Document Routing Review Comment',
			displayNamePlural: 'Document Routing Review Comments',
			description:
				'Human-feedback store for decision/submission/author responses. Survives withdraw/revise.',
			ownership: 'user',
			columns: [
				{
					schemaName: 'name',
					displayName: 'Name',
					type: 'string',
					required: true,
					maxLength: 400,
					isPrimaryName: true,
				},
				{
					schemaName: 'document',
					displayName: 'Document',
					type: 'lookup',
					required: true,
					targetTable: 'document',
				},
				{
					schemaName: 'kind',
					displayName: 'Kind',
					type: 'choice',
					required: true,
					options: reviewCommentKinds,
				},
				{
					schemaName: 'authoritylevel',
					displayName: 'Authority Level',
					type: 'choice',
					required: true,
					options: authorityLevels,
				},
				{
					schemaName: 'status',
					displayName: 'Status',
					type: 'choice',
					required: true,
					options: reviewCommentStatuses,
				},
				{
					schemaName: 'body',
					displayName: 'Body',
					type: 'memo',
					required: true,
					maxLength: 10_000,
				},
				{
					schemaName: 'actoremail',
					displayName: 'Actor Email',
					type: 'string',
					required: true,
					maxLength: 320,
				},
				{
					schemaName: 'actordisplayname',
					displayName: 'Actor Display Name',
					type: 'string',
					maxLength: 400,
				},
				{
					schemaName: 'role',
					displayName: 'Role',
					type: 'string',
					maxLength: 200,
				},
				{
					schemaName: 'sourcestepid',
					displayName: 'Source Step Id',
					description: 'Runtime approvalstep id at decide-time (may later be deleted)',
					type: 'string',
					maxLength: 100,
				},
				{
					schemaName: 'sourcesteporder',
					displayName: 'Source Step Order',
					type: 'integer',
				},
				{
					schemaName: 'submittedcontentrevision',
					displayName: 'Submitted Content Revision',
					type: 'integer',
				},
				{
					schemaName: 'inreplyto',
					displayName: 'In Reply To',
					type: 'lookup',
					targetTable: 'reviewcomment',
				},
			],
		},
	];

	const environmentVariables: EnvironmentVariableDefinition[] = [
		{
			schemaName: `${p}_SharePointSiteUrl`,
			displayName: 'SharePoint Site URL',
			description:
				'Target site for published PDFs. Any HTTPS host (vanity / custom domain OK).',
			defaultFrom: 'sharePoint.siteUrl',
			type: 'string',
		},
		{
			schemaName: `${p}_SharePointLibraryName`,
			displayName: 'SharePoint Library Name',
			description: 'Document library display name for published PDFs',
			defaultFrom: 'sharePoint.libraryName',
			type: 'string',
		},
		{
			schemaName: `${p}_SharePointFolderPath`,
			displayName: 'SharePoint Folder Path',
			description: 'Default folder under the library (leading slash)',
			defaultFrom: 'sharePoint.folderPath',
			type: 'string',
		},
		{
			schemaName: `${p}_DocumentApiBaseUrl`,
			displayName: 'Document Routing API Base URL',
			description:
				'OpenAPI / Custom Connector base URL for the Code App (not limited to Microsoft domains)',
			defaultFrom: 'api.baseUrl',
			type: 'string',
		},
		{
			schemaName: `${p}_DataverseEnvironmentUrl`,
			displayName: 'Dataverse Environment URL',
			description:
				'Org URL used by server-side API adapters (custom Dataverse domains supported)',
			defaultFrom: 'dataverse.environmentUrl',
			type: 'string',
		},
	];

	return { tables, environmentVariables };
}

/**
 * Applies publisher prefix to a table/column schema name.
 */
export function prefixedLogicalName(prefix: string, schemaName: string): string {
	return `${prefix.toLowerCase()}_${schemaName.toLowerCase()}`;
}
