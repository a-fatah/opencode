import { A, useParams } from "@solidjs/router"
import { createResource, Show, type JSX } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useServerSDK } from "@/context/server-sdk"

function UtilityPage(props: { title: string; description: string; children?: JSX.Element }) {
  return (
    <div class="m-2 flex min-h-0 flex-1 self-stretch rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="m-auto flex max-w-md flex-col items-center gap-2 px-6 text-center">
        <h1 class="text-lg font-medium text-v2-text-text-base">{props.title}</h1>
        <p class="text-v2-text-text-muted">{props.description}</p>
        {props.children}
      </div>
    </div>
  )
}

export function InboxPage() {
  const serverSdk = useServerSDK()
  const params = useParams<{ serverKey: string }>()
  const [data] = createResource(
    () => serverSdk().scope,
    async () => {
      const api = serverSdk().nextApi.issueWatchers
      const [sources, watchers] = await Promise.all([api.sources(), api.list()])
      return { connected: sources.some((source) => source.connection), watchers: watchers.length }
    },
  )
  const watchersHref = () => `/server/${encodeURIComponent(params.serverKey)}/watchers`
  return (
    <Show when={data()} fallback={<UtilityPage title="Inbox" description="Loading issue watcher setup..." />}>
      {(current) => (
        <UtilityPage
          title="Inbox"
          description={
            !current().connected
              ? "Connect an issue source, describe the issues, and route them to a project from Watchers."
              : !current().watchers
                ? "Create a watcher to describe issues and preview how they route to a project."
                : "Issue triage appears here after polling is added."
          }
        >
          <A href={watchersHref()}><ButtonV2>{current().connected ? "Open Watchers" : "Connect a source"}</ButtonV2></A>
          <p class="text-xs text-v2-text-text-muted">Nothing runs until a watcher is enabled. Watchers poll only while OpenCode is running.</p>
        </UtilityPage>
      )}
    </Show>
  )
}
