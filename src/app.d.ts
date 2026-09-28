// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// The tender pages throw error(404, { message, kind: 'unknown-notice', notice }) so the error
		// page can name the notice; every other error carries the message alone.
		interface Error {
			message: string;
			kind?: 'unknown-notice';
			notice?: string;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
