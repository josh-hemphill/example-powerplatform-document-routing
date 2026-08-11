import type { ConnectionProfile } from './connection-config.ts';
import type { ConnectionReferencePlan } from './connection-references.ts';
import type { DataverseColumnDefinition, DataverseSchema, DataverseTableDefinition } from './dataverse-schema.ts';
import {
	buildConnectionReferencePlans,
	connectionReferenceCreateBody,
} from './connection-references.ts';
import { dataverseWebApiRoot } from './connection-urls.ts';
import {
	buildDataverseSchema,

	DEFAULT_OPTION_VALUE_PREFIX,
	prefixedLogicalName,
} from './dataverse-schema.ts';

export interface WebApiRequestPlan {
	method: 'POST' | 'PATCH' | 'PUT' | 'GET';
	path: string;
	description: string;
	body?: unknown;
	skipIfExists?: boolean;
	/** When set, apply will diff attributes on an existing table instead of skipping entirely. */
	entityLogicalName?: string;
	/** Kind of metadata create — drives idempotent apply behavior. */
	kind?:
		| 'entity'
		| 'attribute'
		| 'relationship'
		| 'environmentvariable'
		| 'connectionreference';
	/** Schema / logical name used for GET-before-POST lookups. */
	componentSchemaName?: string;
}

export interface DataverseProvisionPlan {
	apiRoot: string;
	prefix: string;
	schema: DataverseSchema;
	requests: WebApiRequestPlan[];
	environmentVariableDefaults: Record<string, string>;
	environmentVariableSchemaNames: string[];
	connectionReferences: ConnectionReferencePlan[];
	tableLogicalNames: string[];
}

function localizedLabel(label: string) {
	return {
		'@odata.type': 'Microsoft.Dynamics.CRM.Label',
		'LocalizedLabels': [
			{
				'@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
				'Label': label,
				'LanguageCode': 1033,
			},
		],
	};
}

function attributePayload(
	prefix: string,
	column: DataverseColumnDefinition,
): Record<string, unknown> {
	const schemaName = `${prefix}_${column.schemaName}`;
	const requiredLevel = {
		Value: column.required ? 'ApplicationRequired' : 'None',
		CanBeChanged: true,
	};

	const base: Record<string, unknown> = {
		SchemaName: schemaName,
		DisplayName: localizedLabel(column.displayName),
		RequiredLevel: requiredLevel,
	};
	if (column.description) {
		base.Description = localizedLabel(column.description);
	}

	switch (column.type) {
		case 'string':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
				'MaxLength': column.maxLength ?? 400,
				'FormatName': { Value: 'Text' },
				'IsPrimaryName': Boolean(column.isPrimaryName),
			};
		case 'memo':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
				'MaxLength': column.maxLength ?? 10_000,
				'Format': 'Text',
			};
		case 'integer':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
				'MinValue': 0,
				'MaxValue': 2_147_483_647,
			};
		case 'decimal':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
				'MinValue': 0,
				'MaxValue': 100_000,
				'Precision': column.precision ?? 2,
			};
		case 'boolean':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
				'OptionSet': {
					'@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
					'TrueOption': { Value: 1, Label: localizedLabel('Yes') },
					'FalseOption': { Value: 0, Label: localizedLabel('No') },
					'OptionSetType': 'Boolean',
				},
				'DefaultValue': false,
			};
		case 'datetime':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
				'Format': 'DateAndTime',
				'DateTimeBehavior': { Value: 'UserLocal' },
			};
		case 'choice':
			return {
				...base,
				'@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
				'OptionSet': {
					'@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
					'IsGlobal': false,
					'OptionSetType': 'Picklist',
					'Options': (column.options ?? []).map((option) => ({
						Value: option.value,
						Label: localizedLabel(option.label),
					})),
				},
			};
		default:
			return base;
	}
}

function entityDefinitionPayload(
	prefix: string,
	table: DataverseTableDefinition,
): Record<string, unknown> {
	const schemaName = `${prefix}_${table.schemaName}`;
	const primary = table.columns.find((column) => column.isPrimaryName);
	if (!primary || primary.type !== 'string') {
		throw new Error(`Table ${table.schemaName} needs a string primary name column`);
	}

	const nonLookupColumns = table.columns.filter((column) => column.type !== 'lookup');
	const attributes = nonLookupColumns.map((column) => attributePayload(prefix, column));

	return {
		'@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
		'SchemaName': schemaName,
		'DisplayName': localizedLabel(table.displayName),
		'DisplayCollectionName': localizedLabel(table.displayNamePlural),
		'Description': localizedLabel(table.description),
		'OwnershipType': table.ownership === 'organization' ? 'OrganizationOwned' : 'UserOwned',
		'IsActivity': false,
		'HasNotes': false,
		'HasActivities': false,
		'Attributes': attributes,
	};
}

/**
 * Builds a OneToMany relationship create body (creates the lookup attribute).
 * POST /RelationshipDefinitions — supported Dataverse Web API sequence.
 */
export function relationshipDefinitionPayload(
	prefix: string,
	table: DataverseTableDefinition,
	column: DataverseColumnDefinition,
): Record<string, unknown> {
	const schemaName = `${prefix}_${column.schemaName}`;
	const entityLogical = prefixedLogicalName(prefix, table.schemaName);
	const target = prefixedLogicalName(prefix, column.targetTable ?? 'document');
	const relationship = `${prefix}_${table.schemaName}_${column.schemaName}`;

	return {
		'@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
		'SchemaName': relationship,
		'ReferencedEntity': target,
		'ReferencingEntity': entityLogical,
		'ReferencedAttribute': `${target}id`,
		'Lookup': {
			'@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
			'SchemaName': schemaName,
			'DisplayName': localizedLabel(column.displayName),
			'RequiredLevel': {
				Value: column.required ? 'ApplicationRequired' : 'None',
				CanBeChanged: true,
			},
			'Description': column.description
				? localizedLabel(column.description)
				: undefined,
		},
		'CascadeConfiguration': {
			Assign: 'NoCascade',
			Delete: 'Cascade',
			Merge: 'NoCascade',
			Reparent: 'NoCascade',
			Share: 'NoCascade',
			Unshare: 'NoCascade',
		},
	};
}

function getByPath(profile: ConnectionProfile, path: string): string {
	const parts = path.split('.');
	let current: unknown = profile;
	for (const part of parts) {
		if (!current || typeof current !== 'object') {
			return '';
		}
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === 'string' ? current : '';
}

/**
 * Builds an ordered Web API provision plan for tables, lookups, and env vars.
 * Control tables are created before case tables so lookups can resolve.
 */
export function buildDataverseProvisionPlan(
	profile: ConnectionProfile,
): DataverseProvisionPlan {
	const prefix = profile.publisher.prefix.toLowerCase();
	const schema = buildDataverseSchema(
		prefix,
		profile.publisher.optionValuePrefix ?? DEFAULT_OPTION_VALUE_PREFIX,
	);
	const apiRoot = dataverseWebApiRoot(
		profile.dataverse.environmentUrl,
		profile.dataverse.apiVersion ?? 'v9.2',
	);
	const requests: WebApiRequestPlan[] = [];

	for (const table of schema.tables) {
		const logical = prefixedLogicalName(prefix, table.schemaName);
		requests.push({
			method: 'POST',
			path: '/EntityDefinitions',
			description: `Create table ${logical}`,
			body: entityDefinitionPayload(prefix, table),
			skipIfExists: true,
			kind: 'entity',
			entityLogicalName: logical,
		});

		// When the table already exists, apply will create any missing non-lookup attributes.
		for (const column of table.columns.filter((item) => item.type !== 'lookup')) {
			const attributeSchema = `${prefix}_${column.schemaName}`;
			requests.push({
				method: 'POST',
				path: `/EntityDefinitions(LogicalName='${logical}')/Attributes`,
				description: `Ensure attribute ${logical}.${attributeSchema.toLowerCase()}`,
				body: attributePayload(prefix, column),
				skipIfExists: true,
				kind: 'attribute',
				entityLogicalName: logical,
			});
		}
	}

	for (const table of schema.tables) {
		for (const column of table.columns.filter((item) => item.type === 'lookup')) {
			const relationship = `${prefix}_${table.schemaName}_${column.schemaName}`;
			requests.push({
				method: 'POST',
				path: '/RelationshipDefinitions',
				description: `Create relationship ${relationship} (lookup ${column.schemaName})`,
				body: relationshipDefinitionPayload(prefix, table, column),
				skipIfExists: true,
				kind: 'relationship',
			});
		}
	}

	const environmentVariableDefaults: Record<string, string> = {};
	const environmentVariableSchemaNames: string[] = [];
	for (const variable of schema.environmentVariables) {
		const value = variable.defaultFrom
			? getByPath(profile, variable.defaultFrom)
			: '';
		environmentVariableDefaults[variable.schemaName] = value;
		environmentVariableSchemaNames.push(variable.schemaName);
		requests.push({
			method: 'POST',
			path: '/environmentvariabledefinitions',
			description: `Ensure environment variable ${variable.schemaName}`,
			body: {
				schemaname: variable.schemaName,
				defaultvalue: value,
				valueset: value,
				description: variable.description,
				displayname: variable.displayName,
				type: variable.type === 'json' ? 100_000_001 : 100_000_000,
			},
			skipIfExists: true,
			kind: 'environmentvariable',
			componentSchemaName: variable.schemaName,
		});
	}

	const connectionReferences = buildConnectionReferencePlans(profile);
	for (const reference of connectionReferences) {
		requests.push({
			method: 'POST',
			path: '/connectionreferences',
			description: `Ensure connection reference ${reference.logicalName}`,
			body: connectionReferenceCreateBody(reference),
			skipIfExists: true,
			kind: 'connectionreference',
			componentSchemaName: reference.logicalName,
		});
	}

	return {
		apiRoot,
		prefix,
		schema,
		requests,
		environmentVariableDefaults,
		environmentVariableSchemaNames,
		connectionReferences,
		tableLogicalNames: schema.tables.map((table) =>
			prefixedLogicalName(prefix, table.schemaName),
		),
	};
}
