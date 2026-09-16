# GPU-Accelerated MSM (Phase 2)

Date: 2026-09-06 · Environment: Windows 11, Python 3.13.7, ezkl 23.0.5 (PyPI wheel)

## Status: NOT AVAILABLE (hardware and build both lack GPU support)

### Hardware audit

| Probe | Result |
| --- | --- |
| Graphics adapters | Intel Iris Xe Graphics (integrated, no CUDA/ROCm device) |
| `nvidia-smi` | not found |
| `nvcc --version` | not found |
| `CUDA_PATH` env var | not set |
| Dedicated GPU compute | none (no NVIDIA/AMD discrete GPU present) |

CPU: 13th Gen Intel Core i5-1334U (10 cores / 12 threads), 15.7 GB RAM.

There is **no CUDA-capable device and no CUDA toolkit** on this machine, so any
GPU-accelerated MSM (the EZKL 23.0.5 `gpu` build feature, halo2curve backend
CUDA acceleration, or Halo2GPU-style external accelerators) cannot run here.

### EZKL build audit

The installed `ezkl 23.0.5` PyPI wheel exposes **no GPU/acceleration API**:

```
gpu-related api: NONE      (searched dir(ezkl) for gpu/acceler/cuda)
```

EZKL 23.0.5 offers GPU-accelerated MSM only when built with its `gpu` feature
(enabled at compile time; typically Linux + CUDA wheels/source builds). The
Windows wheel is CPU-only.

## What runs instead (CPU fallback, verified)

All proving/verification in this project runs on the CPU using EZKL 23.0.5's
Plonkish/KZG MSM implementation. Measured baseline (Phase 0, default circuit,
`[25000, 700, 3]`):

| Metric | Value |
| --- | --- |
| proof generation | 0.894 s (service-local), HTTP end-to-end 1.92 s |
| verification | 0.03 s |
| proof size | 26951 bytes |

These CPU timings are the honest substitute: correctness is unaffected (a proof
verifies identically regardless of prover backend), only throughput/hardware.
Being CPU-only means MSM on the field elements is computed scalar-by-scalar on
the CPU; there is no claim of GPU-equivalent speed.

## Conclusion for the report

GPU-accelerated MSM: **NOT AVAILABLE** — reasons (a) no discrete GPU / CUDA
device, (b) no CUDA toolkit, (c) ezkl 23.0.5 Windows wheel has no GPU feature.
CPU MSM is in continuous use and verified. No code changes were required or
appropriate; nothing in the pipeline claims GPU acceleration.