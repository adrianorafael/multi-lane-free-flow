import React from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Text } from "@dynatrace/strato-components/typography";
import { useApp, useSnapshot } from "../state/engine-context";
import { fmtDec, fmtInt, fmtMoneyShort } from "../format";

export const SessionSummary = () => {
  const { ui, setUi } = useApp();
  const snap = useSnapshot();
  const s = snap.session;
  const mttd = s.incidents.length ? s.incidents.reduce((a, i) => a + i.mttdMin, 0) / s.incidents.length : 0;
  const minutes = Math.max(1, (Date.now() - s.start) / 60_000);
  return (
    <Modal
      show={ui.summary}
      size="medium"
      title="Demo summary"
      onDismiss={() => setUi({ summary: false })}
      footer={<Button onClick={() => setUi({ summary: false })}>Close</Button>}
    >
      <div className="ff-summary">
        <div className="ff-summary-grid">
          <div>
            <b>{fmtInt(s.transactions)}</b>
            <span>transactions followed in {fmtInt(minutes)} min</span>
          </div>
          <div>
            <b>{fmtMoneyShort(s.revenue)}</b>
            <span>billed during the session</span>
          </div>
          <div>
            <b>{fmtInt(s.incidents.length)}</b>
            <span>incidents detected</span>
          </div>
          <div>
            <b>{s.incidents.length ? `${fmtDec(mttd, 1)} min` : "—"}</b>
            <span>mean time to detection</span>
          </div>
          <div>
            <b>{fmtMoneyShort(s.protected)}</b>
            <span>with delayed but protected (recovered) settlement</span>
          </div>
          <div>
            <b>{fmtMoneyShort(s.risk)}</b>
            <span>at risk, flagged with a root cause</span>
          </div>
        </div>
        {s.incidents.length > 0 && (
          <ul className="ff-summary-list">
            {s.incidents.map((i, n) => (
              <li key={n}>
                <b>{i.name}</b> · detected in {i.mttdMin} min · {i.impact}
              </li>
            ))}
          </ul>
        )}
        <Text className="ff-summary-quote">Without observability, these incidents would be discovered by the next-day reconciliation.</Text>
      </div>
    </Modal>
  );
};
