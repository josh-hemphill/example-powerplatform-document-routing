import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
	gfm: true,
	breaks: true,
});

/**
 * Convert markdown to sanitized HTML for safe preview rendering.
 */
export function renderMarkdownToHtml(markdown: string | null | undefined): string {
	const source = (markdown ?? '').trim();
	if (!source) {
		return '';
	}
	const html = marked.parse(source, { async: false }) as string;
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
	});
}
