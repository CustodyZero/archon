# Archon Completion Engine Specification

**Document ID:** ACE-001  
**Version:** 1.0  
**Status:** Draft — Implementation-Targeted  
**Applies To:** `@archon/completion-engine`  
**Owner:** Archon Core Team  

---

## 1. Purpose

The Archon Completion Engine provides deterministic, offline-trained completion suggestions for Archon command entry surfaces (CLI and Desktop). It improves operator throughput while preserving governance guarantees.

This engine is:

- Assistive only (suggests strings)
- Side-effect free
- Deterministic
- Offline-trained
- Inspectable (weights versioned, validated, and test-gated)

This engine is not:

- An LLM
- A runtime learning system
- A generative model
- A capability-bearing module

---

## 2. Architectural Position

The completion engine exists strictly at the input ergonomics layer.

It does not participate in execution, authorization, or governance.

**Integration flow:**

1. Prefix trie completion (fast path)
2. Completion engine fallback (neural retrieval over closed vocabulary)
3. Context augmentation layer (dynamic entities resolved outside the model)
4. Merge, dedupe, rank
5. Render suggestions only

**Governance boundary:**
Completion output is advisory and must not mutate state, execute commands, approve proposals, or bypass proposal workflows.

---

## 3. Core Constraints

| Category | Requirement |
|---|---|
| Runtime dependencies | No ML frameworks; no ONNX; no transformer runtimes |
| Implementation | Pure TypeScript orchestration; deterministic math core allowed (TS or sealed WASM) |
| Inference behavior | Deterministic; stable ordering required |
| Training | Offline only; no runtime learning; no telemetry |
| Candidate set | Closed and versioned; dynamic entities handled outside model |
| Side effects | Prohibited (no filesystem, no network, no secrets access) |
| Performance target | Single completion call must be suitable for interactive UI (target < 2ms on typical dev machine; enforce via non-flaky perf gate where possible) |

---

## 4. Data Model

### 4.1 Vocabulary

- Character-level vocabulary
- Fixed size (e.g., 72)
- Includes: lowercase letters, digits, whitespace, punctuation used by Archon commands, and special tokens.

Special tokens (required):
- `PAD`
- `UNK`
- `BOS` (optional)
- `EOS` (optional)

Vocabulary changes are breaking for the model and require:
- incrementing `ACE_MODEL_VERSION`
- retraining
- committing new weights

### 4.2 Input Encoding

- Maximum sequence length: 64
- Input string normalized:
  - lowercase
  - whitespace collapsed
  - non-representable characters mapped to `UNK`

Tokenization:
- character tokens
- right-pad with `PAD` up to max length

---

## 5. Model Architecture

### 5.1 Overview

The completion engine is a minimal self-attention encoder designed for closed-vocabulary retrieval.

Required architecture (locked):

- **2 attention heads**
- **1 attention layer**
- **no FFN**
- **mean pooling**
- **versioned weights**

The model outputs a fixed-size query embedding vector. Suggestions are ranked by cosine similarity against precomputed candidate embeddings.

### 5.2 Shapes (Reference)

Recommended baseline dimensions (may be tuned, but must be encoded in weight header):

- `d_model`: 32
- `n_heads`: 2
- `head_dim`: `d_model / n_heads` (e.g., 16)
- `max_len`: 64
- `out_dim`: 128

### 5.3 Components

#### Embedding
- Character embedding matrix: `[vocab_size, d_model]`
- Positional embedding matrix (optional but recommended): `[max_len, d_model]`

If positional embeddings are used, they must be fixed and included in the weight file.

#### Self-Attention (Single Layer, 2 Heads)
For input sequence `X: [max_len, d_model]`:

- Linear projections:
  - `Q = X * Wq + bq`
  - `K = X * Wk + bk`
  - `V = X * Wv + bv`

Where `Wq/Wk/Wv: [d_model, d_model]`

Split into 2 heads:
- `Qh, Kh, Vh: [max_len, head_dim]` per head

Scaled dot-product attention per head:
- `A = softmax((Qh * Kh^T) / sqrt(head_dim))` → `[max_len, max_len]`
- `Oh = A * Vh` → `[max_len, head_dim]`

Concatenate heads:
- `O = concat(O1, O2)` → `[max_len, d_model]`

Output projection:
- `Y = O * Wo + bo` where `Wo: [d_model, d_model]`

#### No FFN
There is no feed-forward network block in v1.0.

#### Pooling (Mean Pool)
Mean pooling over non-PAD tokens:

- `p = mean(Y[t])` over valid token positions only

PAD masking is mandatory to avoid dilution for short inputs.

#### Final Projection
- `q = normalize((p * Wproj + bproj))`
- `Wproj: [d_model, out_dim]`
- Output `q: [out_dim]`

Normalization must be deterministic and stable:
- `q = q / (||q|| + epsilon)`
- `epsilon` fixed constant (e.g., `1e-8`)

---

## 6. Candidate Registry

### 6.1 Candidate Set

Candidates are a closed, versioned list of canonical completion strings.

Examples include:
- command verbs (`/enable`, `/proposals`, `/restrict`)
- command subpaths (`/proposals approve`, `/project select`)
- canonical capability identifiers (if included)
- common flags and fixed tokens

### 6.2 Dynamic Entities

Dynamic entities are explicitly out of scope for the model:
- proposal IDs
- module IDs discovered at runtime
- file paths
- hostnames

These must be handled by a separate context augmentation layer after model ranking.

### 6.3 Candidate Embeddings

Candidate embeddings must be computed using the **same encoder** as query embeddings and stored deterministically.

Two acceptable strategies:
1) Precompute and commit candidate embeddings as part of the weight artifact bundle.
2) Compute candidate embeddings at engine load time deterministically (requires candidates list and weights only).

Candidate ordering and canonicalization rules must be stable and versioned.

---

## 7. Scoring and Ranking

Similarity metric:
- cosine similarity: `score = dot(q, c)` where `q` and `c` are L2-normalized

Ranking rules:
- sort descending by `score`
- stable tie-breaker required:
  1) higher score
  2) lexicographic candidate string
  3) candidate index

Output:
- top-K ranked candidates with scores

No stochasticity permitted.

---

## 8. Weight File and Versioning

### 8.1 Model Version Constant

The engine must define:

- `ACE_MODEL_VERSION = 1`

Any breaking change requires:
- increment model version
- retrain
- ship new artifact(s)
- update regression baselines

### 8.2 Weight Header Requirements

The weight artifact must contain a strict header including:

- magic bytes (e.g., `ACE1`)
- model version
- vocab size
- max_len
- d_model
- n_heads
- out_dim
- flags (positional embeddings present, etc.)
- array table: named tensors + shapes + offsets
- checksum/hash of payload

Load-time validation must enforce:
- magic match
- version match
- shape match
- checksum match

A mismatch must fail closed (engine refuses to load).

### 8.3 Deterministic Tensor Order

All tensors must be serialized in a fixed order with explicit names.

No implicit “object key iteration” ordering is permitted.

---

## 9. Determinism Requirements

Determinism is defined as:

- Stable top-K ordering for the same input and same model artifact
- Scores stable within epsilon across supported platforms
- Stable tie-breaking behavior

### 9.1 Numerical Stability Policy

- Softmax must be implemented in a numerically stable manner:
  - subtract max logit per row before exponentiation
- `epsilon` constants must be fixed and documented
- PAD masking must be deterministic and enforced

### 9.2 Test Gates

Required regression tests:
- known inputs map to expected top-1 or top-3
- stable ordering across repeated runs
- stable ordering across OS targets used in CI (where available)

Failure is a P0 defect if:
- ranking changes for a fixed input under the supported environment matrix
- weight validation can be bypassed
- model introduces side effects

---

## 10. Security Model

The completion engine:

- reads input string only
- reads model artifact(s) only (weights and optional candidate embeddings)
- returns suggested strings and scores

It must not:
- access filesystem except to load weights from its own package path
- access network
- access secrets store
- read project logs
- invoke kernel APIs
- spawn processes

Attack surface is limited to:
- input string
- weight file parsing

Weight parsing must be strict and bounds-checked.

---

## 11. Integration Contract

### 11.1 Public API

Minimum required API surface:

```ts
export type CompletionResult = {
  candidate: string;
  score: number;
  source: "trie" | "model";
};

export function loadCompletionEngine(): void;

export function complete(
  input: string,
  opts?: { topK?: number; threshold?: number }
): CompletionResult[];
```

### 11.2 Integration Order

Consumers must follow:

1. Prefix trie
2. If trie results < N, call completion engine
3. Merge results
4. Dedupe (candidate string)
5. Rank (trie results may get deterministic boost; rules must be fixed)
6. Render

The completion engine must not perform contextual augmentation. That remains a higher layer concern.

---

## 12. Implementation Notes

### 12.1 TS vs WASM

A deterministic math core may be implemented in:

- TypeScript with Float32Array operations, or
- A sealed WASM module with strict provenance controls

If WASM is used:

- it must be pure compute (no host calls)
- toolchain must be pinned
- artifact must be reproducible and hashed
- code review must treat it as kernel-adjacent trust surface

### 12.2 No Runtime Training

No training code is required in the runtime package to ship inference.

Offline training may exist as a separate script/tooling package, but must not be invoked at runtime.

---

## 13. Readiness Criteria

The completion engine is considered ready to ship when:

- Weight file header validation is strict and test-covered
- Determinism tests pass across the supported CI matrix
- Integration works for both CLI and Desktop
- The engine is side-effect free by inspection and tests
- Performance is acceptable for interactive completion (no perceptible latency)

---

## 14. Non-Goals

- No open-domain embeddings
- No sentence-transformer dependency
- No tokenization beyond the fixed char vocabulary
- No dynamic candidate learning
- No telemetry-driven personalization
- No auto-execution or approvals
- No “agentic” behavior

---

## 15. Summary

This completion engine is a bounded neural retrieval primitive:

- Minimal self-attention (2 heads, 1 layer)
- No FFN
- Mean pooled
- Versioned and validated weights
- Deterministic ranking over a closed candidate registry
