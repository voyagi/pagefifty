# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner or bid lead of a small IT firm, 5 to 50 people, in the Netherlands, Belgium or Germany. They sit at a desk late in a busy day, on a laptop, with an open EU public tender in front of them that someone found or forwarded. The job: decide in a few minutes whether the firm meets a tender's published selection criteria, before anyone spends two days writing a bid. They are not procurement lawyers and often do not read the language the tender is written in.

## Product Purpose

Pagefifty reads an open tender's own published selection criteria, checks each one against the firm's profile, and returns GO, NO-GO or ASK FIRST. Every clause behind the verdict is quoted from the tender's text, linked to its source, and read back in plain English.

Success is a firm that drops a tender it could never win within minutes, or goes ahead knowing it meets every published criterion that was read, and knowing which criteria were not read. For the hackathon, success is a judge with three minutes seeing a real open tender, the knock-out clause quoted and read in plain English, the verdict, and one measured number with its inference cost.

## Positioning

Pagefifty leads with the clause that rules the firm out. The rule that knocks a small firm out (a minimum headcount per role, a turnover floor, a certificate, three reference projects of a given size) is never on page one; it waits deep in the notice and the document pack. Pagefifty shows that exact clause, quoted and sourced, and shows the ruled-out tenders as loudly as the ones the firm can bid on.

It never gives a verdict the source does not support. Eligibility checkers answer yes or no; Pagefifty shows which published selection criterion the firm does not meet on its own, quotes the clause with its source, and proves it with the buyer's own words. A verdict covers the criteria it read, never every condition for taking part.

## Operating Context

- Tenders come from the official EU TED Search API (anonymous), filtered to IT services and software (CPV 72000000, 48000000) in NL, BE and DE, then extended through per-portal document pack readers (DTVP, TenderNed) where packs are openly readable, and Tavily extract and search for the rest.
- The national portals the user must eventually bid through (TenderNed, DTVP, e-Vergabe, publicprocurement.be) are plain government interfaces. Pagefifty is used before them.
- Selection criteria arrive as typed eForms codes with numeric parameters, plus free text in German, Dutch or French.
- The firm profile (headcount by role, three years of turnover, certificates, reference projects, countries, languages) lives in the browser and is exported as a JSON file the user keeps.
- Where a buyer demands a yearly turnover above two times the published estimated value (Directive 2014/24/EU Article 58(3)), the user gets a drafted clarification question and a calendar reminder for the question deadline.

## Capabilities and Constraints

- Verdicts: GO, NO-GO, ASK FIRST. No readable criteria means ASK FIRST, never GO. A miss the firm could meet through a partner or by relying on another firm's capacity is its own state, not a flat NO-GO.
- A Nemotron model on Nebius Token Factory reads free-text criteria into structured requirements with a verbatim quote. Code verifies the quote against the source, parses every number and decides every comparison. The model never overrules a numeric comparison.
- Document packs are read only through adapters proven on a real notice; any other portal shows "documents not read yet" with its link.
- A captured real run replays with no key and no install, so the product works in demo without live metered calls. Live calls sit behind one switch the owner flips.
- Non-goals: no bid writing, no legal advice, no accounts, no payments, no portals behind a login, no messages sent, no automatic submission.
- Pages planned: Home, Tenders, Tender verdict, Profile, Examples, How it works and limits, Privacy, AI disclosure, 404.
- Stack is set by the codebase: SvelteKit 2, Svelte 5, Cloudflare Workers with static assets.

## Brand Commitments

- Name: Pagefifty, from the reader's moment: the clause that rules you out is on page fifty.
- Voice: plain, concrete and calm, written for a busy owner at the end of a long day. Active voice, real verbs. Always states that it is not legal advice.
- Language: English interface first. Each clause is shown in its original language beside the plain English reading.
- Lane words kept out of the name, tagline and video title: tender, bid, procurement, radar, match.

## Evidence on Hand

- Measured on live TED data, 2026-09-15: 363 IT notices from NL, BE and DE published since 2026-09-01 and listed by TED as active, 350 of them still open by their own deadlines; 97 of the 363 publish an estimated value; 57 of the open ones state a turnover floor (53 German, 4 Belgian, no Dutch), and 31 of those set a floor a firm with EUR 1M yearly turnover cannot meet on its own (every floor in a lot counts, a three-year total counts as a third a year). One of the 363, 601147-2026, is an earlier version of 600367-2026 (Dutch, no typed criteria, so the floor figures hold), and the product lists the other 362, 349 of them open.
- German notices carry typed selection criteria far more often than Dutch or Belgian ones (211 of 240 DE, 2 of 72 NL, 10 of 43 BE, counting the 355 notices with a single buyer, since the other 8 have several).
- Real DTVP document packs (ZIP) and a TenderNed PDF fetched with no account.
- No customers, testimonials, press or partner logos exist. None may be invented.

## Product Principles

1. The source is the verdict. Nothing is shown as ruling a firm out unless the tender's own words, quoted and linked, say so.
2. Code decides numbers, the model reads language. The split is visible to the user.
3. Ruled out is as useful as ruled in. A clear NO-GO saves two days and is presented with the same care.
4. Say what was not read. Unread documents and unreadable criteria are stated, never hidden behind a confident verdict.
5. The firm's data stays with the firm. The profile lives in the browser and leaves only as a file the user exports.

## Accessibility & Inclusion

WCAG 2.2 AA as the target, 2.1 AA as the legal floor for EU users. Clause text in German, Dutch and French must carry correct `lang` attributes. Light, Dark and Device themes, Device the default.
