import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from '@/utils/render-markdown';

describe('renderMarkdownToHtml', () => {
	it('renders headings, emphasis, and lists', () => {
		const html = renderMarkdownToHtml('# Title\n\n**bold** and _italic_\n\n- one\n- two');
		expect(html).toContain('<h1');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>italic</em>');
		expect(html).toContain('<li>');
	});

	it('strips script tags from untrusted markdown', () => {
		const html = renderMarkdownToHtml('Hello <script>alert(1)</script>');
		expect(html.toLowerCase()).not.toContain('<script');
		expect(html).toContain('Hello');
	});

	it('returns empty string for blank input', () => {
		expect(renderMarkdownToHtml('')).toBe('');
		expect(renderMarkdownToHtml('   ')).toBe('');
		expect(renderMarkdownToHtml(null)).toBe('');
	});
});
