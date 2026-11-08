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

The Kaggle run on 2026-11-07 (dataset version 1, same seed) reproduced these numbers exactly. The
artifacts are pickled scikit-learn estimators: a run trained on Kaggle (scikit-learn 1.6.1 at the
time) loads in a runtime with another version only with a warning. `_load_model` logs the mismatch
and names both versions; retrain inside the serving environment, or pin scikit-learn, before
enabling learned fusion in production.

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
official CLI. The notebook runs offline: the dataset ships `code.tar.gz` (a snapshot of `ai/app`)
because the CLI skips nested directories, so the notebook extracts it before training.

## AI-authorship signal (review aid)

The authorship model flags prose that looks **machine-generated**. It is a review aid: it is not
proof that AI was used, it is not misconduct evidence, and it says nothing about copying. Copying
remains the pair-similarity model's job. Because the signal is weak and easy to misinterpret, the
runtime caps it: `AUTHORSHIP_SCORE_CAP = 54`, so the only reachable bands are LOW (< 30) and
MEDIUM (30-54). HIGH and CRITICAL are unreachable by construction, even if a learned model
returns 0.99; tests stub the model to assert this.

### Data

`app/training/authorship_cohorts.py` generates one candidate per request with four answers from a
seeded RNG. Human-like answers vary sentence and paragraph length, use contractions, dashes,
parentheses and semicolons, and arrive through three growing revisions. Machine-like answers keep
sentence length even, avoid contractions, use formal connectives and repeated bigrams, balance
paragraphs, and appear almost fully formed in one revision. Labels describe the simulator. About
5% of answers are deliberately short and are skipped exactly as inference skips them.

External corpora use `app/training/authorship_corpora.py`:

```bash
python -m app.training.authorship_corpora --input authorship-external.jsonl \
    --out data-authorship-external --check-split
```

Input is JSONL with `text`, `label`, `authorId`, `source`, `license`. Rows without a licence,
without an author id, with a licence outside the allowlist (`CC0`, `CC-BY`, `CC-BY-SA`, `MIT`,
`Apache-2.0`, `research-use`, `consented-pilot`) or under 200 characters are rejected. Splits are
grouped by author, never by row, so one author cannot straddle train and test. Candidate sources
and their licence caveats are documented in the module docstring: HC3, DAIGT v2, RAID, M4,
Persuade 2.0 and ELLIPSE. Nothing is downloaded; licence compliance is the operator's
responsibility. Only `consented-pilot` rows can support a production claim.

### Features

`app/authorship/features.py` exports `AUTHORSHIP_FEATURE_ORDER` and builds a deterministic vector
with no network access: sentence-length mean/variance/burstiness, type-token ratio, hapax ratio,
comma/semicolon/dash/parenthesis rates, contraction rate, average word length, repeated-bigram
rate, paragraph-length variance, ten function-word frequencies, and revision dynamics (revision
count, mean words added per revision, final/first word ratio). Empty or short text yields zeros,
never a division by zero. `authorship.meta.json` stores the order; the runtime refuses a model
whose order does not match and falls back to rules, mirroring the fusion loader's version-skew
warning.

### Scoring and gates

The rules baseline combines nine documented signals; the weight table lives in
`app/authorship/classifier.py` and in `models/authorship.MODEL_CARD.md`:

| Signal | Weight |
| --- | --- |
| sentenceRhythm | 0.18 |
| sentenceVariability | 0.10 |
| contractionAvoidance | 0.14 |
| paragraphUniformity | 0.10 |
| functionWordRegularity | 0.14 |
| formulaicRepetition | 0.10 |
| punctuationFlatness | 0.10 |
| revisionFlatness | 0.08 |
| formalWordLength | 0.06 |

The weighted score passes through a logistic link (center 0.68, gain 6.0), and the probability
becomes the 0-100 priority, clamped to 54. With `USE_LEARNED_FUSION=true` and
`models/authorship.joblib` present, the calibrated estimator replaces the rules probability; the
cap, band ceiling and feature-order check still apply. Answers under `minAnswerChars` (default
200) are skipped and at most `maxFindings` (default 200) findings are emitted.

```bash
cd ai
python -m app.training.authorship_export --out data-authorship --cohorts 200 --seed 7
python -m app.training.authorship_train  --data data-authorship --out models --seed 7
python -m app.training.authorship_eval   --data data-authorship/authorship.jsonl \
    --model models/authorship.joblib
```

Outputs:

```
data-authorship/authorship.jsonl        exported stylometry rows
data-authorship/manifest.json           seed, counts, class balance, SHA-256, manifest hash
models/authorship.joblib
models/authorship.meta.json             feature order, splits, metrics, threshold, library versions
models/authorship.MODEL_CARD.md
```

`authorship_eval.py` reports AUROC, TPR at 5% FPR and expected calibration error, and exits
non-zero below AUROC 0.80, TPR 0.55 or above ECE 0.05 so CI can gate on it. Point it at
`--model models/authorship.joblib`; the rules baseline is a ranking heuristic and is not
calibrated, so it can pass AUROC and TPR while failing ECE. The published local run (200
cohorts, seed 7) reaches AUROC 1.0, TPR@5%FPR 1.0 and ECE 0.012 on held-out authors.
Those numbers are **synthetic**: the labels and features come from the same simulator, so they
show the pipeline is wired correctly, not that the detector generalises. The model card states
this, repeats the cap and warns that machine-like prose can be written by a careful human or a
non-native speaker. Do not present an authorship score as proof of AI use.
