import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Text } from "@dynatrace/strato-components/typography";
import { MaximizeIcon } from "@dynatrace/strato-icons";
import { hash01 } from "../sim/rng";
import type { Passage } from "../sim/types";
import type { Engine } from "../sim/engine";
import { LEVEL_COLOR, METHOD_COLOR, STATUS, type Level } from "../theme/colors";
import { useApp, useFrame, useSnapshot } from "../state/engine-context";
import { usePrefersReducedMotion } from "../state/use-reduced-motion";
import { fmtInt } from "../format";
import { Panel } from "./Panel";

type NodeKind = "svc" | "queue" | "partner";
interface NodeDef {
  x: number;
  y: number;
  label: string;
  sub?: string;
  kind: NodeKind;
  queue?: string;
}

export const NODES: Record<string, NodeDef> = {
  gantry: { x: 48, y: 160, label: "Gantry", sub: "8 lanes", kind: "svc" },
  cabinet: {
    x: 143,
    y: 160,
    label: "Cabinet",
    sub: "lane controllers",
    kind: "svc",
  },
  ingest: { x: 238, y: 160, label: "trip-", sub: "ingest", kind: "svc" },
  q_raw: {
    x: 335,
    y: 160,
    label: "trip.raw",
    kind: "queue",
    queue: "mlff.trip.raw",
  },
  ocr: { x: 435, y: 160, label: "ocr-engine", sub: "GPU", kind: "svc" },
  rating: { x: 545, y: 105, label: "rating-", sub: "service", kind: "svc" },
  q_review: {
    x: 545,
    y: 250,
    label: "ocr.review",
    kind: "queue",
    queue: "mlff.ocr.review",
  },
  q_tag: {
    x: 655,
    y: 50,
    label: "charge.tag",
    kind: "queue",
    queue: "mlff.charge.tag",
  },
  q_plate: {
    x: 655,
    y: 160,
    label: "charge.plate",
    kind: "queue",
    queue: "mlff.charge.plate",
  },
  review: { x: 655, y: 250, label: "Human", sub: "review", kind: "svc" },
  taggw: { x: 765, y: 50, label: "tag-gateway", kind: "svc" },
  q_dlq: { x: 765, y: 108, label: "dlq", kind: "queue", queue: "mlff.dlq" },
  billing: { x: 765, y: 160, label: "billing-", sub: "service", kind: "svc" },
  alphatag: { x: 915, y: 16, label: "AlphaTag", kind: "partner" },
  betapass: { x: 915, y: 46, label: "BetaPass", kind: "partner" },
  gammatoll: { x: 915, y: 76, label: "GammaToll", kind: "partner" },
  deltamove: { x: 915, y: 106, label: "DeltaMove", kind: "partner" },
  omegapay: { x: 915, y: 136, label: "OmegaPay", kind: "partner" },
  payments: { x: 915, y: 178, label: "Payments", kind: "partner" },
  registry: { x: 915, y: 214, label: "Registry", kind: "partner" },
  authority: { x: 915, y: 250, label: "Authority", kind: "partner" },
};

const EDGES: [string, string][] = [
  ["gantry", "cabinet"],
  ["cabinet", "ingest"],
  ["ingest", "q_raw"],
  ["q_raw", "ocr"],
  ["ocr", "rating"],
  ["ocr", "q_review"],
  ["q_review", "review"],
  ["review", "rating"],
  ["rating", "q_tag"],
  ["rating", "q_plate"],
  ["q_tag", "taggw"],
  ["taggw", "q_dlq"],
  ["q_plate", "billing"],
  ["taggw", "alphatag"],
  ["taggw", "betapass"],
  ["taggw", "gammatoll"],
  ["taggw", "deltamove"],
  ["taggw", "omegapay"],
  ["billing", "payments"],
  ["billing", "registry"],
  ["billing", "authority"],
];

const HEAD = ["gantry", "cabinet", "ingest", "q_raw", "ocr"];

function route(p: Passage, afterReview: boolean): string[] {
  if (afterReview)
    return [
      "review",
      "rating",
      "q_plate",
      "billing",
      ...(p.autopay ? ["payments"] : []),
    ];
  if (p.method === "TAG")
    return [...HEAD, "rating", "q_tag", "taggw", p.issuer?.id ?? "alphatag"];
  if (p.method === "OCR")
    return [
      ...HEAD,
      "rating",
      "q_plate",
      "billing",
      ...(p.autopay ? ["payments"] : []),
    ];
  return [...HEAD, "q_review", "review"];
}

interface Particle {
  el: SVGCircleElement;
  p: Passage;
  pts: { x: number; y: number }[];
  cum: number[];
  dist: number;
  holdIdx: number;
  holdNode: string;
  done: number;
}

const NS = "http://www.w3.org/2000/svg";
const MAX_PARTICLES = 260;

class ParticleLayer {
  private parts: Particle[] = [];
  private lastNow = 0;

  constructor(private layer: SVGGElement) {}

  add(p: Passage, afterReview = false, reduced = false): void {
    if (reduced || this.parts.length >= MAX_PARTICLES) return;
    const ids = route(p, afterReview);
    const pts = ids.map((id) => ({ x: NODES[id].x, y: NODES[id].y }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(
        cum[i - 1] +
          Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
      );
    const el = document.createElementNS(NS, "circle");
    el.setAttribute("r", "4");
    const color =
      afterReview && p.reviewResult === "REVIEW_OK"
        ? METHOD_COLOR.OCR
        : METHOD_COLOR[p.method];
    el.setAttribute("fill", color);
    el.setAttribute("stroke", "rgba(0,0,0,0.35)");
    el.setAttribute("stroke-width", "0.8");
    this.layer.appendChild(el);
    const holdNode = p.delayReason === "fiber" ? "cabinet" : "q_tag";
    const holdIdx = p.delayReason ? ids.indexOf(holdNode) : -1;
    this.parts.push({ el, p, pts, cum, dist: 0, holdIdx, holdNode, done: 0 });
  }

  render(now: number, speed: number): void {
    const dt = this.lastNow ? Math.min(100, now - this.lastNow) : 16;
    this.lastNow = now;
    const v = 260 * Math.sqrt(Math.max(speed, 0.0001)) * (dt / 1000);
    let held = 0;
    this.parts = this.parts.filter((pt) => {
      const total = pt.cum[pt.cum.length - 1];
      const holdDist = pt.holdIdx >= 0 ? pt.cum[pt.holdIdx] : Infinity;
      const holding = pt.p.status === "DELAYED" && pt.dist >= holdDist - 0.5;
      if (holding) {
        held++;
        if (held > 70) {
          pt.el.setAttribute("opacity", "0");
          return true;
        }
        const n = NODES[pt.holdNode];
        const jx = (hash01(pt.p.id, 1) - 0.5) * 56;
        const jy = (hash01(pt.p.id, 2) - 0.5) * 24;
        pt.el.setAttribute("cx", (n.x + jx).toFixed(1));
        pt.el.setAttribute("cy", (n.y + jy).toFixed(1));
        pt.el.setAttribute("opacity", "0.9");
        return true;
      }
      pt.dist = Math.min(
        total,
        pt.p.status === "DELAYED"
          ? Math.min(pt.dist + v, holdDist)
          : pt.dist + v,
      );
      let i = 1;
      while (i < pt.cum.length - 1 && pt.cum[i] < pt.dist) i++;
      const a = pt.pts[i - 1];
      const b = pt.pts[i];
      const seg = pt.cum[i] - pt.cum[i - 1] || 1;
      const t = (pt.dist - pt.cum[i - 1]) / seg;
      pt.el.setAttribute("cx", (a.x + (b.x - a.x) * t).toFixed(1));
      pt.el.setAttribute("cy", (a.y + (b.y - a.y) * t).toFixed(1));
      if (pt.dist >= total) {
        pt.done += dt;
        pt.el.setAttribute(
          "opacity",
          Math.max(0, 1 - pt.done / 500).toFixed(2),
        );
        if (pt.done >= 500) {
          pt.el.remove();
          return false;
        }
      } else pt.el.setAttribute("opacity", "1");
      return true;
    });
  }
}

function useParticles(
  engine: Engine,
  layerRef: React.RefObject<SVGGElement | null>,
  reduced: boolean,
) {
  const layer = useRef<ParticleLayer | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  useEffect(() => {
    if (!layerRef.current) return;
    layer.current = new ParticleLayer(layerRef.current);
    const off1 = engine.on("crossing", (p) =>
      layer.current?.add(p, false, reducedRef.current),
    );
    const off2 = engine.on("reviewed", (p) => {
      if (p.reviewResult === "REVIEW_OK")
        layer.current?.add(p, true, reducedRef.current);
    });
    return () => {
      off1();
      off2();
    };
  }, [engine, layerRef]);
  const onFrame = useCallback(
    (now: number) =>
      layer.current?.render(now, engine.paused ? 0 : engine.speed),
    [engine],
  );
  useFrame(onFrame);
}

/** The pipeline diagram with its own particle layer (used in the panel and in the zoom modal). */
const PipelineDiagram = ({
  onSelect,
  className,
}: {
  onSelect?: () => void;
  className?: string;
}) => {
  const { engine, select } = useApp();
  const snap = useSnapshot();
  const reduced = usePrefersReducedMotion();
  const layerRef = useRef<SVGGElement>(null);
  useParticles(engine, layerRef, reduced);

  const queues = Object.fromEntries(snap.queues.map((q) => [q.id, q]));
  const partners = Object.fromEntries(snap.partners.map((p) => [p.id, p]));
  const level = (id: string): Level => snap.nodes[id] ?? "ok";

  return (
    <svg
      viewBox="0 0 1000 290"
      className={`ff-pipe-svg ${className ?? ""}`}
      role="img"
      aria-label="Transaction pipeline with queues and partners"
    >
      {["Capture", "Edge data center", "Messaging and billing", "Partners"].map(
        (t, i) => (
          <text
            key={t}
            x={[20, 200, 500, 870][i]}
            y={286}
            className="ff-pipe-stage"
          >
            {t}
          </text>
        ),
      )}
      {EDGES.map(([a, b]) => {
        const A = NODES[a];
        const B = NODES[b];
        const bad = level(b) === "critical" && NODES[b].kind === "partner";
        return (
          <line
            key={`${a}-${b}`}
            x1={A.x}
            y1={A.y}
            x2={B.x}
            y2={B.y}
            className={
              bad
                ? "ff-edge ff-edge-bad"
                : a === "review"
                  ? "ff-edge ff-edge-dashed"
                  : "ff-edge"
            }
          />
        );
      })}
      {Object.entries(NODES).map(([id, n]) => {
        const lvl = level(id);
        const hl = snap.highlight === `node:${id}`;
        const onClick = () => {
          select({ type: "node", id });
          onSelect?.();
        };
        if (n.kind === "queue") {
          const q = queues[n.queue!];
          const depth = q?.depth ?? 0;
          const small = id === "q_dlq";
          const w = small ? 44 : 78;
          const h = small ? 26 : 44;
          const fill = Math.min(1, Math.log10(depth + 1) / Math.log10(20000));
          return (
            <g key={id} className="ff-node ff-clickable" onClick={onClick}>
              <title>{`${n.queue}: ${fmtInt(depth)} messages`}</title>
              <rect
                x={n.x - w / 2}
                y={n.y - h / 2}
                width={w}
                height={h}
                rx={6}
                className="ff-node-box"
              />
              <rect
                x={n.x - w / 2 + 2}
                y={n.y + h / 2 - 2 - (h - 4) * fill}
                width={w - 4}
                height={(h - 4) * fill}
                rx={4}
                fill={LEVEL_COLOR[q?.level ?? "ok"]}
                opacity={0.35}
                className="ff-tank"
              />
              <rect
                x={n.x - w / 2}
                y={n.y - h / 2}
                width={w}
                height={h}
                rx={6}
                fill="none"
                stroke={LEVEL_COLOR[q?.level ?? "ok"]}
                strokeWidth={2}
              />
              {!small && (
                <text
                  x={n.x}
                  y={n.y - 5}
                  className="ff-node-label"
                  textAnchor="middle"
                >
                  {n.label}
                </text>
              )}
              <text
                x={n.x}
                y={small ? n.y + 4 : n.y + 11}
                className="ff-node-value"
                textAnchor="middle"
              >
                {small ? `DLQ ${fmtInt(depth)}` : `${fmtInt(depth)} msgs`}
              </text>
              {!small && q && q.waitMin >= 1 && (
                <text
                  x={n.x}
                  y={n.y + h / 2 + 12}
                  className="ff-node-sub"
                  textAnchor="middle"
                  fill={LEVEL_COLOR[q.level]}
                >
                  wait ~{fmtInt(q.waitMin)} min
                </text>
              )}
              {hl && (
                <rect
                  x={n.x - w / 2 - 6}
                  y={n.y - h / 2 - 6}
                  width={w + 12}
                  height={h + 12}
                  rx={10}
                  className="ff-hl-ring"
                />
              )}
            </g>
          );
        }
        if (n.kind === "partner") {
          const p = partners[id];
          return (
            <g key={id} className="ff-node ff-clickable" onClick={onClick}>
              <title>{`${n.label}: p95 ${fmtInt(p?.p95 ?? 0)} ms`}</title>
              <rect
                x={n.x - 60}
                y={n.y - 12}
                width={120}
                height={24}
                rx={12}
                className="ff-node-box"
                stroke={LEVEL_COLOR[lvl]}
                strokeWidth={2}
              />
              <circle
                cx={n.x - 48}
                cy={n.y}
                r={4}
                fill={LEVEL_COLOR[lvl]}
                className={lvl === "critical" ? "ff-blink-crit" : undefined}
              />
              <text x={n.x - 40} y={n.y + 4} className="ff-node-label">
                {n.label}
              </text>
              <text
                x={n.x + 55}
                y={n.y + 4}
                className="ff-node-sub"
                textAnchor="end"
              >
                {p
                  ? p.p95 >= 1000
                    ? `${(p.p95 / 1000).toFixed(1)} s`
                    : `${fmtInt(p.p95)} ms`
                  : ""}
              </text>
              {hl && (
                <rect
                  x={n.x - 66}
                  y={n.y - 18}
                  width={132}
                  height={36}
                  rx={16}
                  className="ff-hl-ring"
                />
              )}
            </g>
          );
        }
        return (
          <g key={id} className="ff-node ff-clickable" onClick={onClick}>
            <title>{`${n.label}${n.sub ?? ""}`}</title>
            <rect
              x={n.x - 42}
              y={n.y - 20}
              width={84}
              height={40}
              rx={8}
              className="ff-node-box"
              stroke={LEVEL_COLOR[lvl]}
              strokeWidth={2.5}
            />
            <text
              x={n.x}
              y={n.y - (n.sub ? 3 : -4)}
              className="ff-node-label"
              textAnchor="middle"
            >
              {n.label}
            </text>
            {n.sub && (
              <text
                x={n.x}
                y={n.y + 11}
                className="ff-node-sub"
                textAnchor="middle"
              >
                {n.sub}
              </text>
            )}
            {id === "taggw" && lvl === "critical" && (
              <g transform={`translate(${n.x + 30},${n.y - 26})`}>
                <rect
                  x={-28}
                  y={-9}
                  width={70}
                  height={18}
                  rx={9}
                  fill={STATUS.critical}
                />
                <text
                  x={7}
                  y={4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#FFFFFF"
                >
                  breaker open
                </text>
              </g>
            )}
            {hl && (
              <rect
                x={n.x - 48}
                y={n.y - 26}
                width={96}
                height={52}
                rx={12}
                className="ff-hl-ring"
              />
            )}
          </g>
        );
      })}
      <g ref={layerRef} pointerEvents="none" />
    </svg>
  );
};

export const PipelineFlow = () => {
  const [zoom, setZoom] = useState(false);
  return (
    <Panel
      title="Road to revenue · transaction pipeline"
      source="Distributed Tracing (OneAgent/OpenTelemetry) on services, broker extension on queues, Synthetic + traces on partner APIs"
      right={
        <span className="ff-pipe-actions">
          <span className="ff-muted">1 dot = 1 transaction</span>
          <Button
            size="condensed"
            onClick={() => setZoom(true)}
            aria-label="Open the pipeline in a larger view"
          >
            <Button.Prefix>
              <MaximizeIcon />
            </Button.Prefix>
            Zoom
          </Button>
        </span>
      }
      className="ff-pipeline"
    >
      <PipelineDiagram />
      <Modal
        show={zoom}
        size="large"
        title="Road to revenue · transaction pipeline"
        onDismiss={() => setZoom(false)}
      >
        <div className="ff-pipe-zoom">
          <PipelineDiagram
            className="ff-pipe-svg-zoom"
            onSelect={() => setZoom(false)}
          />
          <Text className="ff-muted">
            1 dot = 1 transaction · dot color = identification method · tanks
            fill with queue backlog · click a node to open its details.
          </Text>
        </div>
      </Modal>
    </Panel>
  );
};
