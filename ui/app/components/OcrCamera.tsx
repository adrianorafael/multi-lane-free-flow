import React, { useEffect, useRef, useState } from "react";
import { Select } from "@dynatrace/strato-components/forms";
import { DIR_CODE } from "../sim/model";
import { hash01 } from "../sim/rng";
import { fmtClockMs } from "../sim/time";
import type { Passage } from "../sim/types";
import { LEVEL_COLOR, METHOD_COLOR, METHOD_LEVEL, levelFor } from "../theme/colors";
import { useApp } from "../state/engine-context";
import { fmtDec } from "../format";
import { LicensePlate } from "./LicensePlate";
import { Panel } from "./Panel";

const LANES = ["All", ...["INB", "OUT"].flatMap((d) => [1, 2, 3, 4].map((l) => `${d} L${l}`))];
const MIN_GAP = 2400;

function resultText(p: Passage): string {
  const c = `${fmtDec(p.conf, 1)}%`;
  switch (p.method) {
    case "TAG":
      return `${p.issuer?.name ?? ""} tag read · plate cross-checked (${c})`;
    case "OCR":
      return `${c} · automatic OCR`;
    case "REVIEW":
      return `${c} · sent to human review`;
    default:
      return `${c} · no valid read`;
  }
}

const CONDITION_LABEL: Record<Passage["condition"], string> = {
  day: "Day",
  night: "Night · IR illuminator",
  fog: "Fog",
  ir: "Night · IR illuminator failed",
};

export const OcrCamera = () => {
  const { engine, prefs, setPrefs, select } = useApp();
  const [p, setP] = useState<Passage | null>(null);
  const last = useRef(0);
  const pinned = useRef(prefs.pinnedLane);
  pinned.current = prefs.pinnedLane;

  useEffect(
    () =>
      engine.on("crossing", (pass) => {
        const lane = `${DIR_CODE[pass.dir]} L${pass.lane}`;
        if (pinned.current !== "All" && lane !== pinned.current) return;
        const now = performance.now();
        if (now - last.current < MIN_GAP) return;
        last.current = now;
        setP(pass);
      }),
    [engine],
  );

  const chars = p ? p.plate.text.split("") : [];
  const masked = prefs.masked;
  const shown = chars.map((ch, i) => (masked && i >= chars.length - 2 ? "•" : ch));

  return (
    <Panel
      title="OCR view · LPR camera"
      source="ocr-engine images and confidence (edge DC) via Business Events + camera metrics via Extensions"
      right={
        <Select<string> value={prefs.pinnedLane} onChange={(v) => setPrefs({ pinnedLane: v ?? "All" })} aria-label="Pin camera">
          <Select.Content>
            {LANES.map((l) => (
              <Select.Option key={l} value={l}>
                {l === "All" ? "All lanes" : l}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      }
    >
      {!p ? (
        <div className="ff-cam-wait">Waiting for the next vehicle…</div>
      ) : (
        <div key={p.id} className="ff-cam">
          <button type="button" className={`ff-cam-img ff-cond-${p.condition}`} onClick={() => select({ type: "passage", id: p.id })}>
            <div className={`ff-cam-vehicle ff-kind-${p.cat.kind}`}>
              <div className="ff-cam-grill" />
              <div className="ff-cam-plate">
                <LicensePlate plate={p.plate} masked={masked} width={150} />
                <div className="ff-cam-box" style={{ borderColor: METHOD_COLOR[p.method] }}>
                  <span style={{ background: METHOD_COLOR[p.method] }}>{fmtDec(p.conf, 1)}%</span>
                </div>
              </div>
            </div>
            <div className="ff-cam-fog" />
            <div className="ff-cam-lines" />
            <div className="ff-cam-stamp">
              CAM-LPR-{DIR_CODE[p.dir]}-L{p.lane} · {fmtClockMs(p.t)}
            </div>
            <div className="ff-cam-cond">{CONDITION_LABEL[p.condition]}</div>
          </button>
          <div className="ff-cam-chars" aria-label="Decoded characters">
            {shown.map((ch, i) => {
              const cc = Math.min(99.9, Math.max(20, p.conf + (hash01(p.id, i) - 0.5) * 2 * (100 - p.conf) * 0.8));
              const lvl = levelFor(cc, 95, 85, true);
              return (
                <div key={i} className="ff-cam-char" style={{ animationDelay: `${300 + i * 40}ms` }}>
                  <span>{ch}</span>
                  <i style={{ width: `${cc}%`, background: LEVEL_COLOR[lvl] }} />
                </div>
              );
            })}
          </div>
          <div className="ff-cam-result" style={{ color: METHOD_LEVEL[p.method] === "critical" ? LEVEL_COLOR.critical : undefined }}>
            <span className="ff-dot" style={{ background: METHOD_COLOR[p.method] }} />
            {resultText(p)}
          </div>
        </div>
      )}
    </Panel>
  );
};
