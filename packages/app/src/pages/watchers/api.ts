import type { ServerSDK } from "@/context/server-sdk"
import type {
  IssueWatchersHistoryOutput,
  IssueWatchersInboxOutput,
  IssueWatchersInboxSummaryOutput,
  IssueWatchersListOutput,
  IssueWatchersRunAllOutput,
  IssueWatchersRunOutput,
} from "@opencode-ai/client-next"
import type { IntegrationSource } from "@/components/settings-v2/integrations-logic"

export type InboxSummary = IssueWatchersInboxSummaryOutput
export type InboxItem = IssueWatchersInboxOutput["items"][number]
export type WatcherRun = IssueWatchersRunOutput
export type WatcherHistoryEntry = IssueWatchersHistoryOutput["items"][number]
export type WatcherSummary = IssueWatchersListOutput[number] & {
  readonly connection?: NonNullable<IntegrationSource["connection"]>
}
export type WatcherRunAll = IssueWatchersRunAllOutput

type GeneratedApi = ServerSDK["nextApi"]["issueWatchers"]
type AppApi = Omit<GeneratedApi, "list"> & {
  list: (...args: Parameters<GeneratedApi["list"]>) => Promise<ReadonlyArray<WatcherSummary>>
}

export function issueWatcherApi(sdk: ServerSDK) {
  return sdk.nextApi.issueWatchers as unknown as AppApi
}

export function watcherConnectionSource(sources: readonly IntegrationSource[], summary: WatcherSummary) {
  const source = sources.find((item) => item.integration.id === summary.watcher.integrationID)
  if (!source || !summary.connection) return
  return { ...source, connection: summary.connection }
}
