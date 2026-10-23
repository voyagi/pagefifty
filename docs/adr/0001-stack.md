# 0001: SvelteKit on Cloudflare Workers

Date: 2026-09-15. Status: accepted.

## Context

Pagefifty is app-like rather than content-first. A visitor edits a firm profile, browses a live
list of tenders, and opens a verdict page that is computed on request. Three upstream services are
involved: the TED Search API (public), Nebius Token Factory and Tavily (both keyed and metered). The
keys must never reach the browser, so the product needs server routes, not only static pages. The
default host for these builds is Cloudflare Workers with static assets.

## Options compared

| Option                           | Interactive UI                        | Server routes for keyed calls                      | Workers fit                                          | Notes                                                                  |
| -------------------------------- | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| SvelteKit 2 + adapter-cloudflare | strong, small runtime                 | `+server.ts` endpoints, `platform.env` for secrets | first-party adapter builds for Workers static assets | form actions and progressive enhancement suit the profile form         |
| Astro + Cloudflare adapter       | islands, good for mostly static pages | endpoints available                                | supported                                            | best for content sites; the verdict flow is the core here, not content |
| Next.js via OpenNext             | strong                                | route handlers                                     | works through an extra build layer                   | heavier bundle, more moving parts on Workers                           |
| Plain HTML plus a Worker         | full control                          | a hand-written Worker                              | native                                               | every interaction and route by hand; slower to reach the design bar    |

## Decision

SvelteKit 2 with Svelte 5 and `@sveltejs/adapter-cloudflare`, deployed with `wrangler deploy` to
Workers with static assets. TypeScript throughout, Vitest for tests.

The adapter documentation states it "supports all SvelteKit features and builds for Cloudflare
Workers Static Assets" (svelte.dev/docs/kit/adapter-cloudflare, read 2026-09-15).

## Consequences

- Secrets arrive per request through `platform.env`, so `@t3-oss/env-core` (which reads
  `process.env` at boot) does not apply. As built (2026-10-23): no metered call runs in the Worker,
  which reads no secret and so has no `platform.env` schema. The keys are read only by the local
  capture command, which checks them with a zod schema (`src/lib/capture/keys.ts`) before a live run.
- Every metered call goes through one server module with a live switch (`PAGEFIFTY_LIVE`) that is
  off by default, and a snapshot transport behind the same client for tests and the examples run.
  As built (2026-10-23): that module is the capture command's metered gate
  (`src/lib/capture/metered.ts`), run on a person's machine, never in the Worker, and a call goes
  live only with `PAGEFIFTY_LIVE=1` and the command's `--live` flag together.
- The bundle-size gate measures the client assets only, not the Worker bundle.

## What would change this

If the product turned into mostly static pages with a thin API, Astro would serve it with less
JavaScript. If Workers could not run the XML parsing within its CPU limits for large notices, the
parsing would move to build-time snapshots or a different host. As built (2026-10-23): the notices
are parsed at build time (`scripts/build-records.mjs`), and the Worker serves the parsed records.
