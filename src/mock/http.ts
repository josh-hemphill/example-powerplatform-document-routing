import type { IncomingMessage, ServerResponse } from 'node:http';

export const ACTOR_HEADER = 'x-document-routing-actor';
export const ROLES_HEADER = 'x-document-routing-roles';

export async function readJson<T>(req: IncomingMessage): Promise<T> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const raw = Buffer.concat(chunks).toString('utf8');
	return raw.length === 0 ? ({} as T) : (JSON.parse(raw) as T);
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
}

export function readActorEmail(req: IncomingMessage): string | null {
	const raw = req.headers[ACTOR_HEADER];
	const value = Array.isArray(raw) ? raw[0] : raw;
	const email = value?.trim();
	return email && email.includes('@') ? email : null;
}

export function readActorRoles(req: IncomingMessage): string[] {
	const raw = req.headers[ROLES_HEADER];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value) {
		return [];
	}
	return value
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

export function requireActor(
	req: IncomingMessage,
	res: ServerResponse,
): string | null {
	const actor = readActorEmail(req);
	if (!actor) {
		sendJson(res, 401, {
			message: `Missing or invalid ${ACTOR_HEADER} (caller principal)`,
			code: 'unauthorized',
		});
		return null;
	}
	return actor;
}

export function matchRoute(url: string, pattern: RegExp): RegExpMatchArray | null {
	return url.match(pattern);
}

export function stamp(): string {
	return new Date().toISOString();
}

export function uniqueEmails(emails: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const email of emails) {
		const key = email.trim().toLowerCase();
		if (!key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(email.trim());
	}
	return result;
}

export interface MockHttpContext {
	method: string;
	path: string;
	url: URL;
	actor: string;
	isAdmin: boolean;
	req: IncomingMessage;
	res: ServerResponse;
	readJson: typeof readJson;
	sendJson: typeof sendJson;
	readActorRoles: typeof readActorRoles;
	matchRoute: typeof matchRoute;
	stamp: typeof stamp;
	uniqueEmails: typeof uniqueEmails;
}
