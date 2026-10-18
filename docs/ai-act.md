# EU AI Act: what applies to Pagefifty, and what ships because of it

Determined 2026-10-18 against Regulation (EU) 2024/1689, Article 50, "Transparency obligations
for providers and deployers of certain AI systems", read on EUR-Lex
(https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689) on 2026-10-18. Each
verdict below rests on a fact the site's AI page (/ai) states.

One model reads the published selection criteria of each tender lot when a snapshot is captured.
The site shows those readings as recorded and calls no model while a visitor reads (/ai). Code,
not the model, checks every quote and decides every criterion state and verdict.

## Article 50(1), interaction with natural persons: DOES NOT APPLY

The paragraph covers AI systems intended to interact directly with natural persons, such as a
chat. Pagefifty has no chat and no other exchange between a visitor and the model: the model reads
published tender text at capture time, and the site calls no model while a visitor reads (/ai).

## Article 50(2), marking synthetic output: APPLIES

The paragraph asks that AI-generated text is marked in a machine-readable format and detectable as
artificially generated. Each plain English reading on a tender page is text the model wrote (/ai:
"Each reading on a tender page carries an AI reading label").

What ships: `src/lib/components/CriterionRow.svelte` renders every reading in an element carrying
`data-ai-generated` with the model ID as its value, beside the visible "AI reading" label. The
test `src/lib/components/readings.svelte.test.ts` pins that every stored reading is shown inside a
marked element with the model ID as the marker's value and one "AI reading" label beside it, and
that no other text on the page carries the marker or the label.

## Article 50(3), emotion recognition and biometric categorisation: DOES NOT APPLY

The paragraph covers deployers of an emotion recognition or biometric categorisation system. The
model's only input is the published criteria text of a tender lot (/ai), so it sees no person and
no biometric data, and nothing it returns is about a person.

## Article 50(4), deepfakes and public-interest text: DOES NOT APPLY

The paragraph covers generated or manipulated image, audio or video content (a deep fake), and text
published to inform the public on matters of public interest. Pagefifty generates no image, audio
or video. Its readings explain one tender lot's selection criteria to a firm deciding whether it
meets them (/ai), and each carries the AI reading label and the marker described under 50(2).
