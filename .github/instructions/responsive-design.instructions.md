---
description: "Use when changing responsive layouts, media queries, Tailwind breakpoints, navigation, forms, tables, dashboards, or examination screens. Defines mobile-to-desktop behavior and regression checks for the entire exam system."
applyTo: ["app/**/*.tsx", "components/**/*.tsx", "app/**/*.css", "components/**/*.css"]
---

# Responsive design and media-query guidance

- Preserve a mobile-first layout from 320 px screens through large desktop widths. Use the existing Tailwind breakpoints and add custom media queries only when responsive utilities cannot express the requirement cleanly.
- Prefer fluid sizing, wrapping flex/grid layouts, and `min-w-0` for shrinkable content. Avoid fixed widths that exceed the available viewport; long text must wrap or be deliberately truncated without concealing essential information.
- Do not hide page-level overflow to mask layout defects. Give intentionally wide tables/data grids their own usable horizontal scroll region and keep controls, focus indicators, and labels visible.
- Keep navigation, dialogs, forms, charts, and exam controls usable with touch and keyboard input. Account for fixed/sticky controls, virtual keyboards, and mobile safe areas so content cannot be obscured.
- For user-facing UI changes, inspect affected public and authenticated routes at 320, 360, 375, 390, 430, 768, 1024, 1280, and 1440 px (or the closest supported browser sizes). Check narrow portrait and tablet/desktop layouts, horizontal overflow, clipped content, wrapping, and interactive states.
- Run relevant browser/E2E checks and Lighthouse audits for affected routes. Preserve the Lighthouse targets in `.github/copilot-instructions.md`; document environmental limits rather than claiming unreproduced scores.
- If authenticated screens cannot be reached in the available test environment, review the affected shared and route-specific layouts and state that the authenticated viewport behavior remains unverified.
