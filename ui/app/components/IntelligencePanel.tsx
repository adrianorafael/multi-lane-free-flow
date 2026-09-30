import React, { useEffect, useRef, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { AiLoadingIndicator, AiResponse, Chip } from "@dynatrace/strato-components/content";
import { showToast } from "@dynatrace/strato-components/notifications";
import { ExternalLink, Text } from "@dynatrace/strato-components/typography";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { AiIcon } from "@dynatrace/strato-icons";
import type { ProblemView } from "../sim/types";
import type { Level } from "../theme/colors";
import { useApp, useSnapshot } from "../state/engine-context";
import { StatusPill } from "./PassageFeed";
import { Panel } from "./Panel";

const STATUS_LEVEL: Record<ProblemView["status"], Level> = {
  Active: "critical",
  Forecast: "warning",
  Resolved: "ok",
  Informational: "neutral",
};

function levelOf(p: ProblemView): Level {
  if (p.status === "Active") return p.severity === "critical" ? "critical" : "warning";
  return STATUS_LEVEL[p.status];
}

/** Intelligence explanation: "Analyzing..." then streamed text (scripted in this simulation). */
const Explanation = ({ id, text }: { id: string; text: string }) => {
  const [stage, setStage] = useState<"loading" | "streaming" | "done">("loading");
  useEffect(() => {
    setStage("loading");
    const a = window.setTimeout(() => setStage("streaming"), 1500);
    const b = window.setTimeout(() => setStage("done"), 9000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [id]);
  if (stage === "loading") return <AiLoadingIndicator>Analyzing...</AiLoadingIndicator>;
  return <AiResponse responseState={stage === "streaming" ? "streaming" : "complete"}>{text}</AiResponse>;
};

const Card = ({ p, expanded }: { p: ProblemView; expanded: boolean }) => {
  const { engine } = useApp();
  const lvl = levelOf(p);
  return (
    <article className={`ff-card ff-card-${lvl}`}>
      <div className="ff-card-top">
        <StatusPill level={lvl} text={p.status} />
        <Tooltip text="AI-powered feature (Dynatrace Intelligence)">
          <Chip size="condensed" color="primary">
            <Chip.Prefix>
              <AiIcon />
            </Chip.Prefix>
            Intelligence
          </Chip>
        </Tooltip>
        <Chip size="condensed" color="neutral">
          Simulation
        </Chip>
        {p.accelerated && (
          <Chip size="condensed" color="warning">
            replay 100×
          </Chip>
        )}
      </div>
      <strong className="ff-card-title">{p.title}</strong>
      <div className="ff-card-meta">
        Started {p.start} · {p.duration}
        {p.mttdMin !== undefined && <> · detected in {p.mttdMin} min</>}
      </div>
      <div className="ff-card-ents">
        {p.entities.map((e) => (
          <button key={e.id} type="button" className="ff-ent" onClick={() => engine.highlight(e.id)}>
            {e.label}
          </button>
        ))}
      </div>
      {expanded && (
        <>
          <div className="ff-card-sec">
            <span className="ff-card-k">Root cause</span>
            {p.rootCause}
          </div>
          {p.impacts.length > 0 && (
            <div className="ff-card-impacts">
              {p.impacts.map((i) => (
                <div key={i.label} className="ff-impact">
                  <span className="ff-impact-v">{i.value}</span>
                  <span className="ff-impact-l">
                    {i.label}
                    {i.note && <b> · {i.note}</b>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="ff-card-sec">
            <span className="ff-card-k">Recommended action</span>
            {p.action}
          </div>
          <div className="ff-card-ai">
            <Explanation id={p.id} text={p.explanation} />
          </div>
        </>
      )}
      {!expanded && p.impacts.length > 0 && (
        <div className="ff-card-meta">{p.impacts.map((i) => `${i.label}: ${i.value}${i.note ? ` (${i.note})` : ""}`).join(" · ")}</div>
      )}
    </article>
  );
};

/** A toast for every new problem (lives in the drawer, which is always mounted). */
export function useProblemToasts(problems: ProblemView[]): void {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const p of problems) {
      if (p.status !== "Active" || seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      showToast({
        type: p.severity === "critical" ? "critical" : "warning",
        title: `Dynatrace Intelligence: ${p.title}`,
        message: `Detected in ${p.mttdMin ?? 0} min · root cause identified`,
        lifespan: 5000,
      });
    }
  }, [problems]);
}

export const IntelligencePanel = ({ onClose }: { onClose?: () => void }) => {
  const snap = useSnapshot();
  const firstExpanded = snap.problems.findIndex((p) => p.status !== "Resolved");
  return (
    <Panel
      title="Dynatrace Intelligence"
      source="Causal and predictive AI from Dynatrace Intelligence over traces, metrics, logs and events correlated by topology"
      className="ff-intel"
      right={
        onClose && (
          <Button size="condensed" onClick={onClose} aria-label="Collapse Dynatrace Intelligence">
            Collapse
          </Button>
        )
      }
    >
      <div className="ff-cards">
        {snap.problems.map((p, i) => (
          <Card key={p.id} p={p} expanded={i === firstExpanded || (p.status === "Active" && i < 2)} />
        ))}
      </div>
      <Text className="ff-disclaimer">
        <ExternalLink href="https://docs.dynatrace.com/docs/dynatrace-intelligence">Dynatrace Intelligence</ExternalLink> uses AI. Always verify
        important information and decisions. In this demonstration, the analyses are simulated.
      </Text>
    </Panel>
  );
};
