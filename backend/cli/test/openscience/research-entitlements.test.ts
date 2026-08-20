import { describe, expect, test } from "bun:test"
import { normalizeResearchEntitlements } from "../../src/openscience"

describe("research entitlement rollout compatibility", () => {
  test("keeps the flat alias shape", () => {
    expect(
      normalizeResearchEntitlements({
        plan: "ace",
        managed_search: { enabled: true, limit: 500, used: 10, reserved: 2, remaining: 488, reset_at: "next" },
      }).managed_search,
    ).toMatchObject({ enabled: true, limit: 500, used: 10, reserved: 2, remaining: 488, reset_at: "next" })
  })

  test("normalizes the deployed available plus nested allowance shape", () => {
    expect(
      normalizeResearchEntitlements({
        plan: "ace_plus",
        managed_search: {
          available: true,
          allowance: { limit: 2_000, used: 1_100, reserved: 3, remaining: 897, reset_at: "next" },
        },
      }).managed_search,
    ).toMatchObject({ enabled: true, limit: 2_000, used: 1_100, reserved: 3, remaining: 897, reset_at: "next" })
  })

  test("prefers account availability when an older Free response reports provider readiness as enabled", () => {
    expect(
      normalizeResearchEntitlements({
        plan: "free",
        managed_search: { enabled: true, available: false, allowance: { limit: 0 }, limit: 0 },
      }).managed_search,
    ).toMatchObject({ enabled: false, limit: 0 })
  })
})
