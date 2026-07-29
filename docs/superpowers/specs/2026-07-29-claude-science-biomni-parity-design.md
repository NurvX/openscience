# Claude Science and Biomni Parity Program

## Goal

OpenScience should become a launch-ready scientific workbench that is at least
as coherent and capable as Claude Science for interactive analysis, while
matching the useful breadth of Biomni without inheriting its unsafe execution
model or research-only UI.

Parity is not measured by the number of cards, prompts, or advertised
integrations. A capability counts only when a scientist can discover it, use it
against real data, inspect its execution and provenance, recover from failure,
and export a reproducible result.

## Product Principles

1. **Artifact-first work.** The primary object is the scientific result:
   notebook, figure, structure, dataset, manuscript, or run. Chat, code,
   environment, provenance, and review are contextual views of that object.
2. **One coherent shell.** Project navigation stays on the left, active work in
   the center, and contextual inspection on the right. A task should not require
   learning four independent navigation systems.
3. **Real integrations only.** Public and local integrations must be exercised
   end-to-end. Credential- or contract-locked providers may ship a complete
   adapter, setup flow, and honest unavailable state, but never a fake success
   path.
4. **Local-first trust.** Raw data and credentials stay local unless the user
   deliberately chooses a remote service. Code execution, network access, and
   remote compute remain visible and revocable.
5. **Reproducibility by construction.** Every result links to code, inputs,
   environment, execution, conversation, review, and version history without
   requiring the user to assemble a manual audit trail.
6. **Review before polish is called complete.** Citations, reported numbers,
   figure/code consistency, and missing provenance are checked before a result
   is marked ready.
7. **Depth before catalog size.** A smaller number of integrated workflows is
   more valuable than hundreds of disconnected tool descriptions.

## Evidence Baseline

The audit used the current official Claude Science announcement, product page,
and interactive product demonstrations; the Stanford Biomni repository and
website; and a live browser/code audit of OpenScience on
`openscience/aayam-new`.

### OpenScience capabilities already present

- Native `.ipynb` editing, persistent Python/R kernels, rich outputs, restart,
  interrupt, diff, export, and per-cell provenance.
- Text-backed scientific routing for molecular structures, sequences,
  alignments, and chemistry plus binary summaries for common omics formats.
- Local and SSH job primitives, scheduler resource fields, logs, cancellation,
  reruns, and local artifact capture.
- Artifact gallery, evidence graph, reproducibility manifests, publication
  exports, starter projects, session recovery, and research launchpad.
- Roughly 292 scientific playbooks across 16 categories.
- Forty-two keyless scientific data connectors across proteins, genomics,
  chemistry, pathways, literature, and omics.

These are meaningful foundations. The remaining gap is integration depth,
scientific interaction quality, execution trust, and product coherence.

## Audited Gap Matrix

| Priority | Area | Current OpenScience gap | Required outcome |
| --- | --- | --- | --- |
| P0 | Local security boundary | Local API, renderer isolation, file containment, OAuth redirects, plugin discovery, network policy, and subprocess environment have unresolved launch findings | No critical local-origin, file-read, credential-exfiltration, path-containment, or unsafe-rendering path remains |
| P0 | Application shell | Header, sidebar, center tabs, tool rail, and right pane compete for attention; type is small and low-contrast | One adaptive three-region shell with clear hierarchy, labeled actions, accessible typography, and useful narrow layouts |
| P0 | Artifact workspace | Visualization, source, execution, messages, environment, review, history, and export are separate or absent | A contextual artifact studio exposes all of them without leaving the active result |
| P0 | Scientific review | Reviewer behavior is prompt-driven and advisory | A deterministic finalization gate records citation, numeric, figure/code, and provenance findings with explicit resolution |
| P1 | Molecular interaction | Mol* renders structures but exposes almost no scientific controls | Selection, measurements, representation/color presets, atom details, labels, snapshots, annotations, and image/structure export |
| P1 | Chemistry editing | Molecules render but cannot be sketched or edited | Live 2D sketcher with SMILES/SDF round-trip, validation, history, and handoff to 3D |
| P1 | Remote compute | Jobs lack complete queue lifecycle, arrays, checkpoint restore, remote artifacts, cost planning, and provider revocation | Plan, approve, submit, stream, retry, cancel, resume, collect, and audit local/SSH/HPC/provider jobs |
| P1 | Environment lifecycle | Environment metadata exists but dependency setup is fragmented | Inspectable Python/R/system/container environment plans with validation, lock capture, reusable profiles, and recovery |
| P1 | Manuscript workflow | Export exists without a focused authoring/review workspace | Markdown/LaTeX editor, live PDF preview, citation browser, figure insertion, review findings, and reproducible export |
| P1 | Domain databases | Coverage omits important regulatory, imaging, ecology, genetics, clinical, and pharmacovigilance sources | Typed, tested connectors plus federated search and source-specific result views |
| P2 | Scientific imaging | No first-class FCS, DICOM/NIfTI, OME-TIFF/WSI, or cryo-EM exploration | Format-aware viewers with metadata, channels/slices, annotations, measurements, and export |
| P2 | Scientific models | No polished adapters for protein language/design and structure models | Real local/public adapters where possible and honest credential-gated adapters otherwise |
| P2 | Tables and arrays | Inspection lacks joins, pivots, larger columnar workflows, and richer statistical exploration | Arrow/Parquet-backed transforms, joins, pivots, plots, provenance, and notebook handoff |
| P2 | Local knowledge packs | No versioned optional datalake or licensing filter comparable to Biomni's local assets | Discoverable, checksum-verified, versioned data packs with license/commercial-use metadata |
| P2 | Remaining formats | No native Newick, SBML, MRC, trajectories, richer bigWig/bigBed/BCF, or general HDF5 exploration | Purpose-built viewers and companion/index contracts rather than extension-only recognition |
| P3 | Product benchmarks | Feature existence is tested, but full scientific tasks are not scored against competitor workflows | Reproducible launch benchmark covering task success, interaction cost, provenance, recovery, and review quality |

## Information Architecture

### Left: project navigation

- Project identity and global search
- Sessions and branches
- Files and datasets
- Runs and compute
- Artifacts and manuscripts
- Sources and integrations

The left rail is stable. Catalogs such as skills and databases live behind
searchable commands or project settings rather than dominating the working
canvas.

### Center: active scientific work

The center hosts one active document or conversation:

- analysis conversation
- notebook
- scientific viewer/editor
- data table
- manuscript
- compute plan/run

Tabs remain recoverable and branch-aware. The initial project screen prioritizes
recent work, active runs, unresolved review findings, and a concise composer.
The complete workflow catalog moves behind a searchable launcher.

### Right: contextual inspector

The right pane changes with the active object and uses a consistent tab model:

- **Details** — metadata, inputs, outputs, scientific properties
- **Code** — exact generating or transforming code
- **Run** — status, logs, timing, resources, checkpoints
- **Messages** — conversation slice that produced the object
- **Environment** — packages, runtime, container, hardware
- **Review** — findings and resolution state
- **History** — versions, branches, comparison, restore

On narrow screens it becomes a labeled drawer. It never remains a stale compute
form while the user is inspecting an unrelated file.

## Artifact Model

An artifact is a locally addressable result with a stable id and versions. Each
version records:

- artifact kind and source path
- input files with hashes
- generating code or command
- execution/run id and timestamps
- environment manifest
- conversation range
- review report
- parent version or branch
- export records

Existing notebook provenance, artifact metadata, run records, and Git history
remain authoritative. The studio composes these sources rather than creating a
second provenance database. Missing information is shown as missing, never
inferred.

Annotations are versioned sidecar data. They target scientific coordinates
where possible—atom/residue, genomic interval, image coordinate, table
row/column—and screen coordinates only as a fallback. An annotation can create
a message draft or a requested edit without silently changing the artifact.

## Scientific Viewer Contract

Every first-class viewer implements the same user-facing contract:

- format and parser status
- selection model and details
- measurement/annotation hooks when scientifically meaningful
- view configuration with sensible presets
- source or metadata access
- export image/data
- provenance and version handoff
- loading, empty, malformed, unsupported, and large-file states
- keyboard and screen-reader affordances

The contract is capability-based. A PDF does not pretend to support atom
measurement, and a molecule does not inherit irrelevant genome controls.

## Review Gate

Finalization is a local, recorded state transition rather than another chat
message.

1. Collect claims, citations, numeric values, figures, source code, inputs, and
   provenance references.
2. Run deterministic structural checks first.
3. Optionally ask the configured reviewer model for semantic findings.
4. Store findings with severity, evidence, location, proposed resolution, and
   status.
5. Prevent a “reviewed” or publication-ready badge while blocking findings are
   unresolved.
6. Allow an explicit, attributed override with a reason.

The first gate covers missing/broken citations, numbers not traceable to a
table/run, figures without generating code or inputs, figure/code mismatch
signals, and missing environment capture.

## Compute and Environment Contract

A compute run advances through:

`draft -> validated -> awaiting approval -> queued -> running -> collecting -> completed`

with terminal alternatives `cancelled`, `failed`, and `revoked`.

Before submission the UI shows target, command, working tree state,
environment/container, data transfers, scheduler/provider resources, estimated
cost when available, and expected outputs. Approval is explicit for remote or
billable execution. The same run surface streams logs, scheduler state,
artifacts, checkpoints, retries, and provenance.

Local, SSH, Slurm, and PBS remain the first end-to-end targets. Paid providers
use the same contract but cannot claim validation without credentials and an
actual run.

## Database and Tool Strategy

OpenScience keeps its playbook library but adds typed, observable functions for
high-value sources. The next connector set prioritizes:

- ENCODE and SCREEN/cCRE
- JASPAR and RegulomeDB
- cBioPortal and Monarch
- GWAS Catalog and QuickGO
- PRIDE and EMDB
- OpenFDA, DailyMed, and ClinicalTrials.gov
- UniChem and ReMap
- BLAST-compatible search

Each connector has a typed request/response contract, rate-limit and attribution
metadata, fixture-free contract tests where the public service permits them,
cached/offline behavior, and a dedicated result renderer when generic tables
lose scientific meaning.

Biomni-inspired domain depth follows in imaging, CRISPR and cloning,
microbiology, flow cytometry, pharmacovigilance, physiological signals, and lab
automation. These become real tools or workflows, not additional prompt cards.

## Delivery Batches

### Batch 1 — Trusted Artifact Workbench

- Fix the critical local API, unsafe renderer, file containment, and credential
  forwarding boundaries touched by the workspace.
- Introduce the adaptive three-region shell and contextual inspector.
- Build the artifact studio and versioned annotation model.
- Upgrade molecular structure viewing with selection, measurements, visual
  presets, details, snapshots, and export.
- Replace generic artifact thumbnails with truthful generated previews or
  explicit format placeholders.
- Add accessibility, loading, empty, error, and narrow-layout coverage.

### Batch 2 — Review and Manuscript Workbench

- Implement deterministic review reports and finalization gate.
- Add citation/numeric/figure/provenance checks and override audit trail.
- Build Markdown/LaTeX manuscript editing, live preview, citation browser,
  figure insertion, and publication export.
- Surface review state consistently on artifacts, notebooks, and manuscripts.

### Batch 3 — Complete Compute Lifecycle

- Add scheduler polling, arrays, dependency validation, retries, checkpoint
  restore, remote artifact collection, and disconnect recovery.
- Add environment profiles, validation, lock capture, containers, and reusable
  compute plans.
- Add explicit remote/billable approval, cost display where available, and
  provider revocation.

### Batch 4 — Biomedical Data and Tool Depth

- Add the prioritized public database connectors and federated scientific
  search.
- Add optional versioned data packs with license filtering.
- Add typed biomedical tools in the highest-value Biomni domains.
- Add model adapters only where their execution and provenance can be validated.

### Batch 5 — Imaging, Trees, Models, and Large Data

- Add FCS, DICOM/NIfTI, OME-TIFF, WSI, MRC, Newick, SBML, and trajectory
  viewers.
- Add companion-file and byte-range contracts for indexed/large formats.
- Add Arrow/Parquet transforms, joins, pivots, statistical plots, and notebook
  handoff.

### Batch 6 — Launch Benchmark and Refinement

- Create representative end-to-end scientific tasks spanning the implemented
  domains.
- Score completion, interaction cost, recovery, provenance completeness,
  review quality, accessibility, and performance.
- Fix benchmark failures and remaining cross-workflow inconsistencies.

## Verification Strategy

Every batch must provide evidence at four levels:

1. **Unit and contract tests** for pure models, parsers, policies, and routes.
2. **Real integration tests** for local kernels, files, subprocesses, and public
   APIs; avoid mocks when the real implementation is available.
3. **Browser tests and visual inspection** for complete user workflows,
   including narrow layouts, failure states, and keyboard navigation.
4. **Packaged validation** through the npm `test` tag in an isolated prefix,
   using a temporary configuration and local deterministic model provider.

Before every push:

- run the relevant focused tests and typechecks
- run `git diff --check`
- confirm only `openscience/aayam-new` is checked out
- confirm author and committer are `Aayam Bansal <aayambansal@gmail.com>`
- preserve the user-owned untracked `AUDIT.md`

Npm test releases are batched after tens of coherent feature commits or a major
vertical slice. The production npm workflow and both repositories' `main`
branches are never targets.

## Success Criteria

The parity program is complete only when:

- every P0 and P1 row has direct code, test, and browser evidence
- P2 rows either have that evidence or an explicit product decision removing
  them from the launch contract
- supported integrations have real successful validation, and inaccessible
  partner integrations are labeled accordingly
- representative scientific tasks complete without manual provenance assembly
- review gates catch seeded citation, numeric, figure, and provenance faults
- local and remote failures recover without losing the session or result
- packaged npm `test` installation passes the same core workflows
- the final requirement-by-requirement audit contains no unsupported completion
  claims

## Constraints

- Work only on `openscience/aayam-new`.
- Change Atlas only when OpenScience cannot satisfy a required contract locally;
  use a non-main Atlas branch and validate it independently.
- Never push OpenScience or Atlas `main`.
- Never invoke a production npm workflow.
- Preserve `Aayam Bansal <aayambansal@gmail.com>` as author and committer with no
  generated co-author trailers.
- Never persist provider, npm, GitHub, Atlas, or other credentials in source,
  fixtures, logs, commits, or documentation.
- Preserve the user-owned untracked `AUDIT.md`.
