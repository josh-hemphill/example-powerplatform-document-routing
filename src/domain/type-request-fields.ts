import type { TypeRequestField } from '../config/document-types.ts';

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
