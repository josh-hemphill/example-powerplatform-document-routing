// @ts-check
import antfu from '@antfu/eslint-config';

export default antfu(
	{
		formatters: true,
		pnpm: false,
		typescript: {
			tsconfigPath: 'tsconfig.json',
		},
		vue: {
			a11y: false,
			overrides: {
				'vue/max-attributes-per-line': [
					'warn',
					{
						singleline: 3,
						multiline: 1,
					},
				],
			},
		},
		stylistic: {
			semi: true,
			indent: 'tab',
			quotes: 'single',
			overrides: {
				'style/quotes': [
					'warn',
					'single',
					{
						avoidEscape: true,
						allowTemplateLiterals: 'always',
					},
				],
				'style/comma-dangle': ['warn', 'always-multiline'],
				'style/semi': [
					'warn',
					'always',
					{
						omitLastInOneLineBlock: true,
					},
				],
				'style/no-tabs': [
					'warn',
					{
						allowIndentationTabs: true,
					},
				],
				'style/space-before-function-paren': ['warn', 'never'],
				'style/linebreak-style': ['warn', 'unix'],
				'style/arrow-parens': ['warn', 'always'],
				'vue/html-indent': ['warn', 'tab'],
				'vue/array-bracket-newline': ['warn', 'consistent'],
				'vue/block-tag-newline': [
					'warn',
					{
						singleline: 'always',
						multiline: 'always',
					},
				],
				'vue/comma-dangle': ['warn', 'always-multiline'],
			},
		},
	},
	{
		ignores: [
			'src/client/**',
			'deploy/generated/**',
			'dist/**',
			'power.config.json',
			'.cursor/**',
		],
	},
	{
		files: ['**/*.{ts,tsx,vue}'],
		rules: {
			'no-console': 'warn',
			'no-debugger': 'warn',
			'eqeqeq': 'warn',
			'no-unneeded-ternary': 'warn',
			'ts/ban-ts-comment': 'warn',
			'import/no-named-default': 'off',
			'antfu/no-top-level-await': 'off',
			// Match monup / redirect-newtab-ext: keep typed codebase without blocking on strictness noise.
			'ts/no-unsafe-assignment': 'off',
			'ts/no-unsafe-member-access': 'off',
			'ts/no-unsafe-return': 'off',
			'ts/no-unsafe-argument': 'off',
			'ts/no-unsafe-call': 'off',
			'ts/explicit-function-return-type': 'off',
			'ts/strict-boolean-expressions': 'off',
			'ts/switch-exhaustiveness-check': 'off',
		},
	},
	{
		files: ['scripts/**/*.ts', 'src/provisioning/**/*.ts', 'src/mock/**/*.ts'],
		rules: {
			'no-console': 'off',
			'node/prefer-global/process': 'off',
			'node/prefer-global/buffer': 'off',
			'ts/no-misused-promises': 'off',
		},
	},
);
