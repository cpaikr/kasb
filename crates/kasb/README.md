# kasb Rust SDK

The native `kasb` crate currently implements the phase-4 `get-paragraph`
vertical pilot. It is read-only and has no dependency on the TypeScript package
or Node.js runtime. Remaining v1 Rust capabilities belong to migration phase 5.

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

From this directory, run `cargo build --locked`, `cargo test --locked`, and
`cargo clippy --all-targets --locked -- -D warnings`.

The repository-level [v1 specification](../../docs/specs/kasb-standards-v1.md)
defines serialized semantics. The [migration rulebook](../../docs/plans/rust-migration/rulebook.md)
records Rust-specific translation and persona decisions.
