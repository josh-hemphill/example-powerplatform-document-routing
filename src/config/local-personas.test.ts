import { describe, expect, it } from 'vitest';
import { appConfig } from './app.config.ts';
import {
	LOCAL_DEMO_PERSONAS,
	resolvePrincipalRolesByEmail,
} from './local-personas.ts';

describe('resolvePrincipalRolesByEmail', () => {
	it('returns directory roles for known demo personas', () => {
		expect(resolvePrincipalRolesByEmail(appConfig.localDemoUser.email)).toEqual(
			LOCAL_DEMO_PERSONAS[0].roles,
		);
		expect(LOCAL_DEMO_PERSONAS[0].roles).toContain('admin');
		expect(resolvePrincipalRolesByEmail('casey.author@contoso.com')).toEqual([
			'user',
			'author',
		]);
		expect(resolvePrincipalRolesByEmail('sam.compliance@contoso.com')).toEqual([
			'user',
			'approver',
		]);
	});

	it('defaults unknown emails to user-only', () => {
		expect(resolvePrincipalRolesByEmail('stranger@contoso.com')).toEqual(['user']);
		expect(resolvePrincipalRolesByEmail('')).toEqual(['user']);
	});
});
