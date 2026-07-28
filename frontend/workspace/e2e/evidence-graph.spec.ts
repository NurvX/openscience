import { expect, test } from "./fixtures"
import { serverUrl } from "./utils"

test("visualizes project lineage and reviewer findings in the evidence pane", async ({
  page,
  request,
  gotoSession,
  directory,
}) => {
  await gotoSession()

  const post = async (path: string, data: object) => {
    const response = await request.post(`${serverUrl}${path}`, {
      params: { directory },
      data,
    })
    expect(response.ok(), await response.text()).toBe(true)
    return (await response.json()) as { id?: string; node?: { id: string } }
  }
  const source = await post("/provenance/nodes", {
    kind: "source",
    label: "Playwright trial registry",
    meta: { doi: "10.1000/playwright" },
  })
  const claim = await post("/provenance/nodes", {
    kind: "claim",
    label: "Playwright response claim",
    derived_from: source.id,
  })
  await post("/provenance/reviews", {
    target: claim.id,
    claim: "Playwright response claim",
    issue: "verified against registry",
    severity: "info",
    evidence: source.id,
    verdict: "supports",
  })

  await page.getByTitle("evidence").click()
  const pane = page.locator(".session-right-pane")
  await expect(pane.getByText("evidence & lineage", { exact: true })).toBeVisible()
  await expect(pane.getByRole("img", { name: "Evidence lineage graph" })).toBeVisible()
  const claimRow = pane.getByRole("button", { name: /Playwright response claim/ }).first()
  await expect(claimRow).toBeVisible()
  await claimRow.click()
  await expect(pane.getByText("supported", { exact: true }).first()).toBeVisible()

  await pane.getByRole("button", { name: "review", exact: true }).click()
  await expect(pane.getByText("verified against registry", { exact: true })).toBeVisible()
  await expect(pane.getByRole("button", { name: "export audit" })).toBeVisible()
  await expect(pane.getByRole("button", { name: "run reviewer audit" })).toBeVisible()
})
