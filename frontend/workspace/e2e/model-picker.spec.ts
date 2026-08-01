import { test, expect } from "./fixtures"
import { modelPopoverSelector, modelTriggerSelector } from "./utils"

test("smoke model selection updates the composer trigger", async ({ page, gotoSession }) => {
  await gotoSession()

  // The composer model control is the model-settings popover; the "Model" row
  // opens the select-model dialog.
  const trigger = page.locator(modelTriggerSelector)
  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.locator(`${modelPopoverSelector} [data-model-menu-row="model"]`).click()

  const dialog = page.getByRole("dialog", { name: "select model" })
  await expect(dialog).toBeVisible()

  const target = dialog.locator('[data-slot="list-item"]').first()
  await expect(target).toBeVisible()

  const name = (await target.locator("span.truncate").first().innerText()).trim()
  if (!name) throw new Error("Failed to resolve model name from list item")
  await target.click()

  await expect(dialog).toHaveCount(0)
  await expect(trigger).toContainText(name)
})
