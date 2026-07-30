import type { IssueWatchersProvenanceDetailOutput } from "@opencode-ai/client-next"
import type { AppSessionProvenance } from "@/utils/session"

export type SessionProvenanceDetail = IssueWatchersProvenanceDetailOutput

export function provenanceQueryEnabled(provenance: AppSessionProvenance | undefined) {
  return provenance?.type === "issue"
}

export function provenanceLocation(detail: SessionProvenanceDetail) {
  const workspace = detail.workspace ?? detail.materialization?.resolvedLocation
  return {
    branch: detail.branch ?? detail.provenance.branch ?? detail.materialization?.workspaceLease?.branch,
    directory: workspace?.directory,
    workspaceID: workspace?.workspaceID,
  }
}

export function provenanceWritebackStatus(detail: SessionProvenanceDetail) {
  if (!detail.writebacks.length) return "No writeback"
  if (detail.writebacks.some((item) => item.state === "failed")) return "Writeback failed"
  if (detail.writebacks.some((item) => item.state === "unknown")) return "Writeback unknown"
  if (detail.writebacks.some((item) => item.state === "pending" || item.state === "applying")) return "Writeback pending"
  return "Writeback synced"
}

export function provenanceWritebackEntry(item: SessionProvenanceDetail["writebacks"][number]) {
  const label = item.kind === "comment_created"
    ? "Start comment"
    : item.kind === "transition_started"
      ? "Start transition"
      : "Failure comment"
  const status = item.state === "applied"
    ? "Synced"
    : item.state === "applying"
      ? "Applying"
      : item.state === "pending"
        ? "Pending"
        : item.state === "failed"
          ? "Failed"
          : "Unknown"
  return { label, status }
}

export function provenanceLastSync(detail: SessionProvenanceDetail) {
  return detail.lastSyncedAt ?? detail.provenance.lastSyncedAt
}
