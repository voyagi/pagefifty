const path = require('node:path');

module.exports = {
	forbidden: [
		{
			name: 'no-browser-to-server',
			severity: 'error',
			comment:
				'Components and universal load functions run in the browser; server modules hold provider keys and the live switch.',
			from: { path: '(\\.svelte$|^src/lib/components/|^src/routes/.*\\+(page|layout)\\.ts$)' },
			to: { path: '^src/lib/server/' }
		},
		{
			name: 'no-server-reaches-profile',
			severity: 'error',
			comment:
				'The firm profile is company data that stays in the browser (PROF-02). No server-only module (an endpoint, a server load or action, lib/server) may reach the profile code, so no request handler can take or pass on profile data.',
			// SvelteKit's server-only modules: everything under lib/server and any file named .server
			// (hooks, page and layout loads included), plus the +server endpoints. Components and
			// universal loads may import the profile: they render on the server too, but the store must
			// read storage only in the browser, never while rendering on the server, so no profile data
			// exists there. Holding them to this rule would forbid the profile form itself.
			from: {
				path: '(^src/lib/server/|\\.server\\.(ts|js)$|\\+server\\.(ts|js)$)'
			},
			to: { path: '^src/lib/profile/', reachable: true }
		},
		{
			name: 'no-ui-reaches-verdict',
			severity: 'error',
			comment:
				'Phase 1 draws no verdict (SPEC R3): no component or route may reach the verdict module, directly or through another module. source-rules.test.ts checks the direct import; this rule covers the path through a library module. The verdict page of a later phase lifts it on purpose.',
			from: { path: '(^src/lib/components/|^src/routes/)', pathNot: '\\.test\\.ts$' },
			to: { path: '^src/lib/core/verdict\\.ts$', reachable: true }
		},
		{
			name: 'single-parser-entry',
			severity: 'error',
			comment:
				"The notice reader's size cap, DOCTYPE refusal and validation run before every parse only while it is the one module that imports the XML parser.",
			from: { pathNot: '^src/lib/ingest/read-notice\\.ts$' },
			to: { path: '(^|/)node_modules/fast-xml-parser/' }
		},
		{
			name: 'fetch-only-network',
			severity: 'error',
			comment:
				'App code makes its calls through fetch alone: the snapshot transport is a fetch seam and the test guards wrap fetch and Node sockets only, so a raw socket, datagram, resolver or child process would leave the machine unseen. Tests and their setup files may use them. A resource that markup or CSS loads (an image, a stylesheet) is not a call: the Content-Security-Policy of plan 01-09 bounds those.',
			from: { path: '^src/', pathNot: ['^src/test/', '\\.test\\.ts$'] },
			// The promises subpath counts too: node:dns/promises reaches the resolver as surely as
			// node:dns. The cruiser refuses an open-ended subpath pattern as unsafe, so it is named.
			to: {
				path: '^(node:)?(net|tls|http|https|http2|dgram|dns|child_process|worker_threads|cluster)(/promises)?$|^cloudflare:sockets$'
			}
		},
		{
			name: 'no-site-reaches-capture',
			severity: 'error',
			comment:
				'The capture command holds the TED client and, from plan 01.1-14, the provider key loader, while the site serves a capture and never calls TED or a provider. A direct import is enough: any route to the command passes through a site module that imports it.',
			from: { path: '^src/', pathNot: ['^src/lib/capture/', '^src/test/', '\\.test\\.ts$'] },
			to: { path: '^src/lib/capture/' }
		},
		{
			name: 'no-private-env',
			severity: 'error',
			comment:
				"The site reads no provider key. env.dir keeps the root env file out of $env, but Vite's loadEnv with an empty prefix also returns every variable of the shell that runs vite dev or vite build, and $env/static/private would inline it into the server bundle. Public env stays open; tests may read private env. An unresolved import keeps its written name, which this path matches.",
			from: { path: '^src/', pathNot: ['^src/test/', '\\.test\\.ts$'] },
			to: { path: '^\\$env/(static|dynamic)/private$' }
		},
		{
			// An import the cruiser cannot resolve is invisible to every rule above, so it fails here.
			name: 'no-unresolvable',
			severity: 'error',
			from: {},
			to: { couldNotResolve: true, pathNot: ['^\\$app/', '^\\$env/', '^cloudflare:'] }
		},
		{
			name: 'no-circular',
			severity: 'error',
			from: {},
			to: { circular: true }
		},
		{
			name: 'no-orphans',
			severity: 'warn',
			from: {
				orphan: true,
				pathNot: ['\\.d\\.ts$', '\\.(test|spec)\\.ts$', '(^|/)src/routes/', '(^|/)src/app\\.', '(^|/)src/hooks\\.']
			},
			to: {}
		}
	],
	options: {
		doNotFollow: { path: 'node_modules' },
		exclude: { path: '^\\.svelte-kit/' },
		tsConfig: { fileName: path.join(__dirname, 'tsconfig.json') },
		webpackConfig: { fileName: path.join(__dirname, 'depcruise.resolve.cjs') },
		enhancedResolveOptions: {
			extensions: ['.ts', '.js', '.mjs', '.svelte'],
			conditionNames: ['svelte', 'import', 'module', 'default'],
			exportsFields: ['exports']
		}
	}
};
