import React from "react";
import type { Plate } from "../sim/plates";
import { maskPlate } from "../sim/plates";

const PLATE_FONT = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";

/** Generic, fictitious license plate drawn in SVG (no external images). */
export const LicensePlate = ({ plate, masked, width = 84 }: { plate: Plate; masked: boolean; width?: number }) => {
  const text = maskPlate(plate.text, masked);
  const h = width * 0.325;
  const ink = plate.commercial ? "#C8102E" : "#14213D";
  return (
    <svg width={width} height={h} viewBox="0 0 400 130" role="img" aria-label={`License plate ${text}`}>
      <rect x={3} y={3} width={394} height={124} rx={14} fill="#FFFFFF" stroke="#14213D" strokeWidth={6} />
      <rect x={14} y={12} width={372} height={22} rx={6} fill="#14213D" />
      <text x={200} y={29} textAnchor="middle" fontSize={17} fontWeight={700} fill="#7FE7DC" fontFamily={PLATE_FONT} letterSpacing={6}>
        FREE FLOW
      </text>
      <text
        x={200}
        y={112}
        textAnchor="middle"
        fontSize={plate.format === "compact" ? 80 : 76}
        fontWeight={700}
        fill={ink}
        fontFamily={PLATE_FONT}
        letterSpacing={plate.format === "compact" ? 6 : 3}
      >
        {text}
      </text>
    </svg>
  );
};
