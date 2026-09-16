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
