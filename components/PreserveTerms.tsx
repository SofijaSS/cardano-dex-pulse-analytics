import { Fragment } from "react";
import { splitProtectedTerms } from "@/lib/translation";

export function PreserveTerms({ children }: { children: string }) {
  return splitProtectedTerms(children).map((segment, index) =>
    segment.protected ? (
      <span
        className="notranslate"
        translate="no"
        key={`${segment.value}-${index}`}
      >
        {segment.value}
      </span>
    ) : (
      <Fragment key={`${segment.value}-${index}`}>{segment.value}</Fragment>
    ),
  );
}
