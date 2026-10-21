# TED capture of 2026-09-15

Open IT tenders from the Netherlands, Belgium and Germany, as TED listed them on the evening of 15 September 2026. The fixture tests read this folder today, and the notice reader, the tenders list and the example run are built to read it too, so the app has a fixed "now" and never calls TED while it replays.

## When and what

- Captured 2026-09-15T19:50:49.157Z (21:50 CEST), the `fetchedAt` value in `notices.json`.
- Query, as recorded in `notices.json`: `classification-cpv IN (72000000 48000000) AND buyer-country IN (NLD BEL DEU) AND publication-date>=20260901 AND notice-type=cn-standard`. The search also sent `scope: ACTIVE` and asked for only the latest version of each notice. Those two settings are not stored in `notices.json`.
- 363 notices: `notices.json` is the search response (`total` 363) and `xml/` holds one eForms notice file per publication number, 363 in all.
- `fetch-log.json` holds only the entries of the last fetch run that evening: two search pages and three notice downloads, with no failures. The notice files were downloaded over several runs the same day, so the log does not list every file here.

## Source and reuse terms

Source: TED, the European Union's Tenders Electronic Daily, https://ted.europa.eu.

© European Union, 1998-2026. The TED legal notice says the procurement notices "can be freely reused, for commercial or non-commercial purposes". Reuse follows Commission Decision 2011/833/EU of 12 December 2011 on the reuse of Commission documents, and the editorial content of the TED websites is licensed under CC BY 4.0. Terms: https://ted.europa.eu/en/legal-notice

## What was changed

Every contact name, every email address (also one written with (at) or [at] in place of the at sign), every telephone element and every fax element in these files was replaced with `[removed]`, as was every name given to a buyer's extra contact point (a touch point, where some buyers type a person's name), every telephone, fax or mobile number written straight after a word such as Telefon, Tel., Tél., Fax, Phone, Telefoon, Mobil or GSM, with or without a number word (Telefonnummer, Tel.-Nr.), or after a lone T: or F:, every international telephone number (a plus sign, a country code and at least eight digits) wherever it stands, and the name of a person written right before that person's own email address. Apart from those replacements the files are exactly as TED published them: the element structure, deadlines and values are unchanged, and no selection criterion holds a replacement, which the capture test checks. Replacements do sit inside some free-text descriptions and one organisation name, wherever an address or a number stood.

The app uses none of this contact data, the repository is meant to be public, and the GDPR asks for no more personal data than the purpose needs, so none of it is kept here. `node scripts/scrub-capture.mjs --check examples/2026-09-15` lists any file in which the scrub's own patterns still find contact data, or that is not text, and the capture test, which uses separate patterns, fails if any does. Both also read every file with its character references (`&#64;` is an at sign) and JSON escapes decoded. The scrub does not decode them, so a later capture that writes contact data that way fails both checks rather than passing them. Outside contact and touch point elements, the scrub finds a person's name only when it stands right before that person's own email address. The capture test also fails on a capitalised name written after a form of address such as Frau, Herr, Mevrouw, de heer, Madame or Mr, and no file here holds one. A name with neither an address nor a form of address beside it is found by neither.

## Model readings

`readings.json` holds what the model read in two lots of this capture: the German lot LOT-0000 of 610242-2026 (six criteria) and the Dutch lot LOT-0001 of 634398-2026 (five criteria). The model is `nvidia/nemotron-3-super-120b-a12b` on Nebius Token Factory, region `us-central1`, with thinking off and temperature 0. Each lot's criteria text went out with the prompt, the answer schema and the settings the capture command sends, and nothing else.

The two lots were read on 15 October 2026 in a one-off run with a written cap, made before the capture command had its own model step. The two replies were then passed through that step, so the file has the shape, the keys, the counts and the cost the command writes: 2 requests, 2811 input and 2563 output tokens, no reasoning tokens, USD 0.003150 at the prices listed that day (0.30 per million input tokens, 0.90 per million output tokens). Code then checked every quote word for word against the clause it names: 24 of 24 were found, none rejected. The readings are plain English sentences written by the model and are shown on the site labelled as AI readings. Only the clause text of these two lots was sent. `searches.json` holds the one buyer search of this capture, made on 15 October 2026 in the same run: a Tavily basic search for the earlier awards of the German buyer of 610242-2026, which used 1 credit and returned five web results that nobody checked and that change no verdict.

A later capture goes into its own dated folder beside this one. This folder is never captured again in place. A scrub fix is applied again from the same source capture. The capture test scans every file in every folder under `examples/` and fails on one it cannot read as text, so a document pack (a PDF, a ZIP, an office file) goes in only as extracted, scrubbed text.
