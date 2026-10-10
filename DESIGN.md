# Dogwatch design

## TL;DR
- Dark by default. Accent is samehere.dev blue `#4f9fe8`. Neutrals are near-black.
- Every text color pair passes WCAG AA on every surface (ratios below).
- Status is always color + icon + word: GO (green, check), HOLD (amber, pause), RECALL (red, triangle).
- Layout follows premium SaaS consoles: sidebar, page header, KPI strip, tabbed inbox, right rail.
- Motion only where it carries meaning: the verdict flip (240 ms) and new rows (180 ms). Reduced motion is respected.

## Tokens (`app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| background | `#0a0a0a` | page |
| card | `#161616` | cards |
| secondary / popover | `#1f2228` | raised surfaces, chips |
| border | `#26292f` | hairlines |
| foreground | `#f4f4f5` | text (18.0:1 on bg) |
| muted-foreground | `#a1a5ab` | secondary text (7.3:1 on card) |
| helper | `#8b9097` | captions (5.6:1 on card) |
| primary / info | `#4f9fe8` | accent, primary buttons (dark text 7.0:1) |
| link | `#7ec4ff` | links (9.7:1 on card) |
| go | `#5fce8f` | GO, OK (9.2:1 on card) |
| hold | `#e0a83a` | HOLD, warnings (8.5:1 on card) |
| recall | `#f26d6d` | RECALL, failures (6.2:1 on card) |

## Type and shape
- Geist for UI, Geist Mono for numbers, IDs and times (tabular figures).
- Radius 12 px for cards, 8 px for controls. Page padding 32 px. Grid gap 20 px.
- Micro-labels: 11 px, uppercase, wide tracking, helper color.

## Rules
- Unknown or missing data never shows as green.
- No information by hover only. Map details are also in the mission and anomaly views.
- Focus rings on every interactive element. Icon-only buttons have labels.
