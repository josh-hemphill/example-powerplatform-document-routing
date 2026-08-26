/**
 * Machine-readable Document Routing security role privilege template.
 * Table keys are schema names (no publisher prefix); prefix is applied at generate time.
 */
import type { DocumentRoutingRole } from '../domain/security-roles.ts';
import { DATAVERSE_SECURITY_ROLE_NAMES } from '../domain/security-roles.ts';
import { prefixedLogicalName } from './dataverse-schema.ts';

/** Privilege depth relative to the caller's business unit hierarchy. */
export type PrivilegeDepth = 'user' | 'businessUnit' | 'parentChild' | 'organization';

export interface TablePrivilegeSpec {
	create?: PrivilegeDepth;
	read?: PrivilegeDepth;
	write?: PrivilegeDepth;
	delete?: PrivilegeDepth;
	append?: PrivilegeDepth;
	appendTo?: PrivilegeDepth;
	assign?: PrivilegeDepth;
	share?: PrivilegeDepth;
}

export interface SecurityRoleTemplate {
	token: DocumentRoutingRole;
	displayName: string;
	description: string;
	/** Privileges keyed by unprefixed table schema name (e.g. `document`). */
	tables: Record<string, TablePrivilegeSpec>;
}

export interface PrefixedTablePrivilegeSpec extends TablePrivilegeSpec {
	logicalName: string;
	schemaName: string;
}

export interface SecurityRolePlan {
	token: DocumentRoutingRole;
	displayName: string;
	description: string;
	tables: PrefixedTablePrivilegeSpec[];
}

/**
 * Canonical privilege matrix aligned with deploy/SECURITY_ROLES.md and domain role tokens.
 * Display names stay brand-stable so `/principal` mapping does not depend on publisher prefix.
 */
export const SECURITY_ROLE_TEMPLATES: SecurityRoleTemplate[] = [
	{
		token: 'user',
		displayName: DATAVERSE_SECURITY_ROLE_NAMES.user,
		description: 'Create owned documents/requests; read shared or owned cases.',
		tables: {
			document: {
				create: 'user',
				read: 'user',
				write: 'user',
				append: 'user',
				appendTo: 'user',
				share: 'user',
			},
			historyevent: { create: 'user', read: 'user' },
			reviewcomment: {
				create: 'user',
				read: 'user',
				write: 'user',
				append: 'user',
				appendTo: 'user',
			},
			documenttype: { read: 'organization' },
			publishdestination: { read: 'organization' },
			prioritylevel: { read: 'organization' },
			documentsubtype: { read: 'organization' },
		},
	},
	{
		token: 'author',
		displayName: DATAVERSE_SECURITY_ROLE_NAMES.author,
		description: 'Read/write draft fields on shared requested/drafting documents; append history.',
		tables: {
			document: {
				read: 'businessUnit',
				write: 'businessUnit',
				append: 'businessUnit',
				appendTo: 'businessUnit',
			},
			historyevent: { create: 'user', read: 'businessUnit' },
			reviewcomment: {
				create: 'user',
				read: 'businessUnit',
				write: 'user',
				append: 'businessUnit',
				appendTo: 'businessUnit',
			},
			documenttype: { read: 'organization' },
			approvalchainstep: { read: 'organization' },
			prioritylevel: { read: 'organization' },
			documentsubtype: { read: 'organization' },
		},
	},
	{
		token: 'approver',
		displayName: DATAVERSE_SECURITY_ROLE_NAMES.approver,
		description: 'Update eligible approvalstep rows (claim/decide); read case.',
		tables: {
			document: { read: 'businessUnit' },
			approvalstep: {
				read: 'businessUnit',
				write: 'businessUnit',
				append: 'businessUnit',
				appendTo: 'businessUnit',
			},
			historyevent: { create: 'user', read: 'businessUnit' },
			reviewcomment: {
				create: 'user',
				read: 'businessUnit',
				append: 'businessUnit',
				appendTo: 'businessUnit',
			},
			approverpool: { read: 'organization' },
			approverpoolmember: { read: 'organization' },
			prioritylevel: { read: 'organization' },
			documentsubtype: { read: 'organization' },
		},
	},
	{
		token: 'publisher',
		displayName: DATAVERSE_SECURITY_ROLE_NAMES.publisher,
		description: 'Update publish fields / trigger publish Flow on approved documents.',
		tables: {
			document: {
				read: 'businessUnit',
				write: 'businessUnit',
				append: 'businessUnit',
				appendTo: 'businessUnit',
			},
			publishdestination: { read: 'organization' },
			historyevent: { create: 'user', read: 'businessUnit' },
			reviewcomment: { read: 'businessUnit' },
			prioritylevel: { read: 'organization' },
			documentsubtype: { read: 'organization' },
		},
	},
	{
		token: 'admin',
		displayName: DATAVERSE_SECURITY_ROLE_NAMES.admin,
		description: 'CRUD control tables; Admin UI; assignable for shared-env configuration.',
		tables: {
			documenttype: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			approvalchainstep: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			approverpool: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			approverpoolmember: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			publishdestination: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			appsetting: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
			},
			document: {
				read: 'organization',
				write: 'organization',
				append: 'organization',
				appendTo: 'organization',
				assign: 'organization',
				share: 'organization',
			},
			approvalstep: {
				read: 'organization',
				write: 'organization',
			},
			historyevent: { create: 'organization', read: 'organization' },
			reviewcomment: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			prioritylevel: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
			documentsubtype: {
				create: 'organization',
				read: 'organization',
				write: 'organization',
				delete: 'organization',
				append: 'organization',
				appendTo: 'organization',
			},
		},
	},
];

/**
 * Applies publisher prefix to every table privilege target.
 */
export function buildSecurityRolePlans(publisherPrefix: string): SecurityRolePlan[] {
	const prefix = publisherPrefix.toLowerCase();
	return SECURITY_ROLE_TEMPLATES.map((role) => ({
		token: role.token,
		displayName: role.displayName,
		description: role.description,
		tables: Object.entries(role.tables).map(([schemaName, privileges]) => ({
			schemaName,
			logicalName: prefixedLogicalName(prefix, schemaName),
			...privileges,
		})),
	}));
}

/**
 * Display names expected from production `/principal` (stable across prefixes).
 */
export function securityRoleDisplayNames(): string[] {
	return SECURITY_ROLE_TEMPLATES.map((role) => role.displayName);
}

/**
 * Renders a human privilege guide with prefixed logical names.
 */
export function renderSecurityRolesMarkdown(
	plans: SecurityRolePlan[],
	prefix: string,
): string {
	const lines = [
		'# Dataverse security roles — Document Routing (generated)',
		'',
		`Publisher prefix: \`${prefix}\`. Display names stay **Document Routing *** so \`/principal\` mapping in \`src/domain/security-roles.ts\` does not depend on prefix.`,
		'',
		'Create these roles **inside** your unmanaged solution (maker portal or PAC). Privilege depths below are guidance for shared environments — refine with your security team.',
		'',
		'## Roles',
		'',
	];

	for (const role of plans) {
		lines.push(`### ${role.displayName}`);
		lines.push('');
		lines.push(role.description);
		lines.push('');
		lines.push('| Table (logical) | Privileges |');
		lines.push('| ---------------- | ---------- |');
		for (const table of role.tables) {
			const privs = (
				['create', 'read', 'write', 'delete', 'append', 'appendTo', 'assign', 'share'] as const
			)
				.filter((key) => table[key])
				.map((key) => `${key}:${table[key]}`)
				.join(', ');
			lines.push(`| \`${table.logicalName}\` | ${privs} |`);
		}
		lines.push('');
	}

	lines.push(
		'## Assignment (shared environments)',
		'',
		'- Prefer **Azure AD / Dataverse teams** over individual user role assignment when many authors/approvers rotate.',
		'- Assign **Document Routing Admin** only to platform owners who maintain control tables.',
		'- Publishers and Approvers need case access (ownership or share) in addition to the role privilege.',
		'',
		'## Service / Flow principal',
		'',
		'SLA sweeper and publish flows must run as a **Document Routing Service** account (or an Admin + dedicated service principal) with an elevated Dataverse connection.',
		'Do **not** elevate using the end-user SPA token. The Code App only triggers privileged work by writing status fields or calling a Custom Connector that starts a flow.',
		'',
		'## Hosted `/principal`',
		'',
		'Production `GET /principal` must return these **display names** (or mapped tokens). The SPA maps them via `mapDataverseSecurityRoles` — never trust client-supplied role headers when hosted.',
		'',
		...plans.map((role) => `- \`${role.displayName}\` → \`${role.token}\``),
		'',
	);

	return lines.join('\n');
}
