/**
 * Tree-shaken MDI SVG paths registered as Vuetify aliases ($name).
 */
import {
	mdiAccountMultipleOutline,
	mdiArrowLeft,
	mdiBookOpenOutline,
	mdiCheckCircle,
	mdiChevronDown,
	mdiChevronUp,
	mdiClockOutline,
	mdiCloseCircle,
	mdiCogOutline,
	mdiMagnify,
	mdiMinusCircle,
	mdiPlus,
	mdiTimerSand,
} from '@mdi/js';

export const appIconAliases = {
	magnify: mdiMagnify,
	plus: mdiPlus,
	arrowLeft: mdiArrowLeft,
	timerSand: mdiTimerSand,
	accountMultipleOutline: mdiAccountMultipleOutline,
	clockOutline: mdiClockOutline,
	checkCircle: mdiCheckCircle,
	closeCircle: mdiCloseCircle,
	minusCircle: mdiMinusCircle,
	cogOutline: mdiCogOutline,
	bookOpenOutline: mdiBookOpenOutline,
	chevronDown: mdiChevronDown,
	chevronUp: mdiChevronUp,
} as const;

export type AppIconAlias = keyof typeof appIconAliases;
