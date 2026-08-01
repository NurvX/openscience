import { expect, test } from "bun:test"

const source = await Bun.file(new URL("./session-new-view.tsx", import.meta.url)).text()

test("exposes the selected workflow category as a pressed toggle", () => {
  expect(source).toContain("aria-pressed={workflowGroup() === item[0]}")
})
