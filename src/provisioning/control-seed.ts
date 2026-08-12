import type { ApprovalStepTemplate, DocumentTypeDefinition } from '../config/document-types.ts';
/**
 * Builds Dataverse control-table seed rows from the local document-types demo config.
 * Production orgs should replace Contoso sample emails via Admin (Phase 4) or edit this seed.
 */
import {

	documentTypes,
} from '../config/document-types.ts';
import { isSampleControlEmail } from '../config/sample-identities.ts';
import { looksLikePlaceholder } from './connection-urls.ts';

export interface SeedApproverPool {
	key: string;
	name: string;
	description: string;
	members: Array<{ displayName: string; email: string; role?: string }>;
}

export interface SeedChainStep {
	order: number;
	assignmentMode: 'named' | 'pool';
	role: string;
	slaHours?: number;
	namedApproverEmail?: string;
	namedApproverDisplayName?: string;
	poolKey?: string;
	elevationPoolKey?: string;
	elevationSemantics: 'convert_to_elevated_pool' | 'reassign_escalation_owner';
}

export interface SeedDocumentType {
	id: string;
	label: string;
	description: string;
	requestHint: string;
	draftScaffold: string;
	defaultFolderPath?: string;
	policyVersion: number;
	chain: SeedChainStep[];
}

export interface SeedPublishDestination {
	name: string;
	siteUrl: string;
	libraryName: string;
	folderPath: string;
}

export interface SeedAppSetting {
	key: string;
	value: string;
	description: string;
}

export interface ControlSeedBundle {
	publisherPrefix: string;
	warning: string;
	publishDestinations: SeedPublishDestination[];
	approverPools: SeedApproverPool[];
	documentTypes: SeedDocumentType[];
	appSettings: SeedAppSetting[];
	sampleIdentityEmails: string[];
}

/**
 * True when a seed/control email still looks like documentation sample data.
 */
export { isSampleControlEmail } from '../config/sample-identities.ts';

function poolKeyFromRole(role: string): string {
	return role
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'pool';
}

function collectPools(types: DocumentTypeDefinition[]): SeedApproverPool[] {
	const pools = new Map<string, SeedApproverPool>();

	const addPool = (
		name: string,
		members: Array<{ displayName: string; email: string; role?: string }>,
		description: string,
	) => {
		const key = poolKeyFromRole(name);
		const existing = pools.get(key);
		if (!existing) {
			pools.set(key, {
				key,
				name,
				description,
				members: [...members],
			});
			return;
		}
		for (const member of members) {
			if (
				!existing.members.some(
					(item) => item.email.toLowerCase() === member.email.toLowerCase(),
				)
			) {
				existing.members.push(member);
			}
		}
	};

	for (const type of types) {
		for (const step of type.approvalChain) {
			if (step.mode === 'pool') {
				addPool(step.poolRole, step.pool, `Pool for ${step.poolRole}`);
				if (step.elevationPool?.length) {
					addPool(
						`${step.poolRole} Elevation`,
						step.elevationPool,
						`Elevation pool for ${step.poolRole}`,
					);
				}
			}
			else if (step.elevationPool?.length) {
				addPool(
					`${step.role} Elevation`,
					step.elevationPool,
					`Elevation pool for named role ${step.role}`,
				);
			}
		}
	}

	return [...pools.values()];
}

function mapChainStep(step: ApprovalStepTemplate, order: number): SeedChainStep {
	if (step.mode === 'pool') {
		return {
			order,
			assignmentMode: 'pool',
			role: step.poolRole,
			slaHours: step.slaHours,
			poolKey: poolKeyFromRole(step.poolRole),
			elevationPoolKey: step.elevationPool?.length
				? poolKeyFromRole(`${step.poolRole} Elevation`)
				: undefined,
			elevationSemantics: 'convert_to_elevated_pool',
		};
	}
	return {
		order,
		assignmentMode: 'named',
		role: step.role,
		slaHours: step.slaHours,
		namedApproverEmail: step.email,
		namedApproverDisplayName: step.displayName,
		elevationPoolKey: step.elevationPool?.length
			? poolKeyFromRole(`${step.role} Elevation`)
			: undefined,
		elevationSemantics: 'convert_to_elevated_pool',
	};
}

/**
 * Builds a control seed bundle for provision artifacts / Admin import.
 * Shared-env default omits Contoso demo identities unless `includeDemoIdentities` is true.
 */
export function buildControlSeedBundle(
	publisherPrefix: string,
	types: DocumentTypeDefinition[] = documentTypes,
	options: { includeDemoIdentities?: boolean } = {},
): ControlSeedBundle {
	const includeDemoIdentities = options.includeDemoIdentities === true;
	const approverPools = collectPools(types).map((pool) => {
		if (includeDemoIdentities) {
			return pool;
		}
		return {
			...pool,
			members: [],
		};
	});
	const sampleIdentityEmails = includeDemoIdentities
		? [
				...new Set(
					collectPools(types).flatMap((pool) =>
						pool.members.map((member) => member.email),
					),
				),
			].filter(isSampleControlEmail)
		: [];

	return {
		publisherPrefix: publisherPrefix.toLowerCase(),
		warning: includeDemoIdentities
			? 'Demo seed only. Replace Contoso/example emails and destinations before production. Shared orgs: require --demo-seed intentionally.'
			: 'Shared-env safe seed: demo identities omitted. Use Admin to add real pools/members, or regenerate with --demo-seed for local Contoso samples.',
		publishDestinations: includeDemoIdentities
			? [
					{
						name: 'Default Policies Library',
						siteUrl: 'https://docs.example.com/sites/Policies',
						libraryName: 'Published Documents',
						folderPath: '/Policies',
					},
				]
			: [],
		approverPools,
		documentTypes: types.map((type) => ({
			id: type.id,
			label: type.label,
			description: type.description,
			requestHint: type.requestHint,
			draftScaffold: type.draftTemplate,
			defaultFolderPath: type.folderPath,
			policyVersion: 1,
			chain: type.approvalChain.map((step, index) => {
				const mapped = mapChainStep(step, index + 1);
				if (includeDemoIdentities) {
					return mapped;
				}
				return {
					...mapped,
					namedApproverEmail: undefined,
					namedApproverDisplayName: undefined,
				};
			}),
		})),
		appSettings: [
			{
				key: 'allowApproverOverride',
				value: 'false',
				description:
					'When true, Admin-authorized limited chain override at submit (default off)',
			},
			{
				key: 'collaborationMode',
				value: 'user_owned_share_author_team',
				description:
					'Documents are user-owned and shared with the document type author team while drafting',
			},
			{
				key: 'namedElevationSemantics',
				value: 'convert_to_elevated_pool',
				description: 'Default elevation behavior for overdue named steps',
			},
		],
		sampleIdentityEmails,
	};
}

/**
 * True when control seed still contains documentation sample identities.
 */
export function controlSeedHasSampleIdentities(seed: ControlSeedBundle): boolean {
	return seed.sampleIdentityEmails.length > 0
		|| seed.publishDestinations.some((destination) =>
			looksLikePlaceholder(destination.siteUrl),
		);
}
