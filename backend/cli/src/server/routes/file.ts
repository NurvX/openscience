import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { File } from "../../file"
import { Ripgrep } from "../../file/ripgrep"
import { LSP } from "../../lsp"
import { Instance } from "../../project/instance"
import { lazy } from "../../util/lazy"
import { ScienceFile } from "../../file/science"
import { ArtifactFile } from "../../file/artifacts"
import { StarterFile } from "../../file/starters"
import { PublicationFile } from "../../file/publication"
import { ArtifactAnnotation } from "../../file/annotations"
import { PublicationReview } from "../../file/review"

export const FileRoutes = lazy(() =>
  new Hono()
    .get(
      "/find",
      describeRoute({
        summary: "Find text",
        description: "Search for text patterns across files in the project using ripgrep.",
        operationId: "find.text",
        responses: {
          200: {
            description: "Matches",
            content: {
              "application/json": {
                schema: resolver(Ripgrep.Match.shape.data.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          pattern: z.string(),
        }),
      ),
      async (c) => {
        const pattern = c.req.valid("query").pattern
        const result = await Ripgrep.search({
          cwd: Instance.directory,
          pattern,
          limit: 10,
        })
        return c.json(result)
      },
    )
    .get(
      "/find/file",
      describeRoute({
        summary: "Find files",
        description: "Search for files or directories by name or pattern in the project directory.",
        operationId: "find.files",
        responses: {
          200: {
            description: "File paths",
            content: {
              "application/json": {
                schema: resolver(z.string().array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
          dirs: z.enum(["true", "false"]).optional(),
          type: z.enum(["file", "directory"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query").query
        const dirs = c.req.valid("query").dirs
        const type = c.req.valid("query").type
        const limit = c.req.valid("query").limit
        const results = await File.search({
          query,
          limit: limit ?? 10,
          dirs: dirs !== "false",
          type,
        })
        return c.json(results)
      },
    )
    .get(
      "/find/symbol",
      describeRoute({
        summary: "Find symbols",
        description: "Search for workspace symbols like functions, classes, and variables using LSP.",
        operationId: "find.symbols",
        responses: {
          200: {
            description: "Symbols",
            content: {
              "application/json": {
                schema: resolver(LSP.Symbol.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
        }),
      ),
      async (c) => {
        /*
      const query = c.req.valid("query").query
      const result = await LSP.workspaceSymbol(query)
      return c.json(result)
      */
        return c.json([])
      },
    )
    .get(
      "/file",
      describeRoute({
        summary: "List files",
        description: "List files and directories in a specified path.",
        operationId: "file.list",
        responses: {
          200: {
            description: "Files and directories",
            content: {
              "application/json": {
                schema: resolver(File.Node.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.list(path)
        return c.json(content)
      },
    )
    .get(
      "/file/content",
      describeRoute({
        summary: "Read file",
        description: "Read the content of a specified file.",
        operationId: "file.read",
        responses: {
          200: {
            description: "File content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.read(path)
        return c.json(content)
      },
    )
    .put(
      "/file/content",
      describeRoute({
        summary: "Write file",
        description: "Write the content of a specified file.",
        operationId: "file.write",
        responses: {
          200: {
            description: "File content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string(),
          content: z.string(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const content = await File.write(body.path, body.content)
        return c.json(content)
      },
    )
    .get(
      "/file/inspect",
      describeRoute({
        summary: "Inspect a scientific binary file",
        description: "Inspect BAM, CRAM, H5AD, or LOOM metadata with locally available scientific tools.",
        operationId: "file.inspect",
        responses: {
          200: {
            description: "Scientific file inspection",
            content: {
              "application/json": {
                schema: resolver(ScienceFile.Inspection),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const result = await File.inspect(c.req.valid("query").path)
        return c.json(result)
      },
    )
    .get(
      "/file/raw",
      describeRoute({
        summary: "Download a file",
        description: "Stream a project file without loading it into the JSON API as base64.",
        operationId: "file.raw",
        responses: {
          200: {
            description: "Raw file contents",
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.raw(path)
        return new Response(content, {
          headers: {
            "Content-Type": content.type || "application/octet-stream",
            "Content-Length": String(content.size),
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() || "download")}`,
          },
        })
      },
    )
    .get(
      "/file/artifacts",
      describeRoute({
        summary: "List local research artifacts",
        description: "Discover notebooks, datasets, figures, reports, models, and scientific files in the project.",
        operationId: "file.artifacts",
        responses: {
          200: {
            description: "Research artifacts",
            content: {
              "application/json": {
                schema: resolver(ArtifactFile.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => c.json(await File.artifacts()),
    )
    .get(
      "/file/provenance",
      describeRoute({
        summary: "Get local file provenance",
        description: "Read Git branch, dirty state, and latest commit metadata for a project file.",
        operationId: "file.provenance",
        responses: {
          200: {
            description: "Local provenance",
            content: {
              "application/json": {
                schema: resolver(ArtifactFile.Provenance),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => c.json(await File.provenance(c.req.valid("query").path)),
    )
    .get(
      "/file/reproducibility",
      describeRoute({
        summary: "Audit project reproducibility",
        description:
          "Check Git state, locked dependencies, environment specifications, notebook structure, and research artifacts.",
        operationId: "file.reproducibility",
        responses: {
          200: {
            description: "Project reproducibility audit",
            content: { "application/json": { schema: resolver(ArtifactFile.Audit) } },
          },
        },
      }),
      async (c) => c.json(await File.reproducibility()),
    )
    .get(
      "/file/annotations",
      describeRoute({
        summary: "List artifact annotations",
        description: "List durable review threads anchored to a project artifact.",
        operationId: "file.annotations.list",
        responses: {
          200: {
            description: "Artifact annotations",
            content: { "application/json": { schema: resolver(ArtifactAnnotation.Info.array()) } },
          },
        },
      }),
      validator("query", z.object({ path: z.string() })),
      async (c) => c.json(await ArtifactAnnotation.list(c.req.valid("query").path)),
    )
    .post(
      "/file/annotations",
      describeRoute({
        summary: "Create an artifact annotation",
        description:
          "Create a durable review thread anchored to an artifact, text range, notebook cell, molecule, or locus.",
        operationId: "file.annotations.create",
        responses: {
          200: {
            description: "Created annotation",
            content: { "application/json": { schema: resolver(ArtifactAnnotation.Info) } },
          },
        },
      }),
      validator("json", ArtifactAnnotation.Create),
      async (c) => c.json(await ArtifactAnnotation.create(c.req.valid("json"))),
    )
    .get(
      "/file/annotations/:id/history",
      describeRoute({
        summary: "Read artifact annotation history",
        description: "Read every immutable revision of an artifact review thread, including a recoverable tombstone.",
        operationId: "file.annotations.history",
        responses: {
          200: {
            description: "Versioned artifact annotation",
            content: { "application/json": { schema: resolver(ArtifactAnnotation.Info) } },
          },
        },
      }),
      validator("param", z.object({ id: z.string().startsWith("ann_") })),
      async (c) => c.json(await ArtifactAnnotation.history(c.req.valid("param").id)),
    )
    .patch(
      "/file/annotations/:id",
      describeRoute({
        summary: "Update an artifact annotation",
        description: "Reply to, resolve, or reopen an artifact review thread.",
        operationId: "file.annotations.update",
        responses: {
          200: {
            description: "Updated annotation",
            content: { "application/json": { schema: resolver(ArtifactAnnotation.Info) } },
          },
        },
      }),
      validator("param", z.object({ id: z.string().startsWith("ann_") })),
      validator("json", ArtifactAnnotation.Update),
      async (c) => c.json(await ArtifactAnnotation.update(c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete(
      "/file/annotations/:id",
      describeRoute({
        summary: "Tombstone an artifact annotation",
        description: "Hide an artifact review thread while retaining its recoverable revision history.",
        operationId: "file.annotations.delete",
        responses: {
          200: {
            description: "Tombstoned annotation",
            content: {
              "application/json": {
                schema: resolver(z.object({ deleted: z.literal(true), version: z.number().int().positive() })),
              },
            },
          },
        },
      }),
      validator("param", z.object({ id: z.string().startsWith("ann_") })),
      async (c) => c.json(await ArtifactAnnotation.remove(c.req.valid("param").id)),
    )
    .get(
      "/file/manifest",
      describeRoute({
        summary: "Create an artifact integrity manifest",
        description: "Hash every discovered research artifact and return a portable, deterministic manifest.",
        operationId: "file.manifest",
        responses: {
          200: {
            description: "Artifact checksum manifest",
            content: { "application/json": { schema: resolver(ArtifactFile.Manifest) } },
          },
        },
      }),
      async (c) => {
        c.header("Content-Disposition", 'attachment; filename="openscience-artifact-manifest.json"')
        return c.json(await File.manifest())
      },
    )
    .post(
      "/file/starters",
      describeRoute({
        summary: "Create a local scientific starter project",
        description: "Materialize a valid notebook, sample data, and README without external downloads.",
        operationId: "file.starter",
        responses: {
          200: {
            description: "Created starter files",
            content: { "application/json": { schema: resolver(StarterFile.Result) } },
          },
        },
      }),
      validator("json", z.object({ template: StarterFile.Template })),
      async (c) => c.json(await File.starter(c.req.valid("json").template)),
    )
    .get(
      "/file/publication/capabilities",
      describeRoute({
        summary: "Inspect local publication export support",
        description: "Detect Pandoc and a PDF engine before offering report export formats.",
        operationId: "file.publicationCapabilities",
        responses: {
          200: {
            description: "Available local publication formats",
            content: { "application/json": { schema: resolver(PublicationFile.Capabilities) } },
          },
        },
      }),
      async (c) => c.json(await File.publicationCapabilities()),
    )
    .post(
      "/file/publication",
      describeRoute({
        summary: "Export a Markdown research report",
        description: "Create a timestamped HTML, PDF, DOCX, LaTeX, or PowerPoint publication artifact locally.",
        operationId: "file.publication",
        responses: {
          200: {
            description: "Created publication artifact",
            content: { "application/json": { schema: resolver(PublicationFile.Result) } },
          },
        },
      }),
      validator("json", PublicationFile.Input),
      async (c) => c.json(await File.publication(c.req.valid("json"))),
    )
    .get(
      "/file/reviews",
      describeRoute({
        summary: "Read the current publication review",
        description:
          "Return the latest deterministic review report and whether it is stale for the current source bytes.",
        operationId: "file.reviews.current",
        responses: {
          200: {
            description: "Current publication review",
            content: { "application/json": { schema: resolver(PublicationReview.State) } },
          },
          404: { description: "No publication review exists for this manuscript" },
        },
      }),
      validator("query", z.object({ path: z.string().trim().min(1).max(10_000) })),
      async (c) => {
        const report = await File.reviewCurrent(c.req.valid("query").path)
        if (!report) return c.json({ error: "No publication review exists for this manuscript" }, 404)
        return c.json(report)
      },
    )
    .get(
      "/file/reviews/history",
      describeRoute({
        summary: "List publication review history",
        description: "List prior deterministic review reports for every reviewed version of a manuscript.",
        operationId: "file.reviews.history",
        responses: {
          200: {
            description: "Publication review history",
            content: { "application/json": { schema: resolver(PublicationReview.Report.array()) } },
          },
        },
      }),
      validator("query", z.object({ path: z.string().trim().min(1).max(10_000) })),
      async (c) => c.json(await File.reviewHistory(c.req.valid("query").path)),
    )
    .post(
      "/file/reviews",
      describeRoute({
        summary: "Run deterministic publication checks",
        description:
          "Check citations, numeric traces, figures, and provenance for the exact Markdown manuscript bytes.",
        operationId: "file.reviews.run",
        responses: {
          200: {
            description: "Generated publication review",
            content: { "application/json": { schema: resolver(PublicationReview.Report) } },
          },
        },
      }),
      validator("json", PublicationReview.RunInput),
      async (c) => c.json(await File.review(c.req.valid("json"))),
    )
    .patch(
      "/file/reviews/:id/findings/:finding",
      describeRoute({
        summary: "Resolve or override a publication finding",
        description: "Record an attributed reason and close one deterministic review finding.",
        operationId: "file.reviews.resolve",
        responses: {
          200: {
            description: "Updated publication review",
            content: { "application/json": { schema: resolver(PublicationReview.Report) } },
          },
          409: { description: "Finding cannot be updated" },
        },
      }),
      validator(
        "param",
        z.object({
          id: z.string().startsWith("review_"),
          finding: z.string().startsWith("finding_"),
        }),
      ),
      validator("json", PublicationReview.ResolveInput),
      async (c) => {
        const params = c.req.valid("param")
        const result = await File.reviewResolve(params.id, params.finding, c.req.valid("json")).then(
          (value) => ({ value }),
          (error) => ({ error: error instanceof Error ? error.message : String(error) }),
        )
        if ("error" in result) return c.json({ error: result.error }, 409)
        return c.json(result.value)
      },
    )
    .post(
      "/file/reviews/:id/finalize",
      describeRoute({
        summary: "Finalize a publication review",
        description:
          "Bind publication-ready state to the exact reviewed source hash after all blocking findings close.",
        operationId: "file.reviews.finalize",
        responses: {
          200: {
            description: "Finalized publication review",
            content: { "application/json": { schema: resolver(PublicationReview.Report) } },
          },
          409: { description: "Review is blocked, stale, or already invalid" },
        },
      }),
      validator("param", z.object({ id: z.string().startsWith("review_") })),
      validator("json", PublicationReview.FinalizeInput),
      async (c) => {
        const result = await File.reviewFinalize(c.req.valid("param").id, c.req.valid("json")).then(
          (value) => ({ value }),
          (error) => ({ error: error instanceof Error ? error.message : String(error) }),
        )
        if ("error" in result) return c.json({ error: result.error }, 409)
        return c.json(result.value)
      },
    )
    .get(
      "/file/status",
      describeRoute({
        summary: "Get file status",
        description: "Get the git status of all files in the project.",
        operationId: "file.status",
        responses: {
          200: {
            description: "File status",
            content: {
              "application/json": {
                schema: resolver(File.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const content = await File.status()
        return c.json(content)
      },
    ),
)
