# Kaggle: dataset, training and model storage

The Kaggle CLI is the transport for three private artifacts:

| Artifact | Kaggle type | Produced by |
| --- | --- | --- |
| `examguard-synthetic-fusion-rows` | Dataset | `python -m app.training.export` |
| `examguard-fusion-models` | Dataset | `python -m app.training.train` |
| `examguard-train-fusion` | Notebook | `kaggle/notebooks/train_fusion.ipynb` |

All three are created private. Nothing here changes the runtime score unless you set
`USE_LEARNED_FUSION=true` and place the artifacts in `ai/models`.

Published under `kaveeshaoshadi003` (2026-11-07):

- https://www.kaggle.com/datasets/kaveeshaoshadi003/examguard-synthetic-fusion-rows
- https://www.kaggle.com/datasets/kaveeshaoshadi003/examguard-fusion-models
- https://www.kaggle.com/code/kaveeshaoshadi003/examguard-train-fusion

The notebook starts from the dataset's `code/app` snapshot, trains both kinds and writes
`/kaggle/working/models`; download that output with `kaggle kernels output` and copy the `.joblib`
files into `ai/models`.

## Credentials

Create a Kaggle API token at <https://www.kaggle.com/settings/api> and save it outside the repo:

```bash
# option 1: token file
mkdir -p ~/.kaggle && printf '%s\n' "$TOKEN" > ~/.kaggle/access_token

# option 2: environment
export KAGGLE_API_TOKEN=...
```

The repository never reads the credential directly; `app.training.kaggle_publish` shells out to the
`kaggle` CLI, which handles authentication. Never commit `~/.kaggle`, `kaggle.json` or a token.

## Commands

```bash
cd ai
python -m pip install "kaggle>=2.2" six

# 1. generate rows
python -m app.training.export --out data --pair-cohorts 150 --incident-cohorts 150

# 2. stage + upload the dataset (private; creates or versions automatically)
python -m app.training.kaggle_publish dataset --data data \
  --message "150 synthetic cohorts, seed 7"

# 3. push the training notebook (runs on Kaggle with no internet)
python -m app.training.kaggle_publish notebook \
  --dataset <owner>/examguard-synthetic-fusion-rows

# 4. after downloading the artifacts into ai/models, version them on Kaggle
python -m app.training.kaggle_publish models --models models \
  --message "pair AP 0.81 / incident AP 1.00 (synthetic)"
```

`python -m app.training.kaggle_publish whoami` prints the authenticated account without printing
the token.

## What the uploaded dataset contains

```
pairs.jsonl            pair feature rows (6 features each)
incidents.jsonl        incident feature rows (6 features each)
manifest.json          generator version, seed, row counts, class balance, SHA-256 per file
code/app/**            snapshot of the analysis package used to train
dataset-metadata.json  Kaggle metadata (private)
```

Shipping the code snapshot keeps the notebook offline-capable: it needs no internet and no Git
clone. Regenerate the dataset whenever the feature code changes, otherwise the rows and the
training code drift apart.
