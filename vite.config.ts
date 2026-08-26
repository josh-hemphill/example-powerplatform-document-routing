/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import vuetify from 'vite-plugin-vuetify';
import { documentRoutingMockPlugin } from './src/mock/document-routing-mock-plugin.ts';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
	plugins: [
		vue(),
		vuetify({ autoImport: true }),
		// Browser Vue DevTools overlay — serve/DEV only (not production builds).
		command === 'serve' ? vueDevTools() : null,
		powerApps(),
		documentRoutingMockPlugin(),
	].filter(Boolean),
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: [
				'src/domain/**/*.ts',
				'src/mock/approval-engine.ts',
				'src/publishing/publish-engine.ts',
				'src/provisioning/shell-quote.ts',
				'src/provisioning/connection-config.ts',
				'src/provisioning/schema-drift.ts',
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 70,
				statements: 80,
			},
		},
	},
}));
