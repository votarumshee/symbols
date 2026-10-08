# Release evidence

`qa-artifact-manifest.json` records the locally accepted 1.1.0 QA binaries and their
SHA-256 hashes. `local-independent-review.json` records the independent acceptance
performed on 2026-10-08. These are historical results, not claims about an arbitrary
future checkout, hosted CI, production deployment or store approval.

APK files, raw logs, screenshots and fixtures stay in the ignored local `artifacts/`
directory; relative evidence names inside the review refer to
`artifacts/transition-root/`. They are not public downloads. Reproduce the checks
using [transition acceptance](../docs/transition-acceptance.md) and
[native build instructions](../docs/native-transition.md). Hosted CI publishes its
own artifacts and uses an independent disposable signing key.

Physical Android, Android 26 with a supported WebView, macOS/iOS and owner signing
remain explicit external gates. The manifests contain no account credentials or
private signing material.
