import { expect, test } from "bun:test"
import { KernelMetrics } from "../../src/science/kernel/metrics"

test("sample reports cpu and resident memory for a live pid", async () => {
  if (process.platform !== "darwin" && process.platform !== "linux") return
  const usage = await KernelMetrics.sample(process.pid)
  expect(usage.cpu_percent).toBeGreaterThanOrEqual(0)
  expect(usage.memory_bytes).toBeGreaterThan(0)
})

test("sample omits fields for a dead pid instead of fabricating zeros", async () => {
  const usage = await KernelMetrics.sample(999999999)
  expect(usage.cpu_percent).toBeUndefined()
  expect(usage.memory_bytes).toBeUndefined()
})
