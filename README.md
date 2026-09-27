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

## License

MIT
