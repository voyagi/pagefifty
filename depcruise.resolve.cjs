const path = require('node:path');

// SvelteKit declares $lib in a generated tsconfig that dependency-cruiser does not follow.
module.exports = {
	resolve: {
		alias: { $lib: path.join(__dirname, 'src/lib') }
	}
};
