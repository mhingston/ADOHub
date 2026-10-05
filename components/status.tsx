import type { CheckStatus, ReviewState } from "@/lib/domain";

const symbols: Record<CheckStatus, string> = {
  queued: "○",
  running: "●",
  success: "✓",
  failure: "✕",
  cancelled: "⊘",
  skipped: "–",
};

export function Status({ status, label }: { status: CheckStatus; label?: string }) {
  return <span className={`status status-${status}`}><span aria-hidden>{symbols[status]}</span> {label ?? status}</span>;
}

export function ReviewBadge({ state }: { state: ReviewState }) {
  const label = state === "approved-with-suggestions"
    ? "approved + suggestions"
    : state === "waiting-for-author"
      ? "waiting for author"
      : state === "changes-requested"
        ? "changes requested"
        : state;
  return <span className={`review review-${state}`}>{label}</span>;
}
