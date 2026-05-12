# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the application and CMS code. Key areas are `src/app/` for Next.js routes and API handlers, `src/collections/` and `src/globals/` for Payload config, `src/components/` for admin and frontend UI, `src/services/` for writing and integration flows, and `src/utilities/` for shared helpers. `scripts/` holds seeders and operational tasks such as `pipeline-article-quality-smoke.ts`. Tests live in `tests/unit/`, `tests/int/`, and `tests/e2e/`. Static assets are under `public/`, and Cloudflare/Payload generated artifacts include `cloudflare-env.d.ts` and `src/payload-types.ts`.

## Build, Test, and Development Commands
Use `pnpm dev` for local development on `http://localhost:3000`. Use `pnpm devsafe` if `.next` or `.open-next` state is stale. Run `pnpm build` for a production build and `pnpm preview` for the OpenNext Cloudflare preview. Run `pnpm test:int` for Vitest integration and unit suites, `pnpm test:e2e` for Playwright, and `pnpm test` for both. Useful project-specific tasks include `pnpm seed:dev` to load demo data and `pnpm pipeline:smoke-article` to exercise the article pipeline end to end.

## Coding Style & Naming Conventions
This repo uses TypeScript, ESM, and 2-space indentation. Prefer named exports and colocate domain logic with its feature area. React components use `PascalCase.tsx`; helpers use `camelCase.ts`; tests use `*.spec.ts` or `*.int.spec.ts`. Follow the existing alias style such as `@/utilities/...`. Linting is via `pnpm lint` with `next/core-web-vitals` and `next/typescript`; `any` is tolerated only when justified and should stay narrow.

## Testing Guidelines
Vitest runs in `jsdom` and includes `tests/unit/**/*.spec.ts` plus `tests/int/**/*.int.spec.ts`. Playwright tests live in `tests/e2e/` and reuse an existing `pnpm dev` server when possible. Add or update focused tests for any change touching pipeline logic, Payload hooks, or frontend rendering. For content pipeline work, pair unit coverage with a smoke run such as `pnpm pipeline:smoke-article`.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits with scopes, for example `feat(seo): ...`, `fix(migrations): ...`, and `docs(cloudflare): ...`. Keep commits focused and use the smallest meaningful scope. Pull requests should include a short problem statement, the concrete change, test coverage notes, and screenshots for admin or frontend UI changes. Mention schema, migration, or seed impacts explicitly.

## Security & Configuration Tips
Secrets are loaded from local env files such as `.env.local` and `.dev.vars`; do not hardcode credentials. `PAYLOAD_SECRET` is required for many scripts. Local D1 state lives under `.wrangler/state/`; treat it as disposable runtime data, not source.

## Business Context & SEO Strategy
This project supports Amazon affiliate SEO sites. The business goal is to acquire Google organic search traffic and convert visitors through Amazon Associates links, not to promote an owned product brand. Treat SEO decisions through the lens of affiliate revenue potential, topical authority, indexing, rankings, clicks, and commission conversion.

Keyword and content strategy should prioritize:

- Primary money keywords: buying-intent terms such as `best`, `review`, `vs`, `alternative`, `worth it`, `under $X`, and `for [use case]`.
- High-value category keywords: product categories with stronger estimated affiliate value, based on maintained category rules such as commission tier, estimated average order value, and commercial relevance. Do not assume true commission level from a keyword string alone.
- Quick-win commercial keywords: lower-difficulty commercial or transactional terms with enough volume and clear Amazon monetization fit.
- Support and GEO keywords: informational, comparison-framework, FAQ, and definition content that builds topical authority and internally links to money pages. GEO is an auxiliary strategy for AI Overview / AI citation visibility, not the main revenue engine.
- Refresh keywords: existing pages with rankings or impressions that need title, content, product, internal-link, or freshness updates.

For a new or unproven site, do not judge SEO viability from a small sample or short time window. A practical first validation batch is about 60 articles over roughly 90 days; a more reliable commercial read usually needs 100+ articles and up to 180 days. Evaluate progress by crawlability, indexing, Search Console impressions, ranking ranges, clicks, and affiliate conversion rather than by publication count alone.

When adding or changing pipeline profiles, keyword presets, prompt templates, or admin labels, make the recommended keyword strategy explicit in names and descriptions so non-technical operators can choose the correct flow. Main affiliate revenue pages should generally pair buying-intent or quick-win strategies with the `发布质量 80+` pipeline; GEO/support content should support internal linking and authority rather than replace money-page production.
