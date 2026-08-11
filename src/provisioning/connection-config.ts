import type { ErrorObject } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
	assertDeployableEndpoint,
	looksLikePlaceholder,
	parseEndpointUrl,
} from './connection-urls.ts';

export interface PublisherConfig {
	uniqueName: string;
	friendlyName: string;
	prefix: string;
	optionValuePrefix?: number;
}

export interface SolutionConfig {
	uniqueName: string;
	friendlyName: string;
	version: string;
}

export interface PowerPlatformConfig {
	environmentId: string;
	cloud?: 'public' | 'usgov' | 'usgovhigh' | 'usgovdod' | 'china';
}

export interface DataverseConnectionConfig {
	environmentUrl: string;
	apiVersion?: string;
}

export interface SharePointConnectionConfig {
	siteUrl: string;
	libraryName: string;
	folderPath?: string;
	connectorId?: string;
}

export interface ApiConnectionConfig {
	baseUrl: string;
}

export interface ConnectionReferenceOverride {
	logicalName?: string;
	displayName?: string;
	connectorId?: string;
}

export interface ConnectionReferencesConfig {
	sharePoint?: ConnectionReferenceOverride;
	/** Set false to omit the default Dataverse connection reference. */
	dataverse?: ConnectionReferenceOverride | false;
}

export interface ConnectionProfile {
	publisher: PublisherConfig;
	solution: SolutionConfig;
	powerPlatform: PowerPlatformConfig;
	dataverse: DataverseConnectionConfig;
	sharePoint: SharePointConnectionConfig;
	api: ApiConnectionConfig;
	/**
	 * Optional overrides for generated connection reference logical names / connectors.
	 * Defaults: `{prefix}_sharepoint`, `{prefix}_dataverse`.
	 */
	connectionReferences?: ConnectionReferencesConfig;
	/**
	 * When true, `pnpm provision:apply` may run without `--unmanaged-ok`.
	 * Shared environments should leave this unset/false and use `provision:solution`.
	 */
	allowUnmanagedApply?: boolean;
	/**
	 * When true, generated `pa-connect.sh` uses legacy direct `pa connection create`
	 * + `--connection-id` wiring instead of the connection-reference bind path.
	 */
	legacyDirectConnection?: boolean;
	notes?: string[];
}

export interface ConnectionValidationIssue {
	field: string;
	message: string;
	severity: 'error' | 'warning';
}

const CONNECTOR_ID = /^[A-Z0-9][\w.-]*$/i;
const ENVIRONMENT_GUID
	= /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function connectionsSchemaPath(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return resolve(here, '../../deploy/connections.schema.json');
}

/**
 * Loads and validates a connection profile JSON file against connections.schema.json.
 */
export function loadConnectionProfile(filePath: string): ConnectionProfile {
	const absolute = resolve(filePath);
	const raw = readFileSync(absolute, 'utf8');
	const parsed: unknown = JSON.parse(raw);
	const schemaIssues = validateAgainstJsonSchema(parsed);
	if (schemaIssues.length > 0) {
		throw new Error(
			`Invalid connection profile ${absolute}:\n${schemaIssues.map((issue) => `- ${issue.field}: ${issue.message}`).join('\n')}`,
		);
	}
	return parsed as ConnectionProfile;
}

/**
 * Validates an unknown value against deploy/connections.schema.json.
 */
export function validateAgainstJsonSchema(
	value: unknown,
): ConnectionValidationIssue[] {
	const schema = JSON.parse(readFileSync(connectionsSchemaPath(), 'utf8')) as object;
	const ajv = new Ajv2020({
		allErrors: true,
		strict: false,
		validateFormats: false,
	});
	const validate = ajv.compile(schema);
	if (validate(value)) {
		return [];
	}
	return (validate.errors ?? []).map((error: ErrorObject) => ({
		field: error.instancePath || error.schemaPath,
		message: error.message ?? 'schema validation failed',
		severity: 'error' as const,
	}));
}

/**
 * Soft-validates shape and warns/errors on placeholders without Microsoft domain checks.
 */
export function validateConnectionProfile(
	profile: ConnectionProfile,
	options: { requireDeployableHosts?: boolean } = {},
): ConnectionValidationIssue[] {
	const issues: ConnectionValidationIssue[] = [];
	const requireHosts = options.requireDeployableHosts ?? false;

	issues.push(...validateAgainstJsonSchema(profile));

	if (!/^[a-z]{2,8}$/.test(profile.publisher?.prefix ?? '')) {
		issues.push({
			field: 'publisher.prefix',
			message: 'Publisher prefix must be 2–8 lowercase letters',
			severity: 'error',
		});
	}

	if (profile.publisher?.optionValuePrefix != null) {
		const prefix = profile.publisher.optionValuePrefix;
		if (!Number.isInteger(prefix) || prefix < 10_000 || prefix > 99_999) {
			issues.push({
				field: 'publisher.optionValuePrefix',
				message: 'optionValuePrefix must be an integer between 10000 and 99999',
				severity: 'error',
			});
		}
	}

	const environmentId = profile.powerPlatform?.environmentId ?? '';
	if (looksLikePlaceholder(environmentId)) {
		issues.push({
			field: 'powerPlatform.environmentId',
			message: 'Replace REPLACE_ME_ENVIRONMENT_ID with your environment GUID',
			severity: requireHosts ? 'error' : 'warning',
		});
	}
	else if (
		environmentId
		&& !ENVIRONMENT_GUID.test(environmentId)
		&& !looksLikePlaceholder(environmentId)
	) {
		issues.push({
			field: 'powerPlatform.environmentId',
			message: 'Environment id should be a GUID',
			severity: 'warning',
		});
	}

	const connectorId = profile.sharePoint?.connectorId;
	if (connectorId && !CONNECTOR_ID.test(connectorId)) {
		issues.push({
			field: 'sharePoint.connectorId',
			message: 'Connector id contains unsafe characters for shell generation',
			severity: 'error',
		});
	}

	const checkUrl = (field: string, value: string | undefined, allowRelative = false) => {
		if (value == null) {
			issues.push({
				field,
				message: 'Required URL is missing',
				severity: 'error',
			});
			return;
		}
		try {
			if (requireHosts) {
				assertDeployableEndpoint(value, field, {
					allowRelativeApiPath: allowRelative,
				});
			}
			else {
				if (allowRelative && value.trim().startsWith('/')) {
					return;
				}
				parseEndpointUrl(value, field);
				if (looksLikePlaceholder(value)) {
					issues.push({
						field,
						message: 'Looks like a placeholder — replace with your real endpoint',
						severity: 'warning',
					});
				}
			}
		}
		catch(error) {
			issues.push({
				field,
				message: error instanceof Error ? error.message : String(error),
				severity: 'error',
			});
		}
	};

	checkUrl('dataverse.environmentUrl', profile.dataverse?.environmentUrl);
	checkUrl('sharePoint.siteUrl', profile.sharePoint?.siteUrl);
	checkUrl('api.baseUrl', profile.api?.baseUrl, true);

	if (!profile.sharePoint?.libraryName?.trim()) {
		issues.push({
			field: 'sharePoint.libraryName',
			message: 'Library name is required',
			severity: 'error',
		});
	}

	return dedupeIssues(issues);
}

function dedupeIssues(
	issues: ConnectionValidationIssue[],
): ConnectionValidationIssue[] {
	const seen = new Set<string>();
	return issues.filter((issue) => {
		const key = `${issue.severity}:${issue.field}:${issue.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
