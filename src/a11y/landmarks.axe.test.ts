/**
 * Landmark / skip-link axe smoke for primary route chrome patterns.
 * Full Vue+Vuetify route mounts are deferred (Vuetify test harness cost);
 * these fixtures cover the Phase 13 WCAG landmarks we own in AppShell + lists.
 */
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
	document.body.innerHTML = '';
});

async function expectNoSeriousViolations(html: string, title = 'Document Routing'): Promise<void> {
	document.documentElement.lang = 'en';
	document.title = title;
	document.body.innerHTML = html;
	const results = await axe.run(document, {
		runOnly: {
			type: 'tag',
			values: ['wcag2a', 'wcag2aa'],
		},
	});
	const serious = results.violations.filter(
		(violation) => violation.impact === 'critical' || violation.impact === 'serious',
	);
	if (serious.length > 0) {
		// Helpful failure detail without dumping the whole axe payload in expectations.
		expect(serious.map((item) => item.id)).toEqual([]);
	}
}

describe('a11y smoke landmarks', () => {
	it('covers inbox shell with skip link and table', async() => {
		await expectNoSeriousViolations(`
			<a href="#main-content">Skip to content</a>
			<nav aria-label="Primary">
				<a href="#/" aria-current="page">Inbox</a>
				<a href="#/library">Library</a>
			</nav>
			<main id="main-content" tabindex="-1">
				<h1>Inbox</h1>
				<p>Requests, drafts, and approvals assigned to you</p>
				<table>
					<caption>Inbox documents</caption>
					<thead>
						<tr>
							<th scope="col">Title</th>
							<th scope="col">Status</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>
								<a href="#/documents/1">Sample policy</a>
							</td>
							<td>In review</td>
						</tr>
					</tbody>
				</table>
			</main>
		`);
	});

	it('covers library list landmark pattern', async() => {
		await expectNoSeriousViolations(`
			<a href="#main-content">Skip to content</a>
			<nav aria-label="Primary">
				<a href="#/">Inbox</a>
				<a href="#/library" aria-current="page">Library</a>
			</nav>
			<main id="main-content" tabindex="-1">
				<h1>Library</h1>
				<table>
					<caption>Published documents</caption>
					<thead>
						<tr>
							<th scope="col">Number</th>
							<th scope="col">Title</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>
								<a href="#/library/POL-2026-00001">POL-2026-00001</a>
							</td>
							<td>Travel policy</td>
						</tr>
					</tbody>
				</table>
			</main>
		`);
	});

	it('covers admin and published-reader heading patterns', async() => {
		await expectNoSeriousViolations(`
			<a href="#main-content">Skip to content</a>
			<nav aria-label="Primary">
				<a href="#/admin" aria-current="page">Admin</a>
			</nav>
			<main id="main-content" tabindex="-1">
				<h1>Admin</h1>
				<p>Document types, pools, destinations, and settings</p>
				<section aria-label="Document type editor">
					<button type="button">Save document type</button>
				</section>
				<section aria-labelledby="review-feedback-heading">
					<h2 id="review-feedback-heading">Review feedback</h2>
					<p role="status">Need manager attestation language before approval</p>
				</section>
				<section aria-label="Published reader sample">
					<h2>POL-2026-00001 · Travel policy</h2>
					<p>Controlled published final — content is read-only.</p>
				</section>
			</main>
		`);
	});
});
