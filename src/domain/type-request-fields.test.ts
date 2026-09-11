import { describe, expect, it } from 'vitest';
import {
	typeFieldDisplayLabel,
	typeFieldTemplateValues,
	validateTypeFieldValues,
} from './type-request-fields.ts';

const relevantSystems = {
	key: 'relevantSystems',
	label: 'Relevant systems',
	kind: 'select' as const,
	required: true,
	options: [
		{ value: 'sharepoint', label: 'SharePoint' },
		{ value: 'dataverse', label: 'Dataverse' },
	],
};

describe('type request fields', () => {
	it('requires a selected option when the field is required', () => {
		expect(validateTypeFieldValues([relevantSystems], {})).toEqual({
			message: 'Relevant systems is required',
			code: 'type_field_required',
		});
		expect(
			validateTypeFieldValues([relevantSystems], { relevantSystems: 'sharepoint' }),
		).toBeNull();
	});

	it('rejects values outside the field options', () => {
		expect(
			validateTypeFieldValues([relevantSystems], { relevantSystems: 'mainframe' }),
		).toMatchObject({ code: 'unknown_type_field_value' });
	});

	it('maps stored values to labels for templates', () => {
		expect(typeFieldDisplayLabel(relevantSystems, 'sharepoint')).toBe('SharePoint');
		expect(
			typeFieldTemplateValues([relevantSystems], { relevantSystems: 'dataverse' }),
		).toEqual({ relevantSystems: 'Dataverse' });
	});
});
