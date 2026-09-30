import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";
import { Chip } from "@dynatrace/strato-components/content";
import { Switch, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { DocumentIcon, InformationIcon, MaximizeIcon, PauseIcon, PlayIcon, SettingIcon } from "@dynatrace/strato-icons";
import { fmtClock } from "../sim/time";
import { useApp, useSnapshot } from "../state/engine-context";

export const Header = () => {
  const { engine, prefs, setPrefs, setUi, ui } = useApp();
  const snap = useSnapshot();
  const { pathname } = useLocation();
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" appName="Multi-lane Free Flow" />
        <AppHeader.NavigationItem as={Link} to="/" isSelected={pathname === "/"}>
          Live
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/how-it-works" isSelected={pathname === "/how-it-works"}>
          How it works
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/data" isSelected={pathname === "/data"}>
          Data & integrations
        </AppHeader.NavigationItem>
      </AppHeader.Navigation>
      <AppHeader.ActionItems>
        <div className="ff-header-controls">
          <Tooltip text="Data is simulated in the browser; nothing is read from or written to the environment">
            <Chip color="neutral" variant="emphasized">
              ● Simulation
            </Chip>
          </Tooltip>
          {snap.replayActive && (
            <Tooltip text="Incident totals (queues, $, duration) run 100× faster; vehicles keep the selected speed">
              <Chip color="warning" variant="emphasized">
                Incident in accelerated replay (100×)
              </Chip>
            </Tooltip>
          )}
          {!prefs.tv && (
            <>
              <span className="ff-clock">{fmtClock(snap.simTime)} local</span>
              <ToggleButtonGroup value={String(snap.speed)} onChange={(v) => engine.setSpeed(Number(v))} aria-label="Speed">
                <ToggleButtonGroup.Item value="1">1×</ToggleButtonGroup.Item>
                <ToggleButtonGroup.Item value="4">4×</ToggleButtonGroup.Item>
                <ToggleButtonGroup.Item value="10">10×</ToggleButtonGroup.Item>
              </ToggleButtonGroup>
              <Switch value={prefs.masked} onChange={(v) => setPrefs({ masked: v })}>
                Mask plates
              </Switch>
            </>
          )}
        </div>
        <AppHeader.ActionButton prefixIcon={snap.paused ? <PlayIcon /> : <PauseIcon />} showLabel={false} onClick={() => engine.togglePause()}>
          {snap.paused ? "Resume (Space)" : "Pause (Space)"}
        </AppHeader.ActionButton>
        <AppHeader.ActionButton prefixIcon={<InformationIcon />} isSelected={prefs.sources} onClick={() => setPrefs({ sources: !prefs.sources })}>
          Dynatrace sources
        </AppHeader.ActionButton>
        <AppHeader.ActionButton prefixIcon={<MaximizeIcon />} isSelected={prefs.tv} onClick={() => setPrefs({ tv: !prefs.tv })}>
          TV mode
        </AppHeader.ActionButton>
        <AppHeader.ActionButton prefixIcon={<DocumentIcon />} onClick={() => setUi({ summary: true })}>
          Summary
        </AppHeader.ActionButton>
        <AppHeader.ActionButton prefixIcon={<SettingIcon />} isSelected={ui.presenter} onClick={() => setUi({ presenter: !ui.presenter })}>
          Presenter
        </AppHeader.ActionButton>
      </AppHeader.ActionItems>
    </AppHeader>
  );
};
