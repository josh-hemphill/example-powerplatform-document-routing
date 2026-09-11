/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLocalDemoRoles } from './local-demo-user.ts';

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

describe('vite local demo email override', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('flows into localDemoUser and document-type author teams', async() => {
		vi.stubEnv('VITE_LOCAL_DEMO_EMAIL', 'dev.override@contoso.com');
		vi.stubEnv('VITE_LOCAL_DEMO_USER_NAME', 'Override Dev');
		vi.resetModules();

		const { localDemoUser } = await import('./local-demo-user.ts');
		const { documentTypes } = await import('./document-types.ts');
		const { appConfig } = await import('./app.config.ts');
		const { LOCAL_DEMO_PERSONAS } = await import('./local-personas.ts');

		expect(localDemoUser.email).toBe('dev.override@contoso.com');
		expect(appConfig.localDemoUser.email).toBe('dev.override@contoso.com');
		expect(LOCAL_DEMO_PERSONAS[0].email).toBe('dev.override@contoso.com');

		for (const type of documentTypes) {
			expect(type.authorTeamEmails).toContain('dev.override@contoso.com');
			expect(
				type.authorTeamEmails?.map((email) => email.toLowerCase()),
			).not.toContain('developer@example.com');
		}
	});

	it('reads VITE_LOCAL_DEMO_* via static import.meta.env access so Vite inlines .env.local', () => {
		const source = readFileSync('src/config/local-demo-user.ts', 'utf8');
		expect(source).toContain('import.meta.env?.VITE_LOCAL_DEMO_EMAIL');
		expect(source).toContain('import.meta.env?.VITE_LOCAL_DEMO_USER_NAME');
		expect(source).toContain('import.meta.env?.VITE_LOCAL_DEMO_ROLES');
		expect(source).not.toMatch(/import\.meta\.env\?\.\[/);
		expect(source).not.toMatch(/\benv\?\.\[key\]/);
	});
});
