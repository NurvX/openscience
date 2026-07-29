# Manuscript Workbench Implementation Plan

> **Execution note:** Follow the test-driven-development and verification-before-completion skills for each task.

**Goal:** Turn Markdown reports into a practical scientific authoring surface with live preview, local citations and figures, and trustworthy publication exports.

**Architecture:** Keep file persistence in `FileView`. Add a focused `ManuscriptWorkbench` for Markdown authoring, backed by pure parsing/insertion helpers. Reuse the existing artifact discovery, publication capability, review, and export endpoints; no Atlas changes are required.

**Tech stack:** SolidJS, TypeScript, Bun tests, Playwright.

---

### Task 1: Manuscript parsing and insertion model

**Files:**
- Create: `frontend/workspace/src/manuscript/model.ts`
- Test: `frontend/workspace/src/manuscript/model.test.ts`

1. Add failing tests for stripping YAML frontmatter, resolving bibliography declarations, parsing BibTeX entries, computing relative figure paths, and replacing an editor selection.
2. Implement the smallest pure helpers that pass those tests.
3. Run the focused Bun test.

### Task 2: Live Markdown authoring workbench

**Files:**
- Create: `frontend/workspace/src/manuscript/ManuscriptWorkbench.tsx`
- Modify: `frontend/workspace/src/atlas/FilePreview.tsx`

1. Mount a side-by-side source editor and rendered preview for Markdown.
2. Preserve dirty/reset/save behavior owned by `FileView`.
3. Render only the Markdown body while preserving frontmatter in the saved source.
4. Keep the existing raw-source control as a compact fallback mode.

### Task 3: Citation and figure browsers

**Files:**
- Modify: `frontend/workspace/src/manuscript/ManuscriptWorkbench.tsx`
- Test: `frontend/workspace/e2e/manuscript-workbench.spec.ts`
- Create: `frontend/workspace/e2e/science/manuscript.md`
- Create: `frontend/workspace/e2e/science/references.bib`
- Create: `frontend/workspace/e2e/science/figure.svg`

1. Load frontmatter-declared local `.bib` files and expose searchable citation cards.
2. Insert `[@key]` at the current editor selection and restore focus/cursor.
3. Discover local figure artifacts and insert relative Markdown image syntax.
4. Prove both flows through the real local file APIs in Playwright.

### Task 4: Review-aware publication exports

**Files:**
- Modify: `frontend/workspace/src/manuscript/ManuscriptWorkbench.tsx`
- Modify: `frontend/workspace/e2e/manuscript-workbench.spec.ts`

1. Load local publication capabilities and the current exact-byte review state.
2. Offer draft export for every locally supported format.
3. Offer reviewed export only for a finalized, non-stale review and include its `review_id`.
4. Open generated browser-readable artifacts and download Word/PowerPoint outputs.
5. Show actionable local-tool and review-gate explanations instead of dead controls.

### Task 5: Verification and branch delivery

1. Run focused model and Playwright tests.
2. Run workspace typecheck, formatting, production build, backend tests, and the full browser suite.
3. Commit each coherent feature with Aayam Bansal’s configured identity and push only `openscience/aayam-new`.
4. Validate branch CI.
5. Include this batch in the next npm `test` dist-tag release; never publish `latest`.
