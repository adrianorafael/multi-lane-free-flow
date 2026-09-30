# AI Coding Agent Instructions — Multi-lane Free Flow for Dynatrace

> **Keep `CLAUDE.md` next to this file.** It holds the Dynatrace App Toolkit's own guidance
> (Strato, SDKs, DQL, `dt-app-mcp`). This file is **additive**: it records what Dynatrace
> cannot know — this app's identity, scopes, traps and version discipline. Do not copy content
> between the two; a copy is a second source of truth that drifts.

## Follow the development pattern

This project is built under **[Development Pattern for Dynatrace](https://github.com/adrianorafael/development-pattern-for-Dynatrace)**.
Load that skill before writing, reviewing, running, deploying or publishing any code here.

Its twelve non-negotiable rules apply to every change in this repository, including
"tiny" ones:

1. Never publish a secret — no tokens, `.env`, tenant IDs or tenant URLs.
2. Never invent an API — verify against `node_modules/**/*.d.ts`, `dt-app-mcp`, or
   developer.dynatrace.com.
3. Strato only — no MUI, Tailwind, Recharts, Chart.js or D3.
4. Research the docs, depth-first, before writing a spec.
5. Spec before code, with an approval gate.
6. Every DQL is executed against a live tenant before it ships.
7. Every visualization is fed a verified data shape.
8. No monotonous screens — chart type follows the data's shape and question.
9. Review AI-written code like hostile code.
10. No AI co-authorship in commits, PRs, README or page.
11. Naming convention: `<App Name> for Dynatrace`.
12. Every publication bumps `app.version` (SemVer); every push that changes behaviour,
    setup or cost updates the README **and** the project page in the same commit.

## Project specifics

- **App id:** `my.multi.lane.free.flow` (keep the `my.` prefix — unsigned app)
- **App name (in-product):** `Multi-lane Free Flow` — public name: *Multi-lane Free Flow for Dynatrace*
- **Brand:** "Multi-lane Free Flow" is a **fictitious** toll operator. Never add a real company,
  real tag issuer, real regulator or real customer name — tag issuers are AlphaTag, BetaPass,
  GammaToll, DeltaMove and OmegaPay on purpose.
- **Grail tables used:** none. The app runs a deterministic simulator in the browser
  (`ui/app/sim/`). No DQL ships in this version.
- **Scopes:** none (`app.config.json` → `scopes: []`). Adding the first scope is a **MAJOR** bump.
- **Persistence:** browser `localStorage` only (key `multi-lane-free-flow.prefs`); no App State.
- **Auto-refresh:** not applicable — no queries. The simulator ticks locally at 60 fps.
- **Version:** `app.config.json` → `app.version` is the single source of truth; every
  release is recorded in `CHANGELOG.md`, and README + `docs/index.html` state the same version.

## Architecture in one paragraph

`sim/engine.ts` is a pure TypeScript engine (no React): Poisson arrivals per lane from
weekday traffic curves, identification by tag / OCR / human review, charging with issuer
latencies, queues, equipment state, a composite health index and scripted incident replays
at 100×. React reads a snapshot 4× per second (`useSyncExternalStore`); the gantry scene
and the pipeline particles are drawn **imperatively** from one shared `requestAnimationFrame`
(`state/engine-context.tsx`) — never re-render SVG vehicles through React per frame.

## Traps already hit in this repository

- `@dynatrace/strato-components-preview` is deprecated — import from
  `@dynatrace/strato-components/<subpath>`.
- `SimpleTable` takes **two** generic arguments: `SimpleTable<Row, string>`.
- `ToastContainer` must be rendered explicitly (`App.tsx`); `AppRoot` does not include it.
- `app.description` in `app.config.json` is limited to **80 characters** — the build fails otherwise.
- `PageLayout.Details` works when wrapped in a component (slots are portal-based).
- The calibration tests (`npm run test:sim`) pin a **local** weekday at 2 pm; the plaza clock
  follows the viewer's local time zone.
- `eslint-plugin-no-secrets` flags long high-entropy literals (e.g. an A–Z alphabet string);
  build such strings programmatically.

## Accepted deviations from the pattern (decided by the owner, 2026-09-30)

- **R3 §5 — hardcoded colors.** Status green / yellow / red, the fictitious brand palette and
  the illustrated scene use hex values instead of Strato design tokens. Intentional: the demo
  requires a specific monitoring palette and a brand identity; light / dark themes are handled
  by the scene palette in `theme/colors.ts` and by Strato tokens for all UI chrome.
- **R3 §5 — non-Strato interactive elements.** KPI tiles, transaction rows and matrix cells are
  native `<button>` elements; scene LEDs and pipeline nodes are clickable SVG groups (SVG has no
  Strato equivalent); the Intelligence drawer backdrop is a `div` whose click closes the drawer
  (Esc and the *Collapse* button provide accessible alternatives).
- **R11 — repository name.** The repository is `multi-lane-free-flow`, by the owner's choice;
  README H1, page title and app name follow the convention.
- **§6 — empty states** use plain text instead of `EmptyState`, by the owner's choice.

## Calibration contract

`npm run test:sim` must pass before every push. It asserts, for one simulated weekday hour
at 2 pm: automatic identification 97.6–99.2%, mean OCR confidence 98–99%, tag p95
10–13.5 s, plaza health 93–95, the health range of each scenario, and that the BetaPass
replay ends at 17,000 held messages, $29,600 delayed and 2h 51min.

## MCP servers — two of them, different jobs

| Server | Job | Without it |
| --- | --- | --- |
| `dt-app-mcp` | Strato components, SDK docs, DQL knowledge base, experience standards. No credentials. | Component lookups fall back to grepping `node_modules`. |
| `dynatrace-mcp` | Executes DQL against the tenant (`DT_ENVIRONMENT`, `DT_PLATFORM_TOKEN` from `.env`). | **R6 cannot be satisfied** for any future query. |

Both are declared in `.mcp.json` with environment-variable references only.

## Dynatrace knowledge: reference, never vendor

Dynatrace's own agent skills (https://github.com/Dynatrace/dynatrace-for-ai) are the
authority for DQL and Grail semantics. **Fetch the file you need at the moment you need
it.** Never commit one into this repository.

## Commands

```bash
npm install
npx dt-app dev        # local dev — open the printed link, NOT localhost:3000
npm run lint          # ESLint incl. security + no-secrets rules
npm run typecheck     # tsc --noEmit
npm run test:sim      # simulator calibration tests
npm run scan:secrets  # R1 secret scan of the working tree
npx dt-app deploy     # ONLY with explicit approval, and name the target tenant first
```
