import type { ApprovalStepTemplate, DocumentTypeDefinition } from '../config/document-types.ts';
/**
 * In-memory Dataverse control-table mirror for the Vite mock.
 * Admin CRUD mutates this store; create/submit read from it (not static TS).
 */
import type { ApproverPerson } from '../domain/approval-queue.ts';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/app.config.ts';
import {
	documentTypes as seedDocumentTypes,
	toApprovalStepInputs,
} from '../config/document-types.ts';
import {
	allocateDocumentNumber,
	DEFAULT_NUMBER_PATTERN,
} from '../domain/document-number.ts';

export interface ControlApproverPool {
	id: string;
	key: string;
	name: string;
	description: string;
	members: ApproverPerson[];
}

export interface ControlChainStep {
	order: number;
	assignmentMode: 'named' | 'pool';
	role: string;
	slaHours?: number;
	assignee?: ApproverPerson;
	poolKey?: string;
	elevationPoolKey?: string;
}

export interface ControlDocumentType {
	id: string;
	label: string;
	description: string;
	requestHint: string;
	draftTemplate: string;
	folderPath?: string;
	authorTeamEmails: string[];
	active: boolean;
	policyVersion: number;
	defaultDestinationId: string | null;
	numberPrefix: string;
	numberPattern: string;
	nextSequence: number;
	/** Calendar year for `nextSequence`; allocation resets when the year advances. */
	sequenceYear: number;
	approvalChain: ControlChainStep[];
}

export interface ControlPublishDestination {
	id: string;
	name: string;
	siteUrl: string;
	libraryName: string;
	folderPath: string;
	active: boolean;
}

export interface ControlSettings {
	allowApproverOverride: boolean;
	collaborationMode: string;
	namedElevationSemantics: 'convert_to_elevated_pool';
}

export interface ControlFlowRun {
	id: string;
	flowName: string;
	status: 'succeeded' | 'failed' | 'running';
	at: string;
	message: string;
}

export interface ControlStoreSnapshot {
	documentTypes: ControlDocumentType[];
	approverPools: ControlApproverPool[];
	publishDestinations: ControlPublishDestination[];
	settings: ControlSettings;
	flowRuns: ControlFlowRun[];
}

function poolKeyFromName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'pool';
}

function ensurePool(
	pools: Map<string, ControlApproverPool>,
	name: string,
	members: ApproverPerson[],
	description: string,
): string {
	const key = poolKeyFromName(name);
	const existing = pools.get(key);
	if (!existing) {
		pools.set(key, {
			id: randomUUID(),
			key,
			name,
			description,
			members: [...members],
		});
		return key;
	}
	for (const member of members) {
		if (!existing.members.some((item) => item.email.toLowerCase() === member.email.toLowerCase())) {
			existing.members.push(member);
		}
	}
	return key;
}

function mapSeedChain(
	step: ApprovalStepTemplate,
	order: number,
	pools: Map<string, ControlApproverPool>,
): ControlChainStep {
	if (step.mode === 'named') {
		const elevationPoolKey = step.elevationPool?.length
			? ensurePool(
					pools,
					`${step.role} Elevation`,
					step.elevationPool,
					`Elevation pool for ${step.role}`,
				)
			: undefined;
		return {
			order,
			assignmentMode: 'named',
			role: step.role,
			slaHours: step.slaHours,
			assignee: {
				displayName: step.displayName,
				email: step.email,
				role: step.role,
			},
			elevationPoolKey,
		};
	}

	const poolKey = ensurePool(pools, step.poolRole, step.pool, `Pool for ${step.poolRole}`);
	const elevationPoolKey = step.elevationPool?.length
		? ensurePool(
				pools,
				`${step.poolRole} Elevation`,
				step.elevationPool,
				`Elevation pool for ${step.poolRole}`,
			)
		: undefined;
	return {
		order,
		assignmentMode: 'pool',
		role: step.poolRole,
		slaHours: step.slaHours,
		poolKey,
		elevationPoolKey,
	};
}

function buildSeedSnapshot(): ControlStoreSnapshot {
	const pools = new Map<string, ControlApproverPool>();
	const destinationId = randomUUID();
	const types: ControlDocumentType[] = seedDocumentTypes.map((type) => ({
		id: type.id,
		label: type.label,
		description: type.description,
		requestHint: type.requestHint,
		draftTemplate: type.draftTemplate,
		folderPath: type.folderPath,
		authorTeamEmails: [...(type.authorTeamEmails ?? [])],
		active: true,
		policyVersion: 1,
		defaultDestinationId: destinationId,
		numberPrefix: type.id.slice(0, 3).toUpperCase(),
		numberPattern: DEFAULT_NUMBER_PATTERN,
		// policy seeds a published POL-2026-00001 demo case
		nextSequence: type.id === 'policy' ? 2 : 1,
		sequenceYear: new Date().getUTCFullYear(),
		approvalChain: type.approvalChain.map((step, index) =>
			mapSeedChain(step, index + 1, pools),
		),
	}));

	const now = new Date().toISOString();
	return {
		documentTypes: types,
		approverPools: [...pools.values()],
		publishDestinations: [
			{
				id: destinationId,
				name: 'Default Policies Library',
				siteUrl: appConfig.sharePoint.siteUrl,
				libraryName: appConfig.sharePoint.libraryName,
				folderPath: appConfig.sharePoint.folderPath,
				active: true,
			},
		],
		settings: {
			allowApproverOverride: false,
			collaborationMode: 'user_owned_share_author_team',
			namedElevationSemantics: 'convert_to_elevated_pool',
		},
		flowRuns: [
			{
				id: randomUUID(),
				flowName: 'Document Routing — SLA sweeper',
				status: 'succeeded',
				at: now,
				message: 'No overdue steps on last sweep',
			},
			{
				id: randomUUID(),
				flowName: 'Document Routing — Notify approval',
				status: 'succeeded',
				at: now,
				message: 'Notifications idle',
			},
			{
				id: randomUUID(),
				flowName: 'Document Routing — Publish approved',
				status: 'failed',
				at: now,
				message: 'Demo failure: SharePoint library unreachable (seeded for Admin Flow health)',
			},
		],
	};
}

let snapshot: ControlStoreSnapshot | null = null;

/**
 * Returns the mutable control snapshot, seeding once from document-types.ts.
 */
export function getControlStore(): ControlStoreSnapshot {
	if (!snapshot) {
		snapshot = buildSeedSnapshot();
	}
	return snapshot;
}

/**
 * Resets control data (tests).
 */
export function resetControlStore(): void {
	snapshot = buildSeedSnapshot();
}

/**
 * Looks up an active or inactive document type by id.
 */
export function findControlDocumentType(id: string): ControlDocumentType | undefined {
	return getControlStore().documentTypes.find((type) => type.id === id);
}

/**
 * Resolves a control type into the legacy ApprovalStepTemplate shape (expanded pools).
 */
export function toDocumentTypeDefinition(
	type: ControlDocumentType,
): DocumentTypeDefinition {
	const pools = new Map(
		getControlStore().approverPools.map((pool) => [pool.key, pool] as const),
	);
	const approvalChain: ApprovalStepTemplate[] = [...type.approvalChain]
		.sort((a, b) => a.order - b.order)
		.map((step) => {
			if (step.assignmentMode === 'named') {
				if (!step.assignee) {
					throw new Error(`Named step ${step.order} is missing assignee`);
				}
				const elevation = step.elevationPoolKey
					? pools.get(step.elevationPoolKey)?.members
					: undefined;
				return {
					mode: 'named' as const,
					displayName: step.assignee.displayName,
					email: step.assignee.email,
					role: step.role,
					slaHours: step.slaHours,
					elevationPool: elevation,
				};
			}
			const pool = step.poolKey ? pools.get(step.poolKey) : undefined;
			if (!pool?.members.length) {
				throw new Error(`Pool step ${step.order} references empty/missing pool`);
			}
			const elevation = step.elevationPoolKey
				? pools.get(step.elevationPoolKey)?.members
				: undefined;
			return {
				mode: 'pool' as const,
				poolRole: step.role,
				slaHours: step.slaHours ?? 8,
				pool: pool.members,
				elevationPool: elevation,
			};
		});

	return {
		id: type.id,
		label: type.label,
		description: type.description,
		requestHint: type.requestHint,
		draftTemplate: type.draftTemplate,
		folderPath: type.folderPath,
		authorTeamEmails: type.authorTeamEmails,
		approvalChain,
	};
}

/**
 * Materializes OpenAPI submit step payloads from the live control type + pools.
 */
export function materializeApprovalSteps(typeId: string) {
	const type = findControlDocumentType(typeId);
	if (!type || !type.active) {
		return null;
	}
	return toApprovalStepInputs(toDocumentTypeDefinition(type).approvalChain);
}

/**
 * Allocates the next controlled document number for a type (mutates nextSequence / sequenceYear).
 */
export function allocateNextDocumentNumber(
	typeId: string,
	clock: Date = new Date(),
): string {
	const type = findControlDocumentType(typeId);
	if (!type) {
		throw new Error(`Unknown document type: ${typeId}`);
	}
	const allocated = allocateDocumentNumber(
		{
			numberPrefix: type.numberPrefix || type.id.slice(0, 3).toUpperCase(),
			numberPattern: type.numberPattern || DEFAULT_NUMBER_PATTERN,
			nextSequence: type.nextSequence || 1,
			sequenceYear: type.sequenceYear,
		},
		clock,
	);
	type.nextSequence = allocated.nextSequence;
	type.sequenceYear = allocated.sequenceYear;
	return allocated.documentNumber;
}

/**
 * Records a flow health row (SLA / publish stubs).
 */
export function recordFlowRun(
	flowName: string,
	status: ControlFlowRun['status'],
	message: string,
): void {
	const store = getControlStore();
	store.flowRuns.unshift({
		id: randomUUID(),
		flowName,
		status,
		at: new Date().toISOString(),
		message,
	});
	store.flowRuns = store.flowRuns.slice(0, 20);
}

export function findPoolByKey(key: string): ControlApproverPool | undefined {
	return getControlStore().approverPools.find((pool) => pool.key === key);
}

export function findPoolById(id: string): ControlApproverPool | undefined {
	return getControlStore().approverPools.find((pool) => pool.id === id);
}

export function findDestinationById(id: string): ControlPublishDestination | undefined {
	return getControlStore().publishDestinations.find((item) => item.id === id);
}
