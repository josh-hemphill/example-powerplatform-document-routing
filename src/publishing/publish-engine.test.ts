import { describe, expect, it } from 'vitest';
import {
	buildRevisionPdfFileName,
	isFolderWithinDestinationRoot,
	isSameRevisionAlreadyPublished,
	PublishValidationError,
	resolvePublishRevision,
	resolveTrustedPublishTarget,
} from './publish-engine.ts';

const destinations = [
	{
		id: 'dest-1',
		name: 'Policies',
		siteUrl: 'https://docs.example.com/sites/Policies',
		libraryName: 'Published Documents',
		folderPath: '/Policies',
		active: true,
	},
];

describe('publish engine', () => {
	it('builds revision-scoped file names', () => {
		expect(buildRevisionPdfFileName('abcd1234-ffff', 3, 'Q3 Travel Policy!')).toBe(
			'q3-travel-policy-abcd1234-r3.pdf',
		);
	});

	it('detects same-revision idempotent republish', () => {
		expect(
			isSameRevisionAlreadyPublished({
				id: '1',
				title: 'Doc',
				status: 'published',
				contentRevision: 2,
				submittedContentRevision: 2,
				publishedContentRevision: 2,
				publishedPdfUrl: 'https://docs.example.com/x.pdf',
			}),
		).toBe(true);
		expect(resolvePublishRevision({
			id: '1',
			title: 'Doc',
			status: 'approved',
			contentRevision: 5,
			submittedContentRevision: 4,
		})).toBe(4);
	});

	it('rejects free-form destinations outside the allowlist', () => {
		expect(() =>
			resolveTrustedPublishTarget({
				document: {
					id: '1',
					title: 'Doc',
					status: 'approved',
					contentRevision: 1,
					submittedContentRevision: 1,
				},
				destinations,
				publishDestinationId: 'missing',
			}),
		).toThrow(PublishValidationError);
	});

	it('enforces folder overrides under the destination root', () => {
		expect(isFolderWithinDestinationRoot('/Policies', '/Policies/2026')).toBe(true);
		expect(isFolderWithinDestinationRoot('/Policies', '/Other')).toBe(false);
		const target = resolveTrustedPublishTarget({
			document: {
				id: '1',
				title: 'Doc',
				status: 'approved',
				contentRevision: 1,
				defaultDestinationId: 'dest-1',
			},
			destinations,
			folderPathOverride: '/Policies/Q3',
		});
		expect(target.folderPath).toBe('/Policies/Q3');
		expect(target.idempotent).toBe(false);
	});
});
