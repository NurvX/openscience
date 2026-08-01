import { test, expect } from "./fixtures"
import { modelPopoverSelector, modelTriggerSelector } from "./utils"

async function openModelPicker(page: import("@playwright/test").Page) {
  await page.locator(modelTriggerSelector).click()
  await page.locator(`${modelPopoverSelector} [data-model-menu-row="model"]`).click()
  const picker = page.getByRole("dialog", { name: "select model" })
  await expect(picker).toBeVisible()
  return picker
}

test("hiding a model removes it from the model picker", async ({ page, gotoSession }) => {
  await gotoSession()

  const picker = await openModelPicker(page)

  const target = picker.locator('[data-slot="list-item"]').first()
  await expect(target).toBeVisible()

  const key = await target.getAttribute("data-key")
  if (!key) throw new Error("Failed to resolve model key from list item")

  const name = (await target.locator("span.truncate").first().innerText()).trim()
  if (!name) throw new Error("Failed to resolve model name from list item")

  await picker.getByRole("button", { name: "manage models" }).first().click()

  const manage = page.getByRole("dialog", { name: "manage models" })
  await expect(manage).toBeVisible()
  const search = manage.getByPlaceholder("search models")
  await expect(search).toBeVisible()
  await search.fill(name)

  const row = manage.locator(`[data-slot="list-item"][data-key="${key}"]`)
  const toggle = row.locator('[data-component="switch"]')
  const input = toggle.locator('[data-slot="switch-input"]')
  await expect(toggle).toBeVisible()
  await expect(input).toHaveAttribute("aria-checked", "true")
  await toggle.locator('[data-slot="switch-control"]').click()
  await expect(input).toHaveAttribute("aria-checked", "false")

  await page.keyboard.press("Escape")
  await expect(manage).toHaveCount(0)

  const pickerAgain = await openModelPicker(page)
  await expect(pickerAgain.locator(`[data-slot="list-item"][data-key="${key}"]`)).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(pickerAgain).toHaveCount(0)
})
