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

interface QueuedConfirm {
	options: ConfirmDialogOptions;
	resolve: (confirmed: boolean) => void;
}

const open = ref(false);
const options = shallowRef<ConfirmDialogOptions | null>(null);
let resolver: ((confirmed: boolean) => void) | null = null;
const queue: QueuedConfirm[] = [];

function showNext(): void {
	const next = queue.shift();
	if (!next) {
		options.value = null;
		open.value = false;
		resolver = null;
		return;
	}
	options.value = next.options;
	open.value = true;
	resolver = next.resolve;
}

/**
 * App-wide confirm API (module singleton; mount dialog in AppShell).
 */
export function useConfirmDialog() {
	async function confirm(next: ConfirmDialogOptions): Promise<boolean> {
		return new Promise((resolve) => {
			if (resolver || open.value) {
				queue.push({ options: next, resolve });
				return;
			}
			options.value = next;
			open.value = true;
			resolver = resolve;
		});
	}

	function resolve(confirmed: boolean): void {
		const current = resolver;
		resolver = null;
		open.value = false;
		current?.(confirmed);
		showNext();
	}

	return {
		open,
		options,
		confirm,
		resolve,
	};
}
