import { describe, expect, it } from 'vitest';
import {
	assertAttributeTypeCompatible,
	checkAttributeDrift,
	findIncompatibleAttributes,
	plannedTypeFromAttributeBody,
	SchemaDriftError,
} from './schema-drift.ts';

describe('schema-drift', () => {
	it('accepts compatible string attributes', () => {
		expect(
			checkAttributeDrift({
				planned: {
					schemaName: 'title',
					displayName: 'Title',
					type: 'string',
					maxLength: 200,
				},
				existing: { LogicalName: 'dr_title', AttributeType: 'String' },
			}),
		).toBe('compatible');
	});

	it('reports missing attributes', () => {
		expect(
			checkAttributeDrift({
				planned: {
					schemaName: 'title',
					displayName: 'Title',
					type: 'string',
				},
				existing: null,
			}),
		).toBe('missing');
	});

	it('rejects incompatible type changes', () => {
		expect(() =>
			assertAttributeTypeCompatible('integer', {
				LogicalName: 'dr_contentrevision',
				AttributeType: 'String',
			}),
		).toThrow(SchemaDriftError);
	});

	it('finds drift across a planned column set', () => {
		const existing = new Map([
			['dr_title', { LogicalName: 'dr_title', AttributeType: 'Memo' }],
		]);
		const errors = findIncompatibleAttributes(
			[
				{ schemaName: 'title', displayName: 'Title', type: 'string' },
				{ schemaName: 'newfield', displayName: 'New', type: 'boolean' },
			],
			existing,
			'dr',
		);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toMatch(/dr_title/);
	});

	it('infers planned types from attribute create bodies', () => {
		expect(
			plannedTypeFromAttributeBody({
				'@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
			}),
		).toBe('string');
		expect(
			plannedTypeFromAttributeBody({
				'@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
			}),
		).toBe('integer');
	});
});
