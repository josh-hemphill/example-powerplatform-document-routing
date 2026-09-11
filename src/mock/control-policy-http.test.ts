/**
 * Mock HTTP coverage for create/priority/subtype 400s and Admin 403s.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleControlApiRequest } from './control-api.ts';
import { resetControlStore } from './control-store.ts';
import { clearDocumentStore } from './document-store.ts';
import {
	matchRoute,
	readJson,
	sendJson,
	stamp,
	uniqueEmails,
} from './http.ts';
import { handleDocumentRoutes } from './routes/documents.ts';

function jsonReq(payload: unknown): IncomingMessage {
	const raw = JSON.stringify(payload);
	return {
		async *[Symbol.asyncIterator]() {
			yield Buffer.from(raw);
		},
		headers: {},
		url: '/',
	} as IncomingMessage;
}

function captureResponse(): {
	res: ServerResponse;
	status: () => number;
	body: () => { message?: string; code?: string };
} {
	let statusCode = 0;
	let parsed: { message?: string; code?: string } = {};
	const res = {
		statusCode: 0,
		setHeader() {},
		end(raw?: string) {
			statusCode = this.statusCode;
			parsed = raw ? JSON.parse(raw) as { message?: string; code?: string } : {};
		},
	};
	return {
		res: res as unknown as ServerResponse,
		status: () => statusCode,
		body: () => parsed,
	};
}

async function postDocument(body: Record<string, unknown>) {
	const captured = captureResponse();
	await handleDocumentRoutes({
		method: 'POST',
		path: '/api/documents',
		url: new URL('http://localhost/api/documents'),
		actor: 'alex.requester@contoso.com',
		actorRoles: ['user'],
		isAdmin: false,
		req: jsonReq(body),
		res: captured.res,
		readJson,
		sendJson,
		matchRoute,
		stamp,
		uniqueEmails,
	});
	return captured;
}

describe('control policy HTTP', () => {
	beforeEach(() => {
		resetControlStore();
		clearDocumentStore();
	});

	it('rejects Policy create without a subtype', async() => {
		const captured = await postDocument({
			title: 'New policy request',
			documentType: 'policy',
			freeformRequest: 'Please draft a policy for the team.',
			priority: 'normal',
		});
		expect(captured.status()).toBe(400);
		expect(captured.body().code).toBe('subtype_required');
	});

	it('creates ILAR without a subtype', async() => {
		const captured = await postDocument({
			title: 'Standardize hotfix rollback checklist',
			documentType: 'ilar',
			freeformRequest:
				'Hotfixes skip rollback rehearsal. Please open an ILAR for an official process change.',
			priority: 'normal',
		});
		expect(captured.status()).toBe(201);
	});

	it('creates Announcement without a subtype', async() => {
		const captured = await postDocument({
			title: 'Org announcement',
			documentType: 'announcement',
			freeformRequest: 'Please publish an org-wide announcement.',
			priority: 'normal',
		});
		expect(captured.status()).toBe(201);
	});

	it('rejects mission-critical create without a reason', async() => {
		const captured = await postDocument({
			title: 'Urgent policy',
			documentType: 'policy',
			freeformRequest: 'Please draft a mission-critical policy update.',
			priority: 'mission_critical',
			documentSubtypeId: 'hr',
		});
		expect(captured.status()).toBe(400);
		expect(captured.body().code).toBe('priority_reason_required');
	});

	it('creates mission-critical with a long enough reason', async() => {
		const captured = await postDocument({
			title: 'Urgent policy',
			documentType: 'policy',
			freeformRequest: 'Please draft a mission-critical policy update.',
			priority: 'mission_critical',
			priorityReason: 'Board deadline Friday; payroll is blocked without this change.',
			documentSubtypeId: 'hr',
		});
		expect(captured.status()).toBe(201);
	});

	it('forbids non-admin priority catalog writes', async() => {
		const captured = captureResponse();
		await handleControlApiRequest({
			method: 'PUT',
			path: '/api/control/priority-levels/mission_critical',
			actor: 'alex.requester@contoso.com',
			isAdmin: false,
			req: jsonReq({ label: 'Hacked', key: 'mission_critical', rank: 1, color: 'error', requiresReason: false, active: true }),
			res: captured.res,
			readJson,
			sendJson,
			matchRoute,
		});
		expect(captured.status()).toBe(403);
		expect(captured.body().code).toBe('forbidden');
	});
});
