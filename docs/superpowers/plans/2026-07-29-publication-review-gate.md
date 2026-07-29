# Deterministic Publication Review Gate Implementation Plan

> **Execution mode:** single-agent implementation on `openscience/aayam-new`.
> Keep the review engine local, deterministic, version-bound, and independently
> testable before connecting any optional model reviewer.

**Goal:** Turn OpenScience’s existing publication export and advisory review
prompts into a real readiness workflow. A scientist can run structural checks
against a Markdown manuscript, inspect exact findings, resolve or explicitly
override them with an attributed reason, finalize the exact reviewed bytes, and
request a reviewed export that cannot silently use stale or unreviewed content.

**Architecture:** Add one file-scoped `PublicationReview` service beside
`PublicationFile`. It composes the existing canonical path boundary,
`ArtifactFile.provenance`, project reproducibility audit, and provenance graph.
Reports live in project-scoped Storage as version-bound sidecars. Findings have
stable deterministic IDs; report events are append-only. Publication export
remains available in draft mode and gains an explicit `reviewed` mode that
requires a finalized report for the current source hash. The artifact
inspector’s Review tab composes deterministic findings and manual annotation
threads instead of replacing either.

**Tech stack:** TypeScript, Bun, Zod, Hono, SolidJS, Playwright, existing
OpenScience Storage and project APIs.

## Global Constraints

- Work only on `openscience/aayam-new`.
- Preserve the user-owned untracked `AUDIT.md`.
- Do not modify Atlas unless OpenScience cannot express a required contract.
- Never push either repository’s `main`.
- Never run the production npm workflow.
- Keep `Aayam Bansal <aayambansal@gmail.com>` as author and committer.
- A review is valid only for the exact SHA-256 of the reviewed manuscript.
- Deterministic checks must cite a file location or concrete project evidence.
- Missing evidence is reported as missing; it is never inferred.
- An override requires actor, reason, timestamp, and an immutable event.
- Existing draft exports keep working. Only `readiness: "reviewed"` is gated.

---

### Task 1: Review Report Contract and Deterministic Checks

**Files:**

- Create: `backend/cli/src/file/review.ts`
- Create: `backend/cli/test/file/review.test.ts`

**Contract:**

- Reports include source path/hash, version, timestamps, status, counts,
  findings, finalization state, and append-only events.
- Findings cover `citation`, `numeric`, `figure`, and `provenance`.
- Citation checks detect unresolved citation placeholders, bibliography keys
  absent from local `.bib` files, and undefined footnotes.
- Numeric checks identify statistical/numeric claims without a nearby citation,
  table/figure reference, or linked project data source.
- Figure checks reject missing local figures, flag empty alt text, and require a
  matching provenance artifact node for local figures.
- Provenance checks bind the manuscript to Git state and the existing project
  reproducibility audit.
- Re-running after source bytes change creates a new report rather than
  carrying resolutions across versions.

**Verification:**

- Start with a failing fixture containing one broken citation, undefined
  footnote, untraced numeric claim, missing figure, unprovenanced figure, and
  dirty/untracked manuscript.
- Add a clean fixture whose citations, numeric trace, figure file, provenance
  node, Git state, environment, and lockfile pass.
- Run:

  ```bash
  cd backend/cli
  bun test test/file/review.test.ts
  ```

- Commit:

  ```bash
  git add backend/cli/src/file/review.ts backend/cli/test/file/review.test.ts
  git commit -m "feat: audit publication readiness"
  ```

### Task 2: Resolution, Override, Finalization, and Reviewed Export

**Files:**

- Modify: `backend/cli/src/file/review.ts`
- Modify: `backend/cli/src/file/publication.ts`
- Modify: `backend/cli/src/file/index.ts`
- Modify: `backend/cli/test/file/review.test.ts`
- Modify: `backend/cli/test/file/publication.test.ts`

**Contract:**

- Resolve records actor, reason, time, finding ID, and next report version.
- Override has the same audit fields plus `kind: "overridden"` and can never be
  created without a non-empty reason.
- Finalize fails while a blocking finding is open.
- Finalize stores actor, time, report ID, and reviewed artifact hash.
- A finalized report becomes stale immediately when the manuscript changes.
- `PublicationFile.Input` adds `readiness: "draft" | "reviewed"` with `draft`
  as the backwards-compatible default.
- Reviewed export rejects missing, open-blocked, unfinalized, or stale reports.
- Export results identify draft/reviewed mode and the bound review report.

**Verification:**

- Test open-blocked finalization, resolution, attributed override, successful
  finalization, stale-source rejection, and ordinary draft export.
- Re-run publication security tests.
- Commit:

  ```bash
  git add backend/cli/src/file/review.ts \
    backend/cli/src/file/publication.ts \
    backend/cli/src/file/index.ts \
    backend/cli/test/file/review.test.ts \
    backend/cli/test/file/publication.test.ts
  git commit -m "feat: gate reviewed publication exports"
  ```

### Task 3: File API

**Files:**

- Modify: `backend/cli/src/server/routes/file.ts`
- Modify: `backend/cli/test/server/file-research.test.ts`

**Routes:**

- `GET /file/reviews?path=…` — latest report for the current source path.
- `GET /file/reviews/history?path=…` — prior reports for source versions.
- `POST /file/reviews` — run deterministic checks.
- `PATCH /file/reviews/:id/findings/:finding` — resolve or override.
- `POST /file/reviews/:id/finalize` — finalize the exact reviewed bytes.

**Verification:**

- Exercise routes against actual temporary files and Storage.
- Verify current report, history, resolution events, failed blocked
  finalization, successful finalization, and stale state after a file edit.
- Run the file research and review suites.
- Regenerate the JavaScript SDK with `./tooling/repo/generate.ts` only if the
  generated SDK is used by this UI slice; otherwise keep the direct local API
  pattern already used by the artifact inspector.
- Commit:

  ```bash
  git add backend/cli/src/server/routes/file.ts \
    backend/cli/test/server/file-research.test.ts
  git commit -m "feat: expose publication review workflow"
  ```

### Task 4: Artifact Inspector Readiness UI

**Files:**

- Modify: `frontend/workspace/src/artifacts/ArtifactInspector.tsx`
- Modify: `frontend/workspace/src/artifacts/inspector.ts`
- Modify: `frontend/workspace/src/artifacts/inspector.test.ts`
- Modify: `frontend/workspace/e2e/artifact-inspector.spec.ts`
- Add: `frontend/workspace/e2e/science/review-report.md`

**Contract:**

- Review tab shows a compact readiness header before manual threads.
- For report formats, “Run checks” loads the exact current manuscript.
- Findings are grouped by severity and show check type, evidence/location,
  status, and resolution record.
- Resolve is a deliberate one-click acknowledgement with an attributed reason.
- Override opens a reason field and cannot submit empty text.
- Finalize is disabled while blocking findings are open.
- Stale state is explicit after the file changes.
- Non-report artifacts retain annotation threads and show that publication
  checks apply to Markdown manuscripts.

**Verification:**

- Pure normalization tests cover unknown, blocked, warnings, ready, stale, and
  finalized states.
- Browser coverage runs checks on the fixture, resolves/overrides blockers,
  finalizes the reviewed bytes, and proves state persists after switching
  files.
- Run:

  ```bash
  cd frontend/workspace
  bun run test:e2e -- e2e/artifact-inspector.spec.ts --workers=1
  cd ../..
  bun run typecheck
  bun run format:check
  ```

- Commit:

  ```bash
  git add frontend/workspace/src/artifacts/ArtifactInspector.tsx \
    frontend/workspace/src/artifacts/inspector.ts \
    frontend/workspace/src/artifacts/inspector.test.ts \
    frontend/workspace/e2e/artifact-inspector.spec.ts \
    frontend/workspace/e2e/science/review-report.md
  git commit -m "feat: review manuscripts in the artifact inspector"
  ```

### Task 5: Batch Verification and Publication

- Run the full backend suite from `backend/cli`.
- Run root typecheck and formatting.
- Run the serial browser pack and production workspace build.
- Inspect the review UI at wide and narrow desktop breakpoints.
- Push only `openscience/aayam-new`.
- Run branch CI and repair failures on the branch.
- Trigger `.github/workflows/npm-test.yml` once for this coherent batch.
- Install `@synsci/openscience@test` and `synsci@test` in a fresh temporary npm
  prefix, serve with isolated state, and exercise health, review, finalization,
  and reviewed export through the packaged binary.
- Record the exact branch SHA, test package version, workflow result, and
  remaining launch-critical gaps before starting the manuscript authoring slice.
