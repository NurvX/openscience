# Trusted Artifact Workbench Implementation Plan

> **Execution mode:** single-agent implementation on `openscience/aayam-new`.
> Follow the tasks in order and keep every red/green test result observable.

**Goal:** Deliver the first large parity batch: close the remaining file-boundary
risk, turn opened scientific files into contextual artifacts, replace the stale
global right rail with an artifact inspector, and upgrade molecular structures
from a bare canvas into an inspectable and exportable scientific workspace.

**Architecture:** Existing file, provenance, notebook, run, and Git records stay
authoritative. A small artifact-context store tells the shell what object is
active. `ArtifactInspector` composes the existing APIs into honest
Details/Code/Run/Messages/Environment/Review/History states. Scientific
renderers publish optional capabilities through typed callbacks rather than
reaching into the shell. Mol* remains the only 3D dependency.

**Tech stack:** TypeScript, SolidJS, Bun, Hono, Mol*, Playwright, existing
OpenScience SDK and design tokens.

## Global Constraints

- Work only on `openscience/aayam-new`.
- Preserve the user-owned untracked `AUDIT.md`.
- Never push OpenScience or Atlas `main`.
- Never invoke the production npm workflow.
- Publish packages only through `.github/workflows/npm-test.yml`, after the
  complete batch rather than after individual commits.
- Keep `Aayam Bansal <aayambansal@gmail.com>` as author and committer.
- Do not add React, a second molecular renderer, or a second provenance store.
- Do not show invented run, review, environment, or history data. Empty states
  must say exactly what has not been recorded.

---

### Task 1: Canonical Project Path Boundary

**Files:**

- Modify: `backend/cli/src/util/filesystem.ts`
- Modify: `backend/cli/src/project/instance.ts`
- Modify: `backend/cli/src/file/index.ts`
- Modify: `backend/cli/src/tool/external-directory.ts`
- Modify: `backend/cli/test/file/path-traversal.test.ts`
- Modify: `backend/cli/test/tool/read.test.ts`

**Contract:**

- Existing files and directories are compared by canonical path.
- A symlink below the opened project that resolves outside the project is not
  treated as internal.
- For a new write target, the nearest existing parent is canonicalized and must
  remain inside the canonical project/worktree boundary.
- Ordinary internal paths, monorepo worktree siblings, and non-existent
  internal write targets keep working.

- [ ] Add failing tests that create an internal symlink to an external temp
  directory and prove `File.read`, `File.raw`, `File.inspect`, `File.list`,
  `File.write`, `ReadTool`, and `assertExternalDirectory` do not silently treat
  it as internal.
- [ ] Add failing tests for a new internal file and a valid monorepo sibling so
  the fix cannot over-restrict normal work.
- [ ] Run:

  ```bash
  cd backend/cli
  bun test test/file/path-traversal.test.ts test/tool/read.test.ts
  ```

  Confirm the symlink cases fail for the intended reason.
- [ ] Add one reusable canonical containment helper in
  `backend/cli/src/util/filesystem.ts`. Resolve the nearest existing ancestor
  for missing paths and reconstruct the unresolved suffix without following a
  later symlink.
- [ ] Expose an async `Instance.containsCanonicalPath(path)` or equivalent and
  use it at file/API and external-directory trust boundaries. Keep the existing
  lexical helper only for non-authoritative display/fast-path use.
- [ ] Re-run the focused tests and the existing snapshot symlink/revert tests.
- [ ] Commit:

  ```bash
  git add backend/cli/src/util/filesystem.ts \
    backend/cli/src/project/instance.ts \
    backend/cli/src/file/index.ts \
    backend/cli/src/tool/external-directory.ts \
    backend/cli/test/file/path-traversal.test.ts \
    backend/cli/test/tool/read.test.ts
  git commit -m "fix: enforce canonical project file boundaries"
  ```

### Task 2: Active Artifact Context Model

**Files:**

- Create: `frontend/workspace/src/artifacts/context.ts`
- Create: `frontend/workspace/src/artifacts/context.test.ts`
- Modify: `frontend/workspace/src/atlas/store/ui.ts`
- Modify: `frontend/workspace/src/atlas/FilePreview.tsx`

**Contract:**

```ts
type ArtifactContext = {
  id: string
  directory: string
  path: string
  name: string
  format: string
  kind: ArtifactKind
  scienceKind?: string
}
```

- The active file publishes a normalized artifact context after format
  detection.
- Switching center tabs changes or clears the active context without allowing
  an unmounted/stale file to clear a newer context.
- Inspector selection and open state persist, but stale object-specific state
  never leaks to another file.

- [ ] Write failing pure tests for id stability, file-extension classification,
  scientific kind propagation, stale-clear protection, and unknown file
  fallback.
- [ ] Run `bun test frontend/workspace/src/artifacts/context.test.ts` and confirm
  failure.
- [ ] Implement the pure context model and a small Solid signal store.
- [ ] Have `FileView` publish its context and renderer capabilities; clear it
  only when it still owns the current context.
- [ ] Add source-contract coverage in
  `frontend/workspace/src/pages/session-shell.test.ts`.
- [ ] Run the focused tests and workspace typecheck.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/artifacts/context.ts \
    frontend/workspace/src/artifacts/context.test.ts \
    frontend/workspace/src/atlas/store/ui.ts \
    frontend/workspace/src/atlas/FilePreview.tsx \
    frontend/workspace/src/pages/session-shell.test.ts
  git commit -m "feat: track active scientific artifacts"
  ```

### Task 3: Artifact Inspector Data Model

**Files:**

- Create: `frontend/workspace/src/artifacts/inspector.ts`
- Create: `frontend/workspace/src/artifacts/inspector.test.ts`
- Create: `frontend/workspace/src/artifacts/ArtifactInspector.tsx`
- Modify: `frontend/workspace/src/artifacts/model.ts`

**Contract:**

- Tabs: `details`, `code`, `run`, `messages`, `environment`, `review`,
  `history`.
- Details show real format, size, path, scientific summary, inputs, and
  renderer capabilities.
- Code uses the actual text source, notebook code, or provenance fields. Binary
  data reports that source is not directly displayable.
- Run, messages, environment, review, and history normalize available
  provenance/API data and otherwise render specific empty states.
- Download, copy path, open source, add to context, and export actions remain
  available from one consistent header.

- [ ] Write failing normalization tests for complete, partial, malformed, and
  absent provenance responses.
- [ ] Implement the pure inspector model without SolidJS or network calls.
- [ ] Build `ArtifactInspector` with labeled tabs, keyboard tab semantics,
  loading/error/empty states, and at least 12px content typography.
- [ ] Reuse `/file/provenance`, file content, artifact actions, and existing
  prompt/context hooks. Do not introduce an inspector-only backend store.
- [ ] Add component/source contract tests for all seven tabs and honest empty
  states.
- [ ] Run focused unit tests and workspace typecheck.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/artifacts/inspector.ts \
    frontend/workspace/src/artifacts/inspector.test.ts \
    frontend/workspace/src/artifacts/ArtifactInspector.tsx \
    frontend/workspace/src/artifacts/model.ts
  git commit -m "feat: add contextual artifact inspector"
  ```

### Task 4: Contextual Three-Region Shell

**Files:**

- Modify: `frontend/workspace/src/atlas/RightPane.tsx`
- Modify: `frontend/workspace/src/atlas/store/ui.ts`
- Modify: `frontend/workspace/src/pages/session.tsx`
- Modify: `frontend/workspace/src/pages/session-shell.test.ts`
- Modify: `frontend/workspace/e2e/navigation.spec.ts`
- Create: `frontend/workspace/e2e/artifact-inspector.spec.ts`

**Contract:**

- When a document is active, the right pane defaults to the artifact inspector.
- Global tools remain available as labeled destinations: Atlas, Evidence,
  Compute, Terminal.
- Leaving a document restores the last global tool rather than showing stale
  artifact content.
- At widths below the workspace breakpoint, the inspector becomes an overlay
  drawer and the collapsed rail remains keyboard accessible.
- The pane width is clamped against viewport width and never crushes the center
  below a usable minimum.

- [ ] Add failing browser tests for file-to-file context switching, file-to-chat
  restoration, tab keyboard behavior, close/reopen, and a 1024px viewport.
- [ ] Replace the icon-first pane chooser with labeled inspector/global
  destinations and a contextual header.
- [ ] Add responsive drawer behavior and viewport-aware width clamping.
- [ ] Increase right-pane body typography and contrast through existing tokens;
  do not add a new color system.
- [ ] Run focused browser tests and inspect desktop plus narrow screenshots.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/atlas/RightPane.tsx \
    frontend/workspace/src/atlas/store/ui.ts \
    frontend/workspace/src/pages/session.tsx \
    frontend/workspace/src/pages/session-shell.test.ts \
    frontend/workspace/e2e/navigation.spec.ts \
    frontend/workspace/e2e/artifact-inspector.spec.ts
  git commit -m "feat: make the workspace artifact aware"
  ```

### Task 5: Molecular Source Analysis

**Files:**

- Create: `frontend/workspace/src/science/renderers/molecular/model.ts`
- Create: `frontend/workspace/src/science/renderers/molecular/model.test.ts`
- Modify: `frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx`

**Contract:**

- Inline XYZ, PDB/mmCIF, SDF/MOL, and MOL2 inputs expose format-aware summary
  metadata where it can be derived safely.
- Summary includes atom count, element distribution, model/molecule count,
  chains/residues when available, declared bonds when available, and source
  mode.
- Parse uncertainty is explicit. A heuristic count is never labeled as a
  guaranteed scientific property.

- [ ] Write failing pure tests using the committed XYZ, PDB, and SDF fixtures
  plus malformed/empty inputs.
- [ ] Implement small format-specific analyzers in one module. Keep parsing
  conservative; Mol* remains authoritative for rendering.
- [ ] Publish the summary through the renderer capability/context contract so
  the Details tab updates when a molecule becomes ready.
- [ ] Run focused tests and typecheck.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/science/renderers/molecular/model.ts \
    frontend/workspace/src/science/renderers/molecular/model.test.ts \
    frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx
  git commit -m "feat: inspect molecular structure metadata"
  ```

### Task 6: Interactive Molecular Controls

**Files:**

- Modify: `frontend/workspace/src/science/renderers/registry.ts`
- Modify: `frontend/workspace/src/science/ScienceArtifact.tsx`
- Modify: `frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx`
- Modify: `frontend/workspace/e2e/science-file-viewers.spec.ts`

**Contract:**

- Representation presets: automatic, polymer cartoon, atomic detail,
  illustrative, and molecular surface.
- Selection granularity: atom, residue, chain.
- Clicked selection reports Mol*'s real label and selected element count.
- Two recorded selections can create a Mol* distance measurement; measurements
  can be cleared.
- Camera reset, background toggle, and PNG snapshot export work from labeled
  controls.
- Loading, empty, malformed, WebGL failure, and remote-source-blocked states
  remain usable.

- [ ] Add failing source/unit coverage for capability registration and browser
  coverage for preset switching, camera reset, selection state, measurement
  mode, and snapshot download.
- [ ] Extend the renderer contract with optional callbacks/capabilities; keep
  existing renderers source-compatible.
- [ ] Subscribe to Mol* click and selection events and dispose every
  subscription on cleanup.
- [ ] Apply Mol* representation presets to the loaded structure, preserving the
  selected preset across reloads.
- [ ] Build an in-canvas labeled toolbar and an accessible selected-item card.
- [ ] Implement distance measurement using Mol*'s measurement manager and real
  structure loci.
- [ ] Export the actual WebGL canvas to PNG with a deterministic filename.
- [ ] Run molecular unit tests, file-viewer E2E, typecheck, and inspect the XYZ
  and PDB screens visually.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/science/renderers/registry.ts \
    frontend/workspace/src/science/ScienceArtifact.tsx \
    frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx \
    frontend/workspace/e2e/science-file-viewers.spec.ts
  git commit -m "feat: add interactive molecular analysis controls"
  ```

### Task 7: Versioned Scientific Annotations

**Files:**

- Create: `frontend/workspace/src/artifacts/annotations.ts`
- Create: `frontend/workspace/src/artifacts/annotations.test.ts`
- Create: `backend/cli/src/server/routes/artifact.ts`
- Create: `backend/cli/test/server/artifact.test.ts`
- Modify: `backend/cli/src/server/server.ts`
- Modify: `frontend/workspace/src/artifacts/ArtifactInspector.tsx`
- Modify: `frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx`

**Contract:**

- An annotation records id, artifact path/hash, version, target kind, target
  payload, body, author, created/updated timestamps, and resolution state.
- Molecular annotations prefer atom/residue/chain loci labels; generic artifacts
  may use document coordinates.
- Data is stored locally below the project `.openscience` state and is scoped by
  canonical project path.
- Editing creates a new annotation revision. Deletion is a recoverable tombstone
  rather than destructive removal.
- “Ask OpenScience” inserts an attributed annotation reference into the
  composer; it does not silently edit the artifact.

- [ ] Write failing pure model tests and real route tests for list/create/update,
  revision history, malformed targets, canonical containment, and tombstones.
- [ ] Implement project-local storage with atomic writes and no new database.
- [ ] Add the artifact routes to the existing project-scoped server.
- [ ] Add annotation list/composer/history UI to the inspector.
- [ ] Add “annotate selection” from the molecular selected-item card.
- [ ] Add focused E2E coverage spanning selection, annotation, reload, history,
  and composer handoff.
- [ ] Run backend, unit, type, and browser tests.
- [ ] Commit:

  ```bash
  git add backend/cli/src/server/routes/artifact.ts \
    backend/cli/src/server/server.ts \
    backend/cli/test/server/artifact.test.ts \
    frontend/workspace/src/artifacts/annotations.ts \
    frontend/workspace/src/artifacts/annotations.test.ts \
    frontend/workspace/src/artifacts/ArtifactInspector.tsx \
    frontend/workspace/src/science/renderers/molecular/ProteinStructure.tsx \
    frontend/workspace/e2e/artifact-inspector.spec.ts
  git commit -m "feat: add versioned scientific annotations"
  ```

### Task 8: Truthful Artifact Previews and UX Refinement

**Files:**

- Modify: `frontend/workspace/src/artifacts/ArtifactGallery.tsx`
- Modify: `frontend/workspace/src/atlas/FilePreview.tsx`
- Modify: `frontend/workspace/src/atlas/RightPane.tsx`
- Modify: `frontend/workspace/e2e/artifact-gallery.spec.ts`
- Modify: `frontend/workspace/e2e/artifact-inspector.spec.ts`
- Modify: `frontend/workspace/e2e/science-file-viewers.spec.ts`

**Contract:**

- Image/SVG/PDF and supported molecular artifacts use truthful generated
  previews when available.
- Unsupported preview types use a clear format-specific placeholder, never a
  generic fake chart.
- Header actions have visible labels at normal widths and accessible names at
  all widths.
- Loading skeletons preserve layout; empty/error states explain the next action.
- Focus rings, tab order, contrast, reduced motion, and 1024px/1440px layouts
  pass manual inspection.

- [ ] Add failing browser assertions that distinguish real previews from
  placeholders and verify labeled primary actions.
- [ ] Replace the generic chart thumbnail with real or format-specific preview
  states.
- [ ] Refine artifact/file headers, spacing, type sizes, and responsive
  visibility using existing tokens.
- [ ] Capture and inspect screenshots for gallery, XYZ artifact studio, PDB
  inspector, error state, and narrow inspector.
- [ ] Run focused E2E and workspace typecheck.
- [ ] Commit:

  ```bash
  git add frontend/workspace/src/artifacts/ArtifactGallery.tsx \
    frontend/workspace/src/atlas/FilePreview.tsx \
    frontend/workspace/src/atlas/RightPane.tsx \
    frontend/workspace/e2e/artifact-gallery.spec.ts \
    frontend/workspace/e2e/artifact-inspector.spec.ts \
    frontend/workspace/e2e/science-file-viewers.spec.ts
  git commit -m "feat: polish the trusted artifact workbench"
  ```

### Task 9: Batch Verification and Branch Push

**Files:** Modify only files required by discovered failures.

- [ ] Run focused security tests:

  ```bash
  cd backend/cli
  bun test test/file/path-traversal.test.ts test/tool/read.test.ts \
    test/snapshot/snapshot.test.ts test/server/artifact.test.ts
  ```

- [ ] Run workspace unit and type checks:

  ```bash
  bun test frontend/workspace/src/artifacts \
    frontend/workspace/src/science/renderers/molecular \
    frontend/workspace/src/pages/session-shell.test.ts
  bun run --cwd frontend/workspace typecheck
  ```

- [ ] Run focused browser checks:

  ```bash
  bun run --cwd frontend/workspace test:e2e:local -- \
    e2e/artifact-inspector.spec.ts \
    e2e/artifact-gallery.spec.ts \
    e2e/science-file-viewers.spec.ts \
    e2e/navigation.spec.ts
  ```

- [ ] Run the required full backend suite from `backend/cli`:

  ```bash
  cd backend/cli
  bun test
  ```

- [ ] Run repository typecheck and production workspace build:

  ```bash
  bun run typecheck
  bun run --cwd frontend/workspace build
  ```

- [ ] Run:

  ```bash
  git diff --check
  git status --short
  git log origin/openscience/aayam-new..HEAD \
    --format='%h %an <%ae> | %cn <%ce> | %s'
  ```

  Confirm only `AUDIT.md` is untracked and every commit has the required
  identity.
- [ ] Push only:

  ```bash
  git push origin openscience/aayam-new
  ```

- [ ] Wait for normal branch CI. Diagnose and fix every failure before npm
  packaging.

### Task 10: Batched npm `test` Package Validation

- [ ] Dispatch `.github/workflows/npm-test.yml` for
  `openscience/aayam-new`. Do not dispatch the production workflow.
- [ ] Wait for the workflow and inspect every job/log rather than relying only
  on the aggregate badge.
- [ ] Install the test packages into an isolated temporary npm prefix.
- [ ] Start `openscience serve` with temporary XDG/config/data directories and
  a deterministic local model provider.
- [ ] Re-run the packaged smoke flows: project open, notebook, XYZ viewer,
  artifact inspector, annotation persistence, and clean shutdown.
- [ ] Record the package versions, workflow run, checks executed, and any
  unavailable credential-locked integrations in the parity backlog.
- [ ] Fix and repeat the npm test release only if the packaged artifact reveals
  a release-specific defect.
