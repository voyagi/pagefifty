---
name: Pagefifty
description: A tabbed reference binder that files the clause ruling a firm out of a tender as a vermilion errata slip.
colors:
  desk: '#d9dcdf'
  desk-ink: '#3b3f44'
  ink: '#141414'
  ink-2: '#464a50'
  ink-3: '#5f646b'
  acetate: '#f6f8fa'
  acetate-edge: 'rgb(20 20 20 / 0.16)'
  acetate-rule: 'rgb(20 20 20 / 0.1)'
  leaf-back: '#c9cdd1'
  leaf-back-ink: '#33373c'
  errata: '#d42a24'
  errata-ink: '#ffffff'
  focus: '#1d3fd8'
  selection: 'rgb(242 183 5 / 0.45)'
  dark-desk: '#0e0f11'
  dark-desk-ink: '#b9bdc2'
  dark-ink: '#ecedea'
  dark-ink-2: '#bfc3c7'
  dark-ink-3: '#9ca1a7'
  dark-acetate: '#16181b'
  dark-acetate-edge: 'rgb(236 237 234 / 0.16)'
  dark-acetate-rule: 'rgb(236 237 234 / 0.1)'
  dark-leaf-back: '#2a2d31'
  dark-leaf-back-ink: '#c9ccd0'
  dark-errata: '#ff5a4a'
  dark-errata-ink: '#141414'
  dark-focus: '#8fa6ff'
  dark-selection: 'rgb(242 183 5 / 0.35)'
  board-yellow: '#f2b705'
  board-grass: '#3d9a3a'
  board-teal: '#11808a'
  board-ultramarine: '#2d3fb5'
  board-violet: '#6e3fa3'
  board-slate: '#3f5566'
  on-yellow: '#141414'
  on-grass: '#141414'
  on-teal: '#ffffff'
  on-ultramarine: '#ffffff'
  on-violet: '#ffffff'
  on-slate: '#ffffff'
typography:
  display:
    fontFamily: 'IBM Plex Sans Condensed, IBM Plex Sans, Arial Narrow, sans-serif'
    fontSize: 'clamp(2.75rem, 5.2vw, 5.5rem)'
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: '-0.025em'
  verdict:
    fontFamily: 'IBM Plex Sans Condensed, IBM Plex Sans, Arial Narrow, sans-serif'
    fontSize: '6rem'
    fontWeight: 700
    lineHeight: 0.85
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'IBM Plex Sans Condensed, IBM Plex Sans, Arial Narrow, sans-serif'
    fontSize: '2.125rem'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '-0.015em'
  title:
    fontFamily: 'IBM Plex Sans Condensed, IBM Plex Sans, Arial Narrow, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '0.01em'
  body:
    fontFamily: 'IBM Plex Sans, Helvetica Neue, Arial, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  reading:
    fontFamily: 'IBM Plex Sans, Helvetica Neue, Arial, sans-serif'
    fontSize: '1.1875rem'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'IBM Plex Sans Condensed, IBM Plex Sans, Arial Narrow, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0.06em'
  figure:
    fontFamily: 'IBM Plex Mono, ui-monospace, Cascadia Mono, monospace'
    fontSize: '3rem'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: '-0.03em'
  mono:
    fontFamily: 'IBM Plex Mono, ui-monospace, Cascadia Mono, monospace'
    fontSize: '0.9375em'
    fontWeight: 400
rounded:
  slip: '2px'
  leaf: '3px'
  switch: '4px'
  binder: '6px'
  tab: '8px'
spacing:
  step-xs: '0.5rem'
  leaf-stack: '0.875rem'
  column-gap: '1.75rem'
  board-pad: '1.75rem'
  rail: '3.25rem'
  gutter: 'clamp(1rem, 3vw, 2.5rem)'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.acetate}'
    rounded: '{rounded.leaf}'
    padding: '0 1.125rem'
    height: '44px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.leaf}'
    padding: '0 1.125rem'
    height: '44px'
  leaf:
    backgroundColor: '{colors.acetate}'
    textColor: '{colors.ink}'
    rounded: '{rounded.leaf}'
    padding: '1.75rem 2rem'
  leaf-facedown:
    backgroundColor: '{colors.leaf-back}'
    textColor: '{colors.leaf-back-ink}'
    rounded: '{rounded.leaf}'
    padding: '1.25rem 2rem'
  errata-slip:
    backgroundColor: '{colors.errata}'
    textColor: '{colors.errata-ink}'
    rounded: '{rounded.slip}'
    padding: '0.75rem 1.25rem 0.875rem 2.5rem'
  tab-yellow:
    backgroundColor: '{colors.board-yellow}'
    textColor: '{colors.on-yellow}'
    rounded: '{rounded.tab}'
    width: '3.25rem'
  tab-facedown:
    backgroundColor: '{colors.leaf-back}'
    textColor: '{colors.leaf-back-ink}'
    rounded: '{rounded.tab}'
  verdict-tag-out:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.acetate}'
    typography: '{typography.label}'
    rounded: '{rounded.slip}'
    padding: '0.35rem 0.5rem'
  verdict-tag-ask:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.slip}'
    padding: '0.35rem 0.5rem'
  chip:
    backgroundColor: '{colors.acetate}'
    textColor: '{colors.ink}'
    rounded: '{rounded.leaf}'
    padding: '0 0.875rem'
    height: '44px'
  chip-pressed:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.acetate}'
  input:
    backgroundColor: '{colors.acetate}'
    textColor: '{colors.ink}'
    rounded: '{rounded.leaf}'
    padding: '0 0.75rem'
    height: '44px'
  addendum-tag:
    backgroundColor: '{colors.board-violet}'
    textColor: '{colors.on-violet}'
    rounded: '{rounded.slip}'
    padding: '0.45rem 1rem 0.5rem'
---

# Design System: Pagefifty

## Overview

**Creative North Star: "The Tabbed Reference Binder"**

Every page is a binder lying on a desk. A full-strength coloured board shows only at the binder's edges and in the tab rail on its fore edge; everything the reader actually reads sits on cool milk acetate leaves laid over that board. Each leaf carries its own tab, so a tab spans exactly the leaf it indexes, and the open division's tab stands proud of the rail. A document not yet read is a leaf lying face down. The clause that rules a firm out is not a red status chip but a separate strip of vermilion paper, punched and filed at its reference.

The system is flat, printed and exact. Depth comes from ply (a leaf on a board, a slip on a leaf), not from a shadow scale. Type is IBM Plex in three cuts with strict jobs: Sans reads, Condensed heads and rules, Mono carries evidence. Motion has no easing: a 90ms two-frame step, like a leaf flipping on a ring.

Light and Dark are two separately designed palettes, not an inversion: a pale grey desk with milk acetate by day, a near-black desk with smoked acetate by night. The boards and tab hues keep full strength in both. A three-way switch offers Light, Dark and Device; Device follows the operating system live and is the default.

**Key Characteristics:**

- One board hue per page, set on the binder, visible only at edges, tabs and tags.
- All reading happens on acetate leaves with a hairline edge and a faint board-tinted inner rim.
- Vermilion is reserved for what rules the firm out.
- Plex Mono for clause references, notice numbers, figures, entered values and drafted text.
- A five-column grid: a margin column behind a hairline, then four content columns.
- Stepped 90ms motion, removed entirely under reduced motion.

## Colors

A neutral desk-and-acetate base carrying six saturated section boards and one reserved vermilion.

### Primary

- **Errata Vermilion** (errata; dark-errata in Dark): the errata slip, the shortfall figure the firm falls short on, and the underline beneath the decisive words inside a quoted clause. Text on it is errata-ink (white in Light, ink in Dark).

### Secondary

- **Section Boards** (board-yellow, board-grass, board-teal, board-ultramarine, board-violet, board-slate): one per division. A page sets its binder board (verdict yellow, tenders slate, profile ultramarine, home teal, states violet); tabs take the hue of the division they index. Text on each board uses its paired on-colour (ink on yellow and grass, white on teal, ultramarine, violet, slate). The same values hold in both themes.
- **Question Violet** (board-violet): also the addendum tag on a drafted question to the buyer, and a 7% tint behind that draft. It asks; it never rules out.

### Tertiary

- **Focus Blue** (focus; dark-focus): the 3px focus outline only.

### Neutral

- **Desk** (desk; dark-desk): the page background outside the binder and the punched binding holes.
- **Desk Ink** (desk-ink; dark-desk-ink): desk bar navigation and notes that sit on the desk.
- **Ink** (ink; dark-ink): primary text, primary button fill, pressed chips, the No-go tag.
- **Ink 2 / Ink 3** (ink-2, ink-3 and dark variants): secondary text, margin notes, hints, labels, table headers, the hanging quote mark.
- **Acetate** (acetate; dark-acetate): every reading surface: leaves, inputs, chips, the theme switch.
- **Acetate Edge / Rule** (acetate-edge, acetate-rule): the leaf hairline and the internal dividers, both translucent ink so they sit correctly on any board.
- **Leaf Back** (leaf-back, leaf-back-ink): face-down leaves and tabs for documents not yet read.
- **Selection** (selection): translucent chrome yellow.

### Named Rules

**The Errata Rule.** Vermilion marks only what rules the firm out: the slip, the short figure, the underline under the decisive words. Nothing decorative, no alerts, no links.

**The Board Edge Rule.** A board hue never carries reading text. It shows at the binder edge, on tabs, and on tags that are themselves separate pieces of paper; inside a leaf it appears only as the 14% inner rim or a 7% tint.

**The Two Palettes Rule.** Dark is designed, not inverted: desk, ink, acetate, errata and focus each have their own dark value, while boards and on-colours stay identical.

## Typography

**Display Font:** IBM Plex Sans Condensed (with IBM Plex Sans, Arial Narrow)
**Body Font:** IBM Plex Sans (with Helvetica Neue, Arial)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, Cascadia Mono)

**Character:** A technical manual's type family used with discipline: condensed cuts rule and head, the regular cut reads, and the monospace is the voice of the source document. All type is self-hosted, and body numerals are tabular.

### Hierarchy

- **Display**: the cover headline on the home leaf, balanced, max 17ch; fixed 2.5rem on phones.
- **Verdict**: the verdict word, uppercase, the loudest thing in the system; 3.5rem on phones.
- **Headline**: tender title, balanced; drops to 1.75rem on phones.
- **Title**: margin heads, clause heads and verdict states in Condensed 600; step headings at 1.1875rem.
- **Reading**: the plain English reading and the verdict sentence at 1.1875rem, line length held near 52ch.
- **Body**: 1rem at 1.5 line height; notes capped at 70 to 80ch; secondary text at 0.8125rem.
- **Label**: uppercase Condensed with 0.06em tracking, naming the column it sits over (the buyer's words, the plain English reading) and table headers; the slip and addendum headings use the same cut at 700 with 0.08em.
- **Figure**: demanded and held figures in Plex Mono 500 at 3rem, 1.75rem on phones.

Scale steps as built: 0.8125, 1, 1.1875, 1.4375, 1.75, 2.125, 3 and 6rem.

### Named Rules

**The Evidence Mono Rule.** Plex Mono carries what comes from the source or the firm's own numbers: clause references, notice numbers, figures, form input values, the drafted question. Never headings or prose.

**The Condensed Head Rule.** Headings, labels, tabs and the verdict are Condensed; body copy never is.

## Layout

The page is a desk bar over a binder. The binder sits inside a fluid gutter (clamp(1rem, 3vw, 2.5rem)) and leaves room on its right for the tab rail (3.25rem). Its padding is 1.75rem, with 3.5rem on the left for the punched binding strip (three holes at 12%, 50% and 88%).

Inside a leaf, content follows a five-column grid: a margin column of minmax(12rem, 15rem) behind a hairline rule, then four equal columns, with a 1.75rem column gap. The margin column holds facts (buyer, deadline, notice number) and condensed margin heads. Clause cards run their own four-column body: quote across two columns, reading across the other two, figures and provenance full width. Leaves stack 0.875rem apart; a second-ply leaf indents 0.75rem.

At 1100px the margin column folds above the content and the grid becomes four columns; the profile form drops to two. At 720px everything becomes one column, the rail collapses to zero, the binding holes disappear, board padding shrinks to 0.625rem, leaves stack 2.5rem apart, and each tab turns horizontal and stands up above its leaf's top edge. The tenders table unstacks into blocks.

## Elevation & Depth

Depth is ply. Surfaces are flat printed paper and acetate; a single soft lift shadow appears only under pieces that are physically separate from the leaf they rest on: the binder on the desk, the errata slip, and the addendum tag. Leaves themselves take no drop shadow, only a hairline edge and an inset 4px rim tinted 14% with the board hue. The half-hinged leaf gets its depth from a 9 degree perspective turn about its punched edge, flattening on hover or focus.

### Shadow Vocabulary

- **Lift, Light** (`box-shadow: 0 1px 0 rgb(20 20 20 / 0.08), 0 6px 14px -6px rgb(20 20 20 / 0.28)`): binder, slip, addendum tag.
- **Lift, Dark** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.4), 0 8px 18px -6px rgb(0 0 0 / 0.7)`): the same pieces at night.
- **Board Rim** (`box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--board) 14%, transparent)`): every acetate leaf.

### Named Rules

**The Ply Rule.** Ply is the only rank. Importance is shown by what lies on top of what, never by bigger shadows or raised cards.

## Shapes

Corners are small and physical. Slips, tags, the draft block and the hinged leaf use 2px; leaves, buttons, inputs, chips and clause cards 3px; the theme switch 4px; the binder 6px on its bound side only (square on the fore edge, fully rounded on phones). Tabs round only their outer corners at 8px (right side on desktop, top side on phones). Punched holes are true circles cut in the desk colour. Dashed strokes carry one meaning: not read or not settled (face-down leaves and tabs, the Ask first tag, a field in error).

## Components

### Buttons

Plain, inked and tactile.

- **Shape:** gently squared (3px), 44px minimum height, 1px ink border, Plex Sans 600.
- **Primary:** ink fill with acetate text; one per leaf foot (Copy clause with source, Copy question, Set up your firm).
- **Secondary:** transparent with ink text and the same ink border.
- **Hover / Active:** moves up 1px on hover and down 1px when pressed, in the 90ms two-step; focus is the 3px focus outline at 2px offset.

### Chips

- **Style:** acetate fill, 1px ink-3 border, 3px corners, 44px tall, Plex Sans 500.
- **State:** pressed chips fill with ink and take acetate text; state is carried by aria-pressed.

### Cards / Containers

- **Leaf:** acetate, 1px acetate-edge, 3px corners, 1.75rem by 2rem padding, board rim inset.
- **Clause card:** a bordered block inside a leaf with a head row (condensed clause name, small secondary meta) and a four-column body; when it carries a slip, the slip overlaps its top edge.
- **Face-down leaf:** leaf-back fill, dashed leaf-back-ink border, for a document not yet read.

### Inputs / Fields

- **Style:** acetate fill, 1px ink-3 border, 3px corners, 44px tall, value in Plex Mono 500; label above in Sans 500 at 0.8125rem, hint below in ink-3.
- **Focus:** 3px focus outline at zero offset, border darkens to ink.
- **Error:** 2px dashed ink border, a 6% ink tint, and the hint turns ink 600 with an inline icon. Errors are carried by shape and weight, not vermilion.

### Navigation

- **Desk bar:** condensed 700 wordmark, Sans 500 links in desk-ink; the current page is ink with a 2px underline. The firm name sits right; hidden on phones, where the links wrap to their own row.
- **Theme switch:** a 4px acetate capsule of three buttons (Light, Dark, Device); the pressed one fills with ink.
- **Tabs:** vertical condensed 600 labels on the fore edge, each in its division's board hue, with an optional Plex Mono count. The open tab is wider and stands 0.625rem proud. A face-down tab is leaf-back with an inset dashed outline.

### Errata Slip (signature)

A strip of vermilion paper, max 30rem, 2px corners, lift shadow, with a punched hole cut in acetate on its left. It carries an uppercase condensed heading, a Plex Mono reference (which document, which criterion) and one 600-weight sentence at 1.1875rem. On a clause card it overlaps the card's top edge; on phones it sits in flow.

### Verdict Tags

Uppercase condensed 700 tags with 2px corners and a 1px ink border in the tenders index: No-go is solid ink, Ask first is a dashed outline.

### Half-Hinged Leaf

A small acetate leaf holding a reading a partner or capacity reliance could satisfy, turned 9 degrees about its punched left edge (two holes in the board colour). It lies flat when its row is hovered or focused, and is flat on phones.

### Addendum

A bordered acetate block with a violet tag overlapping its top edge and the drafted question in Plex Mono on a 7% violet tint.

### Loading

Set lines: 0.875rem bars in a 12% ink tint at 60, 80 and 40% width, laid in place before words arrive.

## Do's and Don'ts

### Do:

- **Do** set exactly one board hue on the binder per page and give every leaf its own tab in its division's hue.
- **Do** put all reading text on acetate, with the margin column behind a hairline.
- **Do** reserve vermilion for the errata slip, the short figure and the decisive-words underline (The Errata Rule).
- **Do** show unread documents face down with dashed edges, never as an empty or read leaf.
- **Do** use Plex Mono for references, notice numbers, figures, input values and drafted text.
- **Do** animate only with the 90ms two-step (`steps(2, end)`) and drop all transitions under reduced motion.
- **Do** keep boards and on-colours identical across Light and Dark, and ship Light, Dark and Device with Device as the default.
- **Do** keep interactive targets at 44px minimum and the 3px focus outline.

### Don't:

- **Don't** use vermilion for errors, warnings, links or emphasis that does not rule the firm out.
- **Don't** set reading text directly on a board hue.
- **Don't** rank content with larger shadows or raised cards; a shadow belongs only to a separate physical piece (binder, slip, tag).
- **Don't** use eased or springy motion.
- **Don't** set headings in Plex Mono or body copy in Condensed.
