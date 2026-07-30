import { A, useParams } from "@solidjs/router"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { createEffect, createMemo, createResource, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConnectSource } from "@/components/settings-v2/dialog-connect-source"
import { IssueSourceIcon } from "@/components/issue-source-icon"
import { useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { useTabs } from "@/context/tabs"
import { requireServerKey } from "@/utils/session-route"
import { getRelativeTime } from "@/utils/time"
import { issueWatcherApi, watcherConnectionSource, type InboxItem, type InboxSummary } from "./watchers/api"
import { authExpiredMessage, inboxAttentionCount, inboxBulkActionSupports, inboxQuery, selectableInboxItem, watcherAuthExpired, type InboxBulkAction, type InboxFilter } from "./watchers/logic"

type InboxProject = { readonly id: string; readonly name?: string; readonly worktree: string; readonly sandboxes: readonly string[] }
type InboxProjectTarget = { readonly projectID: string; readonly directory: string; readonly label: string }

async function projectTargets(serverSdk: ReturnType<typeof useServerSDK>, projects: readonly InboxProject[]) {
  return (await Promise.all(projects.map(async (project) => {
    const known = await serverSdk().api.project.directories({ projectID: project.id, location: { directory: project.worktree } })
      .then((items) => items.map((item) => item.directory))
      .catch(() => [] as string[])
    return [...new Set([project.worktree, ...project.sandboxes, ...known])].map((directory) => ({
      projectID: project.id,
      directory,
      label: project.name && directory === project.worktree ? project.name : directory,
    }))
  }))).flat()
}

export function InboxPage() {
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const tabs = useTabs()
  const params = useParams<{ serverKey: string }>()
  const [store, setStore] = createStore({
    filter: "all" as InboxFilter,
    polling: false,
    loadingMore: false,
    error: "",
    busy: "",
    selected: {} as Record<string, boolean>,
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
  const selectable = createMemo(() => store.items.filter((item) => selectableInboxItem(item.match.state)))
  const selected = createMemo(() => selectable().filter((item) => store.selected[item.match.id]))
  const selectedFor = (action: InboxBulkAction) => selected().filter((item) => inboxBulkActionSupports(action, item.match.state))
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
  const openSession = (sessionID: string) => {
    const tab = tabs.addSessionTab({ server: requireServerKey(params.serverKey), sessionId: sessionID })
    tabs.select(tab)
  }
  const refresh = async () => {
    setStore("selected", {})
    await refetch()
  }
  const act = async (item: InboxItem, action: "run" | "awaiting_run" | "skip" | "dismiss" | "retry") => {
    setStore({ busy: item.match.id, error: "" })
    const api = issueWatcherApi(serverSdk())
    const request = action === "retry"
      ? api.rematerialize({ matchID: item.match.id, mode: item.materialization?.mode ?? "awaiting_run" })
      : action === "skip"
      ? api.skip({ matchID: item.match.id })
      : action === "dismiss"
        ? api.dismiss({ matchID: item.match.id })
        : api.approve({ matchID: item.match.id, mode: action })
    await request
      .then(async (result) => {
        if (result && "sessionID" in result) openSession(result.sessionID)
        await refresh()
      })
      .catch((error: Error) => setStore("error", error.message))
    setStore("busy", "")
  }
  const bulk = async (action: "approve" | "skip" | "dismiss", mode?: "run" | "awaiting_run") => {
    const items = selectedFor(action)
    if (!items.length) return
    setStore({ busy: "bulk", error: "" })
    await issueWatcherApi(serverSdk()).bulk({ matchIDs: items.map((item) => item.match.id), action, mode })
      .then(async (result) => {
        const failed = result.items.filter((item) => item.status === "failed")
        if (failed.length) setStore("error", `${failed.length} selected issue${failed.length === 1 ? "" : "s"} could not be updated.`)
        setStore("selected", {})
        await refetch()
      })
      .catch((error: Error) => setStore("error", error.message))
    setStore("busy", "")
  }
  const pickProject = async (item: InboxItem) => {
    const projects = await serverSdk().api.project.list() as readonly InboxProject[]
    const targets = await projectTargets(serverSdk, projects)
    void dialog.push(() => <RouteInboxDialog item={item} projects={targets} onComplete={refresh} onOpenSession={openSession} />)
  }
  const inspectDuplicate = (item: InboxItem) => {
    void dialog.push(() => <DuplicateInboxDialog item={item} onComplete={refresh} onOpenSession={openSession} />)
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

              <Show when={store.error}>
                <div role="alert" class="rounded-lg border border-v2-border-border-danger bg-v2-background-bg-surface p-3 text-v2-text-text-danger">
                  <p class="text-12-medium">Error</p>
                  <p class="mt-1 text-12-regular">{store.error}</p>
                </div>
              </Show>
              <Show when={store.items.length} fallback={<Status>No issues match this filter.</Status>}>
                <section class="overflow-hidden rounded-xl border border-v2-border-border-base bg-v2-background-bg-base">
                  <div class="flex flex-wrap items-center gap-3 border-b border-v2-border-border-base bg-v2-background-bg-surface px-4 py-2">
                    <label class="flex items-center gap-2 text-11-regular text-v2-text-text-muted"><input type="checkbox" disabled={!selectable().length || !!store.busy} checked={!!selectable().length && selected().length === selectable().length} aria-label="Select all Inbox issues" onChange={(event) => setStore("selected", Object.fromEntries(selectable().map((item) => [item.match.id, event.currentTarget.checked])))} /> Select all ({selected().length})</label>
                    <ButtonV2 variant="ghost" disabled={!selectedFor("approve").length || !!store.busy} onClick={() => void bulk("approve", "run")}>Run selected</ButtonV2>
                    <ButtonV2 variant="ghost" disabled={!selectedFor("approve").length || !!store.busy} onClick={() => void bulk("approve", "awaiting_run")}>Await selected</ButtonV2>
                    <ButtonV2 variant="ghost" disabled={!selectedFor("skip").length || !!store.busy} onClick={() => void bulk("skip")}>Skip selected</ButtonV2>
                    <ButtonV2 variant="ghost" disabled={!selectedFor("dismiss").length || !!store.busy} onClick={() => void bulk("dismiss")}>Dismiss selected</ButtonV2>
                  </div>
                   <For each={store.items}>{(item, index) => <InboxRow item={item} divided={index() > 0} selected={!!store.selected[item.match.id]} busy={store.busy === item.match.id} onSelect={(selected) => setStore("selected", item.match.id, selected)} onAction={(action) => void act(item, action)} onRoute={() => pickProject(item)} onDuplicate={() => inspectDuplicate(item)} />}</For>
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

function InboxRow(props: {
  item: InboxItem
  divided: boolean
  selected: boolean
  busy: boolean
  onSelect: (selected: boolean) => void
  onAction: (action: "run" | "awaiting_run" | "skip" | "dismiss" | "retry") => void
  onRoute: () => void
  onDuplicate: () => void
}) {
  const language = useLanguage()
  const state = () => props.item.match.state
  const project = () => props.item.project?.name ?? props.item.match.routeReason ?? "No project matched"
  const retryable = () => props.item.materialization?.state === "failed" && !props.item.materialization.providerStarted
  const actionable = () => selectableInboxItem(state())
  return (
    <article classList={{ "border-t border-v2-border-border-base": props.divided }} class="flex flex-col gap-4 p-4 md:flex-row md:items-center">
      <div class="flex min-w-0 flex-1 gap-3">
        <input type="checkbox" disabled={!actionable() || props.busy} checked={props.selected} onChange={(event) => props.onSelect(event.currentTarget.checked)} aria-label={`Select ${props.item.match.externalKey}`} class="mt-2 size-4 shrink-0" />
        <IssueSourceIcon integrationID={props.item.match.integrationID} sourceName={props.item.sourceName} />
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><a href={props.item.match.externalUrl} target="_blank" rel="noreferrer" class="text-13-medium text-v2-text-text-strong hover:underline">{props.item.match.externalKey}</a><For each={props.item.match.payload.labels.slice(0, 3)}>{(label) => <span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5 text-10-regular text-v2-text-text-muted">{label}</span>}</For></div>
          <p class="mt-1 truncate text-14-regular text-v2-text-text-base">{props.item.match.payload.title}</p>
          <p class="mt-1 text-11-regular text-v2-text-text-muted">{props.item.watcherName} · {getRelativeTime(props.item.match.timeUpdated, language.t)} · {project()}</p>
        </div>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
        <span class="rounded-full bg-v2-background-bg-surface px-2 py-1 text-11-medium capitalize text-v2-text-text-muted">{state()}</span>
        <Show when={retryable()}>
          <span class="rounded-full bg-v2-background-bg-surface px-2 py-1 text-11-medium text-v2-text-text-danger">Materialization failed</span>
          <ButtonV2 variant="outline" disabled={props.busy} onClick={props.onRoute}>Pick project</ButtonV2>
          <ButtonV2 variant="outline" disabled={props.busy} onClick={() => props.onAction("retry")}>Retry creation</ButtonV2>
        </Show>
        <Show when={state() === "unrouted"}>
          <ButtonV2 variant="outline" disabled={props.busy} onClick={props.onRoute}>Pick project</ButtonV2>
          <ButtonV2 variant="ghost" disabled={props.busy} onClick={() => props.onAction("skip")}>Skip</ButtonV2>
        </Show>
        <Show when={state() === "duplicate"}>
          <ButtonV2 variant="outline" disabled={props.busy} onClick={props.onDuplicate}>Review duplicate</ButtonV2>
          <ButtonV2 variant="ghost" disabled={props.busy} onClick={() => props.onAction("dismiss")}>Dismiss</ButtonV2>
        </Show>
        <Show when={state() === "pending" && !retryable()}>
          <ButtonV2 variant="outline" disabled={props.busy} onClick={() => props.onAction("run")}>Create & run</ButtonV2>
          <ButtonV2 variant="ghost" disabled={props.busy} onClick={() => props.onAction("awaiting_run")}>Awaiting run</ButtonV2>
          <ButtonV2 variant="ghost" disabled={props.busy} onClick={() => props.onAction("skip")}>Skip</ButtonV2>
          <ButtonV2 variant="ghost" disabled={props.busy} onClick={() => props.onAction("dismiss")}>Dismiss</ButtonV2>
        </Show>
      </div>
    </article>
  )
}

function RouteInboxDialog(props: {
  item: InboxItem
  projects: readonly InboxProjectTarget[]
  onComplete: () => Promise<unknown>
  onOpenSession: (sessionID: string) => void
}) {
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const selectedDirectory = props.item.materialization?.sourceDirectory
  const [store, setStore] = createStore({
    target: (props.projects.find((project) => project.directory === selectedDirectory) ??
      props.projects.find((project) => project.projectID === (props.item.suggestion?.id ?? props.item.project?.id)) ??
      props.projects[0] ?? null) as InboxProjectTarget | null,
    persistMapping: false,
    busy: false,
    error: "",
  })
  const submit = async (mode: "run" | "awaiting_run" | "skip") => {
    if (!store.target && mode !== "skip") return
    setStore({ busy: true, error: "" })
    const api = issueWatcherApi(serverSdk())
    const request = mode === "skip"
      ? api.skip({ matchID: props.item.match.id })
      : api.routeMatch({ matchID: props.item.match.id, projectID: store.target!.projectID, directory: store.target!.directory, persistMapping: store.persistMapping })
          .then(() => props.item.materialization?.state === "failed"
            ? api.rematerialize({ matchID: props.item.match.id, mode, projectID: store.target!.projectID, directory: store.target!.directory })
            : api.approve({ matchID: props.item.match.id, mode, projectID: store.target!.projectID, directory: store.target!.directory }))
    await request
      .then(async (result) => {
        dialog.close()
        if (result && "sessionID" in result) props.onOpenSession(result.sessionID)
        await props.onComplete()
      })
      .catch((error: Error) => setStore("error", error.message))
    setStore("busy", false)
  }
  return (
    <Dialog fit>
      <DialogHeader><DialogTitle>Route {props.item.match.externalKey}</DialogTitle></DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 py-4">
        <Show when={props.item.suggestion}>
          {(suggestion) => <p class="rounded-lg bg-v2-background-bg-surface p-3 text-12-regular text-v2-text-text-muted">Suggested: <span class="text-v2-text-text-strong">{suggestion().name}</span><Show when={props.item.match.routeReason}> because {props.item.match.routeReason}</Show></p>}
        </Show>
        <label class="flex flex-col gap-2 text-12-medium text-v2-text-text-muted">Project
          <select class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2 text-v2-text-text-strong" value={store.target ? `${store.target.projectID}\0${store.target.directory}` : ""} disabled={store.busy} onChange={(event) => setStore("target", props.projects.find((project) => `${project.projectID}\0${project.directory}` === event.currentTarget.value) ?? null)}>
            <option value="">Select a project</option>
            <For each={props.projects.filter((project) => project.projectID)}>{(project) => <option value={`${project.projectID}\0${project.directory}`}>{project.label}</option>}</For>
          </select>
        </label>
        <label class="flex items-center gap-2 text-12-regular text-v2-text-text-muted"><input type="checkbox" checked={store.persistMapping} disabled={store.busy} onChange={(event) => setStore("persistMapping", event.currentTarget.checked)} /> Use this route for future matching issues</label>
        <Show when={store.error}><p class="text-12-regular text-v2-text-text-danger">{store.error}</p></Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" disabled={store.busy} onClick={() => dialog.close()}>Cancel</ButtonV2>
        <ButtonV2 variant="ghost" disabled={store.busy} onClick={() => void submit("skip")}>Skip</ButtonV2>
        <ButtonV2 variant="outline" disabled={store.busy || !store.target} onClick={() => void submit("awaiting_run")}>Awaiting run</ButtonV2>
        <ButtonV2 variant="contrast" disabled={store.busy || !store.target} onClick={() => void submit("run")}>Create & run</ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function DuplicateInboxDialog(props: {
  item: InboxItem
  onComplete: () => Promise<unknown>
  onOpenSession: (sessionID: string) => void
}) {
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const [store, setStore] = createStore({ busy: "", error: "" })
  const [detail] = createResource(() => props.item.match.id, async (matchID) => {
    try {
      return { data: await issueWatcherApi(serverSdk()).duplicateDetail({ matchID }) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to load duplicate details." }
    }
  })
  const current = () => detail()?.data
  const resolve = async (action: "continue" | "create_second" | "ignore") => {
    setStore({ busy: action, error: "" })
    await issueWatcherApi(serverSdk()).resolveDuplicate({
      matchID: props.item.match.id,
      action,
      mode: action === "ignore" ? undefined : "run",
    }).then(async (result) => {
      dialog.close()
      if ("sessionID" in result) props.onOpenSession(result.sessionID)
      await props.onComplete()
    }).catch((error: Error) => setStore("error", error.message))
    setStore("busy", "")
  }
  return (
    <Dialog size="large">
      <DialogHeader><DialogTitle>Duplicate issue: {props.item.match.externalKey}</DialogTitle></DialogHeader>
      <DialogBody class="flex max-h-[60vh] w-full flex-col gap-4 overflow-y-auto px-4 py-4">
        <Show when={detail()?.error} fallback={
          <Show when={current()} fallback={<p class="text-12-regular text-v2-text-text-muted">Loading changes...</p>}>
            <Show when={current()!.diff.length} fallback={<p class="text-12-regular text-v2-text-text-muted">No field-level changes were reported.</p>}><For each={current()!.diff}>{(change) => <div class="rounded-lg border border-v2-border-border-base p-3"><p class="text-12-medium text-v2-text-text-strong">{change.field}</p><div class="mt-2 grid gap-2 sm:grid-cols-2"><pre class="overflow-auto whitespace-pre-wrap rounded bg-v2-background-bg-surface p-2 text-11-regular text-v2-text-text-muted">{formatDiffValue(change.before)}</pre><pre class="overflow-auto whitespace-pre-wrap rounded bg-v2-background-bg-surface p-2 text-11-regular text-v2-text-text-base">{formatDiffValue(change.after)}</pre></div></div>}</For></Show>
          </Show>
        }><p class="text-12-regular text-v2-text-text-danger">{detail()?.error}</p></Show>
        <Show when={store.error}><p class="text-12-regular text-v2-text-text-danger">{store.error}</p></Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" disabled={!!store.busy} onClick={() => dialog.close()}>Cancel</ButtonV2>
        <Show when={current()?.primary}><ButtonV2 variant="ghost" disabled={!!store.busy} onClick={() => { dialog.close(); props.onOpenSession(current()!.primary!.sessionID) }}>Open session</ButtonV2></Show>
        <ButtonV2 variant="ghost" disabled={!!store.busy || !current()} onClick={() => void resolve("ignore")}>Ignore</ButtonV2>
        <ButtonV2 variant="outline" disabled={!!store.busy || !current()} onClick={() => void resolve("create_second")}>Create second</ButtonV2>
        <ButtonV2 variant="contrast" disabled={!!store.busy || !current()?.primary} onClick={() => void resolve("continue")}>Continue session</ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function formatDiffValue(value: unknown) {
  if (value === undefined) return "(empty)"
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

function InboxSetup(props: { connected: boolean; watchersHref: string; onConnect: () => void }) {
  return <section class="rounded-2xl border border-v2-border-border-base bg-v2-background-bg-base px-6 py-10 text-center"><p class="text-12-medium uppercase tracking-[0.14em] text-v2-text-text-muted">Three steps to your first watcher</p><h2 class="mt-2 text-20-medium text-v2-text-text-strong">{props.connected ? "Create your first watcher" : "Connect an issue source"}</h2><div class="mx-auto mt-7 grid max-w-3xl gap-3 text-left md:grid-cols-3"><SetupStep number="1" title="Connect a source">Credentials stay local to this OpenCode server.</SetupStep><SetupStep number="2" title="Describe the issues">Choose projects, labels, status, and assignee criteria.</SetupStep><SetupStep number="3" title="Route to a project">Preview where each matching issue will go.</SetupStep></div><p class="mx-auto mt-7 max-w-xl text-13-regular text-v2-text-text-muted">Nothing runs until a watcher is enabled. Watchers poll only while OpenCode is running.</p><div class="mt-5"><Show when={props.connected} fallback={<ButtonV2 onClick={props.onConnect}>Connect a source</ButtonV2>}><A href={props.watchersHref}><ButtonV2>New watcher</ButtonV2></A></Show></div></section>
}

function SetupStep(props: { number: string; title: string; children: string }) { return <div class="rounded-xl bg-v2-background-bg-surface p-4"><span class="text-11-medium text-v2-text-text-muted">0{props.number}</span><h3 class="mt-2 text-14-medium text-v2-text-text-strong">{props.title}</h3><p class="mt-1 text-12-regular text-v2-text-text-muted">{props.children}</p></div> }
function Filter(props: { active: boolean; onClick: () => void; children: import("solid-js").JSX.Element }) { return <button type="button" classList={{ "border-v2-border-border-focus bg-v2-background-bg-surface text-v2-text-text-strong": props.active }} class="rounded-full border border-v2-border-border-base px-3 py-1.5 text-12-medium text-v2-text-text-muted" onClick={props.onClick}>{props.children}</button> }
function Status(props: { children: string }) { return <p class="rounded-xl border border-v2-border-border-base bg-v2-background-bg-base py-12 text-center text-13-regular text-v2-text-text-muted">{props.children}</p> }
function ResourceError(props: { message: string; onRetry: () => void }) { return <section class="rounded-xl border border-v2-border-border-danger bg-v2-background-bg-base p-5 text-center"><p class="text-13-regular text-v2-text-text-danger">{props.message}</p><div class="mt-3"><ButtonV2 variant="outline" onClick={props.onRetry}>Retry</ButtonV2></div></section> }
