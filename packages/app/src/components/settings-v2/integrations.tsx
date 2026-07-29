import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource, For, Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { DialogConnectSource } from "./dialog-connect-source"
import type { IntegrationSource } from "./integrations-logic"

export const SettingsIntegrationsV2: Component = () => {
  const language = useLanguage()
  const dialog = useDialog()
  const serverSdk = useServerSDK()
  const [data, { refetch }] = createResource(
    () => serverSdk().scope,
    async () => {
      const api = serverSdk().nextApi.issueWatchers
      const [sources, settings] = await Promise.all([api.sources(), api.getSettings()])
      return { sources, settings }
    },
  )
  const connect = (source?: IntegrationSource) => {
    const sources = data()?.sources ?? []
    void dialog.push(() => <DialogConnectSource sources={sources} source={source} onSaved={() => void refetch()} />)
  }
  const update = async (next: Partial<NonNullable<ReturnType<typeof data>>["settings"]>) => {
    const settings = data()?.settings
    if (!settings) return
    await serverSdk().nextApi.issueWatchers.updateSettings({ ...settings, ...next })
    await refetch()
  }
  const date = (value?: number) => value ? new Date(value).toLocaleString(language.intl()) : language.t("settings.integrations.never")

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.integrations.title")}</h2>
          <ButtonV2 icon="plus-small" variant="outline" disabled={!data()} onClick={() => connect()}>{language.t("settings.integrations.add")}</ButtonV2>
        </div>
      </div>
      <div class="settings-v2-tab-body settings-v2-integrations">
        <Show when={data()} fallback={<div class="settings-v2-models-status">{language.t("common.loading")}{language.t("common.loading.ellipsis")}</div>}>
          {(current) => (
            <>
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">{language.t("settings.integrations.sources")}</h3>
                <SettingsListV2>
                  <For each={current().sources}>
                    {(source) => {
                      const status = () => source.connection?.verification.status ?? "not_connected"
                      const action = () => !source.connection ? "connect" : status() === "connected" ? "manage" : "reconnect"
                      return (
                        <div class="settings-v2-integration-row">
                          <div class="settings-v2-integration-copy">
                            <div class="settings-v2-integration-main">
                              <span class="settings-v2-provider-name">{source.integration.name}</span>
                              <span class={`settings-v2-integration-health settings-v2-integration-health--${status()}`}>
                                {language.t(`settings.integrations.health.${status()}` as "settings.integrations.health.connected")}
                              </span>
                            </div>
                            <span class="settings-v2-provider-description">{source.connection?.verification.detail ?? language.t("settings.integrations.notConfigured")}</span>
                            <span class="settings-v2-integration-meta">
                              {language.t("settings.integrations.watchers", { count: source.watcherCount })} · {language.t("settings.integrations.lastPoll", { time: date(source.lastPollAt) })} · {language.t("settings.integrations.owner", { state: source.owner.detail ?? source.owner.status })}
                            </span>
                          </div>
                          <ButtonV2 variant="outline" onClick={() => connect(source)}>{language.t(`settings.integrations.${action()}` as "settings.integrations.connect")}</ButtonV2>
                        </div>
                      )
                    }}
                  </For>
                </SettingsListV2>
              </div>
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">{language.t("settings.integrations.watcherSettings")}</h3>
                <SettingsListV2>
                  <SettingsRowV2 title={language.t("settings.integrations.pollInterval")} description={language.t("settings.integrations.pollIntervalDetail")}>
                    <TextInputV2 type="number" min="1" appearance="base" value={String(current().settings.pollInterval)} onChange={(event) => Number(event.currentTarget.value) > 0 && void update({ pollInterval: Number(event.currentTarget.value) })} />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.integrations.concurrentRuns")} description={language.t("settings.integrations.concurrentRunsDetail")}>
                    <TextInputV2 type="number" min="1" appearance="base" value={String(current().settings.concurrentRuns)} onChange={(event) => Number(event.currentTarget.value) > 0 && void update({ concurrentRuns: Number(event.currentTarget.value) })} />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.integrations.retryFailedRuns")} description={language.t("settings.integrations.retryFailedRunsDetail")}>
                    <SelectV2 appearance="inline" options={["never", "once"] as const} current={current().settings.retryFailedRuns} label={(value) => language.t(`settings.integrations.retry.${value}` as "settings.integrations.retry.never")} onSelect={(value) => value && void update({ retryFailedRuns: value })} />
                  </SettingsRowV2>
                </SettingsListV2>
              </div>
            </>
          )}
        </Show>
      </div>
    </>
  )
}
