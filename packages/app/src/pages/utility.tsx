import { A, useParams } from "@solidjs/router"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createEffect, createMemo, createResource, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConnectSource } from "@/components/settings-v2/dialog-connect-source"
import { useServerSDK } from "@/context/server-sdk"
import { issueWatcherApi, watcherConnectionSource, type InboxItem, type InboxSummary } from "./watchers/api"
import { authExpiredMessage, inboxActions, inboxAttentionCount, inboxQuery, watcherAuthExpired, type InboxFilter } from "./watchers/logic"

export function InboxPage() {
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const params = useParams<{ serverKey: string }>()
  const [store, setStore] = createStore({
    filter: "all" as InboxFilter,
    polling: false,
    loadingMore: false,
    error: "",
    items: [] as InboxItem[],
    nextCursor: undefined as string | undefined,
  })
  const [data, { refetch }] = createResource(
    () => `${serverSdk().scope}:${store.filter}`,
    async () => {
      const api = issueWatcherApi(serverSdk())
      const [sources, watchers, page, summary] = await Promise.all([
        api.sources(),
        api.list(),
        api.inbox({ ...inboxQuery(store.filter), limit: 50 }),
        api.inboxSummary(),
      ])
      return { sources, watchers, page, summary }
    },
  )
  const watchersHref = () => `/server/${encodeURIComponent(params.serverKey)}/watchers`
  const connected = () => data()?.sources.some((source) => source.connection) ?? false
  const authFailures = createMemo(() => {
    const current = data()
    if (!current) return []
    return current.watchers.flatMap((watcher) => {
      if (!watcherAuthExpired(watcher)) return []
      const source = watcherConnectionSource(current.sources, watcher)
      return [{ watcher, source }]
    })
  })
  const sourceFilters = createMemo(() => {
    return (data()?.sources ?? []).map((source) => ({ id: source.integration.id, name: source.integration.name }))
  })
  createEffect(() => {
    const current = data()
    if (!current) return
    setStore({ items: [...current.page.items], nextCursor: current.page.nextCursor, error: "" })
  })
  const poll = async () => {
    setStore({ polling: true, error: "" })
    await issueWatcherApi(serverSdk()).runAll()
      .then(() => refetch())
      .catch((error: Error) => setStore("error", error.message))
    setStore("polling", false)
  }
  const connect = (source?: (NonNullable<ReturnType<typeof data>>["sources"])[number], watcherID?: string) => {
    if (watcherID && !source) return
    void dialog.push(() => <DialogConnectSource sources={data()?.sources ?? []} source={source} onSaved={async () => {
      if (watcherID) await serverSdk().nextApi.issueWatchers.enable({ watcherID, enabled: true })
      await refetch()
    }} />)
  }
  const loadMore = async () => {
    if (!store.nextCursor || store.loadingMore) return
    setStore({ loadingMore: true, error: "" })
    await issueWatcherApi(serverSdk()).inbox({ ...inboxQuery(store.filter), cursor: store.nextCursor, limit: 50 })
      .then((page) => setStore({ items: [...store.items, ...page.items], nextCursor: page.nextCursor }))
      .catch((error: Error) => setStore("error", error.message))
    setStore("loadingMore", false)
  }

  onMount(() => {
    serverSdk().event.start()
    const unsub = serverSdk().event.listen(({ details }) => {
      const event = details as { type: string }
      if (
        event.type === "issue_watcher.inbox.changed" ||
        event.type === "issue_watcher.run.completed" ||
        event.type === "issue_match.created" ||
        event.type === "issue_match.updated"
      ) void refetch()
    })
    onCleanup(unsub)
  })

  return (
    <main class="h-full min-h-0 w-full min-w-0 overflow-auto bg-v2-background-bg-deep text-v2-text-text-base">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <header class="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <p class="text-12-medium uppercase tracking-[0.14em] text-v2-text-text-muted">Issue watchers</p>
            <h1 class="mt-1 text-24-medium text-v2-text-text-strong">Inbox</h1>
            <p class="mt-2 text-14-regular text-v2-text-text-muted">Issues observed by your enabled watchers.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <A href={watchersHref()}><ButtonV2 variant="ghost">Watcher settings</ButtonV2></A>
            <ButtonV2 disabled={!data()?.watchers.length || store.polling} onClick={() => void poll()}>
              {store.polling ? "Polling..." : "Poll now"}
            </ButtonV2>
          </div>
        </header>

        <Show when={!data.error} fallback={<ResourceError message={data.error?.message ?? "Unable to load Inbox."} onRetry={() => void refetch()} />}>
        <Show when={data()} fallback={<Status>Loading Inbox...</Status>}>
          {(current) => (
            <Show
              when={connected() && current().watchers.length > 0}
               fallback={<InboxSetup connected={connected()} watchersHref={watchersHref()} onConnect={() => connect()} />}
            >
              <For each={authFailures()}>
                {(failure) => (
                  <section class="flex flex-col gap-3 rounded-xl border border-v2-border-border-danger bg-v2-background-bg-base p-4 md:flex-row md:items-center">
                    <p class="min-w-0 flex-1 text-13-regular text-v2-text-text-danger">
                      {authExpiredMessage(failure.source?.integration.name ?? "Issue source", failure.watcher.watcher.name)}
                    </p>
                     <ButtonV2 variant="outline" onClick={() => connect(failure.source, failure.watcher.watcher.id)}>Reconnect and resume</ButtonV2>
                  </section>
                )}
              </For>

              <Summary summary={current().summary} />

              <nav class="flex flex-wrap gap-2" aria-label="Inbox filters">
                <Filter active={store.filter === "all"} onClick={() => setStore("filter", "all")}>All</Filter>
                <Filter active={store.filter === "attention"} onClick={() => setStore("filter", "attention")}>
                  Needs attention ({inboxAttentionCount(current().summary)})
                </Filter>
                <For each={sourceFilters()}>
                  {(source) => <Filter active={store.filter === `source:${source.id}`} onClick={() => setStore("filter", `source:${source.id}`)}>{source.name}</Filter>}
                </For>
                <Filter active={store.filter === "dismissed"} onClick={() => setStore("filter", "dismissed")}>Dismissed</Filter>
              </nav>

              <Show when={store.error}><p class="rounded-lg bg-v2-background-bg-base p-3 text-12-regular text-v2-text-text-danger">{store.error}</p></Show>
              <Show when={store.items.length} fallback={<Status>No issues match this filter.</Status>}>
                <section class="overflow-hidden rounded-xl border border-v2-border-border-base bg-v2-background-bg-base">
                  <div class="flex flex-wrap items-center gap-3 border-b border-v2-border-border-base bg-v2-background-bg-surface px-4 py-2">
                    <label class="flex items-center gap-2 text-11-regular text-v2-text-text-muted"><input type="checkbox" disabled aria-label="Select all Inbox issues" /> Select all</label>
                    <ButtonV2 variant="ghost" disabled>Run selected</ButtonV2>
                    <ButtonV2 variant="ghost" disabled>Skip selected</ButtonV2>
                  </div>
                   <For each={store.items}>{(item, index) => <InboxRow item={item} divided={index() > 0} />}</For>
                </section>
              </Show>
              <Show when={store.nextCursor}><div class="flex justify-center"><ButtonV2 variant="outline" disabled={store.loadingMore} onClick={() => void loadMore()}>{store.loadingMore ? "Loading..." : "Load more"}</ButtonV2></div></Show>
            </Show>
          )}
        </Show>
        </Show>
      </div>
    </main>
  )
}

function Summary(props: { summary: InboxSummary }) {
  const values = () => [
    ["Awaiting triage", props.summary.pending],
    ["Needs attention", inboxAttentionCount(props.summary)],
    ["Sessions this week", props.summary.sessionsOpenedThisWeek],
    ["Failed runs", props.summary.failedRuns],
  ] as const
  return <section class="grid grid-cols-2 gap-2 md:grid-cols-4"><For each={values()}>{(item) => <div class="rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-4"><p class="text-22-medium text-v2-text-text-strong">{item[1]}</p><p class="mt-1 text-12-regular text-v2-text-text-muted">{item[0]}</p></div>}</For></section>
}

function InboxRow(props: { item: InboxItem; divided: boolean }) {
  const state = () => props.item.match.state
  const project = () => props.item.project?.name ?? props.item.match.routeReason ?? "No project matched"
  return (
    <article classList={{ "border-t border-v2-border-border-base": props.divided }} class="flex flex-col gap-4 p-4 md:flex-row md:items-center">
      <div class="flex min-w-0 flex-1 gap-3">
        <input type="checkbox" disabled aria-label={`Select ${props.item.match.externalKey}`} class="mt-2 size-4 shrink-0" />
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-surface text-12-medium uppercase text-v2-text-text-muted">{props.item.sourceGlyph || props.item.sourceName.slice(0, 1)}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><a href={props.item.match.externalUrl} target="_blank" rel="noreferrer" class="text-13-medium text-v2-text-text-strong hover:underline">{props.item.match.externalKey}</a><For each={props.item.match.payload.labels.slice(0, 3)}>{(label) => <span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5 text-10-regular text-v2-text-text-muted">{label}</span>}</For></div>
          <p class="mt-1 truncate text-14-regular text-v2-text-text-base">{props.item.match.payload.title}</p>
          <p class="mt-1 text-11-regular text-v2-text-text-muted">{props.item.watcherName} · {relativeTime(props.item.match.timeUpdated)} · {project()}</p>
        </div>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
        <span class="rounded-full bg-v2-background-bg-surface px-2 py-1 text-11-medium capitalize text-v2-text-text-muted">{state()}</span>
        <For each={inboxActions(state())}>{(action, index) => <ButtonV2 variant={index() === 0 ? "outline" : "ghost"} disabled>{action}</ButtonV2>}</For>
      </div>
    </article>
  )
}

function InboxSetup(props: { connected: boolean; watchersHref: string; onConnect: () => void }) {
  return <section class="rounded-2xl border border-v2-border-border-base bg-v2-background-bg-base px-6 py-10 text-center"><p class="text-12-medium uppercase tracking-[0.14em] text-v2-text-text-muted">Three steps to your first watcher</p><h2 class="mt-2 text-20-medium text-v2-text-text-strong">{props.connected ? "Create your first watcher" : "Connect an issue source"}</h2><div class="mx-auto mt-7 grid max-w-3xl gap-3 text-left md:grid-cols-3"><SetupStep number="1" title="Connect a source">Credentials stay local to this OpenCode server.</SetupStep><SetupStep number="2" title="Describe the issues">Choose projects, labels, status, and assignee criteria.</SetupStep><SetupStep number="3" title="Route to a project">Preview where each matching issue will go.</SetupStep></div><p class="mx-auto mt-7 max-w-xl text-13-regular text-v2-text-text-muted">Nothing runs until a watcher is enabled. Watchers poll only while OpenCode is running.</p><div class="mt-5"><Show when={props.connected} fallback={<ButtonV2 onClick={props.onConnect}>Connect a source</ButtonV2>}><A href={props.watchersHref}><ButtonV2>New watcher</ButtonV2></A></Show></div></section>
}

function SetupStep(props: { number: string; title: string; children: string }) { return <div class="rounded-xl bg-v2-background-bg-surface p-4"><span class="text-11-medium text-v2-text-text-muted">0{props.number}</span><h3 class="mt-2 text-14-medium text-v2-text-text-strong">{props.title}</h3><p class="mt-1 text-12-regular text-v2-text-text-muted">{props.children}</p></div> }
function Filter(props: { active: boolean; onClick: () => void; children: import("solid-js").JSX.Element }) { return <button type="button" classList={{ "border-v2-border-border-focus bg-v2-background-bg-surface text-v2-text-text-strong": props.active }} class="rounded-full border border-v2-border-border-base px-3 py-1.5 text-12-medium text-v2-text-text-muted" onClick={props.onClick}>{props.children}</button> }
function Status(props: { children: string }) { return <p class="rounded-xl border border-v2-border-border-base bg-v2-background-bg-base py-12 text-center text-13-regular text-v2-text-text-muted">{props.children}</p> }
function ResourceError(props: { message: string; onRetry: () => void }) { return <section class="rounded-xl border border-v2-border-border-danger bg-v2-background-bg-base p-5 text-center"><p class="text-13-regular text-v2-text-text-danger">{props.message}</p><div class="mt-3"><ButtonV2 variant="outline" onClick={props.onRetry}>Retry</ButtonV2></div></section> }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago` }
