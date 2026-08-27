import { describe, expect, test } from "bun:test"
import { SessionProcessor } from "../../src/session/processor"
import { MessageV2 } from "../../src/session/message-v2"

describe("session processor snapshot routing", () => {
  test("tracks only when the model can execute an advertised tool", () => {
    expect(SessionProcessor.tracks({ tools: {}, toolcall: true })).toBe(false)
    expect(SessionProcessor.tracks({ tools: { bash: {} }, toolcall: false })).toBe(false)
    expect(SessionProcessor.tracks({ tools: { bash: {} }, toolcall: true })).toBe(true)
  })

  test("finishing a streamed part preserves its first-output timestamp", () => {
    expect(SessionProcessor.finishTime({ start: 123 }, 456)).toEqual({ start: 123, end: 456 })
    expect(SessionProcessor.finishTime(undefined, 456)).toEqual({ start: 456, end: 456 })
  })

  test("preserves a managed-connection pause as a retryable API error", () => {
    const error = SessionProcessor.managedPauseError("Managed access is paused")
    expect(MessageV2.fromError(error, { providerID: "synthetic-sciences" })).toEqual({
      name: "APIError",
      data: {
        message: "Managed access is paused",
        statusCode: 503,
        isRetryable: true,
        metadata: { openscience_state: "paused", action: "retry" },
      },
    })
  })

  test("surfaces preserved work when a provider fails before normal text", () => {
    const notice = SessionProcessor.partialFailureNotice([
      {
        id: "part_tool",
        sessionID: "session",
        messageID: "message",
        type: "tool",
        tool: "task",
        callID: "call",
        state: {
          status: "completed",
          input: {},
          output: "handoff",
          title: "Inspect the evidence",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      },
      {
        id: "part_patch",
        sessionID: "session",
        messageID: "message",
        type: "patch",
        hash: "hash",
        files: ["analysis.py", "results.csv"],
      },
    ])

    expect(notice).toContain("1 completed operation and 2 changed files")
    expect(notice).toContain("- Inspect the evidence")
    expect(notice).toContain("- results.csv")
    expect(notice).toContain('Send "continue"')
  })

  test("does not synthesize a handoff for cancellation or after normal text", () => {
    const completed = {
      id: "part_tool",
      sessionID: "session",
      messageID: "message",
      type: "tool" as const,
      tool: "read",
      callID: "call",
      state: {
        status: "completed" as const,
        input: {},
        output: "done",
        title: "Read data.csv",
        metadata: {},
        time: { start: 1, end: 2 },
      },
    }
    expect(SessionProcessor.partialFailureNotice([completed], true)).toBeUndefined()
    expect(
      SessionProcessor.partialFailureNotice([
        completed,
        {
          id: "part_text",
          sessionID: "session",
          messageID: "message",
          type: "text",
          text: "Here is the partial result.",
        },
      ]),
    ).toBeUndefined()
  })
})
