# Synkka – handover for Claude Code

Synkka is a file sync app for **desktop** (macOS/Windows) and **mobile** (iOS/Android).
This package hands over the UI design so it can be implemented. It holds the design,
not a backend: build the UI on a mock sync layer first (see `docs/data-model.md`).

## Read in this order

1. `docs/design-spec.md` – screens, components, states, interactions (the source of truth)
2. `docs/tokens.json` / `docs/tokens.css` – colors, type, spacing, radii
3. `docs/data-model.md` – types and mock data that drive the screens
4. `docs/copy-fi.json` – all UI copy (Finnish is the primary language)
5. `design-source/*.dc.html` – the original design files (reference only, see below)

## About `design-source/`

These are artboards from a Claude Design canvas. They are **not runnable on their own**:
they use a template runtime (`<x-dc>`, `{{hole}}`, `<sc-for>`, `<sc-if>`, `class Component extends DCLogic`).
Read them for exact values (px, colors, SVG icon paths, layout). Do not copy the template
syntax into production code: port each to the chosen framework's components.

| File | Screen | Size |
|---|---|---|
| `Main.dc.html` | Desktop – file browser | fluid, designed at 1280×820 |
| `MobileFiles.dc.html` | Mobile – Files (home) | 390×844 |
| `MobileSync.dc.html` | Mobile – Sync status & settings | 390×844 |
| `MobileConflict.dc.html` | Mobile – Resolve conflict | 390×844 |

## Open decisions (ask the user before committing to one)

- **Tech stack.** Not decided. A reasonable default that shares code and tokens:
  React Native (Expo) for mobile + Tauri or Electron with React for desktop, with a shared
  `tokens` package and shared TypeScript types. Confirm before scaffolding.
- **Sync backend / protocol.** Out of scope for this handover. Implement against a
  `SyncService` interface with an in-memory mock.
- **Product name.** "Synkka" is a working name.
- **Dark mode.** Not designed yet. Keep all colors in tokens so it can be added.

## Implementation rules

- Use tokens only; no hard-coded hex values in components.
- Status is never color alone: each sync state has its own icon **and** label (see spec §3).
- Touch targets ≥ 44×44 px on mobile; real `button`/`a`/`input` elements with labels;
  `aria-label` on icon-only buttons.
- No fake OS status bar on mobile; respect safe areas instead (the designs leave 56 px top padding
  as a stand-in for the safe-area inset).
- Desktop layout must reflow: sidebar stacks above content and the right panel drops below
  the table at narrow widths; the file table scrolls horizontally inside its card under 620 px.
- All copy comes from `copy-fi.json` (set up i18n from day one; English can follow).
- Sample file names, sizes and devices in the designs are mock data, not requirements.

## Suggested first milestone

1. Scaffold the chosen stack, add tokens and i18n.
2. Build shared primitives: `SyncStatusBadge`, `FileRow`, `DeviceRow`, `ProgressBar`, `ProgressRing`, `Toggle`, `RadioCard`, `Button`.
3. Build the four screens against mock data, with the navigation flow in spec §4.
4. Unit tests for the status → icon/label/color mapping and for conflict resolution choice.
