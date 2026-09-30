import React from "react";
import { EquipmentMatrix } from "../components/EquipmentMatrix";
import { IntelligenceDrawer } from "../components/IntelligenceDrawer";
import { KpiRibbon } from "../components/KpiRibbon";
import { OcrCamera } from "../components/OcrCamera";
import { PassageFeed } from "../components/PassageFeed";
import { PipelineFlow } from "../components/PipelineFlow";
import { SourceTag } from "../components/SourceTag";
import { GantryScene } from "../scene/GantryScene";
import { useApp } from "../state/engine-context";

export const Live = () => {
  const { prefs } = useApp();
  return (
    <div className={`ff-live ${prefs.tv ? "ff-tv" : ""}`}>
      <KpiRibbon />
      <div className="ff-main">
        <section className="ff-panel ff-scene-panel" aria-label="Gantry scene">
          <GantryScene />
          <SourceTag text="Every vehicle is a transaction Business Event; gantry equipment via Extensions; weather via the km 42 station metric" />
        </section>
        <div className="ff-side">
          <EquipmentMatrix />
        </div>
      </div>
      <IntelligenceDrawer />
      <div className="ff-bottom">
        <OcrCamera />
        <PipelineFlow />
        <PassageFeed />
      </div>
    </div>
  );
};
