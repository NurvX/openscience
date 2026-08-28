import z from "zod"

export const BioNemoCapabilityID = z.enum(["boltz2", "diffdock", "proteinmpnn", "rfdiffusion"])
export type BioNemoCapabilityID = z.infer<typeof BioNemoCapabilityID>

const text = (label: string, max = 2_000_000) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too large`)
const chain = z.string().regex(/^[A-Za-z0-9]{1,4}$/)

export const Boltz2Input = z
  .object({
    polymers: z
      .array(
        z
          .object({
            id: chain.optional(),
            molecule_type: z.enum(["protein", "dna", "rna"]),
            sequence: z
              .string()
              .regex(/^[A-Za-z]+$/)
              .min(1)
              .max(4096),
            cyclic: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    recycling_steps: z.number().int().min(1).max(20).optional(),
    sampling_steps: z.number().int().min(1).max(200).optional(),
    diffusion_samples: z.number().int().min(1).max(10).optional(),
    step_scale: z.number().positive().max(10).optional(),
    without_potentials: z.boolean().optional(),
    output_format: z.enum(["mmcif", "pdb"]).optional(),
    concatenate_msas: z.boolean().optional(),
    sampling_steps_affinity: z.number().int().min(1).max(200).optional(),
    diffusion_samples_affinity: z.number().int().min(1).max(10).optional(),
    affinity_mw_correction: z.boolean().optional(),
  })
  .strict()

export const DiffDockInput = z
  .object({
    protein: text("protein structure"),
    ligand: text("ligand"),
    ligand_file_type: z.enum(["smiles", "sdf", "mol2"]).optional(),
    num_poses: z.number().int().min(1).max(100).optional(),
    time_divisions: z.number().int().min(1).max(20).optional(),
    steps: z.number().int().min(1).max(18).optional(),
    save_trajectory: z.boolean().optional(),
    skip_gen_conformer: z.boolean().optional(),
    is_staged: z.literal(false).optional(),
  })
  .strict()

export const ProteinMPNNInput = z
  .object({
    input_pdb: text("input PDB"),
    input_pdb_chains: z.array(chain).min(1).max(64).nullable().optional(),
    ca_only: z.boolean().optional(),
    use_soluble_model: z.boolean().optional(),
    random_seed: z.number().int().min(0).max(2_147_483_647).optional(),
    num_seq_per_target: z.number().int().min(1).max(100).optional(),
    sampling_temp: z.array(z.number().min(0).max(1)).min(1).max(20).nullable().optional(),
    omit_AAs: z
      .array(z.string().regex(/^[ACDEFGHIKLMNPQRSTVWY]$/))
      .max(20)
      .nullable()
      .optional(),
  })
  .strict()

export const RFDiffusionInput = z
  .object({
    input_pdb: text("input PDB").optional(),
    contigs: z.string().trim().min(1).max(4_000),
    hotspot_res: z
      .array(z.string().regex(/^[A-Za-z0-9]{1,4}\d+$/))
      .max(100)
      .nullable()
      .optional(),
    diffusion_steps: z.number().int().min(1).max(50).optional(),
    random_seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .strict()

export const BioNemoInputs = {
  boltz2: Boltz2Input,
  diffdock: DiffDockInput,
  proteinmpnn: ProteinMPNNInput,
  rfdiffusion: RFDiffusionInput,
} as const

export function parseBioNemoInput(id: BioNemoCapabilityID, value: unknown) {
  return BioNemoInputs[id].parse(value) as Record<string, unknown>
}
