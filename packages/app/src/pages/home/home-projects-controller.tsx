import { useDirectoryPicker } from "@/components/directory-picker"
import { useServerManagementController } from "@/components/dialog-select-server"
import { useSettingsCommand } from "@/components/settings-dialog"
import { DialogServerV2 } from "@/components/settings-v2/dialog-server-v2"
import { type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { usePlatform } from "@/context/platform"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { closeHomeProject, errorMessage, homeProjectDirectories } from "@/pages/layout/helpers"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createEffect, createResource, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeController } from "./home-controller"
import { issueWatcherApi } from "../watchers/api"
import { watcherAuthExpired } from "../watchers/logic"

export function createHomeProjectsController(home: HomeController) {
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const language = useLanguage()
  const notification = useNotification()
  const tabs = useTabs()
  const openSettings = useSettingsCommand(() => home.selection.value().server)
  const serverManagement = useServerManagementController({ navigateOnAdd: false })
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.servers", ["home.servers.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (promise) => promise.then(() => _state),
    { initialValue: _state },
  )
  const [watchers, setWatchers] = createStore({ server: "", inboxCount: 0, authExpiredCount: 0 })
  createEffect(() => {
    const context = home.server.focusedContext()
    const server = home.selection.value().server
    if (!context) return
    const api = issueWatcherApi(context.sdk)
    setWatchers({ server, inboxCount: 0, authExpiredCount: 0 })
    void Promise.all([api.inboxSummary(), api.list()])
      .then(([summary, list]) => {
        if (home.selection.value().server !== server) return
        setWatchers({
          inboxCount: summary.pending + summary.unrouted,
          authExpiredCount: list.filter(watcherAuthExpired).length,
        })
      })
      .catch(() => {})
    context.sdk.event.start()
    const unsub = context.sdk.event.listen(({ details }) => {
      const event = details as unknown as { type: string; properties?: { pending: number; unrouted: number } }
      if (event.type === "issue_watcher.inbox.changed") {
        const summary = event.properties
        if (summary) setWatchers("inboxCount", summary.pending + summary.unrouted)
        return
      }
      if (event.type !== "issue_watcher.run.completed") return
      void api.list().then((list) => setWatchers("authExpiredCount", list.filter(watcherAuthExpired).length)).catch(() => {})
    })
    onCleanup(unsub)
  })
  function directories(project: LocalProject) {
    return [project.worktree, ...(project.sandboxes ?? [])]
  }

  function canRevealProject(conn: ServerConnection.Any) {
    return platform.platform === "desktop" && !!platform.openPath && ServerConnection.local(conn)
  }

  return {
    copy: {
      language,
    },
    selection: {
      value: home.selection.value,
    },
    server: {
      list: home.server.list,
      health: home.server.health,
      projects: home.project.forServer,
      collapsed: (conn: ServerConnection.Any) => state().collapsed[ServerConnection.key(conn)] ?? false,
      toggleCollapsed: (conn: ServerConnection.Any) => {
        const key = ServerConnection.key(conn)
        setState("collapsed", key, !state().collapsed[key])
      },
      canDefault: serverManagement.canDefault,
      defaultKey: serverManagement.defaultKey,
      setDefault: (conn: ServerConnection.Any | undefined) =>
        serverManagement.setDefault(conn ? ServerConnection.key(conn) : null),
      remove: (conn: ServerConnection.Any) => serverManagement.handleRemove(ServerConnection.key(conn)),
      edit: (conn: ServerConnection.Http) => dialog.show(() => <DialogServerV2 mode="edit" server={conn} />),
      focus: home.selection.focusServer,
    },
    project: {
      list: home.project.list,
      recentlyClosed: home.project.recentlyClosed,
      homedir: home.project.homedir,
      select: home.project.select,
      add: home.project.add,
      openNewSession: home.project.openProjectNewSession,
      edit: (conn: ServerConnection.Any, project: LocalProject) => {
        void import("@/components/dialog-edit-project-v2").then(({ DialogEditProjectV2 }) => {
          void dialog.show(() => <DialogEditProjectV2 server={conn} project={project} />)
        })
      },
      unseenCount: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        return directories(project).reduce((total, directory) => total + state.project.unseenCount(directory), 0)
      },
      clearNotifications: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        directories(project)
          .filter((directory) => state.project.unseenCount(directory) > 0)
          .forEach((directory) => state.project.markViewed(directory))
      },
      choose: (conn: ServerConnection.Any) => {
        if (home.server.health(conn)?.healthy === false) return
        pickDirectory({
          server: conn,
          title: language.t("command.project.open"),
          multiple: true,
          onSelect: (result) => home.project.add(conn, homeProjectDirectories(result)),
        })
      },
      close: (conn: ServerConnection.Any, directory: string) => {
        const next = closeHomeProject(
          home.selection.value(),
          ServerConnection.key(conn),
          home.server.context(conn).projects,
          directory,
        )
        if (next) home.selection.set(next)
      },
      move: (conn: ServerConnection.Any, worktree: string, index: number) => {
        home.server.context(conn).projects.move(worktree, index)
      },
      canReveal: canRevealProject,
      reveal: (conn: ServerConnection.Any, project: LocalProject) => {
        if (!platform.openPath || !canRevealProject(conn)) return
        platform.openPath(project.worktree).catch((cause: unknown) =>
          showToast({
            title: language.t("common.requestFailed"),
            description: errorMessage(cause, language.t("common.requestFailed")),
          }),
        )
      },
    },
    utility: {
      inboxCount: () => watchers.server === home.selection.value().server ? watchers.inboxCount : 0,
      authExpiredCount: () => watchers.server === home.selection.value().server ? watchers.authExpiredCount : 0,
      inbox: () => tabs.openUtilityTab({ type: "inbox", server: home.selection.value().server }),
      watchers: () => tabs.openUtilityTab({ type: "watchers", server: home.selection.value().server }),
      settings: openSettings,
      help: () => platform.openLink("https://opencode.ai/desktop-feedback"),
    },
  }
}

export type HomeProjectsController = ReturnType<typeof createHomeProjectsController>
