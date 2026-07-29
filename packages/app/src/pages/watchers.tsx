import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { A, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store"
import { DialogConnectSource } from "@/components/settings-v2/dialog-connect-source"
import type { IntegrationSource } from "@/components/settings-v2/integrations-logic"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { requireServerKey } from "@/utils/session-route"
import type { IssueWatchersPreviewInput, IssueWatchersPreviewOutput } from "@opencode-ai/client-next"
import {
  authExpiredMessage,
  canPreview,
  canSave,
  criteriaSummary,
  emptyWatcherDraft,
  inboxAttentionCount,
  outcomeLabel,
  routeRungs,
  routingSummary,
  splitValues,
  type WatcherDraft,
} from "./watchers/logic"
import { issueWatcherApi, watcherConnectionSource, type InboxSummary, type WatcherHistoryEntry, type WatcherSummary } from "./watchers/api"

type WatcherToggle = { id: string; enabled: boolean }
type PreviewMatch = IssueWatchersPreviewOutput["matches"][number]
type PreviewOutput = IssueWatchersPreviewOutput
type PreviewInput = IssueWatchersPreviewInput
type EditorState = {
  draft: WatcherDraft
  section: "criteria" | "routing" | "action"
  loaded: boolean
  saving: boolean
  error: string
  preview: PreviewOutput | undefined
  previewBusy: boolean
  previewError: string
  history: ReadonlyArray<WatcherHistoryEntry>
  historyCursor: string | undefined
  historyLoading: boolean
  historyError: string
}
type EditorSetter = SetStoreFunction<EditorState>

const modes = ["inbox", "awaiting_run", "run"] as const
const workspaces = ["branch", "current", "worktree"] as const
const mappingTypes = ["label", "component", "issueProject"] as const
const escapeLanguages = ["jql", "linear-filter", "github-search"] as const

export default function WatchersPage() {
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const navigate = useNavigate()
  const params = useParams<{ serverKey: string }>()
  const [store, setStore] = createStore({ running: "", error: "" })
  const href = (suffix = "") => `/server/${encodeURIComponent(params.serverKey)}/watchers${suffix}`
  const [data, { refetch }] = createResource(
    () => serverSdk().scope,
    async () => {
      const api = issueWatcherApi(serverSdk())
      const [watchers, sources, summary] = await Promise.all([api.list(), api.sources(), api.inboxSummary()])
      return { watchers, sources, summary }
    },
  )
  const connect = (watcher?: WatcherSummary) => {
    const source = watcher ? watcherConnectionSource(data()?.sources ?? [], watcher) : undefined
    if (watcher && !source) return
    void dialog.push(() => (
      <DialogConnectSource sources={data()?.sources ?? []} source={source} onSaved={async () => {
        if (watcher) await serverSdk().nextApi.issueWatchers.enable({ watcherID: watcher.watcher.id, enabled: true })
        await refetch()
      }} />
    ))
  }
  const toggle = async (watcher: WatcherToggle) => {
    await serverSdk().nextApi.issueWatchers.enable({ watcherID: watcher.id, enabled: !watcher.enabled })
    await refetch()
  }
  const run = async (watcherID?: string) => {
    setStore({ running: watcherID ?? "all", error: "" })
    const api = issueWatcherApi(serverSdk())
    await (watcherID ? api.run({ watcherID }) : api.runAll())
      .then(() => refetch())
      .catch((error: Error) => setStore("error", error.message))
    setStore("running", "")
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
    <main class="h-full min-h-0 overflow-auto bg-v2-background-bg-deep text-v2-text-text-base">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-10">
        <header class="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-12-medium uppercase tracking-[0.14em] text-v2-text-text-muted">Automation</p>
            <h1 class="mt-1 text-24-medium text-v2-text-text-strong">Watchers</h1>
            <p class="mt-2 max-w-2xl text-14-regular text-v2-text-text-muted">
              Match issues, route them to an OpenCode project, and choose what happens next.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <ButtonV2 variant="outline" disabled={!data()?.watchers.length || !!store.running} onClick={() => void run()}>{store.running === "all" ? "Running..." : "Run all now"}</ButtonV2>
            <ButtonV2 icon="plus-small" disabled={!data()?.sources.some((source) => source.connection)} onClick={() => navigate(href("/new"))}>New watcher</ButtonV2>
          </div>
        </header>

        <Show when={!data.error} fallback={<ResourceError message={data.error?.message ?? "Unable to load watchers."} onRetry={() => void refetch()} />}>
        <Show when={data()} fallback={<Status>Loading watchers...</Status>}>
          {(current) => (
            <Show
              when={current().sources.some((source) => source.connection)}
              fallback={<FirstRun kind="source" onConnect={() => connect()} />}
            >
              <Show when={current().watchers.length} fallback={<FirstRun kind="watcher" href={href("/new")} />}>
                <Show when={store.error}><p class="rounded-lg bg-v2-background-bg-base p-3 text-12-regular text-v2-text-text-danger">{store.error}</p></Show>
                <For each={current().watchers.filter((watcher) => watcher.lastRun?.outcome === "auth_failed" || (!!watcher.watcher.lastError && !watcher.watcher.enabled))}>
                  {(watcher) => {
                    return <section class="flex flex-col gap-3 rounded-xl border border-v2-border-border-danger bg-v2-background-bg-base p-4 sm:flex-row sm:items-center"><p class="min-w-0 flex-1 text-13-regular text-v2-text-text-danger">{authExpiredMessage(watcher.sourceName, watcher.watcher.name)}</p><ButtonV2 variant="outline" onClick={() => connect(watcher)}>Reconnect and resume</ButtonV2></section>
                  }}
                </For>
                <section class="overflow-hidden rounded-xl border border-v2-border-border-base bg-v2-background-bg-base">
                  <For each={current().watchers}>
                    {(watcher, index) => {
                      const info = () => watcher.watcher
                      return (
                        <div classList={{ "border-t border-v2-border-border-base": index() > 0 }} class="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                          <A href={href(`/${info().id}`)} class="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-v2-border-border-focus">
                            <div class="flex items-center gap-2">
                              <span class="flex size-7 items-center justify-center rounded-md bg-v2-background-bg-surface text-12-medium uppercase text-v2-text-text-muted">
                                {watcher.sourceGlyph || watcher.sourceName.slice(0, 1)}
                              </span>
                              <span class="truncate text-14-medium text-v2-text-text-strong">{info().name}</span>
                              <span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5 text-11-regular text-v2-text-text-muted">
                                {info().action.mode === "run" ? "Auto-run" : info().action.mode === "awaiting_run" ? "Awaiting run" : "Inbox"}
                              </span>
                            </div>
                            <p class="mt-2 truncate text-12-regular text-v2-text-text-muted">
                              {criteriaSummary(info().criteria)} · {routingSummary(info().routing)}
                            </p>
                            <p class="mt-1 text-11-regular text-v2-text-text-muted">
                              {watcher.lastRun ? outcomeLabel(watcher.lastRun.outcome) : "No outcome yet"} · {watcher.recentMatchCount} recent matches
                            </p>
                            <Show when={info().lastError}>
                              <p class="mt-1 text-12-regular text-v2-text-text-danger">Paused: {info().lastError}</p>
                            </Show>
                          </A>
                           <div class="flex flex-wrap items-center gap-3 md:shrink-0">
                            <span class="text-12-regular text-v2-text-text-muted">
                              {watcher.lastRun ? `Last run ${new Date(watcher.lastRun.startedAt).toLocaleString()}` : "Never run"}
                            </span>
                            <ButtonV2 variant="ghost" disabled={!!store.running || !info().enabled} onClick={() => void run(info().id)}>{store.running === info().id ? "Running..." : "Run now"}</ButtonV2>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={info().enabled}
                              aria-label={`${info().enabled ? "Disable" : "Enable"} ${info().name}`}
                              classList={{ "bg-v2-background-bg-interactive": info().enabled, "bg-v2-background-bg-surface": !info().enabled }}
                              class="relative h-6 w-10 rounded-full border border-v2-border-border-base transition-colors"
                              onClick={() => void toggle(info())}
                            >
                              <span classList={{ "translate-x-4": info().enabled, "translate-x-0": !info().enabled }} class="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform" />
                            </button>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </section>
                <WatcherCounters summary={current().summary} />
              </Show>
            </Show>
          )}
        </Show>
        </Show>
        <SafetyCopy />
      </div>
    </main>
  )
}

export function WatcherEditorPage() {
  const serverSdk = useServerSDK()
  const tabs = useTabs()
  const navigate = useNavigate()
  const params = useParams<{ serverKey: string; watcherID: string }>()
  const isNew = () => params.watcherID === "new"
  const listHref = () => `/server/${encodeURIComponent(params.serverKey)}/watchers`
  const [store, setStore] = createStore<EditorState>({
    draft: emptyWatcherDraft(),
    section: "criteria" as "criteria" | "routing" | "action",
    loaded: false,
    saving: false,
    error: "",
    preview: undefined as PreviewOutput | undefined,
    previewBusy: false,
    previewError: "",
    history: [],
    historyCursor: undefined,
    historyLoading: false,
    historyError: "",
  })
  const [loaded, { refetch: refetchEditor }] = createResource(
    () => `${serverSdk().scope}:${params.watcherID}`,
    async () => {
      const api = issueWatcherApi(serverSdk())
      const [sources, settings, watcher, history] = await Promise.all([
        api.sources(),
        api.getSettings(),
        isNew() ? undefined : api.get({ watcherID: params.watcherID }),
        isNew() ? undefined : api.history({ watcherID: params.watcherID }).catch((error: Error) => {
          setStore("historyError", error.message)
          return undefined
        }),
      ])
      if (watcher) {
        setStore("draft", reconcile({
          name: watcher.name,
          integrationID: watcher.integrationID,
          connectionID: watcher.connectionID,
          criteria: {
            ...watcher.criteria,
            issueProjects: [...watcher.criteria.issueProjects],
            labels: watcher.criteria.labels ? [...watcher.criteria.labels] : undefined,
            statuses: watcher.criteria.statuses ? [...watcher.criteria.statuses] : undefined,
          },
          routing: {
            ...watcher.routing,
            mappings: watcher.routing.mappings.map((mapping) => ({
              key: { ...mapping.key },
              projectID: mapping.projectID,
            })),
          },
          action: watcher.action,
        }))
      }
      if (history) {
        setStore("history", reconcile(history.items))
        setStore("historyCursor", history.nextCursor)
      }
      setStore("loaded", true)
      return { sources, settings, watcher }
    },
  )
  const connectedSources = createMemo(() => (loaded()?.sources ?? []).filter((source) => source.connection))
  const selectedSource = createMemo(() => connectedSources().find((source) => source.integration.id === store.draft.integrationID))
  const refreshHistory = async () => {
    if (isNew()) return
    setStore("historyError", "")
    await issueWatcherApi(serverSdk()).history({ watcherID: params.watcherID, limit: 50 })
      .then((page) => {
        setStore("history", reconcile(page.items))
        setStore("historyCursor", page.nextCursor)
      })
      .catch((error: Error) => setStore("historyError", error.message))
  }
  const loadMoreHistory = async () => {
    if (!store.historyCursor || store.historyLoading) return
    setStore({ historyLoading: true, historyError: "" })
    await issueWatcherApi(serverSdk()).history({ watcherID: params.watcherID, cursor: store.historyCursor, limit: 50 })
      .then((page) => {
        setStore("history", reconcile([...store.history, ...page.items]))
        setStore("historyCursor", page.nextCursor)
      })
      .catch((error: Error) => setStore("historyError", error.message))
    setStore("historyLoading", false)
  }
  onMount(() => {
    serverSdk().event.start()
    const unsub = serverSdk().event.listen(({ details }) => {
      const event = details as { type: string }
      if (
        event.type === "issue_watcher.run.completed" ||
        event.type === "issue_match.created" ||
        event.type === "issue_match.updated"
      ) void refreshHistory()
    })
    onCleanup(unsub)
  })
  createEffect(() => {
    const watcher = loaded()?.watcher
    if (!watcher) return
    tabs.rememberInfo(
      { type: "watcher", server: requireServerKey(params.serverKey), watcherID: watcher.id },
      { title: watcher.name },
    )
  })
  const previewRequest = createMemo<PreviewInput | undefined>(() => {
    if (!store.loaded || !canPreview(store.draft)) return
    return {
      integrationID: store.draft.integrationID,
      connectionID: store.draft.connectionID,
      criteria: store.draft.criteria,
      routing: store.draft.routing,
      action: store.draft.action,
    }
  })

  createEffect(() => {
    const request = previewRequest()
    if (!request) return
    JSON.stringify(request)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStore("previewBusy", true)
      setStore("previewError", "")
      await serverSdk().nextApi.issueWatchers.preview(request, { signal: controller.signal })
        .then((preview) => setStore("preview", preview))
        .catch((error: Error) => {
          if (error.name !== "AbortError") setStore("previewError", error.message)
        })
      if (!controller.signal.aborted) setStore("previewBusy", false)
    }, 350)
    onCleanup(() => {
      window.clearTimeout(timer)
      controller.abort()
    })
  })

  const chooseSource = (source: IntegrationSource | null) => {
    if (!source?.connection) return
    setStore("draft", "integrationID", source.integration.id)
    setStore("draft", "connectionID", source.connection.id)
  }
  const save = async () => {
    if (!canSave(store.draft)) return
    setStore("saving", true)
    setStore("error", "")
    const input = {
      name: store.draft.name.trim(),
      criteria: store.draft.criteria,
      routing: store.draft.routing,
      action: store.draft.action,
    }
    const result = isNew()
      ? serverSdk().nextApi.issueWatchers.create({
          ...input,
          integrationID: store.draft.integrationID,
          connectionID: store.draft.connectionID,
          enabled: false,
        })
      : serverSdk().nextApi.issueWatchers.update({ watcherID: params.watcherID, ...input })
    await result
      .then((watcher) => {
        if (isNew()) {
          tabs.promoteWatcherTab(requireServerKey(params.serverKey), watcher.id)
          return
        }
        navigate(`${listHref()}/${watcher.id}`, { replace: true })
      })
      .catch((error: Error) => setStore("error", error.message))
    setStore("saving", false)
  }

  return (
    <main class="h-full min-h-0 overflow-auto bg-v2-background-bg-deep text-v2-text-text-base">
      <div class="mx-auto flex min-h-full w-full max-w-[1440px] flex-col px-4 py-6 md:px-8">
        <header class="flex flex-wrap items-center gap-3 border-b border-v2-border-border-base pb-5">
          <ButtonV2 variant="ghost" onClick={() => navigate(listHref())}>Back</ButtonV2>
          <TextInputV2
            appearance="large"
            class="min-w-60 flex-1"
            value={store.draft.name}
            placeholder="Watcher name"
            onInput={(event) => setStore("draft", "name", event.currentTarget.value)}
          />
          <ButtonV2 disabled={!canSave(store.draft) || store.saving} onClick={() => void save()}>
            {store.saving ? "Saving..." : isNew() ? "Save disabled watcher" : "Save changes"}
          </ButtonV2>
        </header>
        <Show when={store.error}><p class="mt-3 text-12-regular text-v2-text-text-danger">{store.error}</p></Show>
        <Show when={loaded.error}><div class="mt-3"><ResourceError message={loaded.error.message} onRetry={() => void refetchEditor()} /></div></Show>
        <nav class="mt-5 flex gap-1" aria-label="Watcher editor sections">
          <For each={["criteria", "routing", "action"] as const}>
            {(section) => (
              <button
                type="button"
                classList={{ "bg-v2-background-bg-surface text-v2-text-text-strong": store.section === section, "text-v2-text-text-muted": store.section !== section }}
                class="rounded-lg px-4 py-2 text-13-medium capitalize"
                onClick={() => setStore("section", section)}
              >
                {section}
              </button>
            )}
          </For>
        </nav>

        <div class="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)]">
          <section class="rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-5 md:p-6">
            <Show when={store.section === "criteria"}><CriteriaEditor store={store} setStore={setStore} sources={connectedSources()} selected={selectedSource()} onSource={chooseSource} /></Show>
            <Show when={store.section === "routing"}><RoutingEditor store={store} setStore={setStore} /></Show>
            <Show when={store.section === "action"}><ActionEditor store={store} setStore={setStore} concurrentRuns={loaded()?.settings.concurrentRuns ?? 1} /></Show>
          </section>
          <PreviewPane section={store.section} preview={store.preview} busy={store.previewBusy} error={store.previewError} draft={store.draft} />
        </div>
        <div class="mt-5"><SafetyCopy /></div>
        <Show when={!isNew()}><WatcherHistory entries={store.history} error={store.historyError} nextCursor={store.historyCursor} loading={store.historyLoading} onRetry={refreshHistory} onLoadMore={loadMoreHistory} /></Show>
      </div>
    </main>
  )
}

function CriteriaEditor(props: { store: EditorState; setStore: EditorSetter; sources: IntegrationSource[]; selected?: IntegrationSource; onSource: (source: IntegrationSource | null) => void }) {
  return (
    <EditorSection title="Criteria" description="Describe the issues this watcher should match.">
      <Field label="Source">
        <SelectV2 appearance="large" options={props.sources} current={props.selected} value={(source) => source.integration.id} label={(source) => source.integration.name} onSelect={props.onSource} />
      </Field>
      <Field label="Issue projects" hint="Comma-separated provider project keys. Leave blank for all.">
        <TextInputV2 appearance="large" value={props.store.draft.criteria.issueProjects.join(", ")} onChange={(event) => props.setStore("draft", "criteria", "issueProjects", splitValues(event.currentTarget.value))} />
      </Field>
      <Field label="Assignee">
        <TextInputV2 appearance="large" placeholder="me or provider assignee ID" value={props.store.draft.criteria.assignee === "me" ? "me" : props.store.draft.criteria.assignee?.id ?? ""} onChange={(event) => props.setStore("draft", "criteria", "assignee", event.currentTarget.value === "me" ? "me" : event.currentTarget.value ? { id: event.currentTarget.value } : undefined)} />
      </Field>
      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Labels"><TextInputV2 appearance="large" value={props.store.draft.criteria.labels?.join(", ") ?? ""} onChange={(event) => props.setStore("draft", "criteria", "labels", splitValues(event.currentTarget.value))} /></Field>
        <Field label="Statuses"><TextInputV2 appearance="large" value={props.store.draft.criteria.statuses?.join(", ") ?? ""} onChange={(event) => props.setStore("draft", "criteria", "statuses", splitValues(event.currentTarget.value))} /></Field>
      </div>
      <Check checked={props.store.draft.criteria.watchUpdates} onChange={(checked) => props.setStore("draft", "criteria", "watchUpdates", checked)} label="Also watch issues that change after they matched" />
      <details class="rounded-lg border border-v2-border-border-base p-4">
        <summary class="cursor-pointer text-13-medium text-v2-text-text-strong">Advanced provider query</summary>
        <div class="mt-4 flex flex-col gap-3">
          <SelectV2 appearance="base" options={[...escapeLanguages]} current={props.store.draft.criteria.escape?.language} onSelect={(language) => language && props.setStore("draft", "criteria", "escape", { language, query: props.store.draft.criteria.escape?.query ?? "" })} />
          <TextareaV2 rows={4} value={props.store.draft.criteria.escape?.query ?? ""} placeholder="Provider-native query" onInput={(event) => props.setStore("draft", "criteria", "escape", { language: props.store.draft.criteria.escape?.language ?? "jql", query: event.currentTarget.value })} />
        </div>
      </details>
    </EditorSection>
  )
}

function RoutingEditor(props: { store: EditorState; setStore: EditorSetter }) {
  const addMapping = () => props.setStore("draft", "routing", "mappings", (items) => [...items, { key: { type: "label" as const, value: "" }, projectID: "" }])
  return (
    <EditorSection title="Routing" description="Routes are evaluated in order. The first matching rung wins.">
      <div class="flex flex-col gap-3">
        <For each={routeRungs(props.store.draft.routing)}>{(rung) => <div classList={{ "border-v2-border-border-focus": rung.active }} class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-surface p-3"><p class="text-13-medium text-v2-text-text-strong">{rung.title}</p><p class="mt-1 text-12-regular text-v2-text-text-muted">{rung.detail}</p></div>}</For>
      </div>
      <Field label="Mappings">
        <div class="flex flex-col gap-2">
          <For each={props.store.draft.routing.mappings}>
            {(mapping, index) => <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[130px_1fr_1fr_auto]"><SelectV2 appearance="base" options={[...mappingTypes]} current={mapping.key.type} onSelect={(type) => type && props.setStore("draft", "routing", "mappings", index(), "key", "type", type)} /><TextInputV2 value={mapping.key.value} placeholder="Match value" onInput={(event) => props.setStore("draft", "routing", "mappings", index(), "key", "value", event.currentTarget.value)} /><TextInputV2 value={mapping.projectID} placeholder="OpenCode project ID" onInput={(event) => props.setStore("draft", "routing", "mappings", index(), "projectID", event.currentTarget.value)} /><ButtonV2 variant="ghost" onClick={() => props.setStore("draft", "routing", "mappings", (items) => items.filter((_, itemIndex) => itemIndex !== index()))}>Remove</ButtonV2></div>}
          </For>
          <ButtonV2 variant="outline" icon="plus-small" onClick={addMapping}>Add mapping</ButtonV2>
        </div>
      </Field>
      <Field label="Repository field" hint="Optional issue field containing the repository name."><TextInputV2 appearance="large" value={props.store.draft.routing.repoField?.fieldName ?? ""} onInput={(event) => props.setStore("draft", "routing", "repoField", event.currentTarget.value ? { fieldName: event.currentTarget.value } : undefined)} /></Field>
      <Field label="Workspace">
        <SelectV2 appearance="large" options={[...workspaces]} current={props.store.draft.routing.workspace.type} label={(type) => type === "branch" ? "New branch" : type === "current" ? "Current checkout" : "Fresh worktree"} onSelect={(type) => type && props.setStore("draft", "routing", "workspace", type === "branch" ? { type, pattern: "issue/{{issue.key}}" } : { type })} />
      </Field>
      <Show when={props.store.draft.routing.workspace.type === "branch"}><Field label="Branch pattern"><TextInputV2 appearance="large" value={props.store.draft.routing.workspace.type === "branch" ? props.store.draft.routing.workspace.pattern : ""} onInput={(event) => props.setStore("draft", "routing", "workspace", { type: "branch", pattern: event.currentTarget.value })} /></Field></Show>
      <p class="text-12-regular text-v2-text-text-muted">Fallback is fixed to Inbox when no project route matches.</p>
    </EditorSection>
  )
}

function ActionEditor(props: { store: EditorState; setStore: EditorSetter; concurrentRuns: number }) {
  return (
    <EditorSection title="Action" description="Choose what OpenCode prepares when an issue matches.">
      <Field label="On match">
        <div class="grid gap-2 md:grid-cols-3">
          <For each={[...modes]}>{(mode) => <button type="button" classList={{ "border-v2-border-border-focus bg-v2-background-bg-surface": props.store.draft.action.mode === mode }} class="rounded-lg border border-v2-border-border-base p-3 text-left" onClick={() => props.setStore("draft", "action", "mode", mode)}><p class="text-13-medium text-v2-text-text-strong">{mode === "inbox" ? "Send to Inbox" : mode === "awaiting_run" ? "Create awaiting run" : "Create and run"}</p><p class="mt-1 text-11-regular text-v2-text-text-muted">{mode === "run" ? `Up to ${props.concurrentRuns} concurrent auto-runs` : mode === "awaiting_run" ? "Review the prompt before running" : "Triage before creating a session"}</p></button>}</For>
        </div>
      </Field>
      <Field label="Prompt template" hint="Variables: {{issue.key}}, {{issue.title}}, {{issue.description}}"><TextareaV2 rows={9} value={props.store.draft.action.promptTemplate} onInput={(event) => props.setStore("draft", "action", "promptTemplate", event.currentTarget.value)} /></Field>
      <div class="rounded-lg border border-v2-border-border-base p-4">
        <p class="text-13-medium text-v2-text-text-strong">Write-back</p>
        <div class="mt-3 flex flex-col gap-3">
          <Check label="Post a comment when the session is created" checked={props.store.draft.action.writeback.comment} onChange={(checked) => props.setStore("draft", "action", "writeback", "comment", checked)} />
          <Field label="Transition on start" hint="Optional provider status name."><TextInputV2 value={props.store.draft.action.writeback.transitionOnStart ?? ""} onInput={(event) => props.setStore("draft", "action", "writeback", "transitionOnStart", event.currentTarget.value || undefined)} /></Field>
          <Check label="Post a comment if the run fails" checked={props.store.draft.action.writeback.commentOnFailure} onChange={(checked) => props.setStore("draft", "action", "writeback", "commentOnFailure", checked)} />
        </div>
      </div>
    </EditorSection>
  )
}

function PreviewPane(props: { section: "criteria" | "routing" | "action"; preview?: PreviewOutput; busy: boolean; error: string; draft: WatcherDraft }) {
  const routeText = (route: PreviewMatch["route"]) => "projectID" in route
    ? `${route.projectID} · ${route.reason}`
    : `Inbox · ${route.reason}${route.suggestion ? ` · Suggested: ${route.suggestion}` : ""}`
  const writebackText = (writeback: PreviewMatch["writeback"]) => [
    writeback.comment,
    writeback.transitionOnStart ? `Transition on start: ${writeback.transitionOnStart}` : undefined,
    writeback.commentOnFailure,
  ].filter((value): value is string => !!value).join("\n") || "No write-back"
  return (
    <aside class="self-start rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-5 lg:sticky lg:top-5">
      <div class="flex items-center justify-between gap-3"><div><p class="text-12-medium uppercase tracking-[0.12em] text-v2-text-text-muted">Live preview</p><h2 class="mt-1 text-16-medium text-v2-text-text-strong">{props.section === "criteria" ? "Matching issues" : props.section === "routing" ? "Routing dry run" : "Prompt and write-back"}</h2></div><Show when={props.busy}><span class="text-11-regular text-v2-text-text-muted">Updating...</span></Show></div>
      <Show when={props.error}><p class="mt-4 rounded-lg bg-v2-background-bg-surface p-3 text-12-regular text-v2-text-text-danger">{props.error}</p></Show>
      <Show when={!canPreview(props.draft)}><Status>Select a connected source to preview this rule.</Status></Show>
      <Show when={canPreview(props.draft) && props.preview && !props.preview.matches.length}><Status>No issues match these criteria right now.</Status></Show>
      <div class="mt-4 flex flex-col gap-3">
        <For each={props.preview?.matches}>
          {(match) => <article class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-surface p-3"><p class="text-13-medium text-v2-text-text-strong">{match.issue.key ?? match.issue.id ?? "Issue"}</p><p class="mt-1 text-12-regular text-v2-text-text-muted">{match.issue.title}</p><Show when={props.section !== "action"}><div class="mt-3 border-t border-v2-border-border-base pt-2 text-11-regular text-v2-text-text-muted"><span class="font-medium">Route rung:</span> {routeText(match.route)}</div></Show><Show when={props.section === "action"}><div class="mt-3 flex flex-col gap-3 border-t border-v2-border-border-base pt-3"><PreviewBlock label="Rendered prompt" value={match.prompt} /><PreviewBlock label="Exact write-back" value={writebackText(match.writeback)} /></div></Show></article>}
        </For>
      </div>
      <Show when={props.preview?.truncated}><p class="mt-3 text-11-regular text-v2-text-text-muted">Preview limit reached. Narrow the criteria to inspect fewer issues.</p></Show>
      <Show when={props.section === "routing"}><div class="mt-4 border-t border-v2-border-border-base pt-4"><For each={routeRungs(props.draft.routing)}>{(rung) => <p class="mb-2 text-11-regular text-v2-text-text-muted">{rung.title}: {rung.detail}</p>}</For></div></Show>
      <Show when={props.section === "action" && !props.preview?.matches.length}><div class="mt-4 flex flex-col gap-3"><PreviewBlock label="Prompt template" value={props.draft.action.promptTemplate} /><PreviewBlock label="Write-back" value={props.draft.action.writeback.comment || props.draft.action.writeback.commentOnFailure || props.draft.action.writeback.transitionOnStart ? "Configured; exact provider text appears for a matching issue." : "No write-back configured."} /></div></Show>
      <p class="mt-5 text-11-regular text-v2-text-text-muted">Preview is read-only, persists nothing, and never advances the watcher cursor.</p>
    </aside>
  )
}

function FirstRun(props: { kind: "source" | "watcher"; href?: string; onConnect?: () => void }) {
  return <section class="rounded-2xl border border-v2-border-border-base bg-v2-background-bg-base px-6 py-10 text-center md:px-12"><p class="text-12-medium uppercase tracking-[0.14em] text-v2-text-text-muted">Three steps to your first watcher</p><h2 class="mt-2 text-20-medium text-v2-text-text-strong">{props.kind === "source" ? "Connect an issue source" : "Create your first watcher"}</h2><div class="mx-auto mt-7 grid max-w-3xl gap-3 text-left md:grid-cols-3"><Step number="1" title="Connect a source">Credentials stay local to this OpenCode server.</Step><Step number="2" title="Describe the issues">Choose projects, labels, status, and assignee criteria.</Step><Step number="3" title="Route to a project">Preview the route, prompt, and write-back before enabling.</Step></div><p class="mx-auto mt-7 max-w-xl text-13-regular text-v2-text-text-muted">Nothing runs until a watcher is enabled. Watchers poll only while OpenCode is running.</p><div class="mt-5"><Show when={props.kind === "source"} fallback={<A href={props.href!}><ButtonV2 icon="plus-small">New watcher</ButtonV2></A>}><ButtonV2 onClick={props.onConnect}>Connect a source</ButtonV2></Show></div></section>
}

function WatcherCounters(props: { summary: InboxSummary }) {
  const values = () => [
    ["Sessions this week", props.summary.sessionsOpenedThisWeek],
    ["Awaiting triage", props.summary.pending],
    ["Unrouted", props.summary.unrouted],
    ["Needs attention", inboxAttentionCount(props.summary)],
    ["Failed runs", props.summary.failedRuns],
  ] as const
  return <section class="grid grid-cols-2 gap-2 md:grid-cols-5"><For each={values()}>{(item) => <div class="rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-4"><p class="text-20-medium text-v2-text-text-strong">{item[1]}</p><p class="mt-1 text-11-regular text-v2-text-text-muted">{item[0]}</p></div>}</For></section>
}

function WatcherHistory(props: { entries: ReadonlyArray<WatcherHistoryEntry>; error: string; nextCursor?: string; loading: boolean; onRetry: () => void; onLoadMore: () => void }) {
  return <section class="mt-5 rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-5"><div><p class="text-12-medium uppercase tracking-[0.12em] text-v2-text-text-muted">Activity</p><h2 class="mt-1 text-18-medium text-v2-text-text-strong">Run and observation history</h2></div><Show when={props.error}><div class="mt-4 flex flex-wrap items-center gap-3"><p class="min-w-0 flex-1 text-12-regular text-v2-text-text-danger">{props.error}</p><ButtonV2 variant="outline" onClick={props.onRetry}>Retry</ButtonV2></div></Show><Show when={props.entries.length} fallback={<Status>No runs or observations yet.</Status>}><div class="mt-4 flex flex-col"><For each={props.entries}>{(entry, index) => <div classList={{ "border-t border-v2-border-border-base": index() > 0 }} class="flex gap-3 py-3"><span class="mt-0.5 rounded-full bg-v2-background-bg-surface px-2 py-1 text-10-medium uppercase text-v2-text-text-muted">{entry.type}</span><Show when={entry.type === "run"} fallback={<div class="min-w-0"><p class="truncate text-13-medium text-v2-text-text-strong">{entry.type === "observation" ? `${entry.observation.payload.key} observed` : "Observation"}</p><p class="mt-1 truncate text-12-regular text-v2-text-text-muted">{entry.type === "observation" ? entry.observation.payload.title : ""}</p></div>}>{entry.type === "run" && <div><p class="text-13-medium text-v2-text-text-strong">{outcomeLabel(entry.run.outcome)}</p><p class="mt-1 text-12-regular text-v2-text-text-muted">{entry.run.scanned} scanned · {entry.run.matched} matched · {new Date(entry.run.startedAt).toLocaleString()}</p><Show when={entry.run.error}><p class="mt-1 text-12-regular text-v2-text-text-danger">{entry.run.error}</p></Show></div>}</Show></div>}</For></div></Show><Show when={props.nextCursor}><div class="mt-4 flex justify-center"><ButtonV2 variant="outline" disabled={props.loading} onClick={props.onLoadMore}>{props.loading ? "Loading..." : "Load more"}</ButtonV2></div></Show></section>
}

function Step(props: { number: string; title: string; children: string }) { return <div class="rounded-xl bg-v2-background-bg-surface p-4"><span class="text-11-medium text-v2-text-text-muted">0{props.number}</span><h3 class="mt-2 text-14-medium text-v2-text-text-strong">{props.title}</h3><p class="mt-1 text-12-regular text-v2-text-text-muted">{props.children}</p></div> }
function SafetyCopy() { return <p class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-4 py-3 text-12-regular text-v2-text-text-muted">Saving this watcher does not poll issues or create sessions. Polling begins only when the watcher is enabled, and watchers poll only while OpenCode is running.</p> }
function Status(props: { children: string }) { return <p class="py-10 text-center text-13-regular text-v2-text-text-muted">{props.children}</p> }
function ResourceError(props: { message: string; onRetry: () => void }) { return <section class="rounded-xl border border-v2-border-border-danger bg-v2-background-bg-base p-5 text-center"><p class="text-13-regular text-v2-text-text-danger">{props.message}</p><div class="mt-3"><ButtonV2 variant="outline" onClick={props.onRetry}>Retry</ButtonV2></div></section> }
function Field(props: { label: string; hint?: string; children: JSX.Element }) { return <label class="flex flex-col gap-2"><span class="text-13-medium text-v2-text-text-strong">{props.label}</span>{props.children}<Show when={props.hint}><span class="text-11-regular text-v2-text-text-muted">{props.hint}</span></Show></label> }
function Check(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label class="flex cursor-pointer items-center gap-3 text-13-regular text-v2-text-text-base"><input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.currentTarget.checked)} class="size-4 accent-current" />{props.label}</label> }
function EditorSection(props: { title: string; description: string; children: JSX.Element }) { return <div class="flex flex-col gap-5"><div><h2 class="text-18-medium text-v2-text-text-strong">{props.title}</h2><p class="mt-1 text-13-regular text-v2-text-text-muted">{props.description}</p></div>{props.children}</div> }
function PreviewBlock(props: { label: string; value: string }) { return <div><p class="text-11-medium uppercase tracking-[0.08em] text-v2-text-text-muted">{props.label}</p><pre class="mt-1 whitespace-pre-wrap font-mono text-11-regular text-v2-text-text-base">{props.value}</pre></div> }
