---
name: Project Technical System
colors:
  surface: '#f9faf5'
  surface-dim: '#d9dad6'
  surface-bright: '#f9faf5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f0'
  surface-container: '#edeeea'
  surface-container-high: '#e8e8e4'
  surface-container-highest: '#e2e3df'
  on-surface: '#1a1c1a'
  on-surface-variant: '#45474d'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f0f1ed'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545e76'
  primary: '#051125'
  on-primary: '#ffffff'
  primary-container: '#1b263b'
  on-primary-container: '#828da7'
  inverse-primary: '#bbc6e2'
  secondary: '#47607e'
  on-secondary: '#ffffff'
  secondary-container: '#c2dcff'
  on-secondary-container: '#48617e'
  tertiary: '#200d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#3d1f00'
  on-tertiary-container: '#d27700'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#bbc6e2'
  on-primary-fixed: '#101b30'
  on-primary-fixed-variant: '#3c475d'
  secondary-fixed: '#d1e4ff'
  secondary-fixed-dim: '#afc9ea'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#2f4865'
  tertiary-fixed: '#ffdcc1'
  tertiary-fixed-dim: '#ffb877'
  on-tertiary-fixed: '#2e1600'
  on-tertiary-fixed-variant: '#6c3a00'
  background: '#f9faf5'
  on-background: '#1a1c1a'
  surface-variant: '#e2e3df'
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: '0'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.06em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 24px
---

## Brand & Style

This design system is built for the high-stakes environment of construction and contract management. The brand personality is rooted in **precision, reliability, and structural integrity**. It prioritizes technical clarity over decorative flair, ensuring that complex project data is accessible and actionable. 

The aesthetic follows a **Modern Corporate** approach with a **Technical Minimalist** edge. By utilizing a restrained color palette and a strict underlying grid, the UI evokes the feeling of a digital blueprint—organized, authoritative, and dependable. The goal is to reduce cognitive load for project managers and engineers who interact with high-density information daily.

## Colors

The color strategy uses deep, stable tones to establish authority, accented by high-visibility safety colors for critical path items.

- **Primary (Deep Navy):** Used for navigation, primary actions, and brand presence. It represents the "foundation" of the interface.
- **Secondary (Slate Gray):** Used for secondary UI elements, iconography, and less-critical text. It provides a bridge between the primary blue and the neutral backgrounds.
- **Accent (Safety Orange):** Reserved strictly for alerts, warnings, active status indicators, and primary call-to-action buttons that require immediate attention.
- **Neutral Palette:** A range of cool grays and off-whites are used to define the "workspace," separating technical modules without introducing visual noise.

## Typography

The typography in this design system utilizes **Inter** for its exceptional legibility and neutral tone. To handle the complexity of contract and project data, the system relies on a rigorous hierarchy:

1.  **Technical Labels:** Use `label-caps` for table headers and section metadata to distinguish them clearly from user-generated content.
2.  **Tabular Data:** Use `data-tabular` with fixed-width numerals (tnum) to ensure that columns of numbers and dates align vertically for easy comparison.
3.  **Readability:** Body text is set with generous line-height to ensure that long-form contract clauses remain readable during extended review sessions.

## Layout & Spacing

This design system employs a **Fluid Grid** model optimized for high-density dashboards. 

- **8-Pixel Rhythm:** All margins and paddings must be multiples of 8px (or 4px for tight technical components).
- **Column Logic:** For desktop, a 12-column grid is used. Data tables should ideally span the full container width to maximize horizontal real estate for technical columns.
- **Information Density:** Use compact spacing (8px–12px) within data-entry forms and tables, while reserving larger spacing (24px+) for global layout sections to provide visual "breathing room" between major modules.

## Elevation & Depth

To maintain a professional, minimalist look, this design system avoids heavy drop shadows. Depth is communicated through **Low-Contrast Outlines** and **Tonal Layers**:

1.  **Base Layer:** The application background uses a light neutral (#F8F9FA).
2.  **Surface Layer:** Content cards and modules use a pure white (#FFFFFF) surface with a subtle 1px border (#D1D5DB).
3.  **Elevation Shadows:** Use "Ambient Shadows"—low-opacity (5-8%), highly diffused blurs—only for floating elements like dropdown menus or modals to separate them from the work surface.
4.  **Structural Separation:** Use subtle slate-gray horizontal dividers (1px) in tables rather than zebra-striping to maintain a clean, architectural look.

## Shapes

The shape language reflects the "Soft" setting (4px radius) to strike a balance between modern software and industrial precision.

- **Standard Components:** Buttons, input fields, and cards use a 4px corner radius. This communicates a sense of "engineered" construction.
- **Status Badges:** Use a slightly higher radius (rounded-lg or 8px) to make them visually distinct from interactive input fields.
- **Hard Edges:** Avoid 0px (sharp) corners to prevent the UI from feeling dated, but never exceed 8px except for specific "pill" indicators used in progress bars.

## Components

The components in this design system are built for utility and high-frequency use.

- **Data Tables:** These are the heart of the system. They must support "sticky" headers and "sticky" first columns (usually Project IDs). Use `data-tabular` typography. Hover states should trigger a subtle tint change (#F1F5F9).
- **Status Badges:** Use a "Light Fill + High Contrast Text" style. For example, a "Delayed" status uses a pale orange background with the safety orange (#F48C06) for text and icons.
- **Technical Icons:** Use 20px or 24px line-style icons with a 1.5pt stroke weight. Avoid solid fills unless indicate an active/selected state. Icons should be functional (e.g., paperclips for attachments, hard-hats for site logs, calipers for measurements).
- **Buttons:**
    - **Primary:** Deep navy background with white text.
    - **Secondary:** Transparent background with a 1px slate-gray border.
    - **Action:** Safety orange for destructive or high-alert actions (e.g., "Submit Bid" or "Report Incident").
- **Input Fields:** Use 1px borders. Focused states should use a 2px navy blue border to provide clear visual feedback in data-entry heavy workflows.