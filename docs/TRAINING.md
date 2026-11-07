# Training the fusion models

The runtime defaults to rule weights. Learned fusion is an opt-in path:
`USE_LEARNED_FUSION=true` plus artifacts in `MODEL_DIR` (compose mounts `./ai/models` at
`/app/models`). Missing artifacts fall back to rules silently, so check `stats.fusionMode` in an
analysis response after switching.

## What is trained

Two independent binary classifiers, one per fusion path:

| Kind | Features (in order) | Artifact |
| --- | --- | --- |
| `pair` | `lexical, semantic, rare, cross, timing, coverageWarning` | `pair_fusion.joblib` |
| `incident` | `prohibited, correlated, repeat, unclassified, coverage, extensionConnected` | `incident_fusion.joblib` |

The feature order comes from `app/features/fusion.py` and is copied into every manifest and metadata
file. Training and inference share one feature builder (`app/features/pair_rows.py`), so a row and a
request are scored from identical code. `tests/test_training.py` asserts that the score computed
from an exported row equals the score reported by `analyze_pairs`.

The estimator is `CalibratedClassifierCV(StandardScaler + LogisticRegression, method="sigmoid")`.
`fuse_pair`/`fuse_incident` multiply `predict_proba` by 100 and re-apply the coverage caps, so a
learned score can never exceed 35 (incomplete pair comparison), 45 (low incident coverage) or 40
(unclassified-only incident). That invariant has tests.

## The published score is still a priority

A calibrated probability is not presented to users as a probability of misconduct. The score routes
review work, and the bands (`LOW/MEDIUM/HIGH/CRITICAL`) describe how urgently a human should look.
The model card states this; keep it attached to the artifacts.

## Synthetic data

`app/training/cohorts.py` samples parameterized cohorts from the same pools as the fixed
demonstration cohort:

- 8-14 candidates per cohort, four questions.
- 28% of candidates copy 1-4 answers from an earlier candidate, using exact copies, light edits,
  shared rare phrases, paraphrases or cross-question reuse.
- Timing places copied submissions inside the 120 s window most of the time.
- Roughly 5% of candidates have three short answers, which exercises the coverage cap.
- Incident cohorts cover clean, permitted-only, unclassified-only, prohibited with and without a
  correlated change, sparse monitoring and disconnected extension archetypes.

Label rules are deterministic. The generator is reproducible from `--seed`.

**The labels are the simulator.** A model trained here learns the simulator's definition of a
copy, including its thresholds. High metrics demonstrate that the pipeline is wired correctly; they
are not evidence that the detector works on real students. The generator's text pool is also small,
so a model can exploit wording artefacts that will not exist in a real exam.

## Commands

```bash
cd ai
python -m app.training.export --out data --pair-cohorts 150 --incident-cohorts 150 --seed 7
python -m app.training.train  --data data --out models --seed 7
```

Outputs:

```
data/pairs.jsonl              exported pair rows
data/incidents.jsonl          exported incident rows
data/manifest.json            generator version, seed, counts, class balance, SHA-256
models/pair_fusion.joblib
models/incident_fusion.joblib
models/pair_fusion.meta.json  feature order, split sizes, metrics, threshold, library versions
models/incident_fusion.meta.json
models/MODEL_CARD.md
```

Last local run with 150 cohorts and seed 7:

| Metric (held-out cohorts) | Pair | Incident |
| --- | --- | --- |
| Rows / positives | 8,413 / 438 (5.2%) | 1,008 / 372 (36.9%) |
| Average precision | 0.805 | 1.000 |
| ROC AUC | 0.963 | 1.000 |
| Precision @ 10% review budget | 0.508 | 1.000 |
| Chosen threshold | 0.24 | 0.05 |

The incident classifier is trivially separable because the label rule and the features come from the
same hand-written logic. That is the circularity the model card warns about.

## Splits and leakage

Splits are made by cohort (70/15/15), never by row. Pairs from one cohort cannot appear in both
training and test, which prevents the cohort-relative features (lexical excess, rare-term document
frequency) from leaking. The validation split picks the threshold by F1; the test split is only
used for reporting.

## External corpora

`app/training/corpora.py` maps a licensed pair corpus into the same rows:

```bash
python -m app.training.corpora --input external-pairs.jsonl --out data-external
python -m app.training.train --data data-external --out models-external
```

Input is JSONL with `textA`, `textB`, `label`, `cohort`, `source`, `license`. Rows whose licence is
not on the allowlist (`CC0`, `CC-BY`, `CC-BY-SA`, `MIT`, `Apache-2.0`, `research-use`,
`consented-pilot`) are rejected, as are texts under 20 characters. Cohorts need at least four
distinct texts for the cohort-relative features to mean anything.

Timing is unavailable for external corpora; those rows carry `"timingAvailable": false`. Do not
present a model trained on them as if the timing feature were validated. Candidate sources,
licence checks and mapping caveats are listed in the module docstring (Clough & Stevenson,
PAN-PC, SemEval-2013 Task 7, OULAD, consented pilot).

## Kaggle

`kaggle/README.md` documents publishing the rows, the artifacts and the training notebook with the
official CLI. The notebook runs offline: the dataset includes a snapshot of `ai/app`.
