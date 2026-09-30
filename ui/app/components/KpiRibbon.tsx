import React from "react";
import { useCurrentTheme } from "@dynatrace/strato-components/core";
import { GANTRY_ID, GANTRY_NAME } from "../sim/model";
import type { SparkKey } from "../sim/types";
import { BRAND, LEVEL_COLOR, LEVEL_TEXT, type Level } from "../theme/colors";
import { useApp, useSnapshot } from "../state/engine-context";
import { fmtDec, fmtInt, fmtMoney, fmtMoneyShort, fmtPct, fmtSeconds } from "../format";
import { SourceTag } from "./SourceTag";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Counter that rolls digit by digit. */
export const Odometer = ({ text }: { text: string }) => {
  const chars = text.split("");
  return (
    <span className="ff-odo" aria-label={text}>
      {chars.map((ch, i) => {
        const key = chars.length - i;
        if (!/\d/.test(ch))
          return (
            <span key={key} className="ff-odo-sep" aria-hidden>
              {ch}
            </span>
          );
        return (
          <span key={key} className="ff-odo-digit" aria-hidden>
            <span className="ff-odo-strip" style={{ transform: `translateY(-${Number(ch) * 10}%)` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

export const Sparkline = ({ data, color, width = 110, height = 26 }: { data: number[]; color: string; width?: number; height?: number }) => {
  const pts = data.slice(-30);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts
    .map((v, i) => `${((i / (pts.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="ff-spark" aria-hidden>
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
};

interface Tile {
  key: SparkKey;
  label: string;
  value: React.ReactNode;
  sub: string;
  level?: Level;
  id?: string;
}

export const KpiRibbon = () => {
  const snap = useSnapshot();
  const { select, prefs } = useApp();
  const theme = useCurrentTheme();
  const k = snap.kpi;
  const L = snap.kpiLevel;
  const tiles: Tile[] = [
    { key: "health", label: "Plaza health", value: fmtInt(k.health), sub: "0–100 index", level: L.health },
    { key: "tx", label: "Transactions today", value: <Odometer text={fmtInt(k.txToday)} />, sub: "since midnight" },
    {
      key: "revenue",
      label: "Revenue billed today",
      value: <Odometer text={fmtMoneyShort(k.revenueToday)} />,
      sub: `settled: ${fmtMoneyShort(k.settledToday)}`,
      id: "kpi-revenue",
    },
    { key: "flowPerMin", label: "Flow now", value: `${fmtInt(k.flowPerMin)}/min`, sub: `${fmtInt(k.flowPct)}% of expected`, level: L.flow },
    { key: "ident", label: "Automatic identification", value: fmtPct(k.ident, 2), sub: "tag + OCR", level: L.ident },
    { key: "conf", label: "OCR confidence", value: fmtPct(k.conf, 1), sub: "mean of reads", level: L.conf },
    { key: "p95", label: "Passage → charge", value: fmtSeconds(k.p95), sub: "p95 · settled tag", level: L.p95 },
    { key: "unreadPerHour", label: "Revenue without automatic ID", value: fmtMoney(k.unreadPerHour, 0), sub: "hourly rate", level: L.unread },
  ];
  return (
    <div className={`ff-kpis ${prefs.tv ? "ff-kpis-tv" : ""}`}>
      <div className="ff-brand">
        <img src={theme === "dark" ? "./assets/logo-mlff-white.svg" : "./assets/logo-mlff.svg"} alt="Multi-lane Free Flow" className="ff-brand-logo" />
        <div className="ff-brand-text">
          <strong>
            Gantry {GANTRY_ID} · {GANTRY_NAME}
          </strong>
          <span>
            2 directions × 4 lanes · {fmtDec(snap.speed, 0)}× {snap.paused ? "· paused" : ""}
          </span>
        </div>
      </div>
      {tiles.map((t) => {
        const bg = t.level ? LEVEL_COLOR[t.level] : undefined;
        const fg = t.level ? LEVEL_TEXT[t.level] : undefined;
        return (
          <button
            key={t.key}
            id={t.id}
            type="button"
            className={`ff-kpi ${t.level ? "ff-kpi-status" : ""}`}
            style={{ background: bg, color: fg }}
            onClick={() => select({ type: "kpi", key: t.key })}
            aria-label={`${t.label}: ${typeof t.value === "string" ? t.value : ""} ${t.level ? `(${t.level})` : ""}`}
          >
            <span className="ff-kpi-label">{t.label}</span>
            <span className="ff-kpi-value">{t.value}</span>
            <span className="ff-kpi-foot">
              <span className="ff-kpi-sub">{t.sub}</span>
              <Sparkline data={snap.spark[t.key]} color={t.level ? (fg ?? "#FFFFFF") : BRAND.teal} width={70} height={20} />
            </span>
          </button>
        );
      })}
      <SourceTag text="Transaction Business Events (OpenPipeline) + DQL; health composed from SLOs for identification, queues, partners and infrastructure" />
    </div>
  );
};
