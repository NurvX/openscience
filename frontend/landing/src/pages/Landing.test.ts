import { describe, expect, test } from "bun:test"

const landing = await Bun.file(new URL("./Landing.tsx", import.meta.url)).text()
const main = await Bun.file(new URL("../main.tsx", import.meta.url)).text()
const readme = await Bun.file(new URL("../../../../README.md", import.meta.url)).text()
const gateway = await Bun.file(new URL("../../../docs/src/content/openscience/gateway.mdx", import.meta.url)).text()

describe("OpenScience landing contract", () => {
  test("keeps the free product independent from Ace", () => {
    expect(landing).toContain("The desktop and local runtime remain free")
    expect(landing).toContain("BYOK")
    expect(landing).toContain("eligible ChatGPT")
    expect(landing).toContain("Do I need Ace to use OpenScience?")
  })

  test("publishes the approved Ace catalog without exposing internal credit accounting", () => {
    expect(landing).toContain('price="$20"')
    expect(landing).toContain('credits="20 credits"')
    expect(landing).toContain("Generous research quota")
    expect(landing).toContain('price="$100"')
    expect(landing).toContain('credits="150 credits"')
    expect(landing).toContain("3x research quota")
    expect(landing).toContain("billing?plan=ace_plus")
    expect(landing).not.toContain("added to Wallet")
    expect(landing).not.toContain("promotional credits")
    expect(landing).not.toContain("1,000")
    expect(landing).not.toContain("5,000")
    expect(landing).not.toContain("5% service fee")
  })

  test("markets both paid plans with the same scientist access and default auto-reload", () => {
    expect(landing).toContain("MOST POPULAR")
    expect(landing.match(/title: "Synthetic Scientists access"/g)).toHaveLength(2)
    expect(landing.match(/Auto-reload enabled by default/g)).toHaveLength(2)
    expect(landing).not.toContain("hosted Synthetic Scientists research run")
    expect(landing).toContain("Card processing is included")
  })

  test("keeps public plan copy aligned across the landing page, README, and docs", () => {
    for (const source of [landing, readme, gateway]) {
      expect(source).toContain("20 credits")
      expect(source).toContain("150 credits")
      expect(source).toContain("Generous research quota")
      expect(source).toContain("3x research quota")
      expect(source).toContain("Synthetic Scientists access")
      expect(source).toMatch(/auto-reload (?:is )?enabled by default/i)
      expect(source).not.toMatch(/(?:purchased|promotional) credits/i)
      expect(source).not.toMatch(/(?:1,000|5,000) (?:completed )?managed/i)
      expect(source).not.toMatch(/5% (?:service fee|margin)/i)
    }
  })

  test("does not advertise paused surfaces or old branding", () => {
    expect(landing).not.toContain("Atlas")
    expect(landing).not.toContain("Compute")
    expect(landing).not.toContain("Explore public")
    expect(landing).not.toContain("workspace.png")
  })

  test("gives visitors an explicit website analytics control", () => {
    expect(main).toContain('window.localStorage.getItem(ANALYTICS_PREFERENCE) !== "off"')
    expect(landing).toContain('Website analytics: {analyticsEnabled ? "on" : "off"}')
  })
})
