import { useCallback, useEffect, useRef, useState } from "react";
import { SCENARIOS, type ScenarioId } from "../sim/scenarios";
import { useApp } from "./engine-context";

const SPEEDS = [1, 4, 10];

/** Presenter keyboard shortcuts. */
export function useShortcuts(): void {
  const { engine, prefs, setPrefs, ui, setUi, select } = useApp();
  const ref = useRef({ prefs, ui });
  ref.current = { prefs, ui };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const { prefs: p, ui: u } = ref.current;
      const k = e.key.toLowerCase();
      const scn = SCENARIOS.find((s) => s.key === k);
      if (scn) engine.toggleScenario(scn.id);
      else if (k === "0") engine.normalize();
      else if (k === " ") {
        e.preventDefault();
        engine.togglePause();
      } else if (k === "+" || k === "=") engine.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(engine.speed) + 1)] ?? 1);
      else if (k === "-") engine.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(engine.speed) - 1)] ?? 1);
      else if (k === "m") setPrefs({ masked: !p.masked });
      else if (k === "d") setPrefs({ sources: !p.sources });
      else if (k === "t") setPrefs({ tv: !p.tv });
      else if (k === "r") setUi({ summary: !u.summary });
      else if (k === "p") setUi({ presenter: !u.presenter });
      else if (k === "i") setUi({ intel: !u.intel });
      else if (k === "escape") {
        select(null);
        setUi({ intel: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, setPrefs, setUi, select]);
}

interface TourStep {
  at: number;
  caption: string;
  run: () => void;
}

/** Automatic 5-minute tour of the demo storyline. */
export function useTour(): { caption: string | null; running: boolean; start: () => void; stop: () => void } {
  const { engine, select, setPrefs, setUi } = useApp();
  const [running, setRunning] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const idx = useRef(0);
  const t0 = useRef(0);

  const on = useCallback(
    (id: ScenarioId, want: boolean) => {
      const st = engine.getSnapshot().scenarios.find((s) => s.id === id);
      if ((st?.phase === "active") !== want && st?.phase !== "recovering") engine.toggleScenario(id);
    },
    [engine],
  );

  const steps = useRef<TourStep[]>([]);
  steps.current = [
    {
      at: 0,
      caption: "Everything is running, and Dynatrace Intelligence already forecasts the OCR GPU will overheat in 2 days.",
      run: () => {
        engine.normalize();
        engine.highlight("gpu");
      },
    },
    {
      at: 45,
      caption: "Road to revenue: every step of the transaction is traced, from the reader to the tag issuer.",
      run: () => {
        const snap = engine.getSnapshot();
        const p = snap.feed.find((x) => x.method === "TAG" && x.status === "SETTLED") ?? snap.feed[0];
        if (p) select({ type: "passage", id: p.id });
      },
    },
    {
      at: 90,
      caption: "Holiday exodus: the plaza handles the peak, and you can see it in real time.",
      run: () => {
        select(null);
        on("exodus", true);
      },
    },
    {
      at: 135,
      caption: "Fog: yellow vehicles on every lane. Dynatrace Intelligence correlates it with visibility: it is not the equipment.",
      run: () => {
        on("exodus", false);
        on("fog", true);
      },
    },
    {
      at: 195,
      caption: "Revenue held at a tag issuer: detected in 3 minutes, nothing lost.",
      run: () => {
        on("fog", false);
        on("issuer", true);
      },
    },
    {
      at: 232,
      caption: "Issuer recovered: held messages are reprocessed automatically.",
      run: () => on("issuer", false),
    },
    {
      at: 255,
      caption: "One lane, one device: the field crew leaves with the right part.",
      run: () => on("ir", true),
    },
    {
      at: 285,
      caption: "It all comes from one platform: see the data source behind each panel.",
      run: () => setPrefs({ sources: true }),
    },
    {
      at: 305,
      caption: "Session summary.",
      run: () => {
        setPrefs({ sources: false });
        engine.normalize();
        setUi({ summary: true });
      },
    },
  ];

  const stop = useCallback(() => {
    setRunning(false);
    setCaption(null);
  }, []);

  const start = useCallback(() => {
    idx.current = 0;
    t0.current = performance.now();
    setUi({ presenter: false });
    setRunning(true);
  }, [setUi]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - t0.current) / 1000;
      const list = steps.current;
      while (idx.current < list.length && elapsed >= list[idx.current].at) {
        const s = list[idx.current];
        s.run();
        setCaption(s.caption);
        idx.current++;
      }
      if (idx.current >= list.length && elapsed > list[list.length - 1].at + 8) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, stop]);

  return { caption, running, start, stop };
}
