/**
 * Transient success/error toasts hosted once under the app shell.
 */
import { ref } from 'vue';

const visible = ref(false);
const message = ref('');
const color = ref<'success' | 'error' | 'info' | 'warning'>('success');
const timeoutMs = ref(4_000);

/**
 * App-wide toast API (module singleton; mount snackbar in AppShell).
 */
export function useToast() {
	function show(
		text: string,
		options: {
			color?: 'success' | 'error' | 'info' | 'warning';
			timeout?: number;
		} = {},
	): void {
		message.value = text;
		color.value = options.color ?? 'success';
		timeoutMs.value = options.timeout ?? 4_000;
		visible.value = true;
	}

	function success(text: string): void {
		show(text, { color: 'success' });
	}

	function dismiss(): void {
		visible.value = false;
	}

	return {
		visible,
		message,
		color,
		timeoutMs,
		show,
		success,
		dismiss,
	};
}
