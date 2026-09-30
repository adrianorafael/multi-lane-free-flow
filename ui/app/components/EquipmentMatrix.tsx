import React from "react";
import { HealthIndicator } from "@dynatrace/strato-components/content";
import { DIR_CODE, EQUIP, EQUIP_SHORT } from "../sim/model";
import { LEVEL_COLOR, LEVEL_TEXT, type Level } from "../theme/colors";
import { useApp, useSnapshot } from "../state/engine-context";
import { LevelIcon } from "./LevelIcon";
import { Panel } from "./Panel";

const HI: Record<Level, "ideal" | "warning" | "critical" | "neutral"> = {
  ok: "ideal",
  warning: "warning",
  critical: "critical",
  neutral: "neutral",
};
const LABEL: Record<Level, string> = { ok: "OK", warning: "Warning", critical: "Critical", neutral: "Neutral" };
const LANES: [number, number][] = [0, 1].flatMap((d) => [0, 1, 2, 3].map((l): [number, number] => [d, l]));

export const EquipmentMatrix = () => {
  const snap = useSnapshot();
  const { select } = useApp();
  return (
    <Panel
      title="Gantry health"
      source="Extensions (SNMP / vendor API) on gantry equipment + OneAgent on edge data center hosts"
      className="ff-matrix"
    >
      <table className="ff-matrix-table">
        <thead>
          <tr>
            <th />
            {EQUIP_SHORT.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LANES.map(([d, l]) => (
            <tr key={`${d}-${l}`}>
              <th>
                {DIR_CODE[d]} L{l + 1}
              </th>
              {[0, 1, 2, 3, 4].map((e) => {
                const lvl = snap.equipment[d][l][e];
                return (
                  <td key={e}>
                    <button
                      type="button"
                      className="ff-cell"
                      onClick={() => select({ type: "equip", dir: d, lane: l, equip: e })}
                      aria-label={`${EQUIP[e]} ${DIR_CODE[d]} L${l + 1}: ${LABEL[lvl]}`}
                    >
                      <HealthIndicator status={HI[lvl]} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ff-infra">
        {snap.infra.map((i) => (
          <button key={i.id} type="button" className="ff-infra-row" onClick={() => select({ type: "infra", id: i.id })}>
            <span>{i.label}</span>
            <span className="ff-pill" style={{ background: LEVEL_COLOR[i.level], color: LEVEL_TEXT[i.level] }}>
              <LevelIcon level={i.level} color={LEVEL_TEXT[i.level]} />
              {i.value}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
};
