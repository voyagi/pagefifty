# TED capture of 2026-10-16

Open IT tenders from the Netherlands, Belgium and Germany, as TED listed them on 16 Oct 2026. The capture command (`npm run capture`) wrote this folder, and the records build serves it.

## When and what

- Captured 2026-10-16T14:41:13.399Z (16 Oct 2026, 16:41 CEST), the `fetchedAt` value in `notices.json`.
- Query, as recorded in `notices.json`: `classification-cpv IN (72000000 48000000) AND buyer-country IN (NLD BEL DEU) AND publication-date>=20261002 AND notice-type=cn-standard`. The search sent `scope: ACTIVE` and asked for only the latest version of each notice, and `notices.json` records both settings.
- The window runs from 2 Oct 2026, the first publication day the query names, to the capture day, 16 Oct 2026. A tender published before 2 Oct 2026 and still open is not in this capture.
- The search reads competition notices only, so a procedure its buyer ended through a later result notice is not detected here.
- 395 notices written, of the 397 TED stated for the search: `notices.json` lists them (`total` is the written count, `searchTotal` TED's) and `xml/` holds one eForms notice file per publication number.
- `fetch-log.json` lists every request of this run, search pages and notice downloads, with its time, status and size. `run.json` records the run: its start and end, the commit it ran from, the query and what became of each listed notice.
- Modes of this run: TED live, Token Factory snapshot, Tavily snapshot. `run.json` records them beside every metered call the run attempted.

## Not captured

These notices were in the search answer, but their XML could not be downloaded, read or served as published, so they are not in this capture:

- 694786-2026: scrub: contact data stands inside a selection criterion, which is served only as published
- 695350-2026: malformed: namespace urn:oasis:names:specification:ubl:schema:xsd:ContractNotice-2 is bound to prefix cn, and the reader reads it only as the default namespace

## Source and reuse terms

Source: TED, the European Union's Tenders Electronic Daily, https://ted.europa.eu.

© European Union, 1998-2026. The TED legal notice says the procurement notices "can be freely reused, for commercial or non-commercial purposes". Reuse follows Commission Decision 2011/833/EU of 12 December 2011 on the reuse of Commission documents, and the editorial content of the TED websites is licensed under CC BY 4.0. Terms: https://ted.europa.eu/en/legal-notice

## What was changed

Every contact name, every email address (also one written with (at) or [at] in place of the at sign), every telephone element and every fax element in these files was replaced with `[removed]`, as was every name given to a buyer's extra contact point (a touch point, where some buyers type a person's name), every telephone, fax or mobile number written straight after a word such as Telefon, Tel., Tél., Fax, Phone, Telefoon, Mobil or GSM, with or without a number word (Telefonnummer, Tel.-Nr.), or after a lone T: or F:, every international telephone number (a plus sign, a country code and at least eight digits) wherever it stands, and the name of a person written right before that person's own email address. The capture command made these replacements in a staging folder before this folder was written. Apart from them the files are exactly as TED published them: the element structure, deadlines and values are unchanged. Replacements can sit inside free-text descriptions and organisation names, wherever an address or a number stood.

The app uses none of this contact data, the repository is meant to be public, and the GDPR asks for no more personal data than the purpose needs, so none of it is kept here. Before the staging folder was moved into `examples/`, the command ran the check that `node scripts/scrub-capture.mjs --check` runs, and it writes no folder in which that check finds contact data, a file that is not text or a link. The capture test, which uses separate patterns, fails if any file here still holds contact data.

A later capture goes into its own dated folder beside this one. This folder is never captured again in place. A scrub fix is applied again from the raw notices the command keeps outside the repository.
