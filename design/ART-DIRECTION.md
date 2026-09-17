# Pagefifty art direction

Locked 2026-09-16. Direction name: **The Tabbed Manual**. Chosen by the owner, then built as hi-fi mockups in this folder.

## Who this is for, measured

The owner or bid lead of a 5 to 50 person IT firm in the Netherlands, Belgium or Germany, at a desk late in the day, deciding in minutes whether the firm can legally take part in an open public tender.

What they already use every week, read from live stylesheets on 2026-09-16 (homepage plus up to 12 linked stylesheets, declarations counted):

| Site                 | Group                | Faces                                 | Leading colours                          | Radii       |
| -------------------- | -------------------- | ------------------------------------- | ---------------------------------------- | ----------- |
| dtvp.de              | tender portal DE     | Open Sans, Bootstrap                  | `#134f74` navy, `#ffb700`                | .25rem, 0   |
| publicprocurement.be | tender portal BE     | Open Sans, Montserrat                 | `#1269cf` blue, greys                    | 0, 4px, 8px |
| ted.europa.eu        | tender portal EU     | Arial                                 | Bootstrap 4 blue `#007bff`               | .25rem      |
| mercell.com          | tender tool          | Inter, Montserrat                     | `#561b8c` purple, `#ff516b`              | 8px, pill   |
| tendium.com          | tender tool          | Geist, Inter, Fraunces, Fragment Mono | near-black `#00000d`, `#fafafa`          | 16px        |
| stotles.com          | tender tool          | Inter, Neulis Neue                    | `#2569f9` blue, `#1a1f36` navy           | .5rem       |
| moneybird.nl         | business software NL | InterVariable, Outfit                 | `#081245` navy, `#0073e6` blue           | pill        |
| teamleader.eu        | business software BE | Work Sans                             | `#00b2b2` teal, `#2563eb` blue           | 0, pill     |
| exact.com/nl         | business software NL | Apax                                  | `#e1141d` red, `#0650d0` blue            | 0, 8px      |
| lexware.de           | business software DE | Urbanist                              | `#131010`, `#ff4554` red, `#1aa38a` teal | 0, 32px     |

tenderned.nl rendered client-side and exposed no stylesheet to read.

What this says:

1. **Quality signal:** software that is precise and sure of itself. Portals and bookkeeping tools they trust carry clear structure, real numbers and square-ish corners.
2. **Warning sign:** the portal look (Bootstrap navy, Open Sans, grey forms), which is the thing that frightens them, and hype. Five of eleven readable sites lead with blue or navy, so a blue product blends into the portals and into Stotles.
3. **Where to differ:** no blue lead, no Inter or Geist (Geist is the closest competitor's face), no purple SaaS. **Where familiarity helps:** a dense, well-ruled working surface, one neutral sans on the interface, tabular figures.

## The anchor

A boxed-software reference manual lying open at a tabbed section: coloured divider boards, clear acetate leaves carrying the reading, a stepped tab rail down the fore edge, an errata slip filed at the page it corrects.

It is the product's own mechanism made visible. A tender's document pack is a binder, the rule that shuts a small firm out sits deep in it, and Pagefifty files that rule as an **erratum** at its reference. Every clause keeps its place in the pack.

It is a discipline of documentation, not a period costume: the build is a crisp screen interface in today's type, and the manual supplies structure (divisions, ply, filed slips), not sepia.

## Type

- **IBM Plex Sans** on the working surface (400, 500, 600).
- **IBM Plex Sans Condensed** for the verdict word, headings, tab labels and state names (500, 600, 700).
- **IBM Plex Mono** only for data: clause references, dates, notice numbers, figures, the drafted question.

All three are verified resolving on the Google Fonts css2 endpoint (2026-09-16) and self-hosted from `assets/fonts/`, latin subset, SIL Open Font License. Plex comes from the engineering manual tradition this world quotes. It suits data-heavy products and pairs a sans, a condensed cut and a mono from one family.

Scale in fixed rem steps: 13, 16, 19, 23, 28, 34, 48, 96 px. The verdict word is set at 96px condensed caps. There are no eyebrows over headings.

## Colour

Strategy: **full palette with a strict role for each hue**. Section boards are full-strength colour, seen only at the binder's edges and on the tabs. Every word sits on acetate. Vermilion is held out for one job.

### Light

| Token       | Hex       | Role                                        |
| ----------- | --------- | ------------------------------------------- |
| desk        | `#d9dcdf` | page ground outside the binder              |
| acetate     | `#f6f8fa` | every reading leaf, cool milk               |
| ink         | `#141414` | text                                        |
| ink-2       | `#464a50` | secondary text                              |
| ink-3       | `#5f646b` | labels                                      |
| leaf back   | `#c9cdd1` | a face-down leaf: a document not read       |
| errata      | `#d42a24` | only a rule the firm cannot meet on its own |
| yellow      | `#f2b705` | board: verdict, example                     |
| grass       | `#3d9a3a` | board: notice, certificates                 |
| teal        | `#11808a` | board: start, ask first, people             |
| ultramarine | `#2d3fb5` | board: firm profile                         |
| violet      | `#6e3fa3` | board: the Article 58(3) question           |
| slate       | `#3f5566` | board: index of tenders out of reach alone  |

### Dark

Designed as its own set, not inverted. The desk is a night desk, the acetate is smoked, and boards and tabs keep their full-strength hues so a tab never splits from its board.

| Token               | Hex                               |
| ------------------- | --------------------------------- |
| desk                | `#0e0f11`                         |
| acetate             | `#16181b`                         |
| ink / ink-2 / ink-3 | `#ecedea` / `#bfc3c7` / `#9ca1a7` |
| leaf back           | `#2a2d31`                         |
| errata              | `#ff5a4a` with ink `#141414`      |

### Measured contrast (WCAG 2.2)

Computed with the WCAG relative luminance formula on 2026-09-16:

| Pair                                              | Ratio                             |
| ------------------------------------------------- | --------------------------------- |
| light ink on acetate                              | 17.30:1                           |
| light ink-3 on acetate                            | 5.60:1                            |
| white on errata                                   | 5.05:1                            |
| errata figure on acetate                          | 4.75:1                            |
| dark ink on acetate                               | 15.14:1                           |
| dark ink-3 on acetate                             | 6.84:1                            |
| ink on dark errata                                | 5.98:1                            |
| tab: ink on yellow / ink on grass                 | 10.13:1 / 5.16:1                  |
| tab: white on teal / ultramarine / violet / slate | 4.69:1 / 8.43:1 / 7.23:1 / 7.77:1 |

Every text pair clears 4.5:1.

## Structure

- **The binder is the page.** It has a punched binding on the left, the current division's board around the leaves, and the fore edge on the right.
- **Every leaf carries its own tab.** Each tab spans exactly the leaf it indexes. The open division's tab stands proud, and the others step back. On a phone the fore edge becomes the top edge, so tabs stand up above each leaf.
- **Ply is the only rank.** The top leaf holds the verdict. Lower leaves sit slightly inset.
- **The margin column** (a fifth column, left, behind a hairline rule) holds facts and section heads. Four content columns hold reading.
- **Four leaf states:**
  - **Clear:** read and checked.
  - **Half-hinged:** a rule a partner firm could meet, where another firm may lend capacity.
  - **Face-down:** a document not read yet, never GO.
  - **Errata slip:** a separate punched vermilion strip filed beside the verdict word, carrying the rule the firm cannot meet on its own and its shortfall. Because Directive 2014/24/EU Article 63 lets a partner lend turnover, staff and references, such a miss usually reads Partner needed rather than a flat no-go (verified on legislation.gov.uk, 2026-09-16). Partner needed means a partner is necessary, not that one is enough: it applies only when the notice reads no reserved task (Article 63(2)) or other limit on reliance for that criterion, it names the conditions (the partner performs the work it lends experience for, the firm proves access to the resources), and an unknown legal basis reads Ask first. The on-screen words for this state are still open.
- **The addendum slip** (violet tag) holds a drafted question to the buyer under Article 58(3).
- **The verdict page's reading order:**
  1. Buyer, deadline and notice in the margin
  2. Title
  3. Verdict word and errata slip
  4. One sentence on why
  5. The clause: German quote beside the plain English reading, then figures demanded against held
  6. Every other clause
  7. What was not read
  8. The Article 58(3) check

## Motion

Nothing eases or fades. A change is a 90ms two-frame step, hinged at the punched edge:

- a half-hinged leaf's punched edge strip swings flat on hover or focus, while its text never moves;
- buttons press by a pixel.

Under `prefers-reduced-motion` every transition is off. There are no page-load sequences.

## Media

The product's own material, at full fidelity:

- the buyer's quoted clause text in its original language;
- the firm's figures against the demanded figures;
- the notice and pack references with links;
- the drafted question.

There is no stock photography, no abstract decoration and no flat vector illustration as the media plan. A later pass may add real page crops from a read document pack beside the erratum (the page the rule was found on), once a portal adapter has read one.

## Themes

Light, Dark and Device (the default, following `prefers-color-scheme` live). A visible three-way switch in the desk bar remembers the choice in `localStorage`. The theme is applied by an inline head script before first paint, so there is no flash.

## References and the shared mechanics

- **Boxed-software reference manuals** (acetate leaves over tab boards): tabs sized by extent, board hue at full strength, ply as rank, errata as a slip, two-frame hinge motion.
- **Stotles and Tendium** (competitors, measured above): dense lists and neutral grotesques are what this audience reads as competent. Blue lead and Geist are what to avoid.
- **DTVP and TED** (portals, measured above): square corners and ruled tables are familiar and trusted. The Bootstrap navy is what frightens.

## Mockups

| Page                                | Desktop 1440                                     | Mobile 390                                      |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Verdict                             | `mockups/verdict-desktop-light.png`, `-dark.png` | `mockups/verdict-mobile-light.png`, `-dark.png` |
| Tenders                             | `mockups/tenders-desktop-light.png`, `-dark.png` | `mockups/tenders-mobile-light.png`, `-dark.png` |
| Firm profile                        | `mockups/profile-desktop-light.png`, `-dark.png` | `mockups/profile-mobile-light.png`, `-dark.png` |
| Home                                | `mockups/home-desktop-light.png`, `-dark.png`    | `mockups/home-mobile-light.png`, `-dark.png`    |
| States (58(3), loading, no profile) | `mockups/states-desktop-light.png`, `-dark.png`  | `mockups/states-mobile-light.png`, `-dark.png`  |

Source pages: `verdict.html`, `tenders.html`, `profile.html`, `home.html`, `states.html`, styled by `assets/pagefifty.css`.

Each image is a full-page capture in headless Chromium at a 1440 by 900 or 390 by 844 viewport, with the page opened as `?theme=light` or `?theme=dark`. Capture them again after any change to a page or the stylesheet, so the images match the pages.

## Content truth

- Tender facts and German quotes come from TED notices 630477-2026, 600017, 612926, 634313, 634770, 631707, 625719 and 614181 (2026).
- The home page figure (58 notices with a turnover floor, 28 ruling out a firm at EUR 1M) was measured on 363 open IT notices on 2026-09-15.
- Brink Data is a demo firm with invented figures. The states page's Article 58(3) figures are illustrative. Both are labelled on the pages.
