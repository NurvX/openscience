import { expect, test } from "bun:test"

const [source, action, css] = await Promise.all([
  Bun.file(new URL("./session.tsx", import.meta.url)).text(),
  Bun.file(new URL("./session-sidebar-action.tsx", import.meta.url)).text(),
  Bun.file(new URL("../styles/atlas.css", import.meta.url)).text(),
])

test("keeps the compact research rail readable without inline density overrides", () => {
  expect(source).toContain('<span class="session-sidebar__group-label">Research</span>')
  expect(action).toContain('<span class="session-sidebar__group-label">Workspace</span>')
  expect(action).not.toContain('"font-size":')
  expect(css).toContain(".session-sidebar__action-copy strong,")
  expect(css).toContain("font-size: 14px")
  expect(css).toContain(".session-sidebar__empty")
  expect(css).toContain("font-size: 12px")
})
