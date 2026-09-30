import React from "react";
import type { Level } from "../theme/colors";

/** Status shape + symbol (Strato pattern): circle ✓, triangle !, diamond ✕. Never color alone. */
export const LevelIcon = ({ level, color, icon, size = 12 }: { level: Level; color: string; icon?: string; size?: number }) => {
  if (icon === "clock")
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <circle cx={6} cy={6} r={5} fill="none" stroke={color} strokeWidth={1.4} />
        <path d="M6,3 L6,6.3 L8.2,7.5" stroke={color} strokeWidth={1.4} fill="none" />
      </svg>
    );
  if (icon === "hourglass")
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5,1 L9.5,1 L6,6 L9.5,11 L2.5,11 L6,6 Z" fill="none" stroke={color} strokeWidth={1.4} />
      </svg>
    );
  if (level === "warning")
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <path d="M6,0.8 L11.4,11 L0.6,11 Z" fill={color} />
        <path d="M6,4.2 L6,7.4 M6,8.7 L6,9.5" stroke="#F5C400" strokeWidth={1.3} />
      </svg>
    );
  if (level === "critical")
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <path d="M6,0.5 L11.5,6 L6,11.5 L0.5,6 Z" fill={color} />
        <path d="M4.3,4.3 L7.7,7.7 M7.7,4.3 L4.3,7.7" stroke="#DC172A" strokeWidth={1.3} />
      </svg>
    );
  if (level === "neutral")
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <circle cx={6} cy={6} r={5} fill="none" stroke={color} strokeWidth={1.4} />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <circle cx={6} cy={6} r={5.2} fill={color} />
      <path d="M3.5,6.2 L5.3,8 L8.6,4.3" stroke="#22A652" strokeWidth={1.4} fill="none" />
    </svg>
  );
};
