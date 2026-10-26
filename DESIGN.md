---
name: Pagefifty
description: A calm white place with a tender's verdict and its deciding clause floating over it as real records, inside a plain, polished tool.
colors:
  bar: '#ffffff'
  bar-ink: '#0f1311'
  bar-ink-2: '#59615d'
  bar-hover: '#f0f2ef'
  bar-rule: '#e3e6e2'
  mark: '#14513b'
  mark-ink: '#ffffff'
  ground: '#ffffff'
  panel: '#f4f5f3'
  bg: '#ffffff'
  bg-2: '#eef0ed'
  bg-3: '#e3e6e2'
  line: '#dfe3df'
  line-2: '#c3c9c5'
  edge: '#e3e6e2'
  line-field: '#7d8681'
  ink: '#0f1311'
  ink-2: '#59615d'
  ink-3: '#8a908c'
  brand: '#14513b'
  brand-hover: '#0f4130'
  brand-ink: '#ffffff'
  decides: '#1f8f62'
  focus: '#14513b'
  selection: 'color-mix(in srgb, #14513b 22%, transparent)'
  dark-bar: '#0d100f'
  dark-bar-ink: '#eceeed'
  dark-bar-ink-2: '#a3aca7'
  dark-bar-hover: '#1a1f1d'
  dark-bar-rule: '#232927'
  dark-mark: '#4fae85'
  dark-mark-ink: '#06130d'
  dark-ground: '#0d100f'
  dark-panel: '#161a18'
  dark-bg: '#1c211f'
  dark-bg-2: '#232926'
  dark-bg-3: '#2c332f'
  dark-line: '#29302d'
  dark-line-2: '#3f4743'
  dark-edge: '#2c3330'
  dark-line-field: '#6e7873'
  dark-ink: '#eceeed'
  dark-ink-2: '#a3aca7'
  dark-ink-3: '#7f8883'
  dark-brand: '#4fae85'
  dark-brand-hover: '#63bf96'
  dark-brand-ink: '#06130d'
  dark-decides: '#4fae85'
  dark-focus: '#7fd1ac'
  dark-selection: 'color-mix(in srgb, #4fae85 30%, transparent)'
typography:
  display:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(2.375rem, 4.6vw, 3.875rem)'
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(1.75rem, 3vw, 2.375rem)'
    fontWeight: 750
    lineHeight: 1.12
    letterSpacing: '-0.035em'
  page-title:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.75rem'
    fontWeight: 750
    lineHeight: 1.15
  title:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  lede:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(1.0625rem, 1.4vw, 1.1875rem)'
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  quote:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.96875rem'
    fontWeight: 400
    lineHeight: 1.55
  row-title:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 650
    lineHeight: 1.32
    letterSpacing: '-0.01em'
  button:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 600
    lineHeight: 1.2
  button-lg:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: 1.2
  small:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
  tag:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.78125rem'
    fontWeight: 500
    lineHeight: 1.2
  verdict-tag:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.84375rem'
    fontWeight: 700
  wordmark:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 800
    letterSpacing: '-0.035em'
rounded:
  r-sm: '6px'
  r: '10px'
  r-obj: '12px'
  r-card: '16px'
  r-pill: '999px'
spacing:
  gutter: 'clamp(1rem, 3vw, 2rem)'
  bar-h: '64px'
  page-max: '1280px'
  page-pad: '2rem clamp(1rem, 3vw, 2rem) 3.5rem'
  card-pad: '1.75rem clamp(1rem, 3vw, 2.25rem) 2rem'
  card-gap: '1.25rem'
  ruled-gap: '2.5rem'
  record-gap: '1.5rem'
  hero-overlap: 'clamp(7rem, 18vw, 16rem)'
  list-col: 'min(480px, 42%)'
  pane-pad: '1.75rem 1.25rem 2.5rem 2.25rem'
  row-pad: '0.875rem 1rem 0.9375rem'
components:
  bar:
    backgroundColor: '{colors.bar}'
    textColor: '{colors.bar-ink}'
    padding: '0.5rem clamp(1rem, 3vw, 2rem)'
    height: '64px'
  wordmark-mark:
    backgroundColor: '{colors.mark}'
    textColor: '{colors.mark-ink}'
    size: '28px'
  nav-link:
    textColor: '{colors.bar-ink-2}'
    rounded: '{rounded.r-pill}'
    padding: '0.375rem 0.75rem'
    height: '44px'
  nav-link-current:
    backgroundColor: '{colors.bar-hover}'
    textColor: '{colors.bar-ink}'
  theme-segment:
    backgroundColor: '{colors.bar}'
    textColor: '{colors.bar-ink-2}'
    rounded: '{rounded.r-pill}'
    padding: '0 0.6875rem'
    height: '28px'
  theme-segment-pressed:
    backgroundColor: '{colors.bar-hover}'
    textColor: '{colors.bar-ink}'
  firm-slot:
    backgroundColor: '{colors.bar}'
    textColor: '{colors.bar-ink}'
    rounded: '{rounded.r-pill}'
    padding: '0 0.875rem 0 0.3125rem'
    height: '38px'
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.brand-ink}'
    typography: '{typography.button}'
    rounded: '{rounded.r-pill}'
    padding: '0.375rem 1.125rem'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.brand-hover}'
  button-secondary:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.r-pill}'
    padding: '0.375rem 1.125rem'
    height: '38px'
  button-secondary-hover:
    backgroundColor: '{colors.bg-2}'
  button-lg:
    typography: '{typography.button-lg}'
    padding: '0.5rem 1.5rem'
    height: '48px'
  card:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r-card}'
    padding: '1.75rem clamp(1rem, 3vw, 2.25rem) 2rem'
  record-object:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r-obj}'
    padding: '1.125rem 1.25rem 1.25rem'
  chip:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r}'
    padding: '0.4375rem 0.75rem'
    height: '36px'
  input:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r}'
    padding: '0 0.75rem'
    height: '40px'
  list-row:
    textColor: '{colors.ink}'
    padding: '0.875rem 1rem 0.9375rem'
  list-row-hover:
    backgroundColor: '{colors.panel}'
  list-row-opened:
    backgroundColor: '{colors.bg-2}'
  initials-tile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.r}'
    size: '40px'
  verdict-head:
    backgroundColor: '{colors.bg-2}'
    textColor: '{colors.ink}'
    padding: '0.875rem 1rem'
  verdict-tag:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bg}'
    typography: '{typography.verdict-tag}'
    rounded: '{rounded.r-pill}'
    padding: '0 0.8125rem 0 0.5625rem'
    height: '30px'
  quote-box:
    backgroundColor: '{colors.bg-2}'
    textColor: '{colors.ink}'
    typography: '{typography.quote}'
    rounded: '{rounded.r}'
    padding: '0.6875rem 0.875rem 0.75rem'
  reading-tag:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink-2}'
    typography: '{typography.tag}'
    rounded: '{rounded.r-sm}'
    padding: '0.125rem 0.5625rem'
    height: '24px'
---

# Design System: Pagefifty

## Overview

**Creative North Star: "The Calm White Place"**

Pagefifty is a normal, polished tool. Its first screen is a calm white place, a wide picture of an imaginary modern white library, with a real tender's verdict and its deciding German clause floating over it as white records. Everything after that first screen is the same tool at work: a white page, soft grey cards that mark the areas of a page, and white objects inside them that a reader handles (a record, a quote, a field, a button).

The world is pure white in Light and near-black in Dark. A white top bar with one hairline under it carries a deep green rounded square holding "50", the ink wordmark, grey text links and the firm at the right. Cards have no edge and are told apart from the page by their fill alone. Objects take a hairline edge and slightly smaller corners. Data sits in hairline tables. One deep green appears only on pill buttons, the "50" mark and the focus ring, and a lighter step of the same hue underlines the words a verdict rests on. Albert Sans sets every word, from an 800 centred headline down to the smallest tag. Verdicts never take a colour. Density stays medium to high on the working pages, as on the portals this audience already uses.

The look refuses two things it replaced: a pale grey page ground with white boxed panels and a green band across the top, and a marketing hero over a feature grid.

**Key Characteristics:**

- A white page, soft grey borderless cards (16px), white hairline objects (12px) and hairline tables.
- One deep green on actions, the "50" mark and focus, and a lighter green only under the deciding words.
- Albert Sans alone, 400 to 800, tabular figures everywhere, large heads in two tones.
- Every action is a pill. Tags, fields and chips keep small squared corners.
- Flat, except the records floating over the start page's picture, which cast the one shadow.
- Verdicts and states told apart by mark and word, never by colour.
- Light, Dark and Device themes, Device the default, Dark designed as its own palette.

## Colors

White and near-black with one green in two steps, and Dark built as its own palette rather than an inversion.

### Primary

- **Ledger Green** (brand, mark, focus): the fill and edge of every primary pill button and of the skip link, the "50" square in the top bar, the focus ring, the text caret, the date and checkbox accent, and the selection tint. In Dark it lifts to a lighter green (dark-brand) carrying near-black ink (dark-brand-ink), and the focus ring lifts again (dark-focus).
- **Green Pressed** (brand-hover, dark-brand-hover): the primary fill under the pointer, darker in Light and lighter in Dark.
- **Deciding Green** (decides, dark-decides): the 3px underline under the words a verdict rests on, on the start page and on every record. It is the brand's hue made lighter so a thin line reads as green and not as ink (4.07:1 on white). Dark uses its light green (6.0:1 on a Dark object). It is never used for anything else.

### Neutral

- **Page White** (ground, bg, dark-ground, dark-bg): the page itself, and the fill of every white object (records, quote text, inputs, chips, secondary buttons). In Light both are white. In Dark the page is near-black and an object sits a step above the cards.
- **Card Grey** (panel, dark-panel): the soft grey card that marks an area of a page (the figure, the firm card, the filter row), the hover fill of a list row and the initials tile. It never takes an edge.
- **Wash** (bg-2, dark-bg-2): the verdict row behind its tag, a quote's caption strip, the opened list row and the secondary button's hover.
- **Deep Wash** (bg-3, dark-bg-3): the small numbered badge that ties a marked quote to its reading.
- **Object Edge** (edge, dark-edge): the hairline round a white object.
- **Rule** (line, dark-line): hairlines between rows, requirements, promises and table lines, the line under a ruled panel and the line between the list and the open tender.
- **Strong Rule** (line-2, dark-line-2): the edge of secondary buttons, chips, tags, the quote box and the verdict box.
- **Field Edge** (line-field, dark-line-field): the edge of every input and select, held at 3:1 or more against every ground a field sits on (3.43:1 on Card Grey in Light).
- **Ink** (ink, dark-ink): all reading text, the headline, the verdict tag's fill.
- **Secondary Ink** (ink-2, dark-ink-2): labels, meta lines, glosses, captions, the snapshot line (6.38:1 on white).
- **Quiet Ink** (ink-3, dark-ink-3): the second sentence of a two-tone large heading and nothing else (3.26:1 on white, large text only).
- **Bar Tones** (bar, bar-ink, bar-ink-2, bar-hover, bar-rule and their dark- pairs): the top bar's white, its ink, its grey links, the grey pill behind the current link and under the pointer, and the hairline under the bar and round the theme switch and the firm slot.

### Named Rules

**The Green Only Marks Rule.** Green fills actions, draws the "50" mark, the focus ring and the deciding underline, and tints the caret, the date accent and the selection. It never colours text, a card, a heading or a verdict.

**The One Underline Rule.** On a record the deciding words' underline is the only green in the reading. Nothing else in the clause, the verdict or the requirement rows takes the green.

**The Colourless Verdict Rule.** No verdict, criterion state or reading status has a colour of its own. Each is drawn in ink and told apart by its mark and its word.

**The Two Palettes Rule.** Dark is designed, not inverted: a near-black page, cards a step above it, objects a step above the cards, a lighter green with near-black ink on it, and its own focus green. The dark values apply when Dark is picked, and when Device is picked on a device set to dark.

## Typography

**Display Font:** Albert Sans (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Albert Sans (same stack)

**Character:** One neutral geometric sans for everything, self-hosted as one variable font (weights 400 to 800) cut into latin and latin-ext subsets. Voice comes from weight and tight tracking, never from a second face. Code a reader may copy is the only text in monospace.

### Hierarchy

- **Display** (800, clamp up to 3.875rem, 1.02, -0.04em): the start page headline only, centred, held to 30ch and balanced, two lines on a laptop.
- **Headline** (750, clamp up to 2.375rem, 1.12, -0.035em): the start page's section head, set in two tones. The first sentence is in Ink and the rest in Quiet Ink.
- **Page title** (750, 1.75rem, 1.15): the h1 of a tender record, the profile, privacy, AI and error pages.
- **Title** (750, 1.375rem, 1.2, -0.025em): the tenders list heading, a record object's title, the firm card and figure heads.
- **Lede** (400, clamp up to 1.1875rem, 1.5): the start page's opening line in Ink over the picture, held to 68ch.
- **Body** (400, 0.9375rem, 1.5): running text, tabular figures on by default.
- **Quote** (400, 0.96875rem, 1.55): the buyer's own words in a quote box, held to 72ch and hyphenated by the clause's own language.
- **Row title** (650, 0.9375rem, 1.32): a tender's title in the list, two lines at most.
- **Button** (600, 0.9375rem, 1.2), and 1.0625rem for the large pill that leads a page.
- **Small** (400 to 600, 0.8125rem): meta lines, captions, state words, notes.
- **Tag** (500, 0.78125rem, 1.2): reading tags and the quiet mode tags ("Example run", "Demo firm").
- **Verdict tag** (700, 0.84375rem): the verdict word in its reversed ink pill.
- **Wordmark** (800, 1.25rem, -0.035em): "Pagefifty" beside the green square.

### Named Rules

**The One Face Rule.** Albert Sans sets every word, heading, label, input value and figure. A figure read from the evidence (a notice number, an amount, a count) is the same face with tabular digits at weight 500. The one exception is a command a reader may copy, such as the capture command under the counts, which is code and sits in the system monospace.

**The Two Tone Head Rule.** A large section head on the start page states its first sentence in Ink and continues in Quiet Ink. Quiet Ink is never used below headline size.

**The Sentence Case Rule.** Labels, tags and headings are sentence case at the face's own spacing. Nothing is set in capitals or tracked out.

## Layout

Every page opens with the 64px white bar: the wordmark at the left, three text links (Tenders, Firm profile, Example run), a spacer, the theme switch and the firm slot at the right. Below it the main column is centred at a 1280px maximum with the fluid gutter on each side, 2rem above and 3.5rem below. A page's areas are soft grey cards 1.25rem apart. A panel that stands on the page itself or sits inside another area is ruled instead: a hairline with 2.5rem above it.

**Start page.** The start page runs the full window wide. The place, a full-bleed picture of an imaginary white library, covers the head and runs on under the top of the records. Its upper part is washed in the page colour (80% at the top, 66% at 42%, clear by 72%), so the headline and lede read in Ink at full contrast. In Dark the picture is dimmed to 45% brightness. Each width gets its own crop from one original: a landscape crop on wide screens and a portrait crop below 40em. Centred over the light part sit the headline, the lede and two large pills. From the place's lower part the example record floats as five white objects in three columns from 68.75em (1fr, 1.25fr, 1fr, 1.5rem apart), the middle column set 3rem lower and the right one 1.5rem lower, so they read as objects laid over the picture. Two columns from 45em, one on a phone, always in the record's own DOM order. Under the records come the two-tone head, two promise lines on hairlines held to 40rem, and the snapshot line, then the figure card and the firm card.

**Tenders and the example run.** A title line holds the heading, the counts and the stated sort order. The filters sit in one grey card. Under a hairline the list takes min(480px, 42%) and the open tender the rest, with a hairline between them. Both stand on the white page and scroll on their own, ending 1rem above the bottom of the window. On a phone one shows at a time and each runs to both edges.

**Responsive.** Switches are set in em so a larger default font moves them too: 40em (640px), 45em (720px) and 68.75em (1100px). At 45em and below the bar wraps to two rows, the nav across the second.

**Measures.** Prose holds to 62ch, the lede to 68ch, quotes and readings to 72ch, notes to 70ch.

### Named Rules

**The Record Order Rule.** A record reads notice and title, then the verdict, then the deciding clause, in the DOM and on screen alike. Layout may place the parts in columns but never reorders them with CSS.

**The Art Directed Place Rule.** The place picture is cropped per width from one original with chosen anchors, never one image centred and scaled.

## Elevation & Depth

The system is flat. Depth comes from fill steps: a white page, grey cards, white objects with a hairline, and a wash for rows and captions. In Dark the same steps run upward from a near-black page. The one shadow belongs to the records floating over the start page's picture.

### Shadow Vocabulary

- **Float** (`box-shadow: var(--float)`, a three-layer soft offset shadow, deeper in Dark): only on the white records over the start page's picture.
- **Doubled edge** (`inset 0 0 0 1px` in Ink): not elevation. It doubles the edge of a pressed or checked chip.

### Named Rules

**The One Float Rule.** Only a record floating over the place casts a shadow. Cards, list rows, the open tender and every object on the working pages stay flat.

## Shapes

Corners step up with the size of the thing. Tags and small badges take 6px. Fields, chips, the quote box, the verdict box and initials tiles take 10px. White objects on the start page take 12px. Cards take 16px. Every action is a pill: buttons, the skip link, nav link fills, the theme switch and the firm slot. Two tags you read are pills too, because each names the state of a whole record: the verdict tag, and the quiet mode tag on the start page's records ("Example run", "Demo firm"). Elsewhere the same mode tag keeps 6px. The "50" mark is a 28px square with 8px corners.

Edges are 1px hairlines. Cards have none. A dashed 1px edge means "not read or not settled" (a reading tag for criteria in the documents, an expired certificate chip). A 2px dashed Ink edge on a light Ink tint means an error.

Icons share one line set on a 16px grid, stroked at 1.6 with round caps, always decorative, with a word beside each.

### Named Rules

**The Pill Action Rule.** A thing you press to go or do is a pill. A thing you read or type into keeps squared corners, except a tag that names the state of a whole record (the verdict tag, the start page's mode tag).

**The Dashed Edge Rule.** Dashed carries two meanings only: thin and grey for "not read or not settled", thick and Ink for an error. Nothing decorative is dashed.

## Components

### Top Bar and Navigation

A white bar, the colour only in its mark.

- **Bar:** white, at least 64px tall, one Bar Rule hairline under it.
- **Wordmark:** a 28px Ledger Green square with "50" in white at 800, drawn by the stylesheet so the link's name is the word alone, then "Pagefifty" in Ink at 800.
- **Links:** grey (bar-ink-2) at 500 inside a 44px target. Hover lifts the text to Ink on a grey pill. The current page reads in Ink at 600 on the same grey pill. The focus ring goes round the drawn pill, not the hit area.
- **Theme switch:** Light, Dark and Device as a pill group inside a Bar Rule hairline, 28px buttons (40px on phones), the pressed one on the grey pill.
- **Firm slot:** a 38px pill with a Bar Rule hairline: a round 28px tile (initials for the demo firm, a people mark for the own firm), the name at 600 and a grey second line. The demo firm adds a small "Demo" tag. On phones only the demo label stays.

### Buttons

- **Shape:** pills (999px), 1px edge, at least 38px tall, 48px for the large pill that leads a page.
- **Primary:** Ledger Green fill and edge with white text, Green Pressed on hover.
- **Secondary:** a solid white fill, never transparent, Strong Rule edge, Ink text. Hover fills with Wash and darkens the edge to Secondary Ink.
- **Motion:** fill and edge change at 140ms ease-out. Nothing moves.

### Cards and Objects

- **Card:** Card Grey, 16px corners, no edge, no shadow, 1.75rem top padding and a fluid side padding up to 2.25rem.
- **Object:** white, a 1px Object Edge, 12px corners. On the start page each record object also takes the Float shadow. The firm card's demo record is the same object without the shadow, its figures in hairline rows.

### Chips and Inputs

- **Chip:** white, Strong Rule edge, 10px corners, 36px tall, 500 at 0.875rem. Pressed turns the edge Ink and doubles it with an inset line. Fill and text never change.
- **Input:** white, Field Edge, 10px corners, 40px tall, the value at 500 with tabular figures. Focus is the 2px focus ring. Errors use the dashed Ink edge and a heavier hint, never colour.

### Tender List Rows

- **Row:** a 40px Card Grey initials tile, the title at Row title weight clamped to two lines, the buyer in Ink at 500 with the notice number at the right, a meta line of facts split by drawn dots with the deadline in Ink, and the reading status. Rows are split by Rules and the whole row answers to the pointer.
- **Hover:** Card Grey. **Opened:** Wash with the title underlined. No side bar and no colour.

### Verdict Head (signature)

The verdict as a reversed Ink pill beside what to check next, on one Wash row. The pill is 30px tall, 700, with the verdict's mark before the word. Every verdict has the same fill and weight. Go, Not met alone, Ask first and No-go are told apart by their word and mark only. On a record the verdict head leads the one box inside the tender (Strong Rule edge, 10px corners). On the start page it runs edge to edge across the top of its floating object.

### Quote Block and the Deciding Underline (signature)

- **Quote box:** a Strong Rule edge and 10px corners. The caption, on a Wash strip, names the clause's language and the source in words ("Quoted from TED notice 713597-2026"). Under a Rule the buyer's words sit on white with the clause's own `lang`. An excerpt clamps to six whole lines.
- **Read quotes:** a dotted 1px Secondary Ink underline offset 4px, led by a numbered Deep Wash badge.
- **Deciding words:** a solid 3px Deciding Green underline at the text's own weight. Never a highlighter wash and never bold. On the start page the same underline draws once, left to right, in 600ms with an exponential ease-out after a 500ms delay, from a resting state that is already the full line. With reduced motion requested it is simply there.

### Start Page Place

The full-bleed library picture behind the head, washed in the page colour over its upper part and dimmed in Dark, with five white floating objects (the tender, its verdict, the clause that decides, the requirements in the lot, and how the verdict was decided) overlapping its lower edge and running on into the white page.

## Do's and Don'ts

### Do:

- **Do** keep green on pill buttons, the "50" mark, focus and the deciding underline only (The Green Only Marks Rule).
- **Do** tell every verdict, criterion state and reading status apart by its mark and its word, in Ink (The Colourless Verdict Rule).
- **Do** mark areas with Card Grey cards (16px, no edge) and things a reader handles with white hairline objects.
- **Do** make every action a pill and keep fields, chips and tags squared at 10px and 6px.
- **Do** set everything in Albert Sans with tabular figures, and large start page heads in two tones.
- **Do** quote the buyer's words with the source named beside them and the clause's `lang` on them.
- **Do** keep a record's parts in their own order in the DOM (The Record Order Rule).
- **Do** ship Light, Dark and Device with Device as the default, and remove every transition and the underline draw under reduced motion.

### Don't:

- **Don't** cast a shadow anywhere but the records floating over the start page's picture.
- **Don't** give a verdict, a state or a reading tag a colour, a green included.
- **Don't** put a green band, a grey page ground or edged boxes back on the page.
- **Don't** colour text, a heading or a card green.
- **Don't** use Quiet Ink below headline size.
- **Don't** highlight the deciding words with a wash or set them in bold. The green underline carries them.
- **Don't** set labels or tags in capitals or tracked caps.
- **Don't** use a dashed edge as decoration.
