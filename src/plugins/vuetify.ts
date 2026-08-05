import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { appIconAliases } from '@/plugins/icons';
import 'vuetify/styles';

export const vuetify = createVuetify({
	theme: {
		defaultTheme: 'documentRouting',
		themes: {
			documentRouting: {
				dark: false,
				colors: {
					background: '#f3f6f8',
					surface: '#ffffff',
					primary: '#0b5cab',
					secondary: '#0f766e',
					success: '#1b7f4e',
					warning: '#b45309',
					error: '#b42318',
					info: '#175cd3',
				},
			},
		},
	},
	icons: {
		defaultSet: 'mdi',
		aliases: {
			...aliases,
			...appIconAliases,
		},
		sets: { mdi },
	},
	defaults: {
		VBtn: {
			rounded: 'lg',
		},
		VCard: {
			rounded: 'lg',
			elevation: 0,
			border: true,
		},
		VTextField: {
			variant: 'outlined',
			density: 'comfortable',
		},
		VTextarea: {
			variant: 'outlined',
			density: 'comfortable',
		},
		VSelect: {
			variant: 'outlined',
			density: 'comfortable',
		},
	},
});
