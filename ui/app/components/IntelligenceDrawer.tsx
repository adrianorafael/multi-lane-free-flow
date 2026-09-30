import React from "react";
import { AiIcon } from "@dynatrace/strato-icons";
import { useApp, useSnapshot } from "../state/engine-context";
import { IntelligencePanel, useProblemToasts } from "./IntelligencePanel";

/** Collapsible Dynatrace Intelligence on the right edge: starts closed and opens over the screen (key I). */
export const IntelligenceDrawer = () => {
  const { ui, setUi } = useApp();
  const snap = useSnapshot();
  useProblemToasts(snap.problems);
  const active = snap.problems.filter((p) => p.status === "Active").length;
  const forecasts = snap.problems.filter((p) => p.status === "Forecast").length;
  const badge = active || forecasts;
  const tone = active ? "critical" : forecasts ? "warning" : "ok";
  return (
    <>
      <button
        type="button"
        className={`ff-intel-tab ff-intel-tab-${tone} ${ui.intel ? "ff-intel-tab-hidden" : ""}`}
        onClick={() => setUi({ intel: true })}
        aria-expanded={ui.intel}
        aria-label={`Open Dynatrace Intelligence: ${active} active problem(s), ${forecasts} forecast(s)`}
      >
        <AiIcon />
        <span className="ff-intel-tab-text">Dynatrace Intelligence</span>
        {badge > 0 && <span className="ff-intel-badge">{badge}</span>}
      </button>
      {ui.intel && (
        <>
          <div className="ff-intel-backdrop" onClick={() => setUi({ intel: false })} aria-hidden />
          <aside className="ff-intel-drawer" aria-label="Dynatrace Intelligence">
            <IntelligencePanel onClose={() => setUi({ intel: false })} />
          </aside>
        </>
      )}
    </>
  );
};
