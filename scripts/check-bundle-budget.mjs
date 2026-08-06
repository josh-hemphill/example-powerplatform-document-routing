#!/usr/bin/env node
/**
 * Fails when production dist JS/CSS gzip sizes exceed the Phase 7 budget.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const MAX_SINGLE_GZIP_KB = 600;
const MAX_TOTAL_JS_CSS_GZIP_KB = 1200;

function listAssets(dirPath) {
	try {
		return readdirSync(dirPath)
			.filter((name) => /\.(?:js|css)$/.test(name))
			.map((name) => join(dirPath, name));
	}
	catch {
		console.error(`Missing dist assets at ${dirPath}. Run pnpm build first.`);
		process.exit(1);
	}
}

const assets = listAssets(DIST);
let total = 0;
const offenders = [];

for (const filePath of assets) {
	const raw = readFileSync(filePath);
	const gzipKb = gzipSync(raw).length / 1024;
	total += gzipKb;
	const label = `${basename(filePath)} ${gzipKb.toFixed(1)} KiB gzip`;
	if (gzipKb > MAX_SINGLE_GZIP_KB) {
		offenders.push(label);
	}
	console.log(label);
}

console.log(`Total JS+CSS: ${total.toFixed(1)} KiB gzip (budget ${MAX_TOTAL_JS_CSS_GZIP_KB})`);

if (offenders.length > 0) {
	console.error('Single-asset budget exceeded:', offenders.join('; '));
	process.exit(1);
}
if (total > MAX_TOTAL_JS_CSS_GZIP_KB) {
	console.error(`Total gzip budget exceeded (${total.toFixed(1)} > ${MAX_TOTAL_JS_CSS_GZIP_KB})`);
	process.exit(1);
}
