import React from "react";
import { Accordion, Chip } from "@dynatrace/strato-components/content";
import { SimpleTable } from "@dynatrace/strato-components/tables";
import { Heading, List, Paragraph, Strong } from "@dynatrace/strato-components/typography";
import { LAYERS, ROLLOUT, SCREEN_MAP, SECTIONS, type Field, type Metric, type ScreenMap, type Section, type Step } from "../data/integration-map";

const FIELD_COLUMNS = [
  { id: "field", header: "Field", accessor: "field", minWidth: 190 },
  { id: "type", header: "Type", accessor: "type", minWidth: 110 },
  { id: "example", header: "Example", accessor: "example", minWidth: 180 },
  { id: "producer", header: "Produced by", accessor: "producer", minWidth: 190 },
  { id: "usage", header: "Used in the app by", accessor: "usage", minWidth: 190 },
];

const METRIC_COLUMNS = [
  { id: "metric", header: "Metric / signal", accessor: "metric", minWidth: 230 },
  { id: "unit", header: "Unit", accessor: "unit", minWidth: 100 },
  { id: "dimensions", header: "Dimensions", accessor: "dimensions", minWidth: 180 },
  { id: "collection", header: "Collection → Dynatrace", accessor: "collection", minWidth: 230 },
  { id: "interval", header: "Interval", accessor: "interval", minWidth: 80 },
  { id: "usage", header: "Used in the app by", accessor: "usage", minWidth: 190 },
];

const SCREEN_COLUMNS = [
  { id: "element", header: "Screen element", accessor: "element", minWidth: 220 },
  { id: "data", header: "Data needed", accessor: "data", minWidth: 320 },
  { id: "source", header: "Source in Dynatrace", accessor: "source", minWidth: 260 },
];

const ROLLOUT_COLUMNS = [
  { id: "order", header: "#", accessor: "order", width: 40 },
  { id: "track", header: "Track", accessor: "track", width: 130 },
  { id: "delivery", header: "Delivery", accessor: "delivery", minWidth: 400 },
];

const VARIANT = { rowSeparation: "horizontalDividers", contained: true, rowDensity: "condensed" } as const;

const PRIORITY_COLOR: Record<Section["priority"], "success" | "primary" | "warning" | "neutral"> = {
  Business: "success",
  Integrations: "primary",
  Systems: "warning",
  Infrastructure: "neutral",
  Reference: "neutral",
};

export const DataIntegrations = () => (
  <div className="ff-about ff-data">
    <Heading level={2}>Data & integrations</Heading>
    <Paragraph>
      What must be connected for <Strong>Multi-lane Free Flow</Strong> to run on real plaza data instead of the simulator: every event, metric and
      registry, where it comes from, how it reaches Dynatrace and where it is used on screen. The order follows operational priority: business,
      integrations, systems and infrastructure.
    </Paragraph>

    <Heading level={4}>Path of the data</Heading>
    <div className="ff-layers">
      {LAYERS.map((l, i) => (
        <React.Fragment key={l.name}>
          <div className="ff-layer">
            <strong>{l.name}</strong>
            <span>{l.items}</span>
            <small>{l.collection}</small>
          </div>
          {i < LAYERS.length - 1 && (
            <span className="ff-layer-arrow" aria-hidden>
              →
            </span>
          )}
        </React.Fragment>
      ))}
    </div>

    <Heading level={4}>Conventions</Heading>
    <List>
      <li>
        Business Events with <code>event.provider = &quot;mlff&quot;</code> and <code>event.type</code> set to <code>mlff.transaction</code>,{" "}
        <code>mlff.charge</code> and <code>mlff.review</code>.
      </li>
      <li>
        Custom metrics prefixed <code>mlff.</code> with the common dimensions <code>gantry.id</code>, <code>direction</code> (INB/OUT), <code>lane</code>{" "}
        (1–4), <code>device.id</code> and <code>device.type</code>.
      </li>
      <li>
        <code>transaction.id</code> and <code>trace_id</code> are the keys that link transaction, charge, review and trace.
      </li>
      <li>The full plate is never stored: OpenPipeline keeps only the masked plate and a hash.</li>
    </List>

    <Heading level={4}>Fields and metrics by domain</Heading>
    <Accordion multiple defaultExpanded={["transaction"]}>
      {SECTIONS.map((s) => (
        <Accordion.Section key={s.id} id={s.id}>
          <Accordion.SectionLabel>
            <span className="ff-acc-label">
              <Chip size="condensed" color={PRIORITY_COLOR[s.priority]}>
                {s.priority}
              </Chip>
              {s.title}
            </span>
          </Accordion.SectionLabel>
          <Accordion.SectionContent>
            <div className="ff-acc-body">
              <Paragraph>{s.summary}</Paragraph>
              {s.fields && <SimpleTable<Field, string> data={s.fields} columns={FIELD_COLUMNS} variant={VARIANT} />}
              {s.metrics && <SimpleTable<Metric, string> data={s.metrics} columns={METRIC_COLUMNS} variant={VARIANT} />}
              {s.notes && (
                <List>
                  {s.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </List>
              )}
            </div>
          </Accordion.SectionContent>
        </Accordion.Section>
      ))}
    </Accordion>

    <Heading level={4}>What each screen element consumes</Heading>
    <SimpleTable<ScreenMap, string> data={SCREEN_MAP} columns={SCREEN_COLUMNS} variant={VARIANT} />

    <Heading level={4}>Rollout order</Heading>
    <SimpleTable<Step, string> data={ROLLOUT} columns={ROLLOUT_COLUMNS} variant={VARIANT} />
  </div>
);
