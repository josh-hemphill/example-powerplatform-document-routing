/**
 * Vuetify-friendly validation rules aligned to OpenAPI request schemas.
 */

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 200;
export const FREEFORM_MIN_LENGTH = 10;
export const SUMMARY_MAX_LENGTH = 500;
export const BODY_MARKDOWN_MIN_LENGTH = 1;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@](?:[^\s.@]*\.[^\s\d\-.\x40-\x5A])*[^\s.@]*\.[\d\-.A-Z]+(?:[^\s\d\-.\x40-\x5A](?:[^\s.@]*\.[^\s\d\-.\x40-\x5A])*[^\s.@]*\.[\d\-.A-Z]+)*$/i;

export type FieldRule = (value: unknown) => true | string;

/**
 * Required non-empty trimmed string.
 */
export function requiredRule(label = 'This field'): FieldRule {
	return (value) => {
		if (typeof value === 'string' && value.trim().length > 0) {
			return true;
		}
		if (value != null && typeof value !== 'string' && String(value).length > 0) {
			return true;
		}
		return `${label} is required`;
	};
}

/**
 * Title length rules matching CreateDocumentRequest / UpdateDraftRequest.
 */
export function titleRules(label = 'Title'): FieldRule[] {
	return [
		requiredRule(label),
		(value) => {
			const text = typeof value === 'string' ? value.trim() : '';
			if (text.length < TITLE_MIN_LENGTH) {
				return `${label} must be at least ${TITLE_MIN_LENGTH} characters`;
			}
			if (text.length > TITLE_MAX_LENGTH) {
				return `${label} must be at most ${TITLE_MAX_LENGTH} characters`;
			}
			return true;
		},
	];
}

/**
 * Freeform request length rules matching CreateDocumentRequest.
 */
export function freeformRequestRules(label = 'Freeform request'): FieldRule[] {
	return [
		requiredRule(label),
		(value) => {
			const text = typeof value === 'string' ? value.trim() : '';
			if (text.length < FREEFORM_MIN_LENGTH) {
				return `${label} must be at least ${FREEFORM_MIN_LENGTH} characters`;
			}
			return true;
		},
	];
}

/**
 * Draft body markdown rules matching UpdateDraftRequest.
 * Rejects whitespace-only bodies.
 */
export function bodyMarkdownRules(label = 'Draft'): FieldRule[] {
	return [
		(value) => {
			const text = typeof value === 'string' ? value.trim() : '';
			if (text.length < BODY_MARKDOWN_MIN_LENGTH) {
				return `${label} is required`;
			}
			return true;
		},
	];
}

/**
 * Optional summary max length.
 */
export function summaryRules(label = 'Summary'): FieldRule[] {
	return [
		(value) => {
			if (value == null || value === '') {
				return true;
			}
			const text = typeof value === 'string' ? value : String(value);
			if (text.length > SUMMARY_MAX_LENGTH) {
				return `${label} must be at most ${SUMMARY_MAX_LENGTH} characters`;
			}
			return true;
		},
	];
}

/**
 * Optional email format (empty allowed).
 */
export function emailRules(label = 'Email', { required = false } = {}): FieldRule[] {
	const rules: FieldRule[] = [];
	if (required) {
		rules.push(requiredRule(label));
	}
	rules.push((value) => {
		if (value == null || value === '') {
			return required ? `${label} is required` : true;
		}
		const text = typeof value === 'string' ? value.trim() : String(value);
		return EMAIL_PATTERN.test(text) || `${label} must be a valid email`;
	});
	return rules;
}

/**
 * Required allowlisted destination id.
 */
export function destinationRequiredRule(label = 'Publish destination'): FieldRule {
	return (value) => {
		if (typeof value === 'string' && value.trim().length > 0) {
			return true;
		}
		return `${label} is required`;
	};
}

/**
 * Returns a validation message when title fails OpenAPI Create/UpdateDraft rules.
 */
export function validateTitle(value: unknown): string | null {
	for (const rule of titleRules()) {
		const result = rule(value);
		if (result !== true) {
			return result;
		}
	}
	return null;
}

/**
 * Returns a validation message when freeform request fails CreateDocumentRequest rules.
 */
export function validateFreeformRequest(value: unknown): string | null {
	for (const rule of freeformRequestRules()) {
		const result = rule(value);
		if (result !== true) {
			return result;
		}
	}
	return null;
}

/**
 * Returns a validation message when draft body fails UpdateDraftRequest rules.
 */
export function validateBodyMarkdown(value: unknown): string | null {
	for (const rule of bodyMarkdownRules()) {
		const result = rule(value);
		if (result !== true) {
			return result;
		}
	}
	return null;
}

/**
 * Returns a validation message when optional summary exceeds max length.
 */
export function validateSummary(value: unknown): string | null {
	for (const rule of summaryRules()) {
		const result = rule(value);
		if (result !== true) {
			return result;
		}
	}
	return null;
}
