import { describe, expect, it } from 'vitest';
import { appConfig } from './app.config.ts';
import {
	demoPersonaSwitcherItems,
	isKnownLocalDemoEmail,
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
		expect(resolvePrincipalRolesByEmail('lee.engmgr@contoso.com')).toEqual([
			'user',
			'approver',
		]);
		expect(resolvePrincipalRolesByEmail('quinn.lead@contoso.com')).toEqual([
			'user',
			'approver',
		]);
	});

	it('recognizes demo persona emails case-insensitively', () => {
		expect(isKnownLocalDemoEmail(appConfig.localDemoUser.email)).toBe(true);
		expect(isKnownLocalDemoEmail(appConfig.localDemoUser.email.toUpperCase())).toBe(
			true,
		);
		expect(isKnownLocalDemoEmail('  casey.author@contoso.com  ')).toBe(true);
		expect(isKnownLocalDemoEmail('stranger@contoso.com')).toBe(false);
		expect(isKnownLocalDemoEmail('')).toBe(false);
	});

	it('prepends an unknown hosted UPN to the Acting as list', () => {
		const items = demoPersonaSwitcherItems({
			email: 'pat@contoso.com',
			userName: 'Pat Hosted',
			roles: ['user'],
		});
		expect(items[0]).toMatchObject({
			email: 'pat@contoso.com',
			label: 'Pat Hosted (host)',
		});
		expect(items.slice(1)).toEqual(LOCAL_DEMO_PERSONAS);
	});

	it('does not duplicate a hosted UPN that is already a demo persona', () => {
		const items = demoPersonaSwitcherItems({
			email: appConfig.localDemoUser.email,
			userName: appConfig.localDemoUser.userName,
			roles: appConfig.localDemoUser.roles,
		});
		expect(items).toEqual(LOCAL_DEMO_PERSONAS);
	});

	it('defaults unknown emails to user-only', () => {
		expect(resolvePrincipalRolesByEmail('stranger@contoso.com')).toEqual(['user']);
		expect(resolvePrincipalRolesByEmail('')).toEqual(['user']);
	});
});
