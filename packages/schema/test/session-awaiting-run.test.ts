import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Session, SessionExecutionAttempt, SessionInput } from "../src"
import { SessionEvent } from "../src/session-event"

describe("awaiting-run session contracts", () => {
  test("defines canonical execution attempt IDs and public statuses", () => {
    expect(SessionExecutionAttempt.ID.create()).toStartWith("sea_")
    expect(() => Schema.decodeUnknownSync(SessionExecutionAttempt.ID)("attempt_1")).toThrow()
    expect(
      (["running", "handoff_unknown", "awaiting_run", "idle"] as const).map((status) => Session.Status.make(status)),
    ).toEqual([
      "running",
      "handoff_unknown",
      "awaiting_run",
      "idle",
    ])
  })

  test("defines precise pending input operations", () => {
    const resume = Schema.decodeUnknownSync(SessionInput.ResumeInput)({
      expectedMessageID: "msg_expected",
      attemptID: "sea_attempt",
    })
    expect(String(resume.expectedMessageID)).toBe("msg_expected")
    expect(String(resume.attemptID)).toBe("sea_attempt")
    const confirmation = Schema.decodeUnknownSync(SessionInput.ConfirmHandoffInput)({
      attemptID: "sea_old",
      newAttemptID: "sea_new",
    })
    expect(String(confirmation.attemptID)).toBe("sea_old")
    expect(String(confirmation.newAttemptID)).toBe("sea_new")
  })

  test("registers all input and execution lifecycle events as durable v1 events", () => {
    const definitions = [
      SessionEvent.PromptReplaced,
      SessionEvent.PromptCancelled,
      SessionEvent.PromptClaimed,
      SessionEvent.Execution.Scheduled,
      SessionEvent.Execution.Started,
      SessionEvent.Execution.Completed,
      SessionEvent.Execution.Failed,
      SessionEvent.Execution.Interrupted,
      SessionEvent.Execution.Superseded,
    ]
    expect(definitions.map((definition) => definition.durable)).toEqual(
      definitions.map(() => ({ aggregate: "sessionID", version: 1 })),
    )
    expect(SessionEvent.Execution.Failed.data.fields.failure).toBe(SessionExecutionAttempt.Failure)
    expect(SessionEvent.Execution.Interrupted.data.fields.interruption).toBe(SessionExecutionAttempt.Interruption)
  })
})
