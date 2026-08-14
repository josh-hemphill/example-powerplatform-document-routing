import { describe, expect, it } from 'vitest';
import { parseLocalDemoRoles } from './app.config.ts';

describe('parseLocalDemoRoles', () => {
	it('returns undefined for empty input', () => {
		expect(parseLocalDemoRoles(undefined)).toBeUndefined();
		expect(parseLocalDemoRoles('')).toBeUndefined();
		expect(parseLocalDemoRoles('   ')).toBeUndefined();
	});

	it('parses comma-separated app tokens and includes user', () => {
		expect(parseLocalDemoRoles('admin,publisher')).toEqual([
			'user',
			'publisher',
			'admin',
		]);
	});

	it('parses Dataverse display names', () => {
		expect(
			parseLocalDemoRoles('Document Routing Admin; Document Routing Author'),
		).toEqual(['user', 'author', 'admin']);
	});

	it('returns undefined when nothing maps', () => {
		expect(parseLocalDemoRoles('not-a-role')).toBeUndefined();
	});
});
