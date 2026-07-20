import { Fragment } from "react";

export function PreserveAda({ children }: { children: string }) {
  return children.split(/(ADA)/g).map((part, index) =>
    part === "ADA" ? (
      <span className="notranslate" translate="no" key={`${part}-${index}`}>
        ADA
      </span>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}
