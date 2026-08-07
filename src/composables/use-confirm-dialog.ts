/**
 * Promise-based confirm dialog hosted once under the app shell.
 */
import { ref, shallowRef } from 'vue';

export interface ConfirmDialogOptions {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	/** Vuetify button color for the confirm action. */
	color?: string;
}

const open = ref(false);
const options = shallowRef<ConfirmDialogOptions | null>(null);
let resolver: ((confirmed: boolean) => void) | null = null;

/**
 * App-wide confirm API (module singleton; mount dialog in AppShell).
 */
export function useConfirmDialog() {
	async function confirm(next: ConfirmDialogOptions): Promise<boolean> {
		if (resolver) {
			resolver(false);
			resolver = null;
		}
		options.value = next;
		open.value = true;
		return new Promise((resolve) => {
			resolver = resolve;
		});
	}

	function resolve(confirmed: boolean): void {
		open.value = false;
		resolver?.(confirmed);
		resolver = null;
	}

	return {
		open,
		options,
		confirm,
		resolve,
	};
}
