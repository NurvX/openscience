import { test, expect } from "./fixtures"

test("sidebar filters sessions and clears the search", async ({ page, sdk, gotoSession }) => {
  const stamp = Date.now()
  const oneTitle = `e2e sidebar search alpha ${stamp}`
  const twoTitle = `e2e sidebar search beta ${stamp}`
  const one = await sdk.session.create({ title: oneTitle }).then((r) => r.data)
  const two = await sdk.session.create({ title: twoTitle }).then((r) => r.data)

  if (!one?.id) throw new Error("Session create did not return an id")
  if (!two?.id) throw new Error("Session create did not return an id")

  try {
    await gotoSession(one.id)

    const search = page.getByPlaceholder("Search sessions")
    const sidebar = page.getByRole("complementary").filter({ has: search })
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByRole("button", { name: "New session" })).toBeVisible()

    await search.fill(`beta ${stamp}`)
    await expect(sidebar.locator('[role="button"]').filter({ hasText: twoTitle })).toBeVisible()
    await expect(sidebar.locator('[role="button"]').filter({ hasText: oneTitle })).toHaveCount(0)

    await sidebar.getByRole("button", { name: "clear search" }).click()
    await expect(search).toHaveValue("")
    await expect(sidebar.locator('[role="button"]').filter({ hasText: oneTitle })).toBeVisible()
    await expect(sidebar.locator('[role="button"]').filter({ hasText: twoTitle })).toBeVisible()
  } finally {
    await sdk.session.delete({ sessionID: one.id }).catch(() => undefined)
    await sdk.session.delete({ sessionID: two.id }).catch(() => undefined)
  }
})
