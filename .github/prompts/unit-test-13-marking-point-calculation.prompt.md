---
name: "Unit Test 13 Marking-Point Calculation"
description: "Use the supplied Unit Test 13 specification and attached reference pictures to verify marking-point scoring and produce screenshot evidence."
argument-hint: "Attach the Unit Test 13 prompt and any reference pictures, then run this prompt."
agent: "agent"
---

Implement or verify Unit Test 13, Marking-point calculation, using the supplied test specification and any pictures attached to this request as visual references.

Requirements:

- Inspect the existing scoring implementation, related tests, and the provided pictures before changing files. Treat pictures as reference evidence, not as proof that implementation behavior is correct.
- Use marking criteria Point A = 2 marks, Point B = 2 marks, and Point C = 1 mark. A response matching A and C must score exactly 3/5, with B unmatched.
- Verify that a response matching all points cannot exceed the configured maximum mark.
- Reuse and improve `components/exam/__tests__/marking-point-calculation.browser.test.tsx` if it already exists; do not create duplicate test files.
- Follow `.github/instructions/browser-screenshots.instructions.md`. Reuse the existing canonical folder `components/exam/__tests__/__screenshots__/unit-test/unit-test-13-marking-points/`; do not create a parallel or shortened folder. Keep browser screenshots under its `scenario-specific-ui-screenshots/` directory and preserve `static-test-evidence-summary/`.
- Prefer a genuine production grading component for screenshot evidence. Do not use hand-built HTML, inline styles, or test-only styling to imitate a product screen. Keep logic-only assertions in tests when no relevant product UI exists.
- Keep test data synthetic. Never inspect or expose environment files, credentials, or production records.
- Run the focused Unit Test 13 browser and unit tests plus lint for changed files. Refresh a screenshot baseline only when an intentional UI change requires it, then inspect the generated image and rerun the browser test without update mode.

Report the scoring cases checked, files changed, screenshot path, and exact validation results. Clearly identify any unrelated existing checks that prevent full validation.
