# kasb-cli

First-class Rust `kasb` CLI over the public [`kasb`](../kasb/README.md) SDK.

The crate owns command parsing, help, public-envelope presentation, standard
streams, and exit status. It does not own KASB URLs, transport policy, source
models, normalization, or capability validation.

From the repository root:

```sh
cargo run --locked -p kasb-cli --bin kasb -- --help
cargo run --locked -p kasb-cli --bin kasb -- help get-section
```

Machine success and failure output is one newline-terminated JSON document on
stdout. Failures exit `1` and leave stderr empty. Human help exits successfully.
