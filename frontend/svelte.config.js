import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x'
		}),
		csp: {
			mode: 'auto',
			directives: {
				'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'https:', 'data:', 'blob:'],
				'style-src': ['self', 'unsafe-inline', 'https://rsms.me', 'https:'],
				'font-src': ['self', 'https://rsms.me', 'https:', 'data:'],
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'connect-src': ['self', 'https:', 'http:', 'ws:', 'wss:']
			}
		}
	}
};

export default config;
