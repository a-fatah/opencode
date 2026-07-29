import { useParams } from "@solidjs/router"
import { onCleanup } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Accessor } from "solid-js"
import type { ServerConnection } from "@/context/server"

export function useSettingsDialog(defaultValue?: string, serverKey?: Accessor<ServerConnection.Key | undefined>) {
  const dialog = useDialog()
  const params = useParams<{ id?: string }>()
  let run = 0
  let dead = false

  onCleanup(() => {
    dead = true
  })

  return () => {
    const current = ++run
    const sessionID = params.id
    const selectedServerKey = serverKey?.()
    void import("@/components/settings-v2").then((module) => {
      if (dead || run !== current) return
      void dialog.show(() => (
        <module.DialogSettings sessionID={sessionID} defaultValue={defaultValue} serverKey={selectedServerKey} />
      ))
    })
  }
}

export function useSettingsCommand(serverKey?: Accessor<ServerConnection.Key | undefined>) {
  const command = useCommand()
  const language = useLanguage()
  const show = useSettingsDialog(undefined, serverKey)

  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}
