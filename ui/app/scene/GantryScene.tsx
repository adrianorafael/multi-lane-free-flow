import React, { useCallback, useEffect, useRef } from "react";
import { useCurrentTheme } from "@dynatrace/strato-components/core";
import { EQUIP, DIR_CODE, GANTRY_ID } from "../sim/model";
import { SCENE_H, SCENE_W, GANTRY_X } from "../sim/engine";
import { fmtClock } from "../sim/time";
import { BRAND, LEVEL_COLOR, METHOD_COLOR, SCENE, STATUS, type Level } from "../theme/colors";
import { useApp, useFrame, useSnapshot } from "../state/engine-context";
import { usePrefersReducedMotion } from "../state/use-reduced-motion";
import { fmtInt } from "../format";
import { INB_TOP, LANE_H, OUT_BOTTOM, OUT_TOP, MEDIAN_TOP, laneCenterY, laneTop, ledPos } from "./geometry";
import { VehicleRenderer } from "./vehicle-renderer";

function nightAlpha(h: number): number {
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 19.5) return ((h - 17.5) / 2) * 0.5;
  if (h >= 19.5 || h < 5) return 0.5;
  return ((7 - h) / 2) * 0.5;
}

/** Status shape: circle (ok), triangle (warning), diamond (critical) — never color alone. */
export function LevelShape({ x, y, level, size = 3.4 }: { x: number; y: number; level: Level; size?: number }) {
  const c = LEVEL_COLOR[level];
  if (level === "warning")
    return <path d={`M${x},${y - size * 1.2} L${x + size * 1.2},${y + size} L${x - size * 1.2},${y + size} Z`} fill={c} className="ff-blink-warn" />;
  if (level === "critical")
    return <path d={`M${x},${y - size * 1.4} L${x + size * 1.4},${y} L${x},${y + size * 1.4} L${x - size * 1.4},${y} Z`} fill={c} className="ff-blink-crit" />;
  return <circle cx={x} cy={y} r={size} fill={c} />;
}

const TREES_MEDIAN = Array.from({ length: 23 }, (_, i) => ({ x: 20 + i * 70 + ((i * 37) % 23), r: 8 + ((i * 13) % 6) }));
const BUSHES_TOP = Array.from({ length: 16 }, (_, i) => ({ x: 560 + i * 62 + ((i * 29) % 17), r: 6 + ((i * 7) % 5) }));

export const GantryScene = () => {
  const { engine, select } = useApp();
  const snap = useSnapshot();
  const theme = useCurrentTheme();
  const pal = SCENE[theme === "dark" ? "dark" : "light"];
  const reduced = usePrefersReducedMotion();

  const bodies = useRef<SVGGElement>(null);
  const lights = useRef<SVGGElement>(null);
  const effects = useRef<SVGGElement>(null);
  const badges = useRef<SVGGElement>(null);
  const renderer = useRef<VehicleRenderer | null>(null);
  const nightRef = useRef(false);
  const reducedRef = useRef(false);
  nightRef.current = snap.night;
  reducedRef.current = reduced;

  useEffect(() => {
    if (bodies.current && lights.current && effects.current && badges.current) {
      renderer.current = new VehicleRenderer(bodies.current, lights.current, effects.current, badges.current);
    }
  }, []);

  const onFrame = useCallback((now: number) => renderer.current?.render(engine, now, nightRef.current, reducedRef.current), [engine]);
  useFrame(onFrame);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = (e.target as Element).closest("[data-vid]");
    if (!target) return;
    const id = Number(target.getAttribute("data-vid"));
    for (const d of engine.lanes)
      for (const l of d)
        for (const v of l) if (v.id === id && v.passage) select({ type: "passage", id: v.passage.id });
  };

  const fiberDown = snap.infra.find((i) => i.id === "fiber")?.level === "critical";
  const gpuLevel = snap.infra.find((i) => i.id === "gpu")?.level ?? "ok";
  const fogOpacity = Math.max(0, Math.min(1, (2000 - snap.visibility) / 1900)) * 0.78;
  const nightA = nightAlpha(snap.hour);
  const hl = snap.highlight;
  const period = snap.night ? "Night" : snap.hour < 7 || snap.hour > 17.5 ? "Twilight" : "Day";

  return (
    <svg
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      className="ff-scene"
      role="img"
      aria-label={`Gantry ${GANTRY_ID} scene: ${snap.inScene} vehicles in view`}
      onClick={onClick}
    >
      <defs>
        <linearGradient id="ff-headlight" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#FFF6C8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFF6C8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ff-ir-l" x1="1" x2="0" y1="0" y2="0">
          <stop offset="0" stopColor="#FF4D4D" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FF4D4D" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ff-ir-r" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#FF4D4D" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FF4D4D" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ff-fog">
          <stop offset="0" stopColor="#F2F4F5" stopOpacity="0.95" />
          <stop offset="1" stopColor="#F2F4F5" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ground */}
      <rect width={SCENE_W} height={SCENE_H} fill={pal.verge} />
      {BUSHES_TOP.map((b, i) => (
        <circle key={i} cx={b.x} cy={30 + (i % 3) * 6} r={b.r} fill={pal.vergeDetail} />
      ))}
      <rect x={0} y={INB_TOP} width={SCENE_W} height={MEDIAN_TOP - INB_TOP} fill={pal.asphalt} />
      <rect x={0} y={OUT_TOP} width={SCENE_W} height={OUT_BOTTOM - OUT_TOP} fill={pal.asphalt} />
      <rect x={0} y={MEDIAN_TOP} width={SCENE_W} height={OUT_TOP - MEDIAN_TOP} fill={pal.median} />
      {TREES_MEDIAN.map((t, i) => (
        <circle key={i} cx={t.x} cy={276 + ((i % 2) * 2 - 1) * 4} r={t.r} fill={pal.vergeDetail} />
      ))}
      {[INB_TOP + 2, MEDIAN_TOP - 2, OUT_TOP + 2, OUT_BOTTOM - 2].map((y) => (
        <line key={y} x1={0} x2={SCENE_W} y1={y} y2={y} stroke={pal.lane} strokeWidth={2} opacity={0.8} />
      ))}
      {[1, 2, 3].flatMap((i) =>
        [INB_TOP + i * LANE_H, OUT_TOP + i * LANE_H].map((y) => (
          <line key={`${i}-${y}`} x1={0} x2={SCENE_W} y1={y} y2={y} stroke={pal.lane} strokeWidth={2} strokeDasharray="26 22" opacity={0.55} />
        )),
      )}
      {[0, 1].flatMap((d) =>
        [0, 1, 2, 3].map((l) => (
          <text key={`lbl-${d}-${l}`} x={10} y={laneCenterY(d, l) + 4} fontSize={11} fill={pal.lane} opacity={0.6}>
            L{l + 1}
          </text>
        )),
      )}

      {/* vehicles (imperative) */}
      <g ref={bodies} />

      <rect width={SCENE_W} height={SCENE_H} fill="#061226" opacity={nightA} className="ff-fade" pointerEvents="none" />
      <g ref={lights} pointerEvents="none" />

      {/* IR illuminator cones at night */}
      {snap.night &&
        [0, 1].flatMap((d) =>
          [0, 1, 2, 3].map((l) => {
            if (snap.equipment[d][l][2] === "critical") return null;
            const y = laneCenterY(d, l);
            const x0 = d === 1 ? GANTRY_X - 8 : GANTRY_X + 8;
            const x1 = d === 1 ? GANTRY_X - 120 : GANTRY_X + 120;
            return (
              <polygon
                key={`ir-${d}-${l}`}
                points={`${x0},${y - 6} ${x0},${y + 6} ${x1},${y + 22} ${x1},${y - 22}`}
                fill={d === 1 ? "url(#ff-ir-l)" : "url(#ff-ir-r)"}
                pointerEvents="none"
              />
            );
          }),
        )}

      {/* fog */}
      <g opacity={fogOpacity} className="ff-fade" pointerEvents="none">
        <g className="ff-fog-a">
          <ellipse cx={300} cy={180} rx={420} ry={170} fill="url(#ff-fog)" />
          <ellipse cx={1150} cy={380} rx={480} ry={180} fill="url(#ff-fog)" />
        </g>
        <g className="ff-fog-b">
          <ellipse cx={750} cy={260} rx={520} ry={200} fill="url(#ff-fog)" />
          <ellipse cx={1500} cy={140} rx={380} ry={150} fill="url(#ff-fog)" />
          <ellipse cx={80} cy={430} rx={360} ry={140} fill="url(#ff-fog)" />
        </g>
      </g>

      {/* gantry */}
      <rect x={GANTRY_X - 12} y={46} width={32} height={470} fill={pal.gantryShadow} />
      <rect x={GANTRY_X - 16} y={40} width={32} height={472} rx={4} fill={pal.gantry} stroke="rgba(0,0,0,0.25)" />
      <rect x={GANTRY_X - 24} y={36} width={48} height={12} rx={3} fill={pal.gantry} stroke="rgba(0,0,0,0.3)" />
      <rect x={GANTRY_X - 24} y={504} width={48} height={12} rx={3} fill={pal.gantry} stroke="rgba(0,0,0,0.3)" />
      {[0, 1].flatMap((d) =>
        [0, 1, 2, 3].map((l) => (
          <g key={`eq-${d}-${l}`}>
            <rect x={GANTRY_X - 11} y={laneTop(d, l) + 3} width={22} height={LANE_H - 6} rx={4} fill="#262C32" />
            {[0, 1, 2, 3, 4].map((e) => {
              const p = ledPos(d, l, e);
              const level = snap.equipment[d][l][e];
              return (
                <g
                  key={e}
                  className="ff-clickable"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    select({ type: "equip", dir: d, lane: l, equip: e });
                  }}
                >
                  <title>{`${EQUIP[e]} · ${DIR_CODE[d]} L${l + 1}`}</title>
                  <rect x={p.x - 9} y={p.y - 4} width={18} height={8} fill="transparent" />
                  <LevelShape x={p.x} y={p.y} level={level} size={2.6} />
                </g>
              );
            })}
          </g>
        )),
      )}
      <text x={GANTRY_X} y={24} textAnchor="middle" fontSize={13} fontWeight={700} fill={pal.label}>
        Gantry {GANTRY_ID} · km 38
      </text>

      {/* cabinet, fiber, radio and edge data center */}
      <g className="ff-clickable" onClick={() => select({ type: "infra", id: "cabinet" })}>
        <rect x={GANTRY_X + 22} y={506} width={46} height={34} rx={4} fill={pal.building} stroke="rgba(0,0,0,0.35)" />
        <rect x={GANTRY_X + 28} y={512} width={34} height={5} rx={1} fill="#39424B" />
        <rect x={GANTRY_X + 28} y={520} width={34} height={5} rx={1} fill="#39424B" />
        <circle cx={GANTRY_X + 60} cy={533} r={2.4} fill={fiberDown ? STATUS.warning : STATUS.ok} />
        <text x={GANTRY_X + 45} y={553} textAnchor="middle" fontSize={10} fill={pal.label}>
          Cabinet
        </text>
      </g>
      <path
        d={`M${GANTRY_X + 68},523 L1380,523`}
        stroke={fiberDown ? STATUS.critical : BRAND.teal}
        strokeWidth={3}
        strokeDasharray={fiberDown ? "10 8" : "6 6"}
        className={fiberDown ? undefined : "ff-flow"}
        fill="none"
      />
      {fiberDown && (
        <g>
          <path d="M1080,513 L1096,533 M1096,513 L1080,533" stroke={STATUS.critical} strokeWidth={3.5} />
          <path d={`M${GANTRY_X + 68},512 Q990,462 1150,500 Q1270,462 1380,510`} stroke={STATUS.warning} strokeWidth={2.5} strokeDasharray="5 6" className="ff-flow" fill="none" />
        </g>
      )}
      <text x={1010} y={546} textAnchor="middle" fontSize={10} fill={pal.label}>
        {fiberDown ? "10G fiber cut · radio took over" : "10G fiber · gantry → edge DC"}
      </text>
      <g className="ff-clickable" onClick={() => select({ type: "infra", id: "radio" })}>
        <path d="M1150,540 L1158,504 L1166,540 M1152,528 L1164,528 M1154,516 L1162,516" stroke={pal.label} strokeWidth={1.6} fill="none" />
        <circle cx={1158} cy={502} r={3} fill={fiberDown ? STATUS.warning : STATUS.ok} />
        <text x={1178} y={512} fontSize={10} fill={pal.label}>
          Radio km 33
        </text>
      </g>
      <g className="ff-clickable" onClick={() => select({ type: "infra", id: "gpu" })}>
        <rect x={1380} y={502} width={210} height={50} rx={6} fill={pal.building} stroke="rgba(0,0,0,0.35)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={1392 + i * 26} y={509} width={20} height={36} rx={2} fill="#2A3138" />
            {[0, 1, 2].map((j) => (
              <circle
                key={j}
                cx={1397 + i * 26 + j * 5}
                cy={515}
                r={1.5}
                fill={i === 2 ? LEVEL_COLOR[gpuLevel] : STATUS.ok}
                className={i === 2 && gpuLevel !== "ok" ? "ff-blink-warn" : undefined}
              />
            ))}
          </g>
        ))}
        <text x={1530} y={522} textAnchor="middle" fontSize={11} fontWeight={700} fill={pal.label}>
          Edge DC
        </text>
        <text x={1530} y={537} textAnchor="middle" fontSize={10} fill={pal.label}>
          OCR GPU
        </text>
      </g>

      <g ref={effects} pointerEvents="none" />
      <g ref={badges} pointerEvents="none" />

      {/* HUD */}
      <g pointerEvents="none">
        <text x={16} y={22} fontSize={13} fontWeight={700} fill={pal.label}>
          {fmtClock(snap.simTime)} local · {period}
        </text>
        <text x={16} y={40} fontSize={11} fill={snap.visibility < 1000 ? STATUS.critical : pal.label} fontWeight={snap.visibility < 1000 ? 700 : 400}>
          Weather station km 42 · visibility {fmtInt(snap.visibility)} m
        </text>
        <text x={300} y={50} fontSize={12} fontWeight={600} fill={pal.label}>
          ← Inbound (to city)
        </text>
        <text x={300} y={522} fontSize={12} fontWeight={600} fill={pal.label}>
          Outbound (to coast) →
        </text>
        <text x={16} y={522} fontSize={11} fill={pal.label}>
          In view now: {snap.inScene} vehicles
        </text>
        {(
          [
            ["Tag", METHOD_COLOR.TAG, "ok"],
            ["OCR", METHOD_COLOR.OCR, "ok"],
            ["Review", METHOD_COLOR.REVIEW, "warning"],
            ["Unread", METHOD_COLOR.UNREAD, "critical"],
          ] as const
        ).map(([label, color, lvl], i) => (
          <g key={label} transform={`translate(${1130 + i * 112},22)`}>
            <rect x={-8} y={-10} width={104} height={20} rx={10} fill={color} opacity={0.95} />
            <LevelShape x={3} y={0} level={lvl} size={3.4} />
            <text x={12} y={4} fontSize={11} fontWeight={600} fill={label === "Tag" || label === "Unread" ? "#FFFFFF" : "#1B1B1B"}>
              {label}
            </text>
          </g>
        ))}
      </g>

      <Highlight id={hl} />
    </svg>
  );
};

function Highlight({ id }: { id: string | null }) {
  if (!id) return null;
  const ring = { className: "ff-hl", pointerEvents: "none" as const };
  if (id === "lane:ALL") {
    return (
      <g>
        <rect x={4} y={INB_TOP} width={SCENE_W - 8} height={MEDIAN_TOP - INB_TOP} rx={6} {...ring} />
        <rect x={4} y={OUT_TOP} width={SCENE_W - 8} height={OUT_BOTTOM - OUT_TOP} rx={6} {...ring} />
      </g>
    );
  }
  if (id === "lane:OUT") return <rect x={4} y={OUT_TOP} width={SCENE_W - 8} height={OUT_BOTTOM - OUT_TOP} rx={6} {...ring} />;
  const lane = /^lane:(INB|OUT)-(\d)$/.exec(id);
  if (lane) {
    const d = lane[1] === "INB" ? 0 : 1;
    return <rect x={4} y={laneTop(d, Number(lane[2]) - 1)} width={SCENE_W - 8} height={LANE_H} rx={6} {...ring} />;
  }
  const eq = /^equip:(INB|OUT)-(\d)-(\d)$/.exec(id);
  if (eq) {
    const p = ledPos(eq[1] === "INB" ? 0 : 1, Number(eq[2]) - 1, Number(eq[3]));
    return <circle cx={p.x} cy={p.y} r={12} {...ring} />;
  }
  switch (id) {
    case "meteo":
      return <rect x={8} y={4} width={330} height={44} rx={8} {...ring} />;
    case "fiber":
      return <rect x={GANTRY_X + 64} y={508} width={1380 - GANTRY_X - 60} height={30} rx={8} {...ring} />;
    case "radio":
      return <circle cx={1158} cy={520} r={26} {...ring} />;
    case "node:cabinet":
      return <rect x={GANTRY_X + 16} y={500} width={58} height={46} rx={8} {...ring} />;
    case "gpu":
    case "infra:cpu":
      return <rect x={1374} y={496} width={222} height={62} rx={8} {...ring} />;
    default:
      return null;
  }
}
