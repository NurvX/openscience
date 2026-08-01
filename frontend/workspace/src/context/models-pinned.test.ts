import { describe, expect, test } from "bun:test"
import { togglePinned } from "./models"

const model = (modelID: string, providerID = "anthropic") => ({ modelID, providerID })

describe("pinned models", () => {
  test("pins and unpins a model without duplicating it", () => {
    const pinned = togglePinned([], model("claude-opus-4-8"))
    expect(pinned).toEqual({
      models: [model("claude-opus-4-8")],
      pinned: true,
      limited: false,
    })

    expect(togglePinned(pinned.models, model("claude-opus-4-8"))).toEqual({
      models: [],
      pinned: false,
      limited: false,
    })
  })

  test("keeps the quick selector capped at three models", () => {
    const current = [model("claude-opus-4-8"), model("gpt-5-5", "openai"), model("gpt-5-5", "openai-codex")]
    expect(togglePinned(current, model("gemini-3-6-flash", "google"))).toEqual({
      models: current,
      pinned: false,
      limited: true,
    })
  })
})
