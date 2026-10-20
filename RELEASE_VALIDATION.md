# Cognitive Speech Models v1.5.1 — Automated online validation

This maintenance update adds a dedicated Chromium/GitHub Actions experiment for the released two-controller VTL application. It also removes the prominent “browser-only VTL” label from the page header without changing the synthesis engine.

The experiment is designed to measure local F1 sensitivity and the paired feedforward/feedback-strength response to ±150 Hz perceived-F1 shifts on sustained /aː/.

The control code, VocalTractLab WebAssembly build script, and speaker configuration are unchanged. This release **does not include measured online scientific results**; those are produced when the GitHub Actions workflow runs against the deployed site. Source-level and parser regression checks are separate from the scientific experiment.

See [feedback-balance validation protocol](docs/feedback-balance-validation.md).
