import React from "react";
import { useApp } from "../state/engine-context";

/** "Dynatrace sources" mode (key D): shows which platform capability would feed the panel in real life. */
export const SourceTag = ({ text }: { text: string }) => {
  const { prefs } = useApp();
  if (!prefs.sources) return null;
  return (
    <div className="ff-source" role="note">
      <span className="ff-source-kicker">In real life</span>
      {text}
    </div>
  );
};
