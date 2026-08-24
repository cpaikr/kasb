# kasb-cli

First-class Rust `kasb` CLI over the public [`kasb`](../kasb/README.md) SDK.

The crate owns command parsing, help, public-envelope presentation, standard
streams, and exit status. It does not own KASB URLs, transport policy, source
models, normalization, or capability validation.

From the repository root:

```sh
cargo run --locked -p kasb-cli --bin kasb -- --help
cargo run --locked -p kasb-cli --bin kasb -- --version
cargo run --locked -p kasb-cli --bin kasb -- help get-section
```

`kasb upgrade --check` and `kasb upgrade` are available only to standalone
executables whose adjacent `.kasb-receipt.json` agrees with the executable,
target, version, canonical release, asset, and SHA-256 digest. npm and Cargo
installations remain managed by npm and Cargo. Upgrade discovery is bounded and
requires an immutable stable release from `cpaikr/kasb`; Windows replacement is
scheduled after process exit and is not reported as already applied.

Machine success and failure output is one newline-terminated JSON document on
stdout. Failures exit `1` and leave stderr empty. Human help exits successfully.
