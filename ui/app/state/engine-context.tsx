import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Engine } from "../sim/engine";
import type { Snapshot } from "../sim/types";

type FrameFn = (now: number) => void;

/** A single requestAnimationFrame for the whole app: advances the engine and redraws scene and pipeline. */
class FrameLoop {
  private fns = new Set<FrameFn>();
  private raf = 0;

  constructor(private engine: Engine) {}

  start(): void {
    const loop = (now: number) => {
      this.engine.tick(now);
      for (const fn of this.fns) fn(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  add(fn: FrameFn): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
}

export interface Prefs {
  masked: boolean;
  sources: boolean;
  tv: boolean;
  pinnedLane: string;
  dashboardId: string;
}

const DEFAULT_PREFS: Prefs = { masked: true, sources: false, tv: false, pinnedLane: "All", dashboardId: "" };
const PREFS_KEY = "multi-lane-free-flow.prefs";

/** Preferences live in this browser only (no scopes needed). */
function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export type Selection =
  | { type: "passage"; id: string }
  | { type: "node"; id: string }
  | { type: "equip"; dir: number; lane: number; equip: number }
  | { type: "infra"; id: string }
  | { type: "kpi"; key: string };

interface UiState {
  presenter: boolean;
  summary: boolean;
  intel: boolean;
}

interface Ctx {
  engine: Engine;
  loop: FrameLoop;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  selection: Selection | null;
  select: (s: Selection | null) => void;
  ui: UiState;
  setUi: (u: Partial<UiState>) => void;
}

const EngineCtx = createContext<Ctx | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useMemo(() => new Engine(), []);
  const loop = useMemo(() => new FrameLoop(engine), [engine]);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [selection, select] = useState<Selection | null>(null);
  const [ui, setUiState] = useState<UiState>({ presenter: false, summary: false, intel: false });

  useEffect(() => {
    loop.start();
    return () => loop.stop();
  }, [loop]);

  const value = useMemo<Ctx>(
    () => ({
      engine,
      loop,
      prefs,
      setPrefs: (p) =>
        setPrefsState((old) => {
          const next = { ...old, ...p };
          try {
            window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
          } catch {
            // preferences are optional
          }
          return next;
        }),
      selection,
      select,
      ui,
      setUi: (u) => setUiState((old) => ({ ...old, ...u })),
    }),
    [engine, loop, prefs, selection, ui],
  );
  return <EngineCtx.Provider value={value}>{children}</EngineCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(EngineCtx);
  if (!c) throw new Error("EngineProvider missing");
  return c;
}

/** Engine snapshot, refreshed 4 times per second. */
export function useSnapshot(): Snapshot {
  const { engine } = useApp();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

export function useFrame(fn: FrameFn): void {
  const { loop } = useApp();
  useEffect(() => loop.add(fn), [loop, fn]);
}
