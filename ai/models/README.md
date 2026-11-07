# Fusion model artifacts

`pair_fusion.joblib` and `incident_fusion.joblib` are produced by training and are intentionally
not committed. To create them:

```bash
cd ai
python -m app.training.export --out data
python -m app.training.train --data data --out models
```

Then set `USE_LEARNED_FUSION=true`. Compose mounts this directory read-only at `/app/models`.

The training code writes `MODEL_CARD.md` and `*_fusion.meta.json` next to the artifacts. Keep the
model card with any artifact you publish, because the metrics describe a synthetic simulator and
must not be read as evidence of real-world validity.
