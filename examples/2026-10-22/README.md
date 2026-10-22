# TED capture of 2026-10-22

Open IT tenders from the Netherlands, Belgium and Germany, as TED listed them on 22 Oct 2026. The capture command (`npm run capture`) wrote this folder, and the records build serves it.

## When and what

- Captured 2026-10-22T08:24:12.447Z (22 Oct 2026, 10:24 CEST), the `fetchedAt` value in `notices.json`.
- Query, as recorded in `notices.json`: `classification-cpv IN (72000000 48000000) AND buyer-country IN (NLD BEL DEU) AND publication-date>=20261008 AND notice-type=cn-standard`. The search sent `scope: ACTIVE` and asked for only the latest version of each notice, and `notices.json` records both settings.
- The window runs from 8 Oct 2026, the first publication day the query names, to the capture day, 22 Oct 2026. A tender published before 8 Oct 2026 and still open is not in this capture.
- The search reads competition notices only, so a procedure its buyer ended through a later result notice is not detected here.
- 323 notices written, of the 395 TED stated for the search: `notices.json` lists them (`total` is the written count, `searchTotal` TED's) and `xml/` holds one eForms notice file per publication number.
- `fetch-log.json` lists every request of this run, search pages and notice downloads, with its time, status and size. `run.json` records the run: its start and end, the commit it ran from, the query and what became of each listed notice.
- Modes of this run: TED live, Token Factory live, Tavily live. `run.json` records them beside every metered call the run attempted.
- Only notices whose every lot closes after 2026-10-30T17:00:00.000Z (30 Oct 2026, 18:00 CET) were kept: 66 notices with a lot that closes at or before it, or shows no deadline, were left out, and Left out names each.

## Model read

Each lot's selection criteria, as published in the notice, were read by nvidia/nemotron-3-super-120b-a12b on Nebius Token Factory, region us-central1, with thinking off. Every reading is model-written.

- 288 lots with criteria: 288 read in this run, 0 reused from an earlier run, 0 not read.
- `readings.json` holds the readings, and `run.json` the tokens and the cost: 225 sent, USD 0.275838.

## Buyer search

Each search sent one notice's buyer name and fixed words for earlier awards to Tavily basic search. The results are web pages nobody checked, and they change no verdict.

- 200 notices with criteria in the notice: 200 searched, 0 not searched.
- `searches.json` holds the web results, which nobody checked, and `run.json` the searches and the credits: 200 sent, 200 credits.

## Left out

These notices were in the search answer and are not in this capture:

- 693559-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 693880-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 695366-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 695595-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 695915-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 696212-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 696803-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 696918-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 697508-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 697572-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 698960-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 699123-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 699201-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 700737-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 701461-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 702174-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 702912-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 703823-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 703938-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 704386-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 705091-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 706666-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 707075-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 707306-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 707894-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 709442-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 709558-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 710233-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 710314-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 710891-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 711447-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 711848-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 712102-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 713290-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 713469-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 713514-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 713550-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 713751-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 714124-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 714644-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 715185-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 715318-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 716319-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 717683-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 717756-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 718014-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 719193-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 719226-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 719564-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 719661-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 720149-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 720299-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 720914-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 721055-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 721224-2026: deadline-offsets: ContractNotice/cac:ProcurementProjectLot[LOT-0001]/cac:ParticipationRequestReceptionPeriod gives its date at +01:00 and its time at +02:00, so its deadline is not known to the hour
- 722692-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 722921-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 724004-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 725371-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 725377-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 727241-2026: deadline-offsets: ContractNotice/cac:ProcurementProjectLot[LOT-0001]/cac:TenderSubmissionDeadlinePeriod gives its date at +01:00 and its time at +02:00, so its deadline is not known to the hour
- 727450-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 728241-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 729482-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 730912-2026: deadline-offsets: ContractNotice/cac:ProcurementProjectLot[LOT-0001]/cac:ParticipationRequestReceptionPeriod gives its date at +01:00 and its time at +02:00, so its deadline is not known to the hour
- 730944-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 731397-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 731636-2026: deadline-offsets: ContractNotice/cac:ProcurementProjectLot[LOT-0001]/cac:ParticipationRequestReceptionPeriod gives its date at +01:00 and its time at +02:00, so its deadline is not known to the hour
- 732240-2026: a lot closes at or before 2026-10-30T17:00:00.000Z
- 733061-2026: a lot closes at or before 2026-10-30T17:00:00.000Z

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
