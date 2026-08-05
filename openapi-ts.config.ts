import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generates a typed fetch SDK and Pinia Colada query/mutation helpers
 * from the Document Routing OpenAPI contract.
 */
export default defineConfig({
	input: './openapi/document-routing.yaml',
	output: {
		path: './src/client',
		clean: true,
	},
	plugins: [
		'@hey-api/typescript',
		'@hey-api/sdk',
		{
			name: '@hey-api/client-fetch',
			runtimeConfigPath: './src/api/hey-api-runtime.ts',
		},
		{
			name: '@pinia/colada',
			queryKeys: { tags: true },
			queryOptions: true,
			mutationOptions: true,
		},
	],
});
