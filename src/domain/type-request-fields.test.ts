import { describe, expect, it } from 'vitest';
import {
	normalizeRequestFields,
	typeFieldDisplayLabel,
	typeFieldTemplateValues,
	validateCreateWorkflow,
	validateRequestFields,
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

	it('accepts ILAR-style request field definitions', () => {
		expect(validateRequestFields([relevantSystems])).toBeNull();
		expect(validateCreateWorkflow('dispatch_to_review')).toBeNull();
		expect(validateCreateWorkflow('queued')).toMatchObject({
			code: 'invalid_create_workflow',
		});
	});

	it('rejects duplicate keys, blank labels, and empty option lists', () => {
		expect(
			validateRequestFields([
				relevantSystems,
				{ ...relevantSystems, label: 'Systems again' },
			]),
		).toMatchObject({ code: 'duplicate_request_field_key' });
		expect(
			validateRequestFields([{ ...relevantSystems, key: '1bad' }]),
		).toMatchObject({ code: 'invalid_request_field_key' });
		expect(
			validateRequestFields([{ ...relevantSystems, label: '  ' }]),
		).toMatchObject({ code: 'invalid_request_field_label' });
		expect(
			validateRequestFields([{ ...relevantSystems, options: [] }]),
		).toMatchObject({ code: 'invalid_request_field_options' });
		expect(
			validateRequestFields([
				{
					...relevantSystems,
					options: [
						{ value: 'sharepoint', label: 'SharePoint' },
						{ value: 'sharepoint', label: 'Again' },
					],
				},
			]),
		).toMatchObject({ code: 'duplicate_request_field_option' });
		expect(
			validateRequestFields([{ ...relevantSystems, required: 'true' as unknown as boolean }]),
		).toMatchObject({ code: 'invalid_request_field_required' });
	});

	it('trims field keys and option labels for storage', () => {
		expect(
			normalizeRequestFields([
				{
					key: ' relevantSystems ',
					label: ' Relevant systems ',
					kind: 'select',
					required: true,
					options: [{ value: ' sharepoint ', label: ' SharePoint ' }],
				},
			]),
		).toEqual([{
			key: 'relevantSystems',
			label: 'Relevant systems',
			kind: 'select',
			required: true,
			options: [{ value: 'sharepoint', label: 'SharePoint' }],
		}]);
	});
});
