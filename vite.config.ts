/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vuetify from 'vite-plugin-vuetify';
import { documentRoutingMockPlugin } from './src/mock/document-routing-mock-plugin.ts';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		vue(),
		vuetify({ autoImport: true }),
		powerApps(),
		documentRoutingMockPlugin(),
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
	},
});
