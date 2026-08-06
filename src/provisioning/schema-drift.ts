/**
 * Compares planned Dataverse attributes against existing org metadata.
 * Used by apply dry-run / drift checks so incompatible type changes fail loudly.
 */

import type { DataverseColumnDefinition, DataverseColumnType } from './dataverse-schema.ts';

/** Subset of AttributeMetadata returned by Web API `$select=LogicalName,AttributeType`. */
export interface ExistingAttributeMetadata {
	LogicalName: string;
	AttributeType: string;
}

export class SchemaDriftError extends Error {
	code = 'schema_drift' as const;

	constructor(message: string) {
		super(message);
	}
}

const PLANNED_TO_ATTRIBUTE_TYPE: Record<DataverseColumnType, string[]> = {
	string: ['String'],
	memo: ['Memo'],
	integer: ['Integer'],
	decimal: ['Decimal', 'Double', 'Money'],
	boolean: ['Boolean'],
	datetime: ['DateTime'],
	choice: ['Picklist', 'State', 'Status'],
	lookup: ['Lookup', 'Customer', 'Owner'],
};

/**
 * Maps a planned column type to acceptable Dataverse AttributeType values.
 */
export function attributeTypesForColumn(type: DataverseColumnType): string[] {
	return PLANNED_TO_ATTRIBUTE_TYPE[type];
}

/**
 * Infers planned column type from an attribute create body `@odata.type`.
 */
export function plannedTypeFromAttributeBody(body: Record<string, unknown>): DataverseColumnType | null {
	const odata = String(body['@odata.type'] ?? '');
	if (odata.includes('MemoAttributeMetadata')) {
		return 'memo';
	}
	if (odata.includes('StringAttributeMetadata')) {
		return 'string';
	}
	if (odata.includes('IntegerAttributeMetadata')) {
		return 'integer';
	}
	if (odata.includes('DecimalAttributeMetadata') || odata.includes('MoneyAttributeMetadata')) {
		return 'decimal';
	}
	if (odata.includes('BooleanAttributeMetadata')) {
		return 'boolean';
	}
	if (odata.includes('DateTimeAttributeMetadata')) {
		return 'datetime';
	}
	if (odata.includes('PicklistAttributeMetadata')) {
		return 'choice';
	}
	if (odata.includes('LookupAttributeMetadata')) {
		return 'lookup';
	}
	return null;
}

/**
 * Throws when an existing attribute’s AttributeType is incompatible with the plan.
 */
export function assertAttributeTypeCompatible(
	planned: DataverseColumnType,
	existing: ExistingAttributeMetadata,
): void {
	const allowed = attributeTypesForColumn(planned);
	if (!allowed.includes(existing.AttributeType)) {
		throw new SchemaDriftError(
			`Attribute ${existing.LogicalName} exists as ${existing.AttributeType} `
			+ `but plan expects ${planned} (${allowed.join('|')})`,
		);
	}
}

/**
 * Validates a planned column definition against existing metadata (when present).
 * Missing attributes are fine (apply will create them).
 */
export function checkAttributeDrift(options: {
	planned: DataverseColumnDefinition;
	existing: ExistingAttributeMetadata | null;
}): 'missing' | 'compatible' {
	const { planned, existing } = options;
	if (!existing) {
		return 'missing';
	}
	assertAttributeTypeCompatible(planned.type, existing);
	return 'compatible';
}

/**
 * Dry-run helper: returns incompatible existing attributes for a table plan.
 */
export function findIncompatibleAttributes(
	plannedColumns: DataverseColumnDefinition[],
	existingByLogicalName: Map<string, ExistingAttributeMetadata>,
	publisherPrefix: string,
): SchemaDriftError[] {
	const errors: SchemaDriftError[] = [];
	for (const column of plannedColumns) {
		if (column.type === 'lookup') {
			continue;
		}
		const logical = `${publisherPrefix}_${column.schemaName}`.toLowerCase();
		const existing = existingByLogicalName.get(logical) ?? null;
		try {
			checkAttributeDrift({ planned: column, existing });
		}
		catch(error) {
			if (error instanceof SchemaDriftError) {
				errors.push(error);
			}
			else {
				throw error;
			}
		}
	}
	return errors;
}
