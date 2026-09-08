# Establish the canonical release pipeline

Status: completed implementation record for PR #23. Its original manual
publication flow, npm registry publisher, and protected-environment policy
were superseded by [release flow alignment](release-flow-alignment.md).
[Release posture](../docs/release.md) owns current operations and publication
boundaries; [the first-release task](../tasks/perform-first-rust-node-release.md)
owns production readiness.

## Delivered foundation

The pipeline builds a complete candidate from one checkout, verifies the
Node SDK packages and standalone CLI artifacts on Linux GNU x64/ARM64, macOS
ARM64, and Windows x64, and seals the exact candidate bytes for publication
without rebuilding. Standalone archives reuse the CLI binaries carried by the
native Node packages. Generated installers, checksums, provenance, source
identity, and clean-consumer checks share the canonical release contract.

Strict validation binds the canonical source version and tag to the checkout.
A non-publishing rehearsal substitutes a synthetic candidate ref and
deterministic publication-state fixtures. GitHub publication stages a draft,
reconciles exact asset bytes, and verifies the immutable final release.
Failure injection covers incomplete candidates, failed gates, interrupted
uploads, conflicting assets, and recoverable retries.

The original delivery also implemented npm trusted publication and GitHub
policy credentials. Those paths were removed by the later alignment; package
assembly and consumer validation remain. GitHub Releases deliver standalone
archives, installers, checksums, and provenance. Node tarballs remain CI
candidate evidence and are not a new public delivery channel.

## Completion evidence

PR #22 established the release and managed-upgrade contract at `e9c707d`.
PR #23 merged the reviewed pipeline at `8e86a86`. Exact implementation head
`a9d781a` passed CI run `32713982066` and the full non-publishing four-target
candidate run `32713982087`. The sealed candidate artifact digest was
`sha256:cf1084c26e08c93931f1560481ff2b081ac0d54a44dfdaa6347c26a2f8467cd0`.
CodeRabbit findings were resolved and focused independent reviews found no
remaining issues. This evidence describes that delivery, not the later
alignment's hosted validation or a production publication.
