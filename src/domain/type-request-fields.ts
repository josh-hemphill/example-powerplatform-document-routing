import type { CreateWorkflow, TypeRequestField } from '../config/document-types.ts';

/** Template-safe identifier for a per-type intake field (`{{relevantSystems}}`). */
export const TYPE_REQUEST_FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const CREATE_WORKFLOWS = ['standard', 'dispatch_to_review'] as const;

/** Matches `documenttype.requestfieldsjson` memo maxLength. */
export const REQUEST_FIELDS_JSON_MAX_LENGTH = 50_000;

/**
 * Validates createWorkflow on type write.
 */
export function validateCreateWorkflow(
	value: unknown,
): { message: string; code: string } | null {
	if (value == null) {
		return null;
	}
	if (
		typeof value !== 'string'
		|| !(CREATE_WORKFLOWS as readonly string[]).includes(value)
	) {
		return {
			message: 'createWorkflow must be standard or dispatch_to_review',
			code: 'invalid_create_workflow',
		};
	}
	return null;
}

/**
 * Validates Admin/API request field definitions before they are stored on a type.
 */
export function validateRequestFields(
	fields: unknown,
): { message: string; code: string } | null {
	if (fields == null) {
		return null;
	}
	if (!Array.isArray(fields)) {
		return {
			message: 'requestFields must be an array',
			code: 'invalid_request_fields',
		};
	}
	const seenKeys = new Set<string>();
	for (const field of fields) {
		if (!field || typeof field !== 'object') {
			return {
				message: 'Each request field must be an object',
				code: 'invalid_request_fields',
			};
		}
		const record = field as Record<string, unknown>;
		const key = typeof record.key === 'string' ? record.key.trim() : '';
		const label = typeof record.label === 'string' ? record.label.trim() : '';
		if (!key || !TYPE_REQUEST_FIELD_KEY_PATTERN.test(key)) {
			return {
				message: 'Request field keys must be identifiers (e.g. relevantSystems)',
				code: 'invalid_request_field_key',
			};
		}
		if (seenKeys.has(key)) {
			return {
				message: `Duplicate request field key: ${key}`,
				code: 'duplicate_request_field_key',
			};
		}
		seenKeys.add(key);
		if (!label) {
			return {
				message: `Request field ${key} requires a label`,
				code: 'invalid_request_field_label',
			};
		}
		if (record.required != null && typeof record.required !== 'boolean') {
			return {
				message: `Request field ${key} required must be a boolean`,
				code: 'invalid_request_field_required',
			};
		}
		if (record.kind !== 'select') {
			return {
				message: `Request field ${key} has unsupported kind`,
				code: 'invalid_request_field_kind',
			};
		}
		const options = record.options;
		if (!Array.isArray(options) || options.length === 0) {
			return {
				message: `Request field ${key} requires at least one option`,
				code: 'invalid_request_field_options',
			};
		}
		const seenValues = new Set<string>();
		for (const option of options) {
			if (!option || typeof option !== 'object') {
				return {
					message: `Request field ${key} options need a value and label`,
					code: 'invalid_request_field_option',
				};
			}
			const optionRecord = option as Record<string, unknown>;
			const value = typeof optionRecord.value === 'string' ? optionRecord.value.trim() : '';
			const optionLabel = typeof optionRecord.label === 'string'
				? optionRecord.label.trim()
				: '';
			if (!value || !optionLabel) {
				return {
					message: `Request field ${key} options need a value and label`,
					code: 'invalid_request_field_option',
				};
			}
			if (seenValues.has(value)) {
				return {
					message: `Request field ${key} has a duplicate option value`,
					code: 'duplicate_request_field_option',
				};
			}
			seenValues.add(value);
		}
	}
	if (JSON.stringify(fields).length > REQUEST_FIELDS_JSON_MAX_LENGTH) {
		return {
			message: 'requestFields JSON exceeds the Dataverse memo limit',
			code: 'request_fields_too_large',
		};
	}
	return null;
}

/**
 * Trims request-field keys, labels, and options for storage.
 */
export function normalizeRequestFields(fields: readonly TypeRequestField[]): TypeRequestField[] {
	return fields.map((field) => ({
		key: field.key.trim(),
		label: field.label.trim(),
		kind: 'select',
		required: field.required === true,
		options: (field.options ?? []).map((option) => ({
			value: option.value.trim(),
			label: option.label.trim(),
		})),
	}));
}

export function isCreateWorkflow(value: unknown): value is CreateWorkflow {
	return typeof value === 'string'
		&& (CREATE_WORKFLOWS as readonly string[]).includes(value);
}

/**
 * Validates optional per-type intake fields against the submitted values.
 */
export function validateTypeFieldValues(
	fields: readonly TypeRequestField[] | undefined,
	values: Record<string, string> | null | undefined,
): { message: string; code: string } | null {
	if (!fields?.length) {
		return null;
	}
	const provided = values ?? {};
	for (const field of fields) {
		const raw = provided[field.key]?.trim() ?? '';
		if (!raw) {
			if (field.required) {
				return {
					message: `${field.label} is required`,
					code: 'type_field_required',
				};
			}
			continue;
		}
		if (field.kind === 'select') {
			const known = field.options?.some((option) => option.value === raw);
			if (!known) {
				return {
					message: `Unknown ${field.label} value`,
					code: 'unknown_type_field_value',
				};
			}
		}
	}
	return null;
}

/**
 * Returns the option label for a stored type-field value.
 */
export function typeFieldDisplayLabel(
	field: TypeRequestField,
	value: string | undefined,
): string {
	const raw = value?.trim() ?? '';
	if (!raw) {
		return '';
	}
	return field.options?.find((option) => option.value === raw)?.label ?? raw;
}

/**
 * Maps stored type-field values to labels for draft templates.
 */
export function typeFieldTemplateValues(
	fields: readonly TypeRequestField[] | undefined,
	values: Record<string, string> | null | undefined,
): Record<string, string> {
	const provided = values ?? {};
	const mapped: Record<string, string> = {};
	for (const field of fields ?? []) {
		mapped[field.key] = typeFieldDisplayLabel(field, provided[field.key]);
	}
	return mapped;
}
