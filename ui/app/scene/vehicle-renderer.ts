import { BRAND, METHOD_COLOR, METHOD_LEVEL, type Method } from "../theme/colors";
import { GANTRY_X, vehicleX } from "../sim/engine";
import type { Engine } from "../sim/engine";
import type { Vehicle } from "../sim/types";
import { laneCenterY, laneTop, LANE_H } from "./geometry";

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

function set(e: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
}

interface VNode {
  g: SVGGElement;
  outline: SVGRectElement;
  glow: SVGRectElement;
  axles: SVGRectElement[];
  cone: SVGPolygonElement;
  badge?: SVGGElement;
  crossed: boolean;
  frame: number;
}

interface Fx {
  el: SVGElement;
  start: number;
  dur: number;
  kind: "scan" | "arc" | "flash";
}

const BADGE_MS = 3000;
const SHAPE: Record<string, string> = {
  ok: "M0,-4.2 A4.2,4.2 0 1,1 0,4.2 A4.2,4.2 0 1,1 0,-4.2 Z",
  warning: "M0,-4.8 L4.6,3.8 L-4.6,3.8 Z",
  critical: "M0,-5 L5,0 L0,5 L-5,0 Z",
};

export function badgeText(v: Vehicle): string {
  const p = v.passage;
  if (!p) return "";
  const conf = `${p.conf.toFixed(1)}%`;
  switch (p.method) {
    case "TAG":
      return `Tag ${p.issuer?.name ?? ""}`;
    case "OCR":
      return `OCR ${conf}`;
    case "REVIEW":
      return `Review ${conf}`;
    default:
      return "Unread";
  }
}

/** Draws vehicles and effects imperatively (no React re-render per frame). */
export class VehicleRenderer {
  private nodes = new Map<number, VNode>();
  private fx: Fx[] = [];
  private frame = 0;

  constructor(
    private bodies: SVGGElement,
    private lights: SVGGElement,
    private effects: SVGGElement,
    private badges: SVGGElement,
  ) {}

  render(engine: Engine, now: number, night: boolean, reduced: boolean): void {
    this.frame++;
    for (let d = 0; d < 2; d++) {
      for (let l = 0; l < 4; l++) {
        for (const v of engine.lanes[d][l]) this.draw(v, now, night, reduced);
      }
    }
    for (const [id, n] of this.nodes) {
      if (n.frame !== this.frame) {
        n.g.remove();
        n.cone.remove();
        n.badge?.remove();
        this.nodes.delete(id);
      }
    }
    this.fx = this.fx.filter((f) => {
      const t = Math.max(0, (now - f.start) / f.dur);
      if (t >= 1) {
        f.el.remove();
        return false;
      }
      if (f.kind === "arc") set(f.el, { r: 6 + 30 * t, opacity: 0.9 * (1 - t) });
      else if (f.kind === "scan") set(f.el, { opacity: 0.75 * (1 - t) });
      else set(f.el, { opacity: 0.7 * (1 - t) });
      return true;
    });
  }

  private draw(v: Vehicle, now: number, night: boolean, reduced: boolean): void {
    let n = this.nodes.get(v.id);
    if (!n) n = this.create(v);
    n.frame = this.frame;
    const x = vehicleX(v);
    const y = laneCenterY(v.dir, v.lane);
    const flip = v.dir === 0 ? " scale(-1,1)" : "";
    const tf = `translate(${x.toFixed(1)},${y})${flip}`;
    const hideBefore = reduced && !v.crossed;
    n.g.setAttribute("transform", tf);
    n.g.setAttribute("opacity", hideBefore ? "0" : "1");
    n.cone.setAttribute("transform", tf);
    n.cone.setAttribute("opacity", night && !hideBefore ? "0.5" : "0");

    if (v.crossed && !n.crossed && v.passage) {
      n.crossed = true;
      const method: Method = v.passage.method;
      const color = METHOD_COLOR[method];
      set(n.outline, { stroke: color, opacity: 0.95 });
      set(n.glow, { stroke: color, opacity: 0.35 });
      n.axles.forEach((a, i) => a.setAttribute("opacity", i < v.cat.axles ? "0.9" : "0"));
      if (!reduced) this.spawnFx(v, now);
      n.badge = this.makeBadge(v);
    }
    if (n.badge && v.crossedReal !== undefined) {
      const age = now - v.crossedReal;
      if (age > BADGE_MS) {
        n.badge.remove();
        n.badge = undefined;
      } else {
        const op = age > BADGE_MS - 600 ? (BADGE_MS - age) / 600 : Math.min(1, age / 150);
        const cx = v.dir === 1 ? x - v.len / 2 : x + v.len / 2;
        n.badge.setAttribute("transform", `translate(${cx.toFixed(1)},${y - 27})`);
        n.badge.setAttribute("opacity", op.toFixed(2));
      }
    }
  }

  private create(v: Vehicle): VNode {
    const L = v.len;
    const W = v.wid;
    const g = el("g", { "data-vid": v.id, class: "ff-vehicle" }, this.bodies);
    el("rect", { x: -L + 3, y: -W / 2 + 3, width: L, height: W, rx: 6, fill: "rgba(0,0,0,0.28)" }, g);
    const glow = el("rect", { x: -L - 5, y: -W / 2 - 5, width: L + 10, height: W + 10, rx: 10, fill: "none", "stroke-width": 7, opacity: 0 }, g);
    const kind = v.cat.kind;
    if (kind === "truck") {
      el("rect", { x: -L, y: -W / 2, width: L - 25, height: W, rx: 2, fill: v.trailer, stroke: "rgba(0,0,0,0.25)" }, g);
      el("rect", { x: -L + 6, y: -1, width: L - 37, height: 2, fill: "rgba(0,0,0,0.12)" }, g);
      el("rect", { x: -22, y: -W / 2 + 1, width: 22, height: W - 2, rx: 4, fill: v.cab }, g);
      el("rect", { x: -7, y: -W / 2 + 3, width: 4, height: W - 6, rx: 1.5, fill: "#1C2530", opacity: 0.85 }, g);
    } else if (kind === "bus") {
      el("rect", { x: -L, y: -W / 2, width: L, height: W, rx: 5, fill: v.cab }, g);
      el("rect", { x: -L + 8, y: -W / 2 + 2, width: L - 20, height: 3, fill: "#1C2530", opacity: 0.55 }, g);
      el("rect", { x: -L + 8, y: W / 2 - 5, width: L - 20, height: 3, fill: "#1C2530", opacity: 0.55 }, g);
      el("rect", { x: -L * 0.62, y: -W / 4, width: L * 0.22, height: W / 2, rx: 2, fill: "rgba(255,255,255,0.45)" }, g);
      el("rect", { x: -8, y: -W / 2 + 3, width: 5, height: W - 6, rx: 1.5, fill: "#1C2530", opacity: 0.85 }, g);
    } else if (kind === "moto") {
      el("rect", { x: -L, y: -2.5, width: L, height: 5, rx: 2.5, fill: "#2B2F33" }, g);
      el("rect", { x: -L * 0.62, y: -W / 2, width: 8, height: W, rx: 4, fill: v.paint }, g);
    } else {
      const carL = kind === "carTrailer" ? 44 : L;
      if (kind === "carTrailer") {
        el("rect", { x: -L, y: -W / 2 + 1, width: L - 50, height: W - 2, rx: 3, fill: v.trailer, stroke: "rgba(0,0,0,0.25)" }, g);
        el("rect", { x: -50, y: -1.5, width: 7, height: 3, fill: "#444" }, g);
      }
      el("rect", { x: -carL, y: -W / 2, width: carL, height: W, rx: 6, fill: v.paint, stroke: "rgba(0,0,0,0.18)" }, g);
      el("rect", { x: -carL * 0.42, y: -W / 2 + 2.5, width: 7, height: W - 5, rx: 2, fill: "#1C2530", opacity: 0.85 }, g);
      el("rect", { x: -carL * 0.86, y: -W / 2 + 3, width: 4, height: W - 6, rx: 1.5, fill: "#1C2530", opacity: 0.7 }, g);
    }
    const axles: SVGRectElement[] = [];
    for (let i = 0; i < 7; i++) {
      const n = v.cat.axles;
      const ax = n <= 1 ? -L / 2 : -L * 0.16 - (i / (n - 1)) * L * 0.74;
      axles.push(el("rect", { x: ax - 1.8, y: -W / 2 - 2, width: 3.6, height: W + 4, rx: 1, fill: "#111", opacity: 0 }, g));
    }
    const outline = el("rect", { x: -L - 3, y: -W / 2 - 3, width: L + 6, height: W + 6, rx: 8, fill: "none", "stroke-width": 2.6, opacity: 0 }, g);
    const cone = el(
      "polygon",
      { points: `0,${-W / 2 + 3} 0,${W / 2 - 3} 52,${W / 2 + 12} 52,${-W / 2 - 12}`, fill: "url(#ff-headlight)", opacity: 0 },
      this.lights,
    );
    const node: VNode = { g, outline, glow, axles, cone, crossed: false, frame: this.frame };
    this.nodes.set(v.id, node);
    return node;
  }

  private makeBadge(v: Vehicle): SVGGElement {
    const p = v.passage!;
    const color = METHOD_COLOR[p.method];
    const level = METHOD_LEVEL[p.method];
    const text = badgeText(v);
    const w = text.length * 6.1 + 24;
    const dark = p.method === "REVIEW" || p.method === "OCR";
    const g = el("g", { opacity: 0, class: "ff-badge" }, this.badges);
    el("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 10, fill: color, stroke: "rgba(0,0,0,0.25)" }, g);
    el("path", { d: SHAPE[level], transform: `translate(${-w / 2 + 11},0)`, fill: dark ? "#1B1B1B" : "#FFFFFF" }, g);
    const t = el("text", { x: -w / 2 + 19, y: 4, "font-size": 11, "font-weight": 600, fill: dark ? "#1B1B1B" : "#FFFFFF" }, g);
    t.textContent = text;
    return g;
  }

  private spawnFx(v: Vehicle, now: number): void {
    const top = laneTop(v.dir, v.lane);
    const y = laneCenterY(v.dir, v.lane);
    const scan = el("rect", { x: GANTRY_X - 7, y: top + 2, width: 14, height: LANE_H - 4, rx: 3, fill: BRAND.aqua, opacity: 0.75 }, this.effects);
    this.fx.push({ el: scan, start: now, dur: 380, kind: "scan" });
    if (v.passage?.hasTag) {
      for (let i = 0; i < 2; i++) {
        const arc = el("circle", { cx: GANTRY_X, cy: y, r: 6, fill: "none", stroke: BRAND.teal, "stroke-width": 2, opacity: 0.9 }, this.effects);
        this.fx.push({ el: arc, start: now + i * 140, dur: 520, kind: "arc" });
      }
    }
    const fx = v.dir === 1 ? GANTRY_X + 4 : GANTRY_X - 4;
    const flash = el("circle", { cx: fx, cy: y, r: 16, fill: "#FFFFFF", opacity: 0.7 }, this.effects);
    this.fx.push({ el: flash, start: now, dur: 200, kind: "flash" });
  }
}
