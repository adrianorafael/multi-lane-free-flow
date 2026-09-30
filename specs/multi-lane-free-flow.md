# Spec — Multi-lane Free Flow (live gantry simulation)

**Status:** implemented
**Date:** 2026-09-30
**App:** `Multi-lane Free Flow for Dynatrace`
**Ships in version:** `0.1.0` — first release (pre-1.0: a demonstration app)
**Approval:** the owner approved this design as the plan of a private, localized version of the
same app on 2026-09-29, and requested this English, rebranded public edition on 2026-09-30.

---

## Goal

Let a presenter show, in motion, how a multi-lane free-flow toll gantry turns vehicle passages
into revenue — and how Dynatrace detects, explains and quantifies what goes wrong — without any
data in the environment.

## Non-goals

- Reading real tenant data (roadmap: a Grail data source, see *Data*).
- Writing anything to the tenant (no ingest, no App State, no documents).
- Representing any real operator, tag issuer, regulator or country-specific rule.

## Data

**Grail table(s):** none in this version. A deterministic simulator runs in the browser
(`ui/app/sim/engine.ts`): Poisson arrivals per lane from weekday traffic curves, identification
(tag / automatic OCR / human review / unread), charging with issuer latencies, queues, equipment
state, a composite health index and scripted incident replays at 100×.

**DQL:** none. A future Grail data source (Business Events `mlff.transaction`, `mlff.charge`,
`mlff.review`) is documented field by field in the *Data & integrations* tab; its queries must
be written, executed against real events and measured before they ship (R6).

## Scopes

| Scope | Justification |
| --- | --- |
| — | None. The app reads and writes nothing in the environment. |

Adding the first scope is a MAJOR bump — every user would re-consent.

## UI

**Routes:** `/` (Live), `/how-it-works`, `/data` (Data & integrations).

| Component | Subpath |
| --- | --- |
| `AppHeader`, `PageLayout` (+ `Details` overlay) | `@dynatrace/strato-components/layouts` |
| `Chip`, `HealthIndicator`, `AiResponse`, `AiLoadingIndicator`, `Accordion`, `KeyboardShortcut` | `@dynatrace/strato-components/content` |
| `Switch`, `ToggleButtonGroup`, `Select`, `TextInput` | `@dynatrace/strato-components/forms` |
| `Sheet`, `Modal`, `Tooltip` | `@dynatrace/strato-components/overlays` |
| `ToastContainer`, `showToast` | `@dynatrace/strato-components/notifications` |
| `SimpleTable` | `@dynatrace/strato-components/tables` |
| `Button` | `@dynatrace/strato-components/buttons` |
| `Heading`, `Paragraph`, `Text`, `List`, `ExternalLink` | `@dynatrace/strato-components/typography` |
| `AiIcon` and action icons | `@dynatrace/strato-icons` |
| `openDocument` | `@dynatrace-sdk/navigation` |

Layout sketch (Live):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AppHeader: Live | How it works | Data & integrations   [Simulation][1×4×10×]… │
├──────────────────────────────────────────────────────────────────────────┤
│ Brand │ Health │ Tx today │ Revenue │ Flow │ Ident │ OCR │ p95 │ Unread $/h │
├───────────────────────────────────────────────────┬──────────────────────┤
│ Gantry scene (SVG, imperative animation)          │ Gantry health matrix │
├──────────────┬────────────────────────────────────┴──────┬───────────────┤
│ OCR camera   │ Road to revenue (pipeline + particles)    │ Latest tx     │
└──────────────┴───────────────────────────────────────────┴───────────────┘
   Dynatrace Intelligence: collapsible drawer on the right edge (key I)
```

## Visualization

| Panel | Component | Why this one for this data |
| --- | --- | --- |
| Gantry scene | Custom SVG (imperative) | Spatial, per-vehicle, 60 fps — no chart component models vehicles in lanes |
| KPIs | Tiles + odometer + sparkline (SVG) | Headline numbers with a 15–60 min trend, colored by threshold |
| Pipeline | Custom SVG + particles | Flow through ordered stages with queue backlog; `NodeGraph` cannot animate particles |
| Gantry health | `HealthIndicator` matrix | 8 lanes × 5 devices, one state each |
| Latest transactions | Animated list | New rows slide in; `DataTable` does not animate rows |
| Journey | Waterfall bars | Trace-like sequential timing |
| Data & integrations | `Accordion` + `SimpleTable` | Reference documentation |

**Monotony test:** 7 distinct visualization types on the Live screen. Headline layer present: ✅

## Data contract

| Component | Expected shape | Verified in |
| --- | --- | --- |
| `SimpleTable` | `data: Row[]`, `columns: {id, header, accessor}[]`, two generics `<Row, Value>` | `tables/SimpleTable/public.api.d.ts` |
| `HealthIndicator` | `status: 'ideal' \| 'good' \| 'neutral' \| 'warning' \| 'critical'` | `content/health-indicator/health-indicator-types.d.ts` |
| `AiResponse` | `children: string`, `responseState: 'static' \| 'streaming' \| 'complete'` | `content/ai-response/AiResponse.d.ts` |
| `Chip` | `color`, `variant`, `size` | `content/chip/types/chip.d.ts` |

Simulator snapshot contract: `ui/app/sim/types.ts` → `Snapshot`, asserted by `npm run test:sim`.

## States

| View | Loading | Empty | Error |
| --- | --- | --- | --- |
| OCR camera | — | "Waiting for the next vehicle…" | — |
| Details panel | — | "This transaction is no longer in the recent history." | — |
| Dashboard link | — | Hidden when no document ID is set | — |

No network calls, so no loading or error states.

## Cost (DPS)

| | |
| --- | --- |
| Queries per app open | 0 |
| Auto-refresh | not applicable |
| Default timeframe | not applicable |
| Scanned bytes per run | 0 |
| Estimated GB/month | 0 |

## Security

- New secrets? None. `.env` holds only local MCP credentials and is gitignored.
- External calls? None (CSP `connect-src` is not needed).
- Data persisted? Browser `localStorage` preferences only.
- User input reaching DQL? None.
- Plates are fictitious and masked by default (last two digits).

## Evidence

| Claim | Source | Verified |
| --- | --- | --- |
| App deploy and dev commands | developer.dynatrace.com/quickstart/first-app-in-5-minutes, /develop/guides/deploy-your-app | ✅ |
| CSP: `connect-src` not configurable; no `unsafe-eval` | developer.dynatrace.com/develop/guides/security/configure-csp-rules | ✅ |
| Theme detection via `useCurrentTheme` | developer.dynatrace.com/develop/guides/support-dark-light-themes | ✅ |
| AI presence: "Dynatrace Intelligence" naming, chip and disclaimer | dt-app-mcp → get_experience_standard → `patterns/ai-presence` | ✅ |
| Status: color + shape + text | dt-app-mcp → get_experience_standard → `patterns/status-and-health` | ✅ |
| App name ≤ 40 characters, title case | dt-app-mcp → get_experience_standard → `patterns/app-naming-patterns` | ✅ |
| `openDocument(documentId)` | dt-app-mcp → get_sdk (@dynatrace-sdk/navigation 2.2.0) | ✅ |
| `app.description` ≤ 80 characters | `dt-app build` validation error | ✅ |

## Docs impact (R12)

| Target | Change needed |
| --- | --- |
| `README.md` | Full house-standard README for 0.1.0, install guide, screenshots and animated preview |
| `docs/index.html` | Project page mirroring the README |
| `CHANGELOG.md` | `[0.1.0]` entry |

## Open questions

1. When should the Grail data source be built, and against which operator's real events?
