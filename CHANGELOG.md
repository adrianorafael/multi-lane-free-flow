# Changelog

All notable changes to **Multi-lane Free Flow for Dynatrace** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/), where "breaking" means breaking for
the person running the app — see
`references/release-and-docs-sync.md` in
[Development Pattern for Dynatrace](https://github.com/adrianorafael/development-pattern-for-Dynatrace).

The version here must match `app.config.json` → `app.version`, which is the single source
of truth.

## [Unreleased]

## [0.1.0] - 2026-09-30

### Added
- First release of the demonstration app, for a fictitious toll operator (*Multi-lane Free Flow*).
- **Live** view: animated gantry scene with 2 directions × 4 lanes, where every vehicle is one
  simulated transaction; identification shown as a colored halo and a badge (tag, automatic OCR,
  human review, unread); day / night lighting, fog and IR illuminator cones.
- KPI ribbon with rolling counters: plaza health, transactions and revenue today, flow vs
  expected, automatic identification, OCR confidence, passage-to-charge p95 and revenue
  without automatic identification.
- OCR camera view with per-character confidence, a trace-like transaction journey, the
  "road to revenue" pipeline with queue tanks and partner health, gantry health matrix,
  latest transactions with coins flying to the revenue KPI.
- Pipeline **Zoom**: opens the road-to-revenue diagram in a large modal with its own live animation.
- The *Revenue without automatic ID* KPI is a loss metric and is never shown in green (neutral, then yellow / red).
- Collapsible **Dynatrace Intelligence** panel with scripted, clearly labelled root-cause
  cards, a GPU overheating forecast, toasts and the AI disclaimer.
- Six presenter scenarios replayed at 100× (holiday exodus, fog, IR illuminator failure,
  tag issuer timeouts, fiber cut, OCR GPU throttling), presenter panel, keyboard shortcuts,
  5-minute automatic tour, TV mode, "Dynatrace sources" overlay and a demo summary.
- **How it works** and **Data & integrations** tabs; the latter maps every field and metric
  needed to run the app on real data.
- README step-by-step install guide; project page with screenshots and an animated preview.

### Cost
- No DQL queries, no app functions and no OAuth scopes: this version generates **no Grail
  query consumption**.
