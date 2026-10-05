import Link from "next/link";
import { Status } from "@/components/status";
import type { Check } from "@/lib/domain";

export function CheckList({ checks, runHref }: { checks: Check[]; runHref?: (runId: string) => string }) {
  if (checks.length === 0) return <div className="empty-state">No checks reported yet.</div>;
  return (
    <div className="list-card">
      {checks.map((check) => (
        <div className="list-row" key={check.id}>
          <div className="grow">
            <Status status={check.status} />
            <strong>{check.name}</strong>
            {check.required ? <span className="muted"> · required</span> : null}
            {check.description ? <div className="muted small">{check.description}</div> : null}
          </div>
          {check.runId && runHref ? <Link href={runHref(check.runId)}>View run</Link> : check.detailsUrl ? <a href={check.detailsUrl}>Details</a> : null}
        </div>
      ))}
    </div>
  );
}
