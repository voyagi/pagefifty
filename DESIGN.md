---
name: Pagefifty
description: A tender read the way a bid lead reads a job posting, with each requirement listed, its state for the firm beside it, and the deciding clause quoted with its source.
colors:
  band: '#14513b'
  band-ink: '#ffffff'
  band-ink-2: '#cde2d8'
  band-hover: 'rgb(255 255 255 / 0.12)'
  band-rule: 'rgb(255 255 255 / 0.22)'
  ground: '#eef1ef'
  bg: '#ffffff'
  bg-2: '#f4f6f5'
  bg-3: '#e8ecea'
  line: '#d5dbd8'
  line-2: '#b9c1bd'
  edge: '#c9d0cc'
  line-field: '#7d8681'
  ink: '#111513'
  ink-2: '#535c57'
  brand: '#14513b'
  brand-hover: '#0f4130'
  brand-ink: '#ffffff'
  focus: '#14513b'
  selection: 'color-mix(in srgb, #14513b 22%, transparent)'
  dark-band: '#124834'
  dark-band-ink: '#ffffff'
  dark-band-ink-2: '#b7d3c6'
  dark-band-hover: 'rgb(255 255 255 / 0.1)'
  dark-ground: '#080a09'
  dark-bg: '#121614'
  dark-bg-2: '#191e1c'
  dark-bg-3: '#222826'
  dark-line: '#2c3330'
  dark-line-2: '#444e49'
  dark-edge: '#333c38'
  dark-line-field: '#6e7873'
  dark-ink: '#e9edeb'
  dark-ink-2: '#a3aea8'
  dark-brand: '#4fae85'
  dark-brand-hover: '#63bf96'
  dark-brand-ink: '#06130d'
  dark-focus: '#7fd1ac'
  dark-selection: 'color-mix(in srgb, #4fae85 30%, transparent)'
typography:
  display:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '2.75rem'
    fontWeight: 750
    lineHeight: 1.06
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.75rem'
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: '-0.03em'
  title:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  subhead:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 700
    lineHeight: 1.3
  lede:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.0625rem'
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
  label:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.3
  small:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.35
  tag:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.78125rem'
    fontWeight: 500
    lineHeight: 1.2
  verdict-tag:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.84375rem'
    fontWeight: 700
  figure:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '2.75rem'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-0.03em'
    fontFeature: 'tnum'
  wordmark:
    fontFamily: 'Albert Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.1875rem'
    fontWeight: 750
    letterSpacing: '-0.025em'
rounded:
  r-sm: '6px'
  band: '7px'
  r: '8px'
spacing:
  gutter: 'clamp(1rem, 3vw, 2rem)'
  band-h: '60px'
  page-max: '1280px'
  page-top: '1.75rem'
  page-bottom: '3rem'
  panel-gap: '2.5rem'
  panel-rule-pad: '1.75rem'
  facts-col: '15rem'
  claim-col: '470px'
  claim-gap: '3.5rem'
  list-col: '460px'
  row-pad: '0.875rem 1rem'
  pane-pad: '1.5rem 0 2.5rem 2rem'
  card-pad-x: '1.5rem'
components:
  band:
    backgroundColor: '{colors.band}'
    textColor: '{colors.band-ink}'
    padding: '0.5rem clamp(1rem, 3vw, 2rem)'
    height: '60px'
  nav-link:
    textColor: '{colors.band-ink-2}'
    rounded: '{rounded.band}'
    padding: '0.4375rem 0.6875rem'
    height: '44px'
  nav-link-current:
    backgroundColor: '{colors.band-hover}'
    textColor: '{colors.band-ink}'
  theme-segment:
    textColor: '{colors.band-ink-2}'
    rounded: '{rounded.r-sm}'
    padding: '0 0.625rem'
    height: '28px'
  theme-segment-pressed:
    backgroundColor: '{colors.band-hover}'
    textColor: '{colors.band-ink}'
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.brand-ink}'
    typography: '{typography.button}'
    rounded: '{rounded.r}'
    padding: '0.375rem 1rem'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.brand-hover}'
  button-secondary:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.r}'
    padding: '0.375rem 1rem'
    height: '38px'
  button-secondary-hover:
    backgroundColor: '{colors.bg-2}'
  button-lg:
    padding: '0.5rem 1.25rem'
    height: '44px'
  chip:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r}'
    padding: '0 0.75rem'
    height: '36px'
  input:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r}'
    padding: '0 0.75rem'
    height: '40px'
  list-row:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    padding: '0.875rem 1rem 0.9375rem'
  list-row-hover:
    backgroundColor: '{colors.bg-2}'
  list-row-opened:
    backgroundColor: 'color-mix(in srgb, #14513b 8%, #ffffff)'
  initials-tile:
    backgroundColor: '{colors.bg-2}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.r}'
    size: '40px'
  reading-tag:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink-2}'
    typography: '{typography.tag}'
    rounded: '{rounded.r-sm}'
    padding: '0.125rem 0.5625rem'
    height: '24px'
  verdict-row:
    backgroundColor: '{colors.bg-2}'
    textColor: '{colors.ink}'
    padding: '0.875rem 1rem'
  verdict-tag:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bg}'
    typography: '{typography.verdict-tag}'
    rounded: '{rounded.r}'
    padding: '0 0.75rem 0 0.5625rem'
    height: '30px'
  quote-box:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    typography: '{typography.quote}'
    rounded: '{rounded.r}'
    padding: '0.6875rem 0.875rem 0.75rem'
  example-card:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.r}'
  not-read-note:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink-2}'
    typography: '{typography.small}'
    rounded: '{rounded.r}'
    padding: '0.5rem 0.75rem'
---

# Design System: Pagefifty

## Overview

**Creative North Star: "The Job Board"**

Pagefifty reads a public tender the way a bid lead already reads a job posting. Tenders sit in a ranked list of postings, each with the buyer's initials where a job board shows the employer's logo. Choosing one opens it beside the list, and the list keeps its place. The opened tender reads like a posting's requirements: the verdict and what to check next, the clause that decides it quoted from the tender's own text with its source named in words, the plain English reading, and every other requirement folded below with its state marked by an icon and a word.

The world is white reading panels laid on a pale neutral ground, near-black ink, and one deep green that owns a 60px band across the top of every page and fills the primary buttons. Each area of a page (the filters, the list, the opened tender, a profile section) is its own white box with a 1px edge, set apart by the ground between boxes. Inside a box, 1px rules separate rows and requirements, and there is no shadow anywhere. One face, Albert Sans, carries every word and every figure, with figures set in tabular digits. Density is medium to high, as on the portals this audience already uses: a 1440 by 900 screen shows about five tenders in the list beside the opened one.

The system refuses two things: a marketing hero over a feature grid, and a bare search form with nothing read. Verdicts never take a colour. A verdict is a word in a reversed ink tag with its own mark, and a criterion's state is a mark and a word, so ruled out reads with the same calm as ruled in.

**Key Characteristics:**

- One green, at size only in the top band, elsewhere on primary buttons, the 2px underline under the deciding words, the focus ring and a few quiet state marks.
- White panels on a pale ground, near-black ink, a single secondary ink, and two pale washes for hover, the verdict row, the lot's facts strip, a quote's caption, tiles and small badges.
- Albert Sans alone, weights 400 to 800, tabular figures everywhere.
- Boxed panels on the ground, ruled rows inside them, never a box inside a box except the verdict and a quote. No shadows, no corner above 8px.
- Verdicts and states told apart by mark and word, never by colour.
- A dashed edge means "not read or not settled". A 2px dashed ink edge means an error.
- Light, Dark and Device themes, Device the default.

## Colors

One deep green on white and near-black, with Dark designed as its own palette rather than an inversion.

### Primary

- **Ledger Green** (band, brand, focus): the 60px top band on every page, the fill of every primary action (the lead button, the procurement documents link, the skip link), the 2px underline beneath the words a verdict rests on, and the focus ring. In Light the band, the brand and the focus ring share one value. In Dark the band deepens (dark-band) while the brand lifts to a lighter green (dark-brand) carrying near-black ink (dark-brand-ink), and the focus ring lifts again (dark-focus) so it reads on the near-black ground.
- **Green Pressed** (brand-hover, dark-brand-hover): the primary fill under the pointer, darker in Light and lighter in Dark.

### Neutral

- **Ground** (ground, dark-ground): the page behind the panels. Only the band, the page heads, the start page's claim and the footer stand on it directly. In Dark it is darker than Paper, so the panels sit a step above it.
- **Paper** (bg, dark-bg): every panel and reading surface, including secondary buttons, chips, inputs, quote boxes and the example card. Secondary buttons take this fill, never a transparent one.
- **Wash** (bg-2, dark-bg-2): row hover, the verdict row behind the tag and its Next line, the lot's facts strip, a quote's caption, initials tiles.
- **Deep Wash** (bg-3, dark-bg-3): the small numbered badge that ties a marked quote to its reading.
- **Panel Edge** (edge, dark-edge): the 1px edge of every panel on the ground and of the example card.
- **Rule** (line, dark-line): rules between rows, requirements and lots inside a panel, about 1.4:1 on Paper so each row reads as its own.
- **Strong Rule** (line-2, dark-line-2): the edge of controls named by their own words (buttons, chips, the fold bar), the verdict box, the quote box and reading tags, and the dashed edge of anything not read, about 1.8:1 on Paper.
- **Field Edge** (line-field, dark-line-field): the edge of every input and select. An empty field has nothing else to show where it is, so its edge holds at least 3.2:1 against Paper, Wash and Deep Wash in both themes.
- **Ink** (ink, dark-ink): all reading text, the verdict tag's fill, a checked chip's doubled edge, field errors.
- **Secondary Ink** (ink-2, dark-ink-2): labels, meta lines, hints, glosses, the snapshot and capture lines, the footer.
- **Band Ink** (band-ink, band-ink-2, band-hover, band-rule): text on the band, the quieter nav links, the fill of the current nav link and the pressed theme button, and the 1px rule around the theme switch and the firm slot. Band-rule is the same in both themes.
- **Selection** (selection, dark-selection): a translucent green for selected text and the date part being edited.

Text contrast clears WCAG AA with room in both themes. Ink on Paper is about 18:1 in Light and 15:1 in Dark, Secondary Ink on Paper about 6.9:1 and 8.0:1, Secondary Ink on the Ground about 6.1:1 and 8.7:1, Band Ink 2 on the band about 6.8:1 and 6.6:1, and Brand Ink on the brand about 9.3:1 and 7.0:1. The lowest text pairs, Secondary Ink on the opened row's tint and the Demo tag's text on the band, sit near 6:1.

### Named Rules

**The One Green Rule.** Green appears at size only in the top band. Elsewhere it fills primary actions, underlines the deciding words, draws the focus ring, and marks a few quiet states: the opened list row (an 8% tint inside a 45% edge), the checkbox and date accent, the text caret and the selection. Green never colours text, a verdict or a criterion state.

**The Colourless Verdict Rule.** No verdict, criterion state or reading status has a colour of its own. Each is drawn in ink and told apart by its mark and its word.

**The Two Palettes Rule.** Dark is designed, not inverted: a deeper band, a near-black ground (dark-bg), a lighter green with near-black ink on it, and its own focus green. The dark values apply when Dark is picked, and when Device is picked on a device set to dark.

## Typography

**Display Font:** Albert Sans (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Albert Sans (same stack)

**Character:** One neutral geometric sans for everything, self-hosted as a single variable font (weights 400 to 800) cut into latin and latin-ext subsets. The latin file is preloaded, and latin-ext loads only when a buyer's name needs one of its letters. Headings get their voice from weight (750) and tight tracking, not from a second face.

### Hierarchy

- **Display** (750, 2.75rem, 1.06): the start page claim only, held to 20ch and balanced. On phones it scales with the screen between Headline and Display size (about 2.2rem at 390 wide).
- **Headline** (750, 1.75rem, 1.15, -0.03em): the opened tender's title (held to 30ch), and the h1 of the profile, privacy, AI and error pages.
- **Title** (750, 1.375rem, 1.2, -0.025em): the tender list's heading and the example card's title. The home figure's heading uses the same size at 700.
- **Subhead** (700, 1.0625rem, 1.3): a lot's heading, a panel heading, the empty state's heading.
- **Lede** (400, 1.0625rem, 1.5): a page's opening statement and a verdict's reason line, held to 62ch. The start page lede is a touch smaller (1.03125rem, 1.55) in Secondary Ink.
- **Body** (400, 0.9375rem, 1.5): running text, with tabular figures on by default.
- **Quote** (400, 0.96875rem, 1.55): the buyer's own words in the quote box, held to 72ch, hyphenated by the clause's own language.
- **Row title** (650, 0.9375rem, 1.32): a tender's title in the list, two lines at most.
- **Button** (600, 0.9375rem, 1.2): every button and button-shaped link.
- **Label** (600, 0.8125rem, 1.3): sentence-case labels in Secondary Ink over the column or block they name (the clause that decides, AI reading, the quote's language).
- **Small** (400 or 500, 0.8125rem): meta lines, hints, facts terms, notes and the footer.
- **Tag** (500, 0.78125rem, 1.2): reading tags and the quiet mode tags (Example run, Demo firm, an error's status code).
- **Verdict tag** (700, 0.84375rem): the verdict word in its reversed tag.
- **Figure** (700, 2.75rem, 1, -0.03em): the four counts on the start page's figure, 1.75rem on phones.

Weights in use: 400, 500, 600, 650, 700 and 750, with 800 only for the "50" in the wordmark's square.

### Named Rules

**The One Face Rule.** Albert Sans sets every word, heading, label, input value and figure. A figure read from the evidence (a notice number, an amount, a count) is the same face with tabular digits at weight 500, never a monospace.

**The Sentence Case Rule.** Labels, tags and headings are sentence case at the face's own spacing. Nothing is set in capitals or tracked out to look like a label.

## Layout

Every page opens with the band: wordmark at the left, the three text links (Tenders, Firm profile, Example run), a spacer, the theme switch, and the firm slot at the far right. Below it, the main column is centred at a 1280px maximum with the fluid gutter on each side and 1.75rem of space above, 3rem below. A page's panels are white boxes on the ground: a 1px Panel Edge, 8px corners, 1.5rem of padding above and up to 1.75rem at the sides, and 1rem of ground between one box and the next. Two kinds of panel stay unboxed and take a 1px Rule with 2.5rem above it and 1.75rem below instead: a panel that already sits inside a box (a lot inside the opened tender, the buyer search, the unread documents) and the start page's claim, which holds the example card. A box never sits inside another box, except the verdict and a quote inside a tender. Where a panel has a facts column, it stands 15rem wide beside the text from 68.75em and moves above the text below that.

**Start page.** From 68.75em the claim column is 470px wide beside the example card, 3.5rem apart. The claim holds the headline, two lede lines, the primary and secondary buttons side by side, three promise lines with icons on a hairline, and the snapshot line. The card opens the example's verdict on the right. Below 68.75em the card follows the claim. The figure panel and the firm panel sit below the first screen.

**Tenders and the example run.** A title line carries the heading, the counts and, at the far right, the one sort order stated as text with no control. A capture line follows on the ground, then the filter row (country chips, type of work chips, two deadline dates, Apply) in its own box. Then the split view, 1rem below: the list column takes min(480px, 42%) and the opened tender takes the rest, each its own box with 1rem of ground between them. Each column scrolls on its own, and both end 1rem above the bottom of the window so each box shows its lower edge, measured from where the split starts on every navigation and resize (20rem at least on a very short window). So an open row deep in the list shows beside the head, and reaching the end of either column never moves the page. List rows fill the list's box edge to edge, so a row's tint reads as the row. The pane has 1.75rem of padding on its left and 1.25rem on its right. On a phone the list and the tender run to both edges of the screen as white bands, and the filter button stands on the ground without a box.

**A tender record.** Buyer tile and buyer, the title, a facts row with icons (deadline, time left, estimated value, the notice number linked to TED), the source actions, then one panel per lot. A lot shows its name, the verdict right under it, the clause that decides right under that, the other requirements folded behind a summary, and then its facts strip, so no fact pushes the verdict down the pane. The record ends with its source line and an "About this tender" grid.

**Profile.** Five panels with a 15rem facts column. Form fields run four to a row from 68.75em, two below that, and one on phones.

**Responsive.** Switches are set in em so a larger default font moves them too: 40em (640px), 45em (720px) and 68.75em (1100px). At 45em and below the band wraps to two rows (wordmark, demo tag and theme switch on the first, the nav across the second) and grows past 60px. The split view shows one thing at a time: the bare list shows the list, and an address naming a tender shows that tender with a "Back to the list" link that keeps the filters. Opening a tender on a phone returns to the top and moves focus to the tender's heading. At 40em and below the filters fold behind a "Filters (n)" button that keeps the applied filters in view beside it.

**Measures.** Prose holds to 62ch, quotes and readings to 72ch, notes and the record's source line to 70 to 80ch.

### Named Rules

**The List Keeps Its Place Rule.** Choosing a tender opens it in the pane and changes nothing else on a wide screen: the list keeps its scroll, focus stays on the chosen row, and the pane returns to its own top. A page scrolled down to the notes under the split goes back to its top, where both columns fit. Coming into the split, by a first load or a link from another page, brings the open row into the list.

## Elevation & Depth

The system is flat. No element casts a shadow, nothing is lifted, and depth comes only from white boxes on the ground, their edges, the rules inside them, the two washes and the two columns that scroll on their own. The one box-shadow in use is not elevation: a 1px inset ink line (`inset 0 0 0 1px`) that doubles a checked or pressed chip's border.

### Named Rules

**The Flat Page Rule.** Rank comes from order, weight, the box and the rule, never from a shadow, a raised card or a coloured panel.

## Shapes

Corners are small and squared. Anything with a box (buttons, chips, inputs, the quote box, the example card, initials tiles, notes, the empty state) takes 8px. Tags take 6px (reading tags, the mode tags, the numbered quote badge, the theme switch's buttons). The band's own pieces take 7px (the nav link's drawn shape, the wordmark's square, the theme switch's frame). Nothing is rounder than 8px, and no box is a pill or a circle.

Edges are 1px. A dashed 1px Strong Rule means "not read or not settled": the reading tag for criteria in the documents, the unread note on a record, a requirement the model did not read, the "Documents not read yet" panel, a chip for a certificate that is held but expired. A dashed 2px ink edge on a 5% ink tint means an error, in a field or as a block.

Icons share one line set on a 16px grid, stroked at 1.6 with round caps and joins in the current text colour. They are always decorative and hidden from assistive technology, since a word beside each carries its meaning.

### Named Rules

**The Dashed Edge Rule.** Dashed carries two meanings only: thin and grey for "not read or not settled", thick and ink for an error. Nothing decorative is dashed.

## Components

### Top Band and Navigation

The colour lives here at size, on every page.

- **Band:** Ledger Green, at least 60px tall, Band Ink text.
- **Wordmark:** a 28px Band Ink square with "50" in the band's green at 800, then "Pagefifty" at 750, 1.1875rem. The square's number is drawn by the stylesheet, so the link's name is the word alone.
- **Links:** Band Ink 2 at 500. Each has a 44px hit area around a smaller 7px-cornered drawn shape. Hover and the current page (aria-current) fill that shape with Band Hover and lift the text to Band Ink.
- **Theme switch:** a segmented group of Light, Dark and Device inside a 1px Band Rule frame. Buttons are 28px tall (40px on phones), Band Ink 2 at 500. The pressed one fills with Band Hover.
- **Firm slot:** a 38px link with a 1px Band Rule edge and 8px corners: a 28px square tile (initials for the demo firm, a people mark for the own firm), the name at 600 and a second line in Band Ink 2. The demo firm adds a small "Demo" tag on a 16% white fill. On phones the own firm hides and only the demo tag stays.
- **Focus on the band:** the ring takes Band Ink, so it never disappears green on green.

### Buttons

Plain, squared, colour on the primary only.

- **Shape:** 8px corners, 1px edge, Button type, at least 38px tall (44px for the one large call to action that leads a page).
- **Primary:** brand fill and edge with Brand Ink text, Green Pressed on hover.
- **Secondary:** Paper fill, Strong Rule edge, Ink text. Hover fills with Wash and darkens the edge to Secondary Ink. The quiet "Clear filters" action beside Apply drops the edge and reads as an underlined link with a button's target.
- **Source actions:** on a record, "Open the procurement documents" takes the primary look and "Open notice on TED" the secondary, each ending with the out-of-site mark.
- **Skip link:** hidden until reached by keyboard, then a primary button at the band's top left with a Band Ink edge.
- **No movement:** buttons change fill and edge only. Nothing translates.

### Chips

- **Style:** Paper fill, Strong Rule edge, 8px corners, 500 at 0.875rem, 36px tall. A checkbox chip keeps its native box visible with a green accent.
- **Checked or pressed:** the edge turns Ink and an inset 1px Ink line doubles it. The fill and text never change.
- **Held but not settled:** a dashed Secondary Ink edge.

### Inputs and Fields

- **Style:** Paper fill, Field Edge, 8px corners, 40px tall, the value at 500 with tabular figures. The label sits above in 500 at 0.8125rem, the hint below in Secondary Ink.
- **Date fields:** follow the theme, separators in Secondary Ink, the part being edited on the selection tint, and the calendar mark drawn from the page's own icon set.
- **Focus:** a 2px focus ring at no offset, and the edge takes the focus colour.
- **Error:** a 2px dashed Ink edge on a 5% Ink tint, and the hint turns to Ink at 600 with the information mark. Errors are carried by shape and weight, never by colour.

### Tender List Rows

- **Row:** a 40px initials tile (Wash, Secondary Ink, 700), then the title at Row title weight clamped to two lines, the buyer in Ink at 500 with the notice number in Secondary Ink, a meta line of facts separated by drawn dots (country, deadline, estimated value) with the deadline in Ink, and the reading status. Rows are divided by Rules, and the whole row answers to the pointer.
- **Hover:** the row fills with Wash.
- **Opened:** an 8% green tint inside a 1px edge at 45% green, and the title underlined. No side bar.
- **Reading status:** written as plain Secondary Ink text where it matches the reading most rows share, and boxed as a reading tag only where it differs.
- **Closed tenders:** gathered in a folded group under the open list, each row's deadline led by the word "Closed" at 600 in Ink.

### Reading Tags

A quiet outlined tag, never a verdict: 24px tall, 1px Strong Rule edge, 6px corners, Tag type in Secondary Ink, with a 14px mark. "Criteria in the documents", or "N criteria in the notice, more in the documents" when the notice holds some too, carries the document mark and a dashed edge. A notice with criteria that names no source this version can read, and no documents, ESPD or pointer, reads "N criteria in the notice, more may sit elsewhere" with the same mark and edge. "N criteria in the notice" and "No criteria in the notice" carry the lines mark and a solid edge. The list's heading glosses the term once: "Reading status: what Pagefifty read in each notice."

### Verdict Block

- **Verdict box:** on a record the verdict is the one box inside the tender: a 1px Strong Rule edge and 8px corners, the verdict row as its head and everything that explains the verdict inside it, so the clause after it starts on its own. On the example card the verdict row runs edge to edge between Rules instead.
- **Verdict row:** one Wash row. At the left the verdict tag (30px, 8px corners, Ink fill with Paper text, 700, the verdict's mark before the word). Beside it the Next line: "Next:" at 650, then what to check next.
- **Under it:** the verdict's gloss as one sentence at 600, the reason line at Lede size, any shortfall rows, the Article 63 line for a criterion another firm could cover, a profile or documents link where one applies, then two Small lines in Secondary Ink naming the firm compared and how the verdict was decided.
- **Shortfall rows:** one Rule row per criterion the firm misses on its own, with the short mark, "Short on its own:" at 650, the criterion and its floor, and its position ("Criterion n of m") in Secondary Ink.

### Verdicts and States (signature)

The internal verdict names in `src/lib/core/verdict.ts` never change. The display words, marks and glosses below are what the pages show. They come from `VERDICT_LABELS` in that file and from `src/lib/tenders/verdict-view.ts`.

| Internal verdict | Display word  | Mark              | Gloss under the tag                                                |
| ---------------- | ------------- | ----------------- | ------------------------------------------------------------------ |
| GO               | Go            | ring with a tick  | Meets every selection criterion read, on its own.                  |
| PARTNER NEEDED   | Not met alone | two people        | Falls short on its own on a criterion read.                        |
| ASK FIRST        | Ask first     | ring with an i    | Not read in full, or a question left open.                         |
| NO-GO            | No-go         | ring with a cross | Ruled out by a criterion read, with no route through another firm. |

Every verdict tag has the same fill, edge and weight. The four verdicts are told apart by their word and their mark only, never by colour or fill. A verdict word stands only inside a verdict region: the verdict block on a record, the example card's verdict and its state marks, and the start page's figure, which labels its four counts with the same words. A list row never shows a verdict.

An Ask first verdict always has a reason. The short reason labels in `ASK_FIRST_REASON_LABELS` are not drawn on any page. The reason shows as a full sentence under the tag, and the Next line names what to check:

| Reason (in precedence order) | Label in code (not drawn)             | Next line shown                                             |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| cancel-intent                | The buyer intends to cancel           | check the notice on TED for the cancellation.               |
| route-unsettled              | Route not settled                     | check whether the clause below lets another firm help.      |
| profile-field-missing        | A profile field is missing            | check the requirement named below against your own records. |
| not-read                     | Not read                              | read the criterion named below yourself.                    |
| not-compared                 | Not compared in this version          | read the criterion named below yourself.                    |
| criteria-in-documents        | Criteria in the ESPD or the documents | read the procurement documents, which were not read.        |
| no-criteria-in-notice        | No criteria in the notice             | read the notice on TED for criteria set elsewhere.          |

With no firm profile in the browser, profile-field-missing shows "set up a firm profile." instead. The Next lines for Go and Not met alone are "check the exclusion grounds and declarations, which this reading does not cover." and "check whether another firm can lend the capacity named below." The No-go line points at the clause below as the one that rules the firm out. Exact wording lives in `NEXT_LINES`.

Each criterion carries a state, drawn as a mark and a word at 600, 0.8125rem, in Ink at the right of its heading. None of these words is a verdict word:

| Criterion state       | Word shown                   | Mark              |
| --------------------- | ---------------------------- | ----------------- |
| MET                   | Met                          | ring with a tick  |
| MET_WITH_TASK         | Met, with a task             | ring with a tick  |
| INFO                  | For information              | ring with an i    |
| SHORT_BORROWABLE      | Short on its own             | ring with a plus  |
| SHORT_FIXED           | Short, no partner route      | ring with a cross |
| SHORT_ROUTE_UNSETTLED | Short, route not settled     | ring with a cross |
| PROFILE_GAP           | Not settled by the profile   | ring with an i    |
| NOT_READ              | Not read                     | dashed ring       |
| (not compared)        | Not compared in this version | ring with an i    |
| (not assessed)        | Not assessed                 | ring with an i    |

### Clause and Quote Block

- **Criterion heading:** the criterion's English label at 650 and Subhead size, its code and "Criterion n of m" in Small Secondary Ink, and the state at the right. The buyer's parameters follow as published. Each criterion is separated from the next by a Rule with 1.5rem above and below.
- **Quote box:** one box with a 1px Strong Rule edge and 8px corners. Its caption, on a Wash strip, names the clause's language as a Label and the source in words ("Quoted from TED notice n"). Under a Rule, the buyer's words sit on Paper, carrying the clause's own `lang`. An excerpt clamps to six whole lines with the whole clause one click away.
- **Lot facts:** a lot's deadline, value, criteria count, source and legal basis sit together on one Wash strip with 8px corners after the lot's requirements.
- **Marked quotes:** a quote the model read is underlined with a dotted 1px Secondary Ink rule, offset 4px, led by a small numbered badge (Deep Wash, 6px corners, 700) that matches the number of its reading.
- **Deciding words:** the words the verdict rests on carry a 2px green underline at the text's own weight, since a deciding quote can run most of a clause. Never a highlighter wash, never bold.
- **AI reading:** a Label, then the numbered readings in Ink, held to 72ch. A provenance line in Small Secondary Ink says how the quotes were checked and links the notice on TED.
- **Other requirements:** folded under a 44px bar with a Strong Rule edge and 8px corners, "Other requirements in this lot (n)", whose chevron turns when open and which fills with Wash under the pointer.

### Example Card (start page)

A white box on the ground beside the claim: Paper fill, 1px Panel Edge, 8px corners, no shadow, 1.5rem side padding. It holds a 36px initials tile with the buyer and country, a quiet "Example run" tag, the title at Title size, the facts (the notice number linked to TED, the demo firm compared), the verdict row running edge to edge with its gloss, the clause that decides with its excerpt and AI reading, the requirement rows on Rules (the deciding one at 650) with a count by state, and one Small line on how the verdict was decided.

### Notes, Empty and Error States

- **Not-read notes:** a 1px dashed Strong Rule box with 8px corners, Small Secondary Ink text, and the dashed-ring mark where it leads a record.
- **Empty state:** a named box with 8px corners (a Wash fill inside the list's box), a Subhead heading, a Secondary Ink sentence that says why nothing matched, and a Clear filters button. An empty list never reads as a failed page.
- **Error block:** the field error at block size, a 2px dashed Ink edge on a 6% Ink tint, weight 600, with a warning mark.
- **Loading:** three set lines (0.875rem bars at 80%, 60% and 40% width, a 12% Ink tint) laid in place before words arrive. No spinner.

### Footer

A 1px Rule, then "Not legal advice." and the links Privacy and How the AI is used, in Small Secondary Ink on the page's own 1280px measure, each link with a 44px target.

### Motion

Only state changes move: fills, edges and colours on hover or press, and a chevron turning when a section folds open, all at 140ms ease-out. Opening a tender swaps the pane's content in place with no transition. With reduced motion requested, every transition is removed.

### Themes

Light, Dark and Device, with Device the default. A script in the document head sets the theme before first paint from a `?theme=` value, then the stored pick, then the device. Without that script the dark palette still follows the device through a media query. A Device pick follows the operating system live, and a pick made in another tab or before a page was restored from the back-forward cache is taken up too.

### Accessibility

- WCAG 2.2 AA is the target. Every text colour on the surface it is drawn on clears 4.5:1 in both themes, and a field's edge clears 3:1 against every ground it sits on.
- Focus is a 2px ring in the focus colour at a 2px offset, at no offset on inputs, in Band Ink on the band, drawn round the visible shape of a nav link rather than its larger hit area.
- Targets are at least 24px. Band links, links standing alone on a line, fold summaries and the footer links get 44px.
- Every quoted clause, buyer name and title carries the `lang` of the notice text it comes from.
- Marks are decorative. The word beside a mark is always its label.

## Do's and Don'ts

### Do:

- **Do** keep the green at size in the top band alone, and use it elsewhere only for primary actions, the deciding words' 2px underline, the focus ring and the quiet state marks (The One Green Rule).
- **Do** tell every verdict, criterion state and reading status apart by its mark and its word, in ink (The Colourless Verdict Rule).
- **Do** set everything in Albert Sans, with tabular figures and weight 500 for evidence figures.
- **Do** give each area of a page its own white box on the ground, and separate rows and requirements inside a box with 1px Rules.
- **Do** keep box corners at 8px, tags at 6px and the band's pieces at 7px.
- **Do** quote the buyer's words in the quote box with the source named in words above it and the clause's `lang` on it.
- **Do** show a reading status as plain muted text where most rows share it, and box it only where a row differs.
- **Do** mark anything not read or not settled with a 1px dashed edge, and an error with a 2px dashed ink edge on a light ink tint.
- **Do** give secondary buttons, chips and inputs the Paper fill.
- **Do** ship Light, Dark and Device with Device as the default, and keep the dark palette its own.
- **Do** move only on state changes, at 140ms ease-out, and remove all transitions under reduced motion.

### Don't:

- **Don't** cast a shadow or raise a card. The inset ink line on a checked chip is the only box-shadow and is an edge, not depth.
- **Don't** put a box inside a box. Inside a panel, rules and washes group things; the verdict and a quote are the only boxes inside a tender.
- **Don't** give a verdict, a state or a reading tag a colour, a green included.
- **Don't** round anything past 8px or draw a box as a pill or a circle.
- **Don't** add a second typeface, a monospace or a condensed cut.
- **Don't** set labels or tags in capitals or tracked caps.
- **Don't** highlight the deciding words with a wash or set them in bold. The green underline carries them.
- **Don't** show a verdict word on a list row or anywhere outside a verdict region.
- **Don't** put a sort control on the tender list. Its one order is stated as text.
- **Don't** use a dashed edge as decoration.
