# Synkka – design spec

Exact px values, SVG paths and layout live in `design-source/*.dc.html`. Copy keys refer to `copy-fi.json`.

## 1. Look & feel

- Neutral, light UI: grey canvas (`bg.canvas`), white cards with 1 px `border.default`, one blue accent.
- Inter 400/500/600/700. Headings tight (`letter-spacing: -0.01em` desktop, `-0.02em` mobile H1).
- Icons: 24×24 stroke icons, stroke 2 (2.2–2.4 for small status icons), round caps/joins.
  Use an icon library with the same style (e.g. Lucide) and match the glyphs listed in §6.
- Accent is themeable (tokens list three alternatives); every accent use goes through the token.

## 2. Screens

### 2.1 Desktop – File browser (`Main.dc.html`)
Fluid page; designed at 1280×820. Root is a wrapping flex row.

**Sidebar** (`flex: 1 1 232px`, white, right border, padding 20/16, gap 24)
- Logo: 32 px accent square (radius 8) with white sync glyph + "Synkka" 18/700.
- Primary button "Lisää tiedostoja" – full width, 44 h, radius 10, accent, plus icon.
- Nav (40 h items, radius 8, gap 12 icon→label): Kaikki tiedostot (active: `bg.accentSoft`, `accent.strong`, 600), Viimeisimmät, Jaetut, Laitteet, Roskakori.
- Storage card pinned to bottom (`margin-top: auto`): title + percent, 6 px bar, "X Gt / Y Gt käytössä".

**Main** (`flex: 999 1 560px; min-width: 0`)
- Top bar (white, bottom border, padding 16/28, wraps): search field (40 h, `bg.subtle`, radius 10, visually-hidden label), sync status pill (36 h, radius 18, `bg.successSoft`, text `status.syncedText`), "Keskeytä" secondary button, settings icon button (40×40, `aria-label`).
- Content row (padding 24/28, gap 24, wraps):
  - **File section** (`flex: 999 1 520px`): breadcrumb (13, muted) + H1 24/700; actions "Jaa kansio", "Uusi kansio" (36 h secondary).
    File table card: radius 12, `overflow-x: auto`, inner `min-width: 620px`.
    Grid columns `3fr 1.5fr 1.3fr 0.8fr`, gap 12, padding 0/20, row 56 h, divider `border.divider`.
    Header 12/600 uppercase muted. Columns: Nimi (32 px icon tile + name, ellipsis), Tila (status, §3), Muokattu, Koko (right-aligned).
    Folder tile: `bg.accentSoft` + accent folder icon. File tile: `bg.subtle` + document icon.
  - **Right panel** (`flex: 1 1 280px`, gap 16): two cards (padding 20, radius 12):
    - *Laitteet*: rows with 36 px icon tile (laptop/phone), name 500, state 12 muted, presence dot (online: 8 px filled `status.synced`; offline: 8 px ring `border.radioIdle`), each with `aria-label`.
    - *Viimeisin toiminta*: entries "**file** detail" + time; link "Näytä koko historia".

**Responsive:** sidebar stacks on top when width < ~792 px; right panel drops below the table; top bar wraps.

### 2.2 Mobile – Files (`MobileFiles.dc.html`) 390×844
- Header (white, top safe area): H1 "Tiedostot" 28/700 + round 44 px accent "+" button (`aria-label`). Search 44 h, radius 12.
- Sync banner (link → Sync screen): `bg.accentSoft`, radius 14, 36 px accent circle with sync icon, title + subtitle ("1 ristiriita odottaa ratkaisua"), chevron.
- "Kansiot": 2-column grid of folder cards (radius 14, border, folder icon in accent, name 600, meta 12 muted).
- "Viimeisimmät": rows ≥56 h: 40 px file tile, name (ellipsis), meta 13 muted, trailing 20 px status icon with `aria-label`.
- Bottom tab bar (4 equal columns, 48 px min target, 11 px labels, bottom safe area): Tiedostot (active, accent), Kuvat, Synkronointi, Tili.

### 2.3 Mobile – Sync (`MobileSync.dc.html`) 390×844 – interactive
- Header: back button (44×44, `aria-label="Takaisin"`) + title "Synkronointi" 20/700.
- Status card (radius 18, padding 24/20, centered): **progress ring** 132 px, stroke 10, track `track`, value accent, round cap, starts at 12 o'clock; center "64 %" 32/700 + "24 / 38 Mt". Title "Synkronoidaan N tiedostoa" 17/600, subtitle "Wi-Fi · noin 1 min jäljellä". Two buttons in a 2-col grid: "Keskeytä" (secondary, pause icon) / "Synkronoi nyt" (primary).
- "Jono" card: each item name + state text right, 4 px progress bar (accent; completed = `status.synced`). Last row is a conflict link (danger color, warning icon, chevron) → Conflict screen.
- "Asetukset" card: toggle rows ≥56 h (label 500 + hint 12 muted + 48×28 switch). The whole row is the `<label>`; a real checkbox drives it. Defaults: Vain Wi-Fi = on, Kuvien varmuuskopiointi = on, Akunsäästö = off.

### 2.4 Mobile – Resolve conflict (`MobileConflict.dc.html`) 390×844 – interactive
- Header: back → Sync, title "Ratkaise ristiriita".
- Alert box: `bg.dangerSoft`, text `text.dangerStrong`, warning icon `status.conflict`, file name 600 + explanation.
- Fieldset, legend "Mikä versio säilytetään?" (overline style). Three **radio cards** (radius 14, padding 14/16): 22 px radio ring, 40 px device icon tile, title 600 + meta 13 muted.
  Options: this device's version / other device's version / keep both (**default**).
  Selected: 2 px accent border, accent ring + 10 px accent dot. Idle: 1 px `border.default`, ring `border.radioIdle`.
- Note: rejected version kept in version history 30 days.
- Sticky footer: primary 52 h button whose label follows the selection (`conflict.cta.*`), plus link "Päätä myöhemmin" → back.

## 3. Sync status system (shared)

| State | Icon | Color token | Label (desktop) | Extras |
|---|---|---|---|---|
| `synced` | circle + check | `status.synced` / text `syncedText` | Synkronoitu | – |
| `syncing` | two-arrow sync | `status.syncing` / text `syncingText` | Lähetetään {pct} % | 4 px progress bar (max-w 150) |
| `pending` | clock | `status.pending` | Jonossa | – |
| `conflict` | triangle + ! | `status.conflict`, 600 | Ristiriita – ratkaise | is a link to resolution |
| `cloudOnly` | cloud | `status.cloudOnly` | Vain pilvessä | – |
| `offlineAvailable` | circle + down arrow | `status.offlineAvailable` | Tallennettu laitteelle | mobile only so far |

Always icon + text (desktop) or icon with `aria-label` (mobile list). Colors also differ in lightness.

## 4. Navigation flow

```
Mobile Files ──(sync banner / tab "Synkronointi")──▶ Mobile Sync ──(conflict row)──▶ Resolve conflict
      ▲                                                  │  ▲                              │
      └──────────────────────(back)──────────────────────┘  └──(back / "Päätä myöhemmin")──┘
Desktop table "Ristiriita – ratkaise" ──▶ conflict resolution (desktop dialog: not designed yet,
reuse the mobile radio-card pattern in a modal ~480 px wide)
```

## 5. Interactions & behaviour

- Pause/resume: "Keskeytä" toggles to "Jatka" while paused; status pill/banner shows paused state (copy key `sync.paused`).
- "Synkronoi nyt" forces a sync pass; disabled while one is already running.
- Toggles persist immediately (no save button).
- Conflict: submitting resolves, shows a toast (`conflict.resolvedToast`), returns to Sync; the conflict row disappears.
- Progress values update live; ring and bars animate width/offset over ~200 ms ease-out.
- Search filters the current list as you type (debounce ~150 ms).

## 6. Icon glyph list
sync (two arcs + arrowheads), plus, folder, file (page with corner fold), clock, users, monitor, trash, search, pause, settings (gear), check-circle, alert-triangle, cloud, laptop, smartphone, copy (keep both), chevron-left, chevron-right, upload (Kuvat tab), user (Tili tab), download-circle (offline).

## 7. Not designed yet (flag, don't invent silently)
Empty states, error/offline-network states, onboarding & sign-in, sharing dialog, settings screen, desktop conflict dialog, tray/menu-bar menu, dark mode, tablet layout.
