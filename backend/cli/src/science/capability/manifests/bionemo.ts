import { CapabilityManifest } from "../schema"

const TERMS = "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA_API_Trial_Service_Terms.pdf"

function hosted(input: {
  id: "boltz2" | "diffdock" | "proteinmpnn" | "rfdiffusion"
  name: string
  category: "structure" | "docking" | "protein_design"
  summary: string
  version: string
  docs: string
}) {
  return CapabilityManifest.parse({
    schema_version: 2,
    id: input.id,
    version: "2.0.0",
    name: input.name,
    category: input.category,
    summary: input.summary,
    maturity: "experimental",
    availability: { local: "unavailable", hosted: "setup_needed" },
    basis:
      "OpenScience owns a strict request schema, a direct BYOK NVIDIA NIM adapter, bounded response capture, artifact hashing, and an offline credential doctor. No paid release canary has been recorded, so this remains experimental and is never described as release-verified.",
    source: {
      kind: "nvidia_nim",
      name: input.name,
      version: input.version,
      reference: input.docs,
      license: "NVIDIA API Trial Service Terms or the user's separate NVIDIA agreement",
    },
    hosted: {
      kind: "nvidia_nim",
      adapter_id: input.id,
      credential: "nvidia_nim",
      docs_url: input.docs,
      terms_url: TERMS,
    },
    setup: {
      instructions:
        "Add an NVIDIA API key in Credentials, review NVIDIA's applicable service and data terms, then run doctor and plan before start. OpenScience never substitutes a shared managed key.",
      requirements: [
        "A user-owned NVIDIA API key with access to the selected NIM",
        "Permission to submit the intended data under the applicable NVIDIA agreement",
        "Outbound HTTPS access to health.api.nvidia.com",
      ],
    },
  })
}

export const bioNemoManifests = {
  boltz2: hosted({
    id: "boltz2",
    name: "Boltz-2",
    category: "structure",
    summary: "Hosted biomolecular structure and affinity prediction through NVIDIA's Boltz-2 NIM.",
    version: "2.2.1",
    docs: "https://docs.api.nvidia.com/nim/reference/mit-boltz2-infer",
  }),
  diffdock: hosted({
    id: "diffdock",
    name: "DiffDock",
    category: "docking",
    summary: "Hosted protein-ligand pose generation through NVIDIA's DiffDock NIM.",
    version: "2.2",
    docs: "https://docs.api.nvidia.com/nim/reference/mit-diffdock-infer",
  }),
  proteinmpnn: hosted({
    id: "proteinmpnn",
    name: "ProteinMPNN",
    category: "protein_design",
    summary: "Hosted structure-conditioned protein sequence design through NVIDIA's ProteinMPNN NIM.",
    version: "1.1.0",
    docs: "https://docs.api.nvidia.com/nim/reference/ipd-proteinmpnn-infer",
  }),
  rfdiffusion: hosted({
    id: "rfdiffusion",
    name: "RFdiffusion",
    category: "protein_design",
    summary: "Hosted protein backbone generation through NVIDIA's RFdiffusion NIM.",
    version: "2.0.0",
    docs: "https://docs.api.nvidia.com/nim/reference/ipd-rfdiffusion-infer",
  }),
} as const
