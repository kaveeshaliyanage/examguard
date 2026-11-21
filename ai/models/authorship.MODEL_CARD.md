# ExamGuard authorship model (review aid)

Trained 2026-11-07T08:30:37+00:00 from synthetic-authorship-1.0 synthetic cohorts.

## What this model does

It scores prose for how much it resembles **machine-generated text** on stylometric evidence:
sentence rhythm, contraction use, punctuation, repeated bigrams, drafting dynamics and
function-word mix. The output is capped at **54/100**, so the highest
possible band is MEDIUM. It is a routing signal for a human reader.

It does **not** detect copied work. Copying is the pair-similarity model's job. A high
authorship score is not proof of AI use and must never be presented as misconduct evidence.

## Data

- Source: `app/training/authorship_cohorts.py`, seeded synthetic human-like and
  machine-like paragraphs.
- Rows: 762 (439 machine-like,
  positive rate 0.5761).
- Splits are grouped by author/cohort (70/15/15), never by row.
- **The metrics below are synthetic.** They measure recovery of the simulator's style
  contrast, not real-world authorship detection.

## Held-out metrics

| Metric | Value |
| --- | --- |
| AUROC | 1.0 |
| TPR @ 5% FPR | 1.0 |
| Expected calibration error | 0.0121 |
| Brier | 0.0002 |
| Precision @ threshold | 1.0 |
| Recall @ threshold | 1.0 |
| Threshold | 0.11 |

Evaluation gates for CI: AUROC 0.80, TPR@5%FPR 0.55, ECE 0.05
(`app/training/authorship_eval.py` exits non-zero below them).

## Rules baseline weights

The runtime falls back to this transparent baseline when `USE_LEARNED_FUSION` is false or the
artifact is missing, or when the metadata feature order does not match. Weighted signals are
passed through a logistic link with center 0.68 and gain 6.0.

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

## Limits that matter

1. **Synthetic circularity.** The labels and the features both come from the same simulator.
   The metrics show the pipeline is wired correctly, not that the detector is valid.
2. **Domain shift.** Function words, punctuation and drafting habits vary by subject,
   language and assessment type. Re-validate on a licensed corpus with author ids.
3. **False accusations.** Machine-like prose can be written by a careful human, a non-native
   speaker, or a template-heavy discipline. The cap and the band ceiling are policy controls,
   not a calibration guarantee.
4. **No copying claim.** Stylometry says nothing about whether two candidates share an answer.

## Reproduce

```bash
cd ai
python -m app.training.authorship_export --out data-authorship --cohorts 200 --seed 7
python -m app.training.authorship_train --data data-authorship --out models --seed 7
python -m app.training.authorship_eval --data data-authorship/authorship.jsonl \
    --model models/authorship.joblib
```
