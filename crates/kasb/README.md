# kasb Rust SDK

The native `kasb` crate implements all six read-only KASB v1 operations:
`search-standards`, `get-standard-structure`, `get-section`, `get-paragraph`,
`search-qna`, and `get-qna`. It has no dependency on the TypeScript package or
Node.js runtime. KASB transport, source decoding, normalization, domain policy,
and typed capability failures live in this crate.

The example uses Tokio's runtime macro. Add these direct dependencies to the
consumer crate:

```toml
[dependencies]
kasb = "0.1.0"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust,no_run
use kasb::capabilities::get_paragraph::GetParagraphRequest;
use kasb::http::CancellationToken;
use kasb::KasbClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = KasbClient::default();
    let request = GetParagraphRequest::new("1116", "23")?;
    let result = client
        .get_paragraph(request, &CancellationToken::new())
        .await?;

    println!("{}", result.result.paragraph.full_content);
    Ok(())
}
```

`KasbClient` reuses one `wreq` browser persona, connection pool, cookie store,
proxy affinity, and concurrency budget. Use `KasbClient::from_parts` with an
implementation of `HttpTransport` and `Clock` for deterministic embedding and
tests. Caller cancellation returns `KasbError::Cancelled`; capability failures
remain structured `KasbError::Failure` values with serializable fields.

Each capability module exposes a validated request type and a project-owned
result type. `KasbClient` provides a typed method and an `execute_*` JSON trust
boundary for each operation. The latter is used by native projections and
still validates inputs before any source request.

From this directory, run `cargo build --locked`, `cargo test --locked`, and
`cargo clippy --all-targets --locked -- -D warnings`.

The repository-level [v1 specification](../../docs/specs/kasb-standards-v1.md)
defines serialized semantics. The [migration rulebook](../../docs/plans/rust-migration/rulebook.md)
records Rust-specific translation and persona decisions.
