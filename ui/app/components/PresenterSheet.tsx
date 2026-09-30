import React, { useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { KeyboardShortcut } from "@dynatrace/strato-components/content";
import { Switch, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { SCENARIOS } from "../sim/scenarios";
import { useApp, useSnapshot } from "../state/engine-context";

const HOURS: [string, number | null][] = [
  ["Now", null],
  ["3 am", 3],
  ["6 am", 6],
  ["8 am", 8],
  ["1 pm", 13],
  ["6 pm", 18],
];

const SHORTCUTS: [string, string][] = [
  ["0", "Normal operation (ends incidents)"],
  ["1–6", "Scenarios"],
  ["Space", "Pause / resume"],
  ["+", "Faster"],
  ["-", "Slower"],
  ["M", "Mask plates"],
  ["D", "Dynatrace sources"],
  ["T", "TV mode"],
  ["R", "Demo summary"],
  ["P", "Presenter panel"],
  ["I", "Dynatrace Intelligence"],
];

export const PresenterSheet = ({ onTour }: { onTour: () => void }) => {
  const { engine, ui, setUi, prefs, setPrefs } = useApp();
  const snap = useSnapshot();
  const [hour, setHour] = useState("Now");
  const [seed, setSeed] = useState(String(engine.seed));

  return (
    <Sheet show={ui.presenter} title="Presenter panel" onDismiss={() => setUi({ presenter: false })}>
      <div className="ff-presenter">
        <Heading level={6}>Scenarios</Heading>
        {SCENARIOS.map((s) => {
          const st = snap.scenarios.find((x) => x.id === s.id);
          const on = st?.phase === "active";
          return (
            <div key={s.id} className="ff-scn">
              <Switch value={on} disabled={st?.phase === "recovering"} onChange={() => engine.toggleScenario(s.id)}>
                <b>
                  {s.key} · {s.name}
                </b>
              </Switch>
              <Text className="ff-muted">
                {s.summary}
                {st?.phase === "recovering" ? " · recovering…" : ""}
                {s.kind === "incident" ? ` · ${Math.round(s.durationMin / 60)}h incident in ~${Math.round((s.durationMin * 60) / 100)} s` : ""}
              </Text>
            </div>
          );
        })}
        <Button onClick={() => engine.normalize()}>0 · End active incidents</Button>

        <Heading level={6}>Time</Heading>
        <ToggleButtonGroup value={String(snap.speed)} onChange={(v) => engine.setSpeed(Number(v))} aria-label="Speed">
          <ToggleButtonGroup.Item value="1">1× real time</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="4">4×</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="10">10×</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          value={hour}
          onChange={(v) => {
            setHour(v);
            engine.setHour(HOURS.find((h) => h[0] === v)?.[1] ?? null);
          }}
          aria-label="Simulated hour"
        >
          {HOURS.map(([label]) => (
            <ToggleButtonGroup.Item key={label} value={label}>
              {label}
            </ToggleButtonGroup.Item>
          ))}
        </ToggleButtonGroup>

        <Heading level={6}>Rehearsal</Heading>
        <div className="ff-row">
          <TextInput value={seed} onChange={(v) => setSeed(v)} aria-label="Simulation seed" />
          <Button
            onClick={() => {
              const n = Number(seed);
              engine.reset(Number.isFinite(n) && n > 0 ? n : engine.seed);
              setHour("Now");
            }}
          >
            Restart day
          </Button>
        </div>
        <Text className="ff-muted">The same seed replays exactly the same sequence of vehicles.</Text>
        <Button variant="accent" color="primary" onClick={onTour}>
          Start automatic tour (5 min)
        </Button>

        <Heading level={6}>Dashboard link (optional)</Heading>
        <Text className="ff-muted">Document ID of a dashboard in this environment. When set, the details panel shows an "Open dashboard" button.</Text>
        <TextInput value={prefs.dashboardId} onChange={(v) => setPrefs({ dashboardId: v.trim() })} placeholder="Dashboard document ID" />

        <Heading level={6}>Shortcuts</Heading>
        <div className="ff-shortcuts">
          {SHORTCUTS.map(([k, label]) => (
            <div key={k} className="ff-shortcut">
              <KeyboardShortcut keys={k} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
};
