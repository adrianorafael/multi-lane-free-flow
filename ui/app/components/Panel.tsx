import React, { type ReactNode } from "react";
import { Heading } from "@dynatrace/strato-components/typography";
import { SourceTag } from "./SourceTag";

/** Standard panel container (Strato tokens) with the "Dynatrace sources" tag. */
export const Panel = ({
  title,
  right,
  source,
  children,
  className,
}: {
  title: string;
  right?: ReactNode;
  source?: string;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`ff-panel ${className ?? ""}`}>
    <header className="ff-panel-head">
      <Heading level={6} as="h2">
        {title}
      </Heading>
      {right}
    </header>
    <div className="ff-panel-body">{children}</div>
    {source && <SourceTag text={source} />}
  </section>
);
