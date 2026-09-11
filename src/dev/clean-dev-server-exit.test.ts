import { describe, expect, it, vi } from 'vitest';
import {
	bindShortcutSigint,
	createDevServerShutdown,
	restoreStdinTty,
	type ViteServerWithShortcuts,
} from './clean-dev-server-exit.ts';

describe('clean dev server exit', () => {
	it('restores cooked mode on a TTY stdin', () => {
		const setRawMode = vi.fn();
		restoreStdinTty({ isTTY: true, setRawMode } as unknown as NodeJS.ReadStream);
		expect(setRawMode).toHaveBeenCalledWith(false);
	});

	it('skips restore when stdin is not a TTY', () => {
		const setRawMode = vi.fn();
		restoreStdinTty({ isTTY: false, setRawMode } as unknown as NodeJS.ReadStream);
		expect(setRawMode).not.toHaveBeenCalled();
	});

	it('closes shortcuts, restores the TTY, then exits after close', async() => {
		const close = vi.fn().mockResolvedValue(undefined);
		const exit = vi.fn();
		const restoreTty = vi.fn();
		const closeShortcuts = vi.fn();
		const shutdown = createDevServerShutdown({
			close,
			exit,
			restoreTty,
			closeShortcuts,
		});
		shutdown();
		expect(closeShortcuts).toHaveBeenCalledOnce();
		expect(restoreTty).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
	});

	it('is one-shot and force-exits if close hangs', async() => {
		const exit = vi.fn();
		const close = vi.fn().mockReturnValue(new Promise(() => {}));
		const scheduled: Array<() => void> = [];
		const shutdown = createDevServerShutdown(
			{
				close,
				exit,
				scheduleForceExit: (fn) => {
					scheduled.push(fn);
					return { unref: vi.fn() };
				},
			},
			25,
		);
		shutdown();
		shutdown();
		expect(close).toHaveBeenCalledOnce();
		expect(scheduled).toHaveLength(1);
		scheduled[0]();
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('hooks readline SIGINT after Vite binds CLI shortcuts', () => {
		const on = vi.fn();
		const originalBind = vi.fn(function bind(this: ViteServerWithShortcuts) {
			this._shortcutsState = { rl: { close: vi.fn(), on } };
		});
		const server = {
			bindCLIShortcuts: originalBind,
		} as unknown as ViteServerWithShortcuts;
		const onSigint = vi.fn();
		bindShortcutSigint(server, onSigint);
		server.bindCLIShortcuts({ print: true });
		expect(originalBind).toHaveBeenCalledOnce();
		expect(on).toHaveBeenCalledWith('SIGINT', onSigint);
	});
});
