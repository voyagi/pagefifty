# Pagefifty

Can a small IT firm legally bid on this EU public tender? Pagefifty reads the tender's own
published selection criteria, checks each one against the firm's profile, and answers GO, NO-GO or
ASK FIRST with every clause quoted and linked to its source.

Status: early development. The examples/ folder will hold a captured real run that replays with no
key and no install.

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
