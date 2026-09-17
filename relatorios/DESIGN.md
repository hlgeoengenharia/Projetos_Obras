---
name: Cartographic Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#43474d'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#49607c'
  primary: '#001428'
  on-primary: '#ffffff'
  primary-container: '#0f2942'
  on-primary-container: '#7991af'
  inverse-primary: '#b0c9e8'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#220e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#401f00'
  on-tertiary-container: '#d77503'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9e8'
  on-primary-fixed: '#011d35'
  on-primary-fixed-variant: '#314863'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style
The design system balances technical institutional authority with modern geospatial ergonomics. Built for territory governance, land administration, and executive environmental auditing, the system serves technical GIS analysts, municipal planners, and C-suite spatial directors.

The overarching design aesthetic is **Corporate Technical Modernism**: highly disciplined, dense, metric-driven, and crisp. Visual elements avoid decorative playfulness in favor of functional precision, structural clarity, and spatial density. The interface instills unyielding trust, scientific accuracy, and audit-grade immutability. Micro-interactions are snappy (100ms–150ms) with purposeful mechanical feedback, supporting modular report composition, drag-and-drop spatial blocks, print-ready A4 sheet viewports, and explicit architectural decouple/adapter boundaries.

## Colors
The palette is structured to handle multi-tiered analytical depth without visual fatigue:

- **Primary (`#0F2942`)**: Deep petroleum navy serving as the foundational anchor for navigation structures, contextual toolbars, primary system commands, and document master frames. An ancillary shade (`#1E3A8A`) is reserved for focused operational highlights and interactive link states.
- **Secondary (`#059669`)**: Emerald teal-green dedicated to geospatial geometry layers, active spatial features, boundary validation markers, topological verifications, and successful computation states.
- **Tertiary (`#D97706`)**: Technical amber deployed for critical land-use restrictions, analytical zoning thresholds, and pending validation notices. A supplemental violet (`#7C3AED`) identifies decoupling connectors, adapter pipelines, dynamic calculated metrics, and macro-aggregation blocks.
- **Neutral (`#1E293B`)**: Refined deep slate for body copy and structural typography, balanced against soft technical ground layers: `#F8FAFC` (canvas workspace backdrop), `#F1F5F9` (sidebar panels and card wells), and `#E2E8F0` (calibrated dividers and geometric hairpins).
- **Functional Semantics**: System alert red (`#DC2626`) strictly handles spatial overlap violations and pipeline errors; status badges use 10% opacity tints of the relevant semantic token to preserve legibility in dense tables.

## Typography
Typography is tuned for maximum information density, analytical scanning, and numerical alignment:

- **Headlines (`Hanken Grotesk`)**: Provides sharp, contemporary corporate authority across dashboard module heads, report covers, and analytical summary titles.
- **Body (`IBM Plex Sans`)**: Chosen for its engineering-grade legibility, robust character differentiation (e.g., distinguishing uppercase `I`, lowercase `l`, and digit `1`), and stability in compact forms.
- **Data & Labels (`JetBrains Mono`)**: Applied to all geospatial coordinates (UTM, SIRGAS 2000, WGS84), cadastral IDs, scale notations (1:25.000), adapter pipeline statuses, and data-density metrics to preserve tabular alignment across columns.

## Layout & Spacing
The layout uses a hybrid dual-viewport model:
1. **Application Shell (Fluid Workbench)**: A 12-column adaptive fluid grid housing collateral toolbars, data-source adapters, component library sidebars, and contextual inspectors. Outer margins are pegged at `1.5rem` (`24px`), with `1rem` (`16px`) gutters to preserve screen real estate.
2. **Report Stage (Fixed-Ratio Canvas)**: A dedicated viewport that presents a physical ISO 216 A4 workspace (1:1.414 aspect ratio, default 794px × 1123px at 96 DPI screen preview or 210mm × 297mm print output). In this mode, blocks snap to a rigid 8pt micro-grid with virtual printing margins locked at `space-xl` (`2rem`).

### Breakpoints & Adaptive Rules
- **Desktop (≥ 1280px)**: Three-pane layout (Left: Data Catalog & Block Repository; Center: A4 Page Viewport / Spatial Canvas; Right: Property Inspector & Export Engine).
- **Tablet (768px – 1279px)**: Inspector collapses into a slide-over panel. Grid narrows to 8 columns with `1rem` gutters. Drag-and-drop remains active with touch-target expansions.
- **Mobile (< 768px)**: 4-column flow. The A4 viewport switches to a responsive preview scroll with pinned download/export actions; visual editing collapses to read-only summary inspection.

## Elevation & Depth
Visual hierarchy avoids soft decorative blurs, relying instead on structural surface tiers, crisp ghost borders, and calibrated functional depth:

- **Surface Levels**:
  - `Surface-0` (`#F8FAFC`): Base application canvas.
  - `Surface-1` (`#FFFFFF`): Standard cards, report sheets, and active panels.
  - `Surface-2` (`#F1F5F9`): Data tables, metadata wells, and adapter bridge containers.
  - `Surface-Overlay` (`#FFFFFF`): Dragged block proxies, modal sheets, and floating mini-maps.
- **Borders & Seams**: Every card, input, and panel is bounded by a hairline border (`1px solid #E2E8F0`). Dark-mode or high-contrast states escalate this to `#CBD5E1`.
- **Elevation Shadows**:
  - *Resting/Flat*: `none` (strictly governed by `1px` structural borders).
  - *Draggable Hover*: `0 2px 4px -1px rgba(15, 41, 66, 0.08)`.
  - *Active Dragging Block*: `0 12px 24px -4px rgba(15, 41, 66, 0.16), 0 0 0 1px #059669`.
  - *Floating Toolbar / Context Menu*: `0 4px 12px -2px rgba(15, 41, 66, 0.12), 0 0 0 1px #E2E8F0`.

## Shapes
The design uses a compact **Soft (1)** shape language to maintain a disciplined engineering aesthetic:

- Standard controls (inputs, buttons, chips, table cell selectors): `0.25rem` (`4px`).
- Structural cards, panel enclosures, and report widgets: `0.5rem` (`8px`) via `rounded-lg`.
- Floating action modals, export sheets, and drawer corners: `0.75rem` (`12px`) via `rounded-xl`.
- Technical tags, read-only indicators, and adapter status badges: strictly `0.25rem` (`4px`) with uppercase monospace text to retain block-level alignment.
- Circular elements are restricted solely to user avatars and map coordinate pins.

## Components

### Buttons
- **Primary**: Solid background `#0F2942`, white label (`IBM Plex Sans`, 13px, weight 500), `4px` radius, padding `6px 14px`. Hover state: `#1E3A8A`. Active: `#0B1F32`.
- **Secondary / Spatial Action**: Outline or soft tinted `#059669`. Background `rgba(5, 150, 105, 0.08)`, border `1px solid #059669`, text `#059669`. Hover: background `#059669`, text `#FFFFFF`.
- **Ghost / Utility**: Borderless, text `#1E293B`, hover background `#F1F5F9`.

### Chips & Semantic Badges
- Height locked at `20px` or `24px`, padding `0 6px`, radius `4px`.
- **Read-Only Seal**: Background `#F1F5F9`, border `1px solid #CBD5E1`, text `#475569`, icon `lock` (12px), text `JetBrains Mono` 10px uppercase.
- **GIS Status Badge**: Background `rgba(5, 150, 105, 0.1)`, border `1px solid #059669`, text `#059669`.
- **Decoupled Adapter Tag**: Background `rgba(124, 58, 237, 0.1)`, border `1px dashed #7C3AED`, text `#7C3AED`, displaying data source contract (e.g., `ADAPTER::SIGWEB_REST_V2`).

### Input Fields & Selectors
- Height `32px` for high-density forms. Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#1E293B` (`IBM Plex Sans` 13px).
- Focus state: border `1px solid #0F2942` with an ambient glow ring of `0 0 0 2px rgba(15, 41, 66, 0.1)`. No default browser outlines.
- Spatial coordinate inputs: use `JetBrains Mono` font for numeric precision.

### Checkboxes & Radios
- Size `16px × 16px`, radius `3px` for checkboxes, circular for radios.
- Unchecked: border `1.5px solid #CBD5E1`, background `#FFFFFF`.
- Checked: border `#0F2942`, background `#0F2942`, checkmark icon in sharp white.

### Cards & Report Blocks (Drag-and-Drop)
- Background `#FFFFFF`, border `1px solid #E2E8F0`, radius `8px`.
- Header: height `36px`, padded with `0.5rem 0.75rem`, background `#F8FAFC`, bottom divider `1px solid #E2E8F0`.
- Draggable Handle: 6-dot matrix icon in `#94A3B8` on the left corner. During drag, surface receives `2px dashed #059669` outline with drop-target indicator line (`2px solid #059669`).

### Tables & Data Grids
- Row height `32px` (dense) or `40px` (standard). Alternating rows disabled; borders use `#F1F5F9`.
- Header row: background `#F8FAFC`, uppercase `JetBrains Mono` 11px text in `#475569`, bottom border `2px solid #E2E8F0`.
- Numeric columns automatically right-align and adopt tabular numbers (`font-variant-numeric: tabular-nums`).

### A4 Document Stage
- Displayed as a stark white card (`#FFFFFF`) with precise print margins indicated by faint dashed lines (`#E2E8F0`).
- Header displays page numbering metadata, generation timestamp, and digital signature/hash verification chip.