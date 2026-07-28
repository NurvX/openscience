import { describe, expect, test } from "bun:test"
import { researchWorkflows, workflowGroups, workflowPrompt } from "./research-launchpad"

describe("research launchpad", () => {
  test("ships launch-ready workflows across the core scientific loop", () => {
    expect(researchWorkflows.map((workflow) => workflow.id)).toEqual([
      "analyze-data",
      "run-notebook",
      "inspect-structure",
      "sequence-qc",
      "survey-literature",
      "reproduce-result",
      "compare-runs",
      "write-report",
    ])
    expect(new Set(researchWorkflows.map((workflow) => workflow.group))).toEqual(
      new Set(["analyze", "compute", "discover", "communicate"]),
    )
  })

  test("groups workflows without losing their authored order", () => {
    expect(workflowGroups().map((group) => group.id)).toEqual(["analyze", "compute", "discover", "communicate"])
    expect(
      workflowGroups()
        .find((group) => group.id === "analyze")
        ?.workflows.map((workflow) => workflow.id),
    ).toEqual(["analyze-data", "inspect-structure", "sequence-qc"])
  })

  test("adds project context to workflow prompts when artifacts are available", () => {
    const workflow = researchWorkflows[0]
    expect(workflowPrompt(workflow, 0)).toBe(workflow.prompt)
    expect(workflowPrompt(workflow, 12)).toContain("12 research artifacts")
    expect(workflowPrompt(workflow, 12)).toContain(workflow.prompt)
  })
})
