import { CapabilityRuntime } from "./schema"

export const CORE_SCIENCE_PACKAGES = [
  "biopython==1.88",
  "contourpy==1.3.3",
  "cycler==0.12.1",
  "fonttools==4.63.0",
  "joblib==1.5.3",
  "kiwisolver==1.5.1",
  "matplotlib==3.11.1",
  "narwhals==2.25.0",
  "numpy==2.5.2",
  "packaging==26.3",
  "pillow==12.3.0",
  "pyparsing==3.3.2",
  "python-dateutil==2.9.0.post0",
  "rdkit==2026.3.5",
  "scikit-learn==1.9.0",
  "scipy==1.18.1",
  "six==1.17.0",
  "threadpoolctl==3.6.0",
] as const

export const CORE_SCIENCE_RUNTIME = CapabilityRuntime.parse({
  kind: "python_pack",
  pack_id: "core-science-py312-v1",
  python: "3.12.11",
  targets: ["local", "modal"],
  image: "python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7",
  lock_digest: "b3f565bfdffd007d2e5c899ae84e9a96f0a2a446eba03d16f438a009664fbf43",
  packages: CORE_SCIENCE_PACKAGES,
  resources: { cpus: 1, memory_gb: 2, time_minutes: 10, gpu: "none" },
  network: "package_index_build_only",
})

export const CORE_SCIENCE_ENVIRONMENT = CORE_SCIENCE_RUNTIME.pack_id
