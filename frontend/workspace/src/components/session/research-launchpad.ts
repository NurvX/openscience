export type ResearchWorkflow = {
  id: string
  group: "analyze" | "compute" | "discover" | "communicate"
  title: string
  description: string
  prompt: string
  shortcut: string
  icon: "table" | "notebook" | "atom" | "sequence" | "search" | "reproduce" | "compare" | "report"
}

export const researchWorkflows: ResearchWorkflow[] = [
  {
    id: "analyze-data",
    group: "analyze",
    title: "Analyze a dataset",
    description: "Profile columns, find quality issues, visualize patterns, and produce a defensible result.",
    prompt:
      "Analyze the relevant dataset in this project. Inspect its schema and quality first, then compute useful summaries and visualizations. Explain every assumption and save any reusable analysis as a notebook.",
    shortcut: "CSV · TSV · JSONL · HDF5",
    icon: "table",
  },
  {
    id: "run-notebook",
    group: "compute",
    title: "Run a notebook",
    description: "Open an existing notebook or build one with live Python or R outputs.",
    prompt:
      "Find the most relevant notebook in this project, inspect it before running anything, then execute or repair it cell by cell. Preserve outputs and summarize the result and environment.",
    shortcut: "Jupyter · Python · R",
    icon: "notebook",
  },
  {
    id: "inspect-structure",
    group: "analyze",
    title: "Inspect a structure",
    description: "Render proteins or molecules, check chemistry, and investigate structural features.",
    prompt:
      "Inspect the relevant molecular or protein structure in this project. Render it, identify important chains, ligands, residues, or conformers, and explain any structural quality issues before drawing conclusions.",
    shortcut: "PDB · CIF · SDF · MOL",
    icon: "atom",
  },
  {
    id: "sequence-qc",
    group: "analyze",
    title: "Quality-check sequences",
    description: "Review reads, variants, intervals, alignments, and per-cycle quality.",
    prompt:
      "Quality-check the relevant sequencing or genomics files in this project. Report read and base counts, quality and GC patterns, sample or contig coverage, and any concrete anomalies worth investigating.",
    shortcut: "FASTQ · VCF · BAM · GFF",
    icon: "sequence",
  },
  {
    id: "survey-literature",
    group: "discover",
    title: "Survey the literature",
    description: "Turn a research question into a sourced map of claims, methods, and open gaps.",
    prompt:
      "Build a focused literature survey for my research question. Separate established evidence from inference, compare methods and datasets, capture citations, and finish with the highest-value unanswered questions.",
    shortcut: "papers · citations · claims",
    icon: "search",
  },
  {
    id: "reproduce-result",
    group: "discover",
    title: "Reproduce a result",
    description: "Trace a claim to code and data, define a criterion, run checks, and record evidence.",
    prompt:
      "Reproduce the target result in this project. Identify the exact claim, code, data, configuration, and success criterion before running it. Record failures as evidence and finish with a supported, weakened, rejected, or not-tested verdict.",
    shortcut: "claim · code · evidence",
    icon: "reproduce",
  },
  {
    id: "compare-runs",
    group: "compute",
    title: "Compare experiments",
    description: "Normalize metrics, surface confounders, and choose a winner without hiding failures.",
    prompt:
      "Compare the experiment runs in this project. Normalize their configurations and metrics, flag confounders and failed runs, visualize the decision-relevant differences, and recommend the next experiment.",
    shortcut: "metrics · configs · failures",
    icon: "compare",
  },
  {
    id: "write-report",
    group: "communicate",
    title: "Write a research report",
    description: "Synthesize project evidence into a clear report with figures, caveats, and citations.",
    prompt:
      "Draft a research report from the evidence in this project. Use a concise abstract, methods, results, limitations, and next steps. Cite source files and claims precisely, and reuse existing figures where they support the text.",
    shortcut: "Markdown · LaTeX · PDF",
    icon: "report",
  },
]

const groups: Array<{ id: ResearchWorkflow["group"]; title: string }> = [
  { id: "analyze", title: "Analyze" },
  { id: "compute", title: "Compute" },
  { id: "discover", title: "Discover" },
  { id: "communicate", title: "Communicate" },
]

export function workflowGroups() {
  return groups.map((group) => ({
    ...group,
    workflows: researchWorkflows.filter((workflow) => workflow.group === group.id),
  }))
}

export function workflowPrompt(workflow: ResearchWorkflow, artifacts: number) {
  if (artifacts <= 0) return workflow.prompt
  return `Your workspace contains ${artifacts.toLocaleString("en-US")} research artifacts. ${workflow.prompt}`
}
