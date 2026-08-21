import { describe, expect, test } from "bun:test"

const landing = await Bun.file(new URL("./Landing.tsx", import.meta.url)).text()
const main = await Bun.file(new URL("../main.tsx", import.meta.url)).text()

describe("OpenScience landing contract", () => {
  test("keeps the free product independent from Ace", () => {
    expect(landing).toContain("The desktop and local runtime remain free")
    expect(landing).toContain("BYOK")
    expect(landing).toContain("eligible ChatGPT")
    expect(landing).toContain("Do I need Ace to use OpenScience?")
  })

  test("publishes the approved Ace catalog and managed search allowances", () => {
    expect(landing).toContain("$20 / month")
    expect(landing).toContain("$20 added to Wallet every month")
    expect(landing).toContain("1,000 completed managed searches each billing cycle")
    expect(landing).toContain("$100 / month")
    expect(landing).toContain("$100 added to Wallet every month")
    expect(landing).toContain("$50 in promotional credits each cycle")
    expect(landing).toContain("5,000 completed managed searches each billing cycle")
    expect(landing).toContain("billing?plan=ace_plus")
  })

  test("markets the plans without mixing promotional credits into the purchased balance", () => {
    expect(landing).toContain("MOST POPULAR")
    expect(landing).toContain("Skip provider setup and keep momentum")
    expect(landing).toContain("Your Wallet holds paid credits only")
    expect(landing).toContain("promotional credits are shown separately")
    expect(landing).toContain("Card processing is included")
  })

  test("does not advertise paused surfaces or old branding", () => {
    expect(landing).not.toContain("Atlas")
    expect(landing).not.toContain("Compute")
    expect(landing).not.toContain("Explore public")
  })

  test("gives visitors an explicit website analytics control", () => {
    expect(main).toContain('window.localStorage.getItem(ANALYTICS_PREFERENCE) !== "off"')
    expect(landing).toContain('Website analytics: {analyticsEnabled ? "on" : "off"}')
  })
})
