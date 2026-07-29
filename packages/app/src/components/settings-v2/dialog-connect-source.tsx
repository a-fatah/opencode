import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@opencode-ai/ui/v2/divider-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import {
  tenantPromptKey,
  valuesFingerprint,
  visiblePrompts,
  type IntegrationSource,
  type KeyMethod,
} from "./integrations-logic"

export const DialogConnectSource: Component<{
  sources: readonly IntegrationSource[]
  source?: IntegrationSource
  onSaved: () => void
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [store, setStore] = createStore({
    integrationID: props.source?.integration.id ?? "",
    key: "",
    inputs: { ...(props.source?.connection?.inputs ?? {}) } as Record<string, string>,
    verified: "",
    verification: undefined as { ok: boolean; detail: string } | undefined,
    busy: false,
    error: "",
  })
  const source = createMemo(() => props.sources.find((item) => item.integration.id === store.integrationID))
  const connection = createMemo(() => {
    const current = props.source
    if (!current || current.integration.id !== source()?.integration.id) return
    return current.connection
  })
  const method = createMemo(() => source()?.integration.methods.find((item) => item.type === "key") as KeyMethod | undefined)
  const tenantKey = createMemo(() => tenantPromptKey(method(), connection()?.tenantIdentity))
  const inputs = createMemo(() => {
    const key = tenantKey()
    const current = connection()
    if (!key || !current) return store.inputs
    return { ...store.inputs, [key]: current.tenantIdentity }
  })
  const fingerprint = createMemo(() => valuesFingerprint(store.key, inputs()))
  const prompts = createMemo(() => (method() ? visiblePrompts(method()!, inputs()) : []))
  const ready = createMemo(
    () =>
      !!method() &&
      (!!connection() || !!store.key.trim()) &&
      prompts().every((prompt) => inputs()[prompt.key]?.trim()),
  )

  const invalidate = () => {
    setStore("verification", undefined)
    setStore("verified", "")
    setStore("error", "")
  }
  const selectSource = (item: IntegrationSource | null) => {
    if (!item) return
    setStore({ integrationID: item.integration.id, key: "", inputs: {}, verified: "", verification: undefined, error: "" })
  }
  const setInput = (key: string, value: string) => {
    setStore("inputs", key, value)
    invalidate()
  }
  const verify = async () => {
    const current = source()
    if (!current || !ready()) return
    setStore("busy", true)
    setStore("error", "")
    const result = await serverSdk().nextApi.issueWatchers
      .verifySource({
        integrationID: current.integration.id,
        key: store.key || undefined,
        inputs: inputs(),
        useSavedConnection: !!connection() && !store.key,
      })
      .then((value) => value)
      .catch((error: Error) => {
        setStore("error", error.message)
      })
    if (result) {
      setStore("verification", result)
      setStore("verified", fingerprint())
    }
    setStore("busy", false)
  }
  const save = async () => {
    const current = source()
    if (!current || store.verified !== fingerprint() || !store.verification?.ok) return
    setStore("busy", true)
    setStore("error", "")
    const request = { integrationID: current.integration.id, key: store.key, inputs: inputs() }
    const saved = connection()
    const result = saved
      ? serverSdk().nextApi.issueWatchers.rotateConnection({
          ...request,
          connectionID: saved.id,
          key: store.key || undefined,
        })
      : serverSdk().nextApi.issueWatchers.createConnection(request)
    await result
      .then(() => {
        props.onSaved()
        dialog.close()
      })
      .catch((error: Error) => setStore("error", error.message))
    setStore("busy", false)
  }

  return (
    <Dialog fit class="settings-v2-source-dialog">
      <DialogHeader hideClose>
        <DialogTitle>{language.t("settings.integrations.connect.title")}</DialogTitle>
      </DialogHeader>
      <DividerV2 />
      <DialogBody class="settings-v2-source-dialog-body">
        <Show when={!props.source}>
          <label class="settings-v2-server-dialog-label">{language.t("settings.integrations.source")}</label>
          <SelectV2
            appearance="large"
            options={[...props.sources]}
            current={source()}
            value={(item) => item.integration.id}
            label={(item) => item.integration.name}
            onSelect={selectSource}
          />
        </Show>
        <Show when={source()}>
          {(current) => (
            <Show when={method()} fallback={<p class="settings-v2-source-dialog-hint">{language.t("settings.integrations.keyUnsupported")}</p>}>
              <For each={prompts()}>
                {(prompt) => (
                  <div class="settings-v2-source-dialog-field">
                    <label class="settings-v2-server-dialog-label">{prompt.message}</label>
                    <Show
                      when={prompt.type === "select"}
                      fallback={
                        <TextInputV2
                          appearance="large"
                          class="!w-full"
                          value={inputs()[prompt.key] ?? ""}
                          placeholder={prompt.type === "text" ? prompt.placeholder : undefined}
                          disabled={store.busy || tenantKey() === prompt.key}
                          onInput={(event) => setInput(prompt.key, event.currentTarget.value)}
                        />
                      }
                    >
                      <SelectV2
                        appearance="large"
                        options={prompt.type === "select" ? [...prompt.options] : []}
                        current={prompt.type === "select" ? prompt.options.find((option) => option.value === inputs()[prompt.key]) : undefined}
                        value={(option) => option.value}
                        label={(option) => option.label}
                        disabled={store.busy || tenantKey() === prompt.key}
                        onSelect={(option) => option && setInput(prompt.key, option.value)}
                      />
                    </Show>
                  </div>
                )}
              </For>
              <div class="settings-v2-source-dialog-field">
                <label class="settings-v2-server-dialog-label">{method()?.label ?? language.t("settings.integrations.key")}</label>
                <TextInputV2
                  type="password"
                  appearance="large"
                  class="!w-full"
                  value={store.key}
                  disabled={store.busy}
                  onInput={(event) => {
                    setStore("key", event.currentTarget.value)
                    invalidate()
                  }}
                />
              </div>
              <p class="settings-v2-source-dialog-hint">{language.t("settings.integrations.secretsLocal")}</p>
              <Show when={store.verification}>
                {(verification) => (
                  <p classList={{ "settings-v2-source-dialog-success": verification().ok, "settings-v2-source-dialog-error": !verification().ok }}>
                    {verification().detail}
                  </p>
                )}
              </Show>
              <Show when={store.error}><p class="settings-v2-source-dialog-error">{store.error}</p></Show>
            </Show>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" disabled={store.busy} onClick={() => dialog.close()}>{language.t("common.cancel")}</ButtonV2>
        <ButtonV2 variant="outline" disabled={store.busy || !ready()} onClick={verify}>{language.t("settings.integrations.verify")}</ButtonV2>
        <ButtonV2 variant="contrast" disabled={store.busy || !store.verification?.ok || store.verified !== fingerprint()} onClick={save}>
          {connection() ? language.t("settings.integrations.reconnect") : language.t("settings.integrations.connect")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
