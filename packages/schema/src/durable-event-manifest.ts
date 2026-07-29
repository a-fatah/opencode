export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { SessionEvent } from "./session-event"
import { SessionV1 } from "./session-v1"
import { IssueWatcher } from "./issue-watcher"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionV1.Event.Definitions.filter(
    (definition) => definition.durable !== undefined && definition !== SessionEvent.Deleted,
  ),
  ...SessionEvent.DurableDefinitions,
  ...IssueWatcher.Event.DurableDefinitions,
])
