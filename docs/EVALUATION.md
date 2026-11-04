# Evaluation plan

The system must be evaluated as **triage**, not as a cheating detector. The target is whether a
lecturer reaches relevant cases earlier, with fewer irrelevant cases at the top of the queue.

## Research questions

1. Does distinctive-pattern evidence improve pair ranking over lexical similarity alone?
2. Does timing evidence add ranking value once content evidence is included, or is it redundant?
3. Does semantic similarity retrieve paraphrased overlap that lexical features miss, without
   increasing false alarms on legitimately similar answers?
4. Does adding answer-change evidence improve incident ranking over resource-rule violations alone?
5. How much does missing coverage degrade ranking, and does the coverage cap prevent inflated trust?

## Pair ablations

| Condition | Features |
| --- | --- |
| A. Content | TF-IDF lexical only |
| B. Content + patterns | lexical + rare shingles + rare tokens + cross-question |
| C. Content + patterns + timing | full rule fusion |
| D. Semantic variant | B/C with SBERT enabled |

Report A -> B -> C -> D on the same held-out cohort. Do not tune thresholds on the test split.

## Incident ablations

| Condition | Features |
| --- | --- |
| A. Rules only | prohibited/unclassified domain visits |
| B. Rules + coverage | coverage cap and warning |
| C. Full | rules + coverage + answer-change correlation + repeat access |

## Metrics

- Precision, recall and F1 at the operating threshold; report the threshold.
- Average precision (area under the precision-recall curve) as the threshold-free summary.
- Precision@5, @10 and @20 for reviewer workload.
- False alarms per 100 candidates (incidents) and per 1,000 pairs (pairs). Pair counts grow
  quadratically: 100 candidates produce 4,950 pairs, so a 1% false-positive rate is 50 cases.
- Recall@k: how many labelled positives appear in the first k.
- Calibration only if a probabilistic claim is made. The default UI shows a priority band, not a
  probability.

## Scale

`ai/tests/test_performance.py` runs pair analysis on 100 candidates and four questions (4,950
pairs) and fails above 10 seconds, the acceptance target for the software-quality criterion. Each
candidate carries distinct answer text, so no comparison is served from the per-request similarity
cache. The measurement excludes one-time interpreter and scikit-learn import cost: the test warms up
first and reports the median of three samples.

Timing similarity is a character 5-gram Dice coefficient over counters built once per revision. It
replaced a character-level sequence matcher whose per-comparison cost grew with answer length and
dominated 100-candidate runs.

Observed on the development machine (Windows, Intel i5-8250U, 8 GB RAM, Python 3.14, scikit-learn
lexical backend, semantic model disabled): 2.5-2.8 s warm (median 2.7 s) with the machine at roughly
40% CPU. Re-measure on the reference machine before quoting a figure, and treat the cold-start
number as a deployment consideration.

## Splitting and leakage

- Split by exam session/cohort first.
- Split by candidate as well: a candidate appears in many pairs, so random pair splitting leaks.
- Never let paraphrases generated from the same source answer cross the split.
- Keep the synthetic generator seed and scripted scenario ids out of model inputs.
- Store `model_version` and `input_hash` with each run so results are reproducible.

## Synthetic and semi-synthetic data

`ai/app/evaluation/synthetic.py` generates cohorts with known conditions:

- `independent`: different facts and phrasing.
- `shared_rare`: both answers include the same invented term or unusual example.
- `paraphrase`: meaning overlap with different wording.
- `aligned_timing`: near-simultaneous content-changing revisions.
- `noise`: realistic length variation, typos, partial answers.

`ai/app/evaluation/run_eval.py` runs the ablations and prints a table. Use it for regression testing
of the pipeline and for sensitivity analysis, not as evidence of real-world accuracy. Scripted labels
encode the script; a learned fusion model will recover those rules and look unrealistically good.

## Public corpora

Verify licences and current availability before use.

- **Clough-Stevenson short-answer plagiarism corpus**: copy / paraphrase / normal labels for short
  answers. Best available check of lexical and semantic similarity behaviour. No activity data.
- **PAN plagiarism corpora**: passage-level reuse. Useful for pattern features, not representative of
  short exam answers.
- **SemEval-2013 Task 7 Student Response Analysis**: legitimate similarity and correctness labels,
  useful as hard negatives. Correctness is not copying.
- **OULAD** (optional): interaction-record processing practice only; lacks linked evidence.

Hard negatives matter more than easy positives. Include answers that are similar because they are
correct, formulaic, or drawn from the same textbook.

## Consented pilot

A stronger evaluation than pure simulation:

1. Ethics approval; no real grades; explicit disclosure; opt-in consent.
2. 20-40 volunteers take a 30-40 minute mock exam with 6-8 short-answer questions.
3. Conditions assigned with consent: independent work; permitted resources; instructed answer
   sharing (participants know they are simulating a case); instructed prohibited-resource access.
4. Collect real browser noise, real phrasing diversity and real timing.
5. Debrief; collect lecturer usability feedback on ranked findings.
6. Report results as behaviour under instructed conditions, not real misconduct rates.

If browser monitoring is not approved, fall back to a lab study on provided machines or to the
replay harness with clearly labelled simulated events.

## Reporting template

State separately: data source, labels, split, thresholds, base rate, metrics, coverage, and known
confounds. Never report "accuracy" without the base rate. Never describe a priority score as a
probability. Report failures and false positives explicitly; they are the main practical risk.
