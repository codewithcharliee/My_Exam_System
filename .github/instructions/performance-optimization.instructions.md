---
description: "Use when changing page rendering, images, fonts, scripts, CSS, Next.js configuration, or client bundles. Keeps Lighthouse performance and Core Web Vitals as measured targets."
applyTo: ["app/**/*.{js,jsx,ts,tsx,css,scss}", "components/**/*.{js,jsx,ts,tsx,css,scss}", "next.config.*", "public/**/*.{svg,png,jpg,jpeg,webp,avif,woff,woff2}"]
---

# Performance and asset optimization

- Preserve a Lighthouse Performance score of 100 as the target for representative mobile and desktop routes; also preserve 100 Accessibility, Best Practices, and SEO. Scores vary by device, hosting, network, and test run, so measure and report exact conditions instead of promising a score.
- Track Core Web Vitals against LCP <= 2.5 s, INP <= 200 ms, and CLS < 0.1. Use real-user field data for INP where available; do not present a lab audit as field INP.
- Before optimizing, run Lighthouse on the affected production build or deployment with extensions disabled and record the route, device preset, scores, Core Web Vitals, and actionable opportunities. Change measured bottlenecks and compare with the same conditions afterward.
- Keep experimental global CSS inlining disabled unless a same-condition production audit proves it helps. On this app it expanded the homepage HTML from about 31 KB to 275 KB and reduced the measured mobile Performance score from 83 to 76.
- Prefer `next/image` for static and remote images. Provide intrinsic dimensions or a stable aspect ratio, set an accurate `sizes` value for responsive images, and use the configured Next.js optimizer to serve modern formats where supported.
- Give only the measured above-the-fold LCP image high fetch priority; do not lazy-load it. Lazy-load below-the-fold images. For camera-generated data URLs, monitoring evidence, and other images the optimizer cannot transform, preserve their source format, provide dimensions, and use lazy loading and asynchronous decoding when off-screen. Prefer WebP capture when supported and retain the browser's safe fallback format.
- Keep the app's `next/font` self-hosted fonts. Limit font families, subsets, and preloads to actual page needs; retain `font-display: swap` or an equivalent visible fallback.
- Use Server Components by default and keep client boundaries narrow. Dynamically split a heavy client feature only when bundle or main-thread measurements show the active route is paying for code it does not use.
- Load non-critical third-party scripts with supported Next.js script strategies. Do not add unnecessary third-party requests, manually defer framework-owned scripts, or inline stylesheets/critical CSS without measurements showing that the supported Next.js pipeline needs it.
- Keep static assets cacheable and avoid duplicating large media in page markup or JSON. Never remove useful content or functionality merely to improve an audit score.
- Run the relevant tests, lint, and production build after changes. Re-audit affected routes at mobile and desktop sizes, compare the results, and fix attributable regressions before deployment.
