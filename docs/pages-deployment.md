# Runtime-only GitHub Pages deployment

The existing public site is
`https://tomkokkas.github.io/ETF-ATF-Calculator-AH-64DHA/`.
Its last inspected successful deployment was the GitHub-managed dynamic Pages
workflow on `main`, commit `4d280d58721ee8ba85f1f075b5713d3a0cab5176`.
There was no repository-owned workflow or artifact filter. Public scripts,
tests and rendered technical documents were accessible from that site.

## One-time migration, after publication approval

Before pushing the prepared workflow, an authorized repository administrator
must select **Settings > Pages > Build and deployment > Source: GitHub Actions**.
Do not leave branch/Jekyll publishing enabled during the change: it could
publish repository contents independently of the allowlisted artifact.
The public unauthenticated Pages settings API returned 404 during preparation;
no remote settings have been changed or assumed to be configured.

The workflow verifies `build_type: workflow` through the authenticated Pages
API and fails before upload/deployment if the source is wrong or cannot be
verified. `configure-pages` has enablement disabled and cannot silently enable
Pages. The build has only contents/pages read permissions; only the deployment
job receives pages write and OIDC permissions. No personal access token is
required. The existing `github-pages` environment and any protection rules
remain in use. No domain, repository name or base-path change is made.

After that setting is verified and publication is approved, pushes to the
existing `main` trigger the new workflow. Manual reruns use `workflow_dispatch`
on main only. Every build uses the same explicit file list and fails closed on
missing files, unexpected output, changed copied contents, links and unapproved
asset URLs. Adding a file to the repository does not add it to the site.

## Exact publication boundary

`scripts/build-pages.cjs` copies exactly these files to ignored `artifacts/pages`:

```text
index.html
css/style.css
js/interpolation.js
js/calculator.js
js/engines.js
js/engine-outline.js
data/figure-1-tsf.json
data/figure-4-tgtref.json
data/figure-5-dtrq-dtgt.json
data/figure-7-ttv.json
data/figure-8-etf.json
```

The source bytes are copied unchanged: no generated `.nojekyll`, transformation
of calculations, logging removal or extra manifest is inserted into the site.
The verifier prints file paths, sizes and SHA-256 hashes to the build log,
not into the publication directory. Only that directory is passed to
`upload-pages-artifact`; the deployment job depends on the successful build.

Tests, scripts and docs stay in the repository. `reference/` remains ignored;
`artifacts/` now ignores both screenshots and generated publication output.
Neither directory had tracked files requiring removal. Existing files are not
deleted. Excluding documents from Pages does not make committed documents
private in this public GitHub repository.

## Local verification

```powershell
node scripts/build-pages.cjs
node scripts/build-pages.cjs --verify
$testFiles = @(rg --files --no-ignore tests -g '*.test.cjs')
node --test $testFiles
$env:ETF_CAPTURE_TABS = '0'
$env:ETF_SITE_ROOT = 'artifacts/pages'
$env:ETF_SITE_PREFIX = '/ETF-ATF-Calculator-AH-64DHA'
node scripts/browser-engines.cjs
```

The browser suite serves the actual artifact under the project prefix. It
checks the normal two-engine calculation/UI scenarios and verifies HTTP 404
for reference, screenshots, docs, scripts, tests and local configuration paths.
No Node, PDF, local server or external library is required by the published
calculator. Node/Chrome and the locally held manual are development/checking
dependencies only. The CI publication-boundary tests do not need the manual.
Full numerical/calibration checks are run locally with the authorized source.

## Debug logging review

`calculator.js` still logs chart loading and successful calculation/debug
objects, including measured inputs, to the user's local console. The runtime
contains no upload of those inputs or persistent storage. For evaluator use,
the recommendation is to disable verbose input/result logging through a
separately approved presentation/diagnostic change, keeping numerical results
and necessary errors unchanged. No logging code is changed by this deployment
preparation; the artifact intentionally matches the reviewed runtime exactly.

## Approval and later deployment checks

This preparation does not stage, commit, push, alter GitHub settings, upload an
artifact or deploy. After approval, check the actual GitHub run, public runtime
assets and excluded paths again. Historical URLs must return 404 after the
replacement deployment; verify them after any CDN cache has refreshed.
Do not revert to branch publishing as a shortcut if the workflow fails.
