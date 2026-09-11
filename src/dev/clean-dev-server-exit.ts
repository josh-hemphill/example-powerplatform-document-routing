import type { Plugin, ViteDevServer } from 'vite';

/** Give `server.close()` this long before forcing process exit. */
export const DEV_SERVER_FORCE_EXIT_MS = 1_500;

export interface DevServerExitHooks {
	close: () => Promise<void>;
	exit: (code?: number) => void;
	restoreTty?: () => void;
	closeShortcuts?: () => void;
	scheduleForceExit?: (fn: () => void, ms: number) => { unref?: () => void };
}

/**
 * Returns a one-shot shutdown that restores the TTY and exits even if Vite close hangs.
 */
export function createDevServerShutdown(
	hooks: DevServerExitHooks,
	forceExitAfterMs = DEV_SERVER_FORCE_EXIT_MS,
): () => void {
	let shuttingDown = false;
	return () => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		hooks.closeShortcuts?.();
		hooks.restoreTty?.();
		const timer = hooks.scheduleForceExit?.(() => hooks.exit(0), forceExitAfterMs);
		timer?.unref?.();
		void hooks.close().finally(() => hooks.exit(0));
	};
}

/**
 * Puts stdin back in cooked mode after Vite's readline shortcuts used raw mode.
 */
export function restoreStdinTty(stdin: NodeJS.ReadStream = process.stdin): void {
	if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
		return;
	}
	try {
		stdin.setRawMode(false);
	}
	catch {
		// stdin may already be closed during teardown
	}
}

export type ViteServerWithShortcuts = ViteDevServer & {
	_shortcutsState?: {
		rl?: {
			close: () => void;
			on?: (event: string, listener: () => void) => void;
		};
	};
};

/**
 * Vite binds CLI shortcuts after listen. Wrap that so Ctrl+C on the
 * readline interface shuts down (otherwise it only emits `pause`).
 */
export function bindShortcutSigint(
	server: ViteServerWithShortcuts,
	onSigint: () => void,
): void {
	const originalBind = server.bindCLIShortcuts.bind(server);
	server.bindCLIShortcuts = (options) => {
		originalBind(options);
		server._shortcutsState?.rl?.on?.('SIGINT', onSigint);
	};
}

/**
 * Vite 8 CLI shortcuts use readline, which intercepts Ctrl+C. Without a
 * SIGINT handler the process never exits and the TTY stays captured.
 */
export function cleanDevServerExitPlugin(): Plugin {
	return {
		name: 'clean-dev-server-exit',
		apply: 'serve',
		configureServer(server) {
			const typedServer = server as ViteServerWithShortcuts;
			const shutdown = createDevServerShutdown({
				close: () => server.close(),
				exit: (code) => process.exit(code ?? 0),
				restoreTty: () => restoreStdinTty(),
				closeShortcuts: () => {
					typedServer._shortcutsState?.rl?.close();
				},
				scheduleForceExit: (fn, ms) => {
					const timer = setTimeout(fn, ms);
					timer.unref();
					return timer;
				},
			});
			bindShortcutSigint(typedServer, shutdown);
			process.on('SIGINT', shutdown);
		},
	};
}
