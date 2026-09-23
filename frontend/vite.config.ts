import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';

const browserChannel = process.env.VITEST_BROWSER_CHANNEL;
const browserProvider = browserChannel
	? playwright({ launchOptions: { channel: browserChannel } })
	: playwright();

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage/server',
			reporter: ['text', 'json-summary', 'html'],
			include: ['src/lib/api/client.ts', 'src/lib/api/erros-sms.ts', 'src/lib/api/erros-tfd.ts'],
			thresholds: {
				statements: 30,
				branches: 29,
				functions: 15,
				lines: 30
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: browserProvider,
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
