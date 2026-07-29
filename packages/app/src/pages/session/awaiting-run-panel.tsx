import { createQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Prompt } from "@opencode-ai/schema/prompt"
import type { ServerSDK } from "@/context/server-sdk"
import type { Prompt as ComposerPrompt } from "@/context/prompt"
import type { AppSessionStatus } from "@/utils/session"
import { showToast } from "@/utils/toast"
import {
  awaitingRunLocked,
  confirmationPair,
  createAwaitingRunApi,
  createExecutionAttemptID,
  latestHandoffAttempt,
  loadAwaitingRunHistory,
  pendingHydration,
  runAttemptID,
  saveAndRun,
  shouldRefreshAwaitingRun,
  type AwaitingRunRetry,
  type AwaitingRunState,
} from "./awaiting-run"

export function AwaitingRunPanel(props: {
  sessionID: string
  status: AppSessionStatus
  serverSDK: ServerSDK
  fetch?: typeof globalThis.fetch
  state: ReturnType<typeof createStore<AwaitingRunState>>
  retry: () => AwaitingRunRetry
  setRetry: (retry: AwaitingRunRetry) => void
  retryReady: boolean
  current: () => ComposerPrompt
  setPrompt: (prompt: ComposerPrompt, cursor?: number) => void
  refreshSession: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [state, setState] = props.state
  const api = createMemo(() =>
    createAwaitingRunApi({
      baseUrl: props.serverSDK.url,
      fetch: props.fetch,
      username: props.serverSDK.server.http.username,
      password: props.serverSDK.server.http.password,
    }),
  )
  const text = () => props.current().flatMap((part) => ("content" in part ? [part.content] : [])).join("")
  const key = [props.serverSDK.scope, "awaiting-run", props.sessionID] as const
  const pending = createQuery(() => ({
    queryKey: [...key, "pending"],
    enabled: props.status === "awaiting_run",
    queryFn: async () => {
      const inputs = await api().pending(props.sessionID)
      if (inputs.length !== 1) throw new Error(`Expected one pending input, received ${inputs.length}`)
      return inputs[0]!
    },
  }))
  const history = createQuery(() => ({
    queryKey: [...key, "history"],
    enabled: props.status === "handoff_unknown",
    queryFn: () => loadAwaitingRunHistory(api(), props.sessionID),
  }))
  const oldAttemptID = createMemo(() => latestHandoffAttempt(history.data ?? []))

  createEffect(() => setState("locked", props.status === "handoff_unknown"))

  createEffect(() => {
    const input = pending.data
    if (!input) return
    const value = pendingHydration(state, text(), input)
    if (value === undefined) return
    props.setPrompt([{ type: "text", content: value, start: 0, end: value.length }], value.length)
    setState({ hydratedID: input.id, sourceText: value })
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void props.refreshSession()
  }
  const unsubscribe = props.serverSDK.event.listen(({ details }) => {
    const event = details.current
      ? { type: details.current.type, data: "data" in details.current ? details.current.data : undefined }
      : { type: details.type, data: details.properties as { sessionID?: string; attemptID?: string } }
    if (awaitingRunLocked(event, props.sessionID)) setState("locked", true)
    if (shouldRefreshAwaitingRun(event, props.sessionID)) refresh()
  })
  onCleanup(unsubscribe)

  const fail = (error: unknown) =>
    showToast({ variant: "error", title: "Request failed", description: error instanceof Error ? error.message : String(error) })
  const save = useMutation(() => ({
    mutationFn: async () => {
      const input = pending.data
      if (!input || state.locked) return
      const prompt: Prompt = { ...input.prompt, text: text() }
      const result = await api().replace(props.sessionID, input.id, prompt)
      setState({ hydratedID: result.id, sourceText: result.prompt.text })
      refresh()
    },
    onError: fail,
  }))
  const cancel = useMutation(() => ({
    mutationFn: async () => {
      const input = pending.data
      if (!input || state.locked) return
      setState("locked", true)
      await api().cancel(props.sessionID, input.id)
      refresh()
    },
    onError: (error) => {
      setState("locked", false)
      fail(error)
    },
  }))
  const run = useMutation(() => ({
    mutationFn: async () => {
      const input = pending.data
      if (!input || !props.retryReady) return
      if (state.locked) return
      const attemptID = runAttemptID(props.retry(), createExecutionAttemptID)
      props.setRetry({ ...props.retry(), attemptID })
      setState("locked", true)
      const result = await saveAndRun({
        api: api(),
        sessionID: props.sessionID,
        pending: input,
        prompt: { ...input.prompt, text: text() },
        attemptID,
      })
      setState({ hydratedID: result.id, sourceText: result.prompt.text })
      refresh()
    },
    onError: (error) => {
      setState("locked", false)
      fail(error)
    },
  }))
  const confirm = useMutation(() => ({
    mutationFn: async () => {
      const attemptID = oldAttemptID()
      if (!props.retryReady) return
      if (!attemptID) throw new Error("The ambiguous execution attempt could not be identified")
      const pair = confirmationPair(props.retry(), attemptID, createExecutionAttemptID)
      props.setRetry({ ...props.retry(), confirmation: pair })
      setState("locked", true)
      await api().confirm(props.sessionID, pair.attemptID, pair.newAttemptID)
      refresh()
    },
    onError: fail,
  }))

  return (
    <div class="mx-auto min-w-0 w-full max-w-3xl px-3 sm:px-4 pb-4">
      <div class="min-w-0 rounded-xl border border-v2-border-border-base bg-v2-background-bg-base p-3 sm:p-4 shadow-[var(--v2-elevation-raised)]">
        <Show
          when={props.status === "awaiting_run"}
          fallback={
            <div class="flex flex-col gap-3">
              <div>
                <p class="text-14-medium text-v2-text-text-strong">Execution handoff is unknown</p>
                <p class="mt-1 text-12-regular text-v2-text-text-muted">
                  The previous run may have started. Confirm only if you want to schedule another attempt.
                </p>
                <Show when={history.error}>
                  {(error) => <p class="mt-2 text-12-regular text-v2-text-text-danger">{String(error())}</p>}
                </Show>
              </div>
              <div class="flex justify-end">
                <ButtonV2
                  variant="contrast"
                  disabled={!props.retryReady || confirm.isPending || history.isPending || !oldAttemptID()}
                  onClick={() => confirm.mutate()}
                >
                  Run anyway
                </ButtonV2>
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-3">
            <div>
              <p class="text-14-medium text-v2-text-text-strong">Awaiting run</p>
              <p class="mt-1 text-12-regular text-v2-text-text-muted">Review and save the prompt before starting the agent.</p>
            </div>
            <TextareaV2
              rows={6}
              value={text()}
              disabled={state.locked || pending.isPending || pending.isError}
              onInput={(event) => {
                const value = event.currentTarget.value
                props.setPrompt([{ type: "text", content: value, start: 0, end: value.length }], value.length)
              }}
            />
            <Show when={pending.error}>
              {(error) => <p class="text-12-regular text-v2-text-text-danger">{String(error())}</p>}
            </Show>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <ButtonV2 variant="ghost" disabled={state.locked || !pending.data || cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel input
              </ButtonV2>
              <ButtonV2 variant="neutral" disabled={state.locked || !pending.data || save.isPending} onClick={() => save.mutate()}>
                Save
              </ButtonV2>
              <ButtonV2
                variant="contrast"
                disabled={!props.retryReady || state.locked || !pending.data || run.isPending}
                onClick={() => run.mutate()}
              >
                Run
              </ButtonV2>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
