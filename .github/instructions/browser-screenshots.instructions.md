---
description: "Use when creating, editing, or refreshing Vitest browser screenshots and screenshot baselines. Covers authentic product UI, components, styling, and evidence."
applyTo: "components/exam/__tests__/**/*.browser.test.tsx"
---

# Browser screenshot guidelines

- Capture the real application experience for the scenario: render the production page or relevant production components inside the appropriate product shell wherever possible.
- Reuse components from `components/ui` and feature components from `components/exam`; use the app's Tailwind design tokens, typography, spacing, and colors.
- Do not create hand-built HTML evidence summaries as substitutes for app screens. For backend-only behavior with no corresponding user-facing screen, keep the assertions in tests and do not invent an application screenshot.
- Do not use inline styles or test-only CSS to imitate production components, force a visual theme, or conceal an unstyled fixture. Test-only screenshot CSS may provide neutral browser setup only; it must not change the product's intended appearance.
- Keep scenario data clearly synthetic and safe. Screenshots must not expose credentials, API keys, personal data, or production records.
- Preserve functional assertions while changing screenshot renderers. Refresh the relevant baselines after intentional visual changes and inspect the generated images at the configured browser viewport.
- Every Unit Test 1–15 and Hypothesis Test H01–H15 must have both a static evidence summary and at least one scenario-specific UI screenshot. Keep them in distinct `static-test-evidence-summary` and `scenario-specific-ui-screenshots` subfolders within that test's folder.
- When a scenario exercises multiple distinct user-visible UI states, capture a separate screenshot for each meaningful state in its `scenario-specific-ui-screenshots` folder. Keep a single screenshot when the scenario has only one meaningful UI state; do not add redundant captures just to increase the count.
- Treat the repository's existing screenshot directory layout as authoritative over paths suggested by an individual prompt. Before creating or updating a baseline, inspect the applicable screenshot directories and reuse the existing canonical folder; never create a parallel short-name or alternate folder when the correct folder already exists.
- Store unit baselines under `__screenshots__/unit-test/unit-test-<number>-<slug>/` and hypothesis baselines under `__screenshots__/hypothesis-test/hNN/`. Inside each test's folder, put the summary at `static-test-evidence-summary/summary.png` and each scenario screenshot under `scenario-specific-ui-screenshots/` with a descriptive filename. If the required folder does not exist, create it using this same hierarchy and naming convention, following the slug used by related existing tests; do not flatten or rename the arrangement to match a prompt's conflicting example.
- Static summaries supplement scenario screenshots; they must never replace them. For backend-only behavior, capture only a genuine production UI that demonstrates the same tested flow; do not fabricate a screen or present a hand-built evidence page as the product UI.
