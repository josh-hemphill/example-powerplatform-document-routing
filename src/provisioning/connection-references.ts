/**
 * Named connection references for solution-first SharePoint (and optional Dataverse) wiring.
 */
import type { ConnectionProfile } from './connection-config.ts';

export interface ConnectionReferencePlan {
	purpose: 'sharepoint' | 'dataverse';
	logicalName: string;
	displayName: string;
	/** Short connector id used by `pa` CLI (e.g. shared_sharepointonline). */
	connectorId: string;
	/** Full connector API id stored on the connectionreference row. */
	connectorApiId: string;
	description: string;
}

const POWER_APIS_PREFIX = '/providers/Microsoft.PowerApps/apis/';

/**
 * Builds the connector API id used by Dataverse connectionreference.connectorid.
 */
export function toConnectorApiId(connectorId: string): string {
	const trimmed = connectorId.trim();
	if (trimmed.startsWith('/providers/')) {
		return trimmed;
	}
	return `${POWER_APIS_PREFIX}${trimmed}`;
}

/**
 * Default SharePoint + Dataverse connection reference plans for a profile.
 */
export function buildConnectionReferencePlans(
	profile: ConnectionProfile,
): ConnectionReferencePlan[] {
	const prefix = profile.publisher.prefix.toLowerCase();
	const refs = profile.connectionReferences;
	const plans: ConnectionReferencePlan[] = [];

	const sharePointConnector = assertConnectorToken(
		refs?.sharePoint?.connectorId
		?? profile.sharePoint.connectorId
		?? 'shared_sharepointonline',
	);
	plans.push({
		purpose: 'sharepoint',
		logicalName: normalizeLogicalName(
			refs?.sharePoint?.logicalName ?? `${prefix}_sharepoint`,
			prefix,
		),
		displayName:
			refs?.sharePoint?.displayName
			?? `${profile.solution.friendlyName} SharePoint`,
		connectorId: sharePointConnector,
		connectorApiId: toConnectorApiId(sharePointConnector),
		description:
			'Solution connection reference for the Document Routing SharePoint library data source.',
	});

	if (refs?.dataverse !== false) {
		const dataverseConnector = assertConnectorToken(
			refs?.dataverse?.connectorId ?? 'shared_commondataserviceforapps',
		);
		plans.push({
			purpose: 'dataverse',
			logicalName: normalizeLogicalName(
				refs?.dataverse?.logicalName ?? `${prefix}_dataverse`,
				prefix,
			),
			displayName:
				refs?.dataverse?.displayName
				?? `${profile.solution.friendlyName} Dataverse`,
			connectorId: dataverseConnector,
			connectorApiId: toConnectorApiId(dataverseConnector),
			description:
				'Solution connection reference for Dataverse (flows / solution-aware apps). '
				+ 'Code App table data sources may still use --org-url directly.',
		});
	}

	return plans;
}

/**
 * Web API body for creating a connectionreference row.
 */
export function connectionReferenceCreateBody(
	plan: ConnectionReferencePlan,
): Record<string, unknown> {
	return {
		connectionreferencelogicalname: plan.logicalName,
		connectionreferencedisplayname: plan.displayName,
		connectorid: plan.connectorApiId,
		description: plan.description,
	};
}

function normalizeLogicalName(value: string, prefix: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!/^[a-z][a-z0-9_]{1,99}$/.test(trimmed)) {
		throw new Error(
			`Invalid connection reference logical name "${value}". `
			+ 'Use letters, digits, and underscores (2–100 chars).',
		);
	}
	if (!trimmed.startsWith(`${prefix}_`)) {
		return `${prefix}_${trimmed}`;
	}
	return trimmed;
}

function assertConnectorToken(value: string): string {
	const trimmed = value.trim();
	if (!/^[A-Z0-9][\w.-]*$/i.test(trimmed) && !trimmed.startsWith('/providers/')) {
		throw new Error(`Unsafe connector id for connection reference: ${value}`);
	}
	if (trimmed.startsWith('/providers/')) {
		const leaf = trimmed.slice(trimmed.lastIndexOf('/') + 1);
		return leaf || trimmed;
	}
	return trimmed;
}
