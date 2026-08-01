import { describe, expect, test } from "bun:test"
import { isVisibleSpecialist } from "./specialist-catalog"

describe("specialist catalog", () => {
  test("shows built-in subagents while hiding implementation agents and plan mode", () => {
    expect(isVisibleSpecialist({ name: "write" })).toBe(true)
    expect(isVisibleSpecialist({ name: "literature-review" })).toBe(true)
    expect(isVisibleSpecialist({ name: "reviewer" })).toBe(true)
    expect(isVisibleSpecialist({ name: "artifact-reviewer", hidden: true })).toBe(false)
    expect(isVisibleSpecialist({ name: "title" })).toBe(false)
    expect(isVisibleSpecialist({ name: "compaction" })).toBe(false)
    expect(isVisibleSpecialist({ name: "plan" })).toBe(false)
  })
})
