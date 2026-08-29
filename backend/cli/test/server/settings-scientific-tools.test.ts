import { describe, expect, test } from "bun:test"
import { ScientificToolsSettingsRoutes } from "../../src/server/routes/settings/scientific-tools"

describe("scientific tools settings catalog", () => {
  test("returns the complete truthful capability and reviewed connector inventory", async () => {
    const response = await ScientificToolsSettingsRoutes().request("/")
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      schema_version: number
      capabilities: Array<{
        id: string
        maturity: string
        current_availability: { local: string; hosted: string }
      }>
      connectors: Array<{ id: string; writes_enabled_by_catalog: boolean; revision: string }>
      counts: {
        total: number
        packaged: number
        hosted: number
        verified: number
        experimental: number
        blocked: number
      }
    }

    expect(body.schema_version).toBe(1)
    expect(body.capabilities).toHaveLength(54)
    expect(body.counts).toEqual({
      total: 54,
      packaged: 5,
      hosted: 4,
      verified: 0,
      experimental: 51,
      blocked: 3,
    })
    expect(body.connectors.map((entry) => entry.id)).toEqual(["github", "benchling", "box", "dropbox", "s3"])
    expect(body.connectors.every((entry) => entry.writes_enabled_by_catalog === false)).toBe(true)
    expect(body.connectors.every((entry) => /^[a-f0-9]{64}$/.test(entry.revision))).toBe(true)
    expect(
      body.capabilities.every((entry) =>
        ["ready", "configured", "setup_needed", "degraded", "unavailable", "not_applicable"].includes(
          entry.current_availability.hosted,
        ),
      ),
    ).toBe(true)
  })
})
