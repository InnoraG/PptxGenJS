# BetterPPTX Asset Catalog Readiness

This verifies that AI-facing asset search is ready for local development and a Cloud Run deployment.

## Local

Run:

```powershell
node betterpptx-mcp\verify-asset-catalog-readiness.mjs --mode=local
```

The verifier checks:

- `BETTERPPTX_ASSETS_ROOT` or the repo root contains `outputs/microsoft_stock3d_library`.
- Microsoft Stock 3D has at least 1,000 GLBs.
- Abstract prompts such as `executive growth strategy`, `cybersecurity risk`, and `medical innovation` return `model3d://microsoft-stock/...` handles.
- Public black-box catalog responses do not expose local paths or implementation files.

To simulate a mounted cloud asset root locally:

```powershell
$env:BETTERPPTX_ASSETS_ROOT="D:\PptxGenJS_Claude"
node betterpptx-mcp\verify-asset-catalog-readiness.mjs --mode=local
```

## Cloud Provisioning

Use a dedicated persistent assets bucket. Do not use the staging artifacts bucket if it has a short lifecycle delete rule.

Dry-run the default Microsoft Stock 3D provisioning:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\gcp\provision-betterpptx-assets.ps1 -DryRun -Upload -ConfigureService
```

Provision Microsoft Stock 3D for staging:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\gcp\provision-betterpptx-assets.ps1 -CreateBucket -Upload -ConfigureService
```

Provision the broader public-safe catalog:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\gcp\provision-betterpptx-assets.ps1 -AssetSet public-core -CreateBucket -Upload -ConfigureService
```

The `all-local` asset set includes the private IconScout cache and requires `-AllowPrivateIconScout`.

## Cloud Verify

After the MCP image containing `BETTERPPTX_ASSETS_ROOT` support is deployed and the bucket is mounted:

```powershell
node betterpptx-mcp\verify-asset-catalog-readiness.mjs --mode=cloud --base=https://betterpptx-mcp-staging-yqkbambcna-uc.a.run.app
```

This calls the public MCP endpoint and verifies the same AI-intent Microsoft Stock catalog behavior without exposing server internals.
