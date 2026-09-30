import React from "react";
import { Route, Routes } from "react-router-dom";
import { Button } from "@dynatrace/strato-components/buttons";
import { PageLayout } from "@dynatrace/strato-components/layouts";
import { ToastContainer } from "@dynatrace/strato-components/notifications";
import { DetailsPanel } from "./components/DetailsPanel";
import { Header } from "./components/Header";
import { PresenterSheet } from "./components/PresenterSheet";
import { SessionSummary } from "./components/SessionSummary";
import { DataIntegrations } from "./pages/DataIntegrations";
import { HowItWorks } from "./pages/HowItWorks";
import { Live } from "./pages/Live";
import { EngineProvider } from "./state/engine-context";
import { useShortcuts, useTour } from "./state/use-demo-controls";

const Shell = () => {
  useShortcuts();
  const tour = useTour();
  return (
    <>
      <PageLayout>
        <PageLayout.Header>
          <Header />
        </PageLayout.Header>
        <PageLayout.Content>
          <Routes>
            <Route path="/" element={<Live />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/data" element={<DataIntegrations />} />
          </Routes>
        </PageLayout.Content>
        <DetailsPanel />
      </PageLayout>
      <PresenterSheet onTour={tour.start} />
      <SessionSummary />
      {tour.running && tour.caption && (
        <div className="ff-tour" role="status" aria-live="polite">
          <span className="ff-tour-kicker">Tour</span>
          <span>{tour.caption}</span>
          <Button size="condensed" onClick={tour.stop}>
            End tour
          </Button>
        </div>
      )}
      <ToastContainer />
    </>
  );
};

export const App = () => (
  <EngineProvider>
    <Shell />
  </EngineProvider>
);
