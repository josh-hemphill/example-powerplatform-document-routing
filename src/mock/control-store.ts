import type {
	ApprovalStepTemplate,
	DocumentTypeDefinition,
	TypeRequestField,
} from '../config/document-types.ts';
/**
 * In-memory Dataverse control-table mirror for the Vite mock.
 * Admin CRUD mutates this store; create/submit read from it (not static TS).
 */
import type { ApproverPerson } from '../domain/approval-queue.ts';
import type { PriorityLevelRecord } from '../domain/priority-catalog.ts';
import type { AuthorityLevel, CommentPolicy } from '../domain/review-comments.ts';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/app.config.ts';
import {
	documentTypes as seedDocumentTypes,
	toApprovalStepInputs,
} from '../config/document-types.ts';
import { SEED_PRIORITY_LEVELS } from '../config/priority-catalog.ts';
import {
	allocateDocumentNumber,
	DEFAULT_NUMBER_PATTERN,
} from '../domain/document-number.ts';
import {
	DEFAULT_COMMENT_POLICY,
	seedAuthorityForRole,
} from '../domain/review-comments.ts';

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
	authorityLevel?: AuthorityLevel;
	commentPolicy?: CommentPolicy;
}

export interface ControlPriorityLevel extends PriorityLevelRecord {
	id: string;
}

export interface ControlDocumentSubtype {
	id: string;
	key: string;
	label: string;
	description: string;
	documentTypeId: string;
	active: boolean;
	requestHint: string | null;
	draftScaffold: string | null;
	numberPrefix: string | null;
	usesOwnChain: boolean;
	approvalChain: ControlChainStep[];
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
	createWorkflow: 'standard' | 'dispatch_to_review';
	requestFields: TypeRequestField[];
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
	documentSubtypes: ControlDocumentSubtype[];
	priorityLevels: ControlPriorityLevel[];
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
			authorityLevel: step.authorityLevel ?? seedAuthorityForRole(step.role),
			commentPolicy: step.commentPolicy ?? DEFAULT_COMMENT_POLICY,
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
		authorityLevel: step.authorityLevel ?? seedAuthorityForRole(step.poolRole),
		commentPolicy: step.commentPolicy ?? DEFAULT_COMMENT_POLICY,
	};
}

function buildSeedSnapshot(): ControlStoreSnapshot {
	const pools = new Map<string, ControlApproverPool>();
	const destinationId = randomUUID();
	/** Seeded published policy case uses this year in `POL-2026-00001`. */
	const seedPolicyNumberYear = 2026;
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
		// policy seeds a published POL-2026-00001 demo case — keep sequenceYear aligned
		nextSequence: type.id === 'policy' ? 2 : 1,
		sequenceYear: type.id === 'policy' ? seedPolicyNumberYear : new Date().getUTCFullYear(),
		approvalChain: type.approvalChain.map((step, index) =>
			mapSeedChain(step, index + 1, pools),
		),
		createWorkflow: type.createWorkflow ?? 'standard',
		requestFields: type.requestFields ? [...type.requestFields] : [],
	}));

	const documentSubtypes: ControlDocumentSubtype[] = [];
	for (const type of seedDocumentTypes) {
		for (const subtype of type.subtypes ?? []) {
			documentSubtypes.push({
				id: randomUUID(),
				key: subtype.key,
				label: subtype.label,
				description: subtype.description,
				documentTypeId: type.id,
				active: true,
				requestHint: subtype.requestHint ?? null,
				draftScaffold: subtype.draftScaffold ?? null,
				numberPrefix: subtype.numberPrefix ?? null,
				usesOwnChain: subtype.usesOwnChain === true,
				approvalChain: (subtype.approvalChain ?? []).map((step, index) =>
					mapSeedChain(step, index + 1, pools),
				),
			});
		}
	}

	const now = new Date().toISOString();
	return {
		documentTypes: types,
		documentSubtypes,
		priorityLevels: SEED_PRIORITY_LEVELS.map((row) => ({
			...row,
			id: randomUUID(),
		})),
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
					authorityLevel: step.authorityLevel ?? seedAuthorityForRole(step.role),
					commentPolicy: step.commentPolicy ?? DEFAULT_COMMENT_POLICY,
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
				authorityLevel: step.authorityLevel ?? seedAuthorityForRole(step.role),
				commentPolicy: step.commentPolicy ?? DEFAULT_COMMENT_POLICY,
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
		createWorkflow: type.createWorkflow,
		requestFields: type.requestFields,
	};
}

/**
 * Looks up a subtype by key or id, optionally scoped to a document type.
 */
export function findControlDocumentSubtype(
	idOrKey: string,
	documentTypeId?: string,
): ControlDocumentSubtype | undefined {
	const value = idOrKey.trim();
	return getControlStore().documentSubtypes.find((subtype) => {
		if (documentTypeId && subtype.documentTypeId !== documentTypeId) {
			return false;
		}
		return subtype.id === value || subtype.key === value;
	});
}

/**
 * Active subtypes for a document type.
 */
export function activeSubtypesForType(typeId: string): ControlDocumentSubtype[] {
	return getControlStore().documentSubtypes.filter(
		(subtype) => subtype.documentTypeId === typeId && subtype.active,
	);
}

/**
 * Materializes OpenAPI submit step payloads from the live control type + optional subtype.
 */
export function materializeApprovalSteps(typeId: string, subtypeId?: string | null) {
	const type = findControlDocumentType(typeId);
	if (!type || !type.active) {
		return null;
	}
	if (subtypeId) {
		const subtype = findControlDocumentSubtype(subtypeId, typeId);
		if (subtype?.usesOwnChain) {
			if (!subtype.approvalChain.length) {
				return [];
			}
			return toApprovalStepInputs(
				toDocumentTypeDefinition({
					...type,
					approvalChain: subtype.approvalChain,
				}).approvalChain,
			);
		}
	}
	return toApprovalStepInputs(toDocumentTypeDefinition(type).approvalChain);
}

/**
 * Looks up a priority catalog row by key or id.
 */
export function findPriorityLevel(keyOrId: string): ControlPriorityLevel | undefined {
	const value = keyOrId.trim();
	return getControlStore().priorityLevels.find(
		(item) => item.key === value || item.id === value,
	);
}

/**
 * Allocates the next controlled document number for a type (mutates nextSequence / sequenceYear).
 */
export function allocateNextDocumentNumber(
	typeId: string,
	clock: Date = new Date(),
	subtypeId?: string | null,
): string {
	const type = findControlDocumentType(typeId);
	if (!type) {
		throw new Error(`Unknown document type: ${typeId}`);
	}
	const subtype = subtypeId
		? findControlDocumentSubtype(subtypeId, typeId)
		: undefined;
	const allocated = allocateDocumentNumber(
		{
			numberPrefix:
				subtype?.numberPrefix?.trim()
				|| type.numberPrefix
				|| type.id.slice(0, 3).toUpperCase(),
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
