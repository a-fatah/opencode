export function homeRelativeTime(value: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - value) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function homeSessionMatchesSource(source: "all" | "issues" | "manual", issue: boolean) {
  if (source === "issues") return issue
  if (source === "manual") return !issue
  return true
}

export function homeSessionSourceGroups<T>(records: readonly T[], issue: (record: T) => boolean) {
  return [
    { id: "issues" as const, title: "From issues", sessions: records.filter(issue) },
    { id: "manual" as const, title: "Manual", sessions: records.filter((record) => !issue(record)) },
  ].filter((group) => group.sessions.length)
}
