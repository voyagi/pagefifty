# Pagefifty

The rule your firm can't meet alone is on page fifty. Read it first. Pagefifty checks whether your
firm meets a tender's published selection criteria, and quotes each clause from the tender's own
text with its source.

Status: early development. The [examples/2026-09-15/](examples/2026-09-15/) folder holds the
captured TED snapshot the example run replays with no key and no install. TED is the source; the
folder's README gives the reuse terms and what was scrubbed.

## Data sources

- Open tenders: the EU's TED Search API (Tenders Electronic Daily), public and keyless.
- Reading free-text criteria: an NVIDIA Nemotron model served by Nebius Token Factory.
- Public document pages and a buyer's earlier awards: Tavily.

Pagefifty is not legal advice. It points at the clause and the source; the decision stays with you.

## Setup

```sh
cp .env.example .env
npm install
npm run dev -- --no-open
```

Live model and search calls are off by default. Without keys the app runs on recorded snapshots.

## Capturing open tenders

```sh
npm run capture
```

The command searches TED for open IT notices (CPV 72000000 and 48000000) from buyers in the
Netherlands, Belgium and Germany, published in the last 14 days. `--since YYYYMMDD` starts the
window on another day. It downloads each notice's XML at one request a second, keeps active notices
and their latest versions only, removes contact data, and writes `examples/<date>/`, named after the
day the run started in Europe/Amsterdam. The site serves the newest capture on its next build.

Downloads are kept in `.capture-cache/`, so a later run asks TED again only for the search and for
notices it does not hold yet. Every run that gets past its flags leaves a record in
`.capture-cache/runs/`, failed runs included; a written capture also holds it as `run.json`.

Exit codes: 0 the capture was written; 1 the run failed and wrote nothing; 2 refused before any
request (a bad flag, a folder for that day already exists, another run is in progress, or a live run
without its switch or keys); 130 stopped with Ctrl+C.

### Metered calls and the go-live switch

The model read (Token Factory) and the search (Tavily) cost money per call. They stay off: a plain
run logs `(dry-run) WOULD call <provider> <operation>` for each call it would have made and calls
nothing. A live run needs the `--live` flag and `PAGEFIFTY_LIVE=1` set in the shell for that one
command:

```sh
PAGEFIFTY_LIVE=1 npm run capture -- --live --cap 50
```

`PAGEFIFTY_LIVE` is read from the shell only. A value in `.env` does nothing, and `--live` with any
value other than `1` stops before any request. `--cap N` is required with `--live`, a whole number
from 0 to 1000. It counts every attempt across both providers, retries included, and each call past
it is refused and logged.

A live run reads `NEBIUS_API_KEY` and `TAVILY_API_KEY` from `.env` at the repository root and hands
each key to its own provider's calls only. The keys never reach `process.env`, a log line, a run
record or the capture. No metered call is wired into the command yet, so a live run makes no billed
call today.

## License

MIT
