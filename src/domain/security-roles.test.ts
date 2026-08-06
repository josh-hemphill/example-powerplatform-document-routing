import { describe, expect, it } from 'vitest';
import {
	DATAVERSE_SECURITY_ROLE_NAMES,
	defaultHostedRoles,
	mapDataverseSecurityRoles,
	resolveHostedRoles,
} from './security-roles.ts';

describe('mapDataverseSecurityRoles', () => {
	it('maps canonical Dataverse display names', () => {
		expect(
			mapDataverseSecurityRoles([
				DATAVERSE_SECURITY_ROLE_NAMES.publisher,
				DATAVERSE_SECURITY_ROLE_NAMES.admin,
			]),
		).toEqual(['user', 'publisher', 'admin']);
	});

	it('maps short aliases and ignores unknown names', () => {
		expect(mapDataverseSecurityRoles(['approver', 'Not A Role', 'AUTHOR'])).toEqual([
			'user',
			'author',
			'approver',
		]);
	});

	it('returns empty when nothing recognized', () => {
		expect(mapDataverseSecurityRoles([])).toEqual([]);
		expect(mapDataverseSecurityRoles(['Contoso Reader'])).toEqual([]);
	});
});

describe('resolveHostedRoles', () => {
	it('defaults to user-only when roles are missing or unrecognized', () => {
		expect(defaultHostedRoles()).toEqual(['user']);
		expect(resolveHostedRoles(null)).toEqual(['user']);
		expect(resolveHostedRoles([])).toEqual(['user']);
		expect(resolveHostedRoles(['Unknown'])).toEqual(['user']);
	});

	it('never implies publisher without an explicit mapped role', () => {
		expect(resolveHostedRoles(null)).not.toContain('publisher');
		expect(resolveHostedRoles(['Document Routing User'])).toEqual(['user']);
	});
});
