# Dogwatch design

## TL;DR
- Dark by default. Accent is samehere.dev blue `#4f9fe8`. Neutrals are warm charcoal, not blue-black.
- Every text color pair passes WCAG AA on every surface (ratios below).
- Status is always color + icon + word: GO (green, check), HOLD (amber, pause), RECALL (red, triangle).
- Layout: one framed window floating on a darker backdrop. Cards are card-in-card: a caps title row, then an inset panel.
- Motion is short and ease-out: cards rise in, KPI numbers count up, bars grow, tabs slide. Reduced motion turns it into a plain fade or nothing.

## Tokens (`app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| backdrop | `#0f0f0f` | behind the framed app window |
| sidebar | `#171717` | window frame and sidebar |
| background | `#1b1b1b` | main panel |
| panel | `#1d1d1d` | inset panel inside a card (`panel-inset`, `bg-panel`) |
| card | `#232323` | cards, one step lighter than the panel |
| secondary / accent | `#2c2c2c` | raised surfaces, active tab pill, chips |
| border | `#2e2e2e` | hairlines; cards use a 6% white ring instead |
| foreground | `#f5f5f4` | text (15.8:1 on background, 14.4:1 on card) |
| muted-foreground | `#a8a8a2` | secondary text, card titles (6.6:1 on card) |
| helper | `#9a9a94` | captions (5.6:1 on card, 4.9:1 on secondary) |
| primary / info | `#4f9fe8` | accent, primary buttons (dark text 7.0:1), current breadcrumb (6.1:1 on background) |
| link | `#7ec4ff` | links (8.4:1 on card) |
| go | `#5fce8f` | GO, OK (8.0:1 on card) |
| hold | `#e0a83a` | HOLD, warnings (7.4:1 on card) |
| recall | `#f26d6d` | RECALL, failures (5.4:1 on card, 4.7:1 on a 10% recall tint) |

Status tints under status text stay at 10% or less (`bg-recall/10`); at 15% recall text drops below 4.5:1. Urgent counts use a solid recall pill with background-colored text (5.9:1).

## Type and shape
- Geist for UI, Geist Mono for numbers, IDs and times (tabular figures).
- Card titles and table headers: `label-caps` (11 px Geist Mono, uppercase, 0.12em tracking, muted color). `CardTitle` takes an optional `info` string for the small (i) icon.
- KPI tiles: caps label, 28 px mono number, sparkbars at the right (neutral bars, latest bar in the accent, red for bars past a limit), footer row with the delta.
- Radius base 10 px: cards 18 px, inset panels 14 px, controls 10 px, pills fully round. Page padding 32 px. Grid gap 20 px.
- Segmented controls are pills on the panel color; the active pill is `secondary` with a hairline ring.

## Motion
| Utility | What | Timing |
|---|---|---|
| `animate-rise` | fade in, 8 px up | 420 ms, ease-out-quint, delay `--rise-delay` |
| `animate-grow-y` / `animate-grow-x` | bars scale in from the bottom / left (works on SVG rects) | 600 ms, delay `--rise-delay` |
| `animate-pulse-soft` | outline ring breathes out in the text color | 2.4 s loop, RECALL or live only, never on focusable elements |
| `animate-verdict` | verdict flip | 240 ms |
| `animate-row` | new log row | 180 ms |
| `tab-anchor` + `tab-indicator` | tab pill slides to the active tab (CSS anchor positioning; static pill where unsupported) | 320 ms |
- Page load: cards rise 60 ms apart (`animate-rise [--rise-delay:60ms]`). KPI numbers count up once (`components/count-up.tsx`, 700 ms; the server renders the final value).
- Hover: cards lift 1 px with a deeper shadow; nav items shift 2 px right.
- `prefers-reduced-motion`: rise becomes a 200 ms fade, bars, pulse, slide, lift and count-up are off.

## Rules
- Unknown or missing data never shows as green.
- No information by hover only. Map details are also in the mission and anomaly views.
- Focus rings on every interactive element. Icon-only buttons have labels.
