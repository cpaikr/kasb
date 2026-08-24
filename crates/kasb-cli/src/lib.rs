#![forbid(unsafe_code)]

mod args;
#[cfg(feature = "conformance-fixtures")]
pub mod conformance;
mod render;
mod upgrade;

use std::ffi::OsString;

use args::{Cli, OperationName};
use clap::Parser;
use kasb::http::{CancellationToken, HttpTransport};
use kasb::{Clock, KasbClient, KasbError};
use render::{ProcessOutput, is_help};
use serde_json::Value;

pub use render::ProcessOutput as CliProcessOutput;

pub async fn run_with_client<T, C, I, A>(
    client: &KasbClient<T, C>,
    argv: I,
    cancellation: &CancellationToken,
) -> ProcessOutput
where
    T: HttpTransport,
    C: Clock,
    I: IntoIterator<Item = A>,
    A: Into<OsString> + Clone,
{
    let invocation = match parse_invocation(argv) {
        Ok(invocation) => invocation,
        Err(output) => return output,
    };
    if invocation.operation == OperationName::Upgrade {
        return upgrade::run(invocation.upgrade_check).await;
    }
    run_invocation(client, &invocation, cancellation).await
}

/// Parses local CLI behavior before constructing the KASB transport.
///
/// This keeps help and parse failures independent from transport availability.
pub async fn run_with_client_factory<T, C, E, F, I, A>(
    argv: I,
    cancellation: &CancellationToken,
    client_factory: F,
) -> ProcessOutput
where
    T: HttpTransport,
    C: Clock,
    F: FnOnce() -> Result<KasbClient<T, C>, E>,
    I: IntoIterator<Item = A>,
    A: Into<OsString> + Clone,
{
    let invocation = match parse_invocation(argv) {
        Ok(invocation) => invocation,
        Err(output) => return output,
    };
    if invocation.operation == OperationName::Upgrade {
        return upgrade::run(invocation.upgrade_check).await;
    }
    let client = match client_factory() {
        Ok(client) => client,
        Err(_) => {
            return render::render_internal_failure(
                Some(invocation.operation.as_str()),
                invocation.failure_pretty,
                "Could not initialize the KASB transport.",
            );
        }
    };
    run_invocation(&client, &invocation, cancellation).await
}

fn parse_invocation<I, A>(argv: I) -> Result<args::Invocation, ProcessOutput>
where
    I: IntoIterator<Item = A>,
    A: Into<OsString> + Clone,
{
    let argv = argv.into_iter().map(Into::into).collect::<Vec<_>>();
    let printable_argv = argv
        .iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let cli = match Cli::try_parse_from(&argv) {
        Ok(cli) => cli,
        Err(error) if is_help(&error) => return Err(render::render_help(error)),
        Err(error) => return Err(render::render_parse_failure(error, &printable_argv)),
    };
    let mut invocation = cli.into_invocation();
    // The frozen CLI selects pretty rendering from raw argv, even when a
    // hyphen-leading `--pretty` token was consumed as another option's value.
    invocation.failure_pretty = printable_argv.iter().any(|value| value == "--pretty");
    Ok(invocation)
}

async fn run_invocation<T, C>(
    client: &KasbClient<T, C>,
    invocation: &args::Invocation,
    cancellation: &CancellationToken,
) -> ProcessOutput
where
    T: HttpTransport,
    C: Clock,
{
    let result = execute(
        client,
        invocation.operation,
        invocation.input.clone(),
        cancellation,
    )
    .await;
    match result {
        Ok(value) => render::render_success(value, invocation).unwrap_or_else(|_| {
            render::render_internal_failure(
                Some(invocation.operation.as_str()),
                invocation.failure_pretty,
                "Could not render the KASB operation result.",
            )
        }),
        Err(KasbError::Failure(failure)) => render::render_typed_failure(&failure, invocation),
        Err(KasbError::Cancelled) => ProcessOutput::interrupted(130),
    }
}

async fn execute<T, C>(
    client: &KasbClient<T, C>,
    operation: OperationName,
    input: Value,
    cancellation: &CancellationToken,
) -> Result<Value, KasbError>
where
    T: HttpTransport,
    C: Clock,
{
    match operation {
        OperationName::SearchStandards => {
            serialize(client.execute_search_standards(input, cancellation).await)
        }
        OperationName::GetStandardStructure => serialize(
            client
                .execute_get_standard_structure(input, cancellation)
                .await,
        ),
        OperationName::GetSection => {
            serialize(client.execute_get_section(input, cancellation).await)
        }
        OperationName::GetParagraph => {
            serialize(client.execute_get_paragraph(input, cancellation).await)
        }
        OperationName::SearchQna => serialize(client.execute_search_qna(input, cancellation).await),
        OperationName::GetQna => serialize(client.execute_get_qna(input, cancellation).await),
        OperationName::Upgrade => unreachable!("upgrade is handled before KASB transport"),
    }
}

fn serialize<T: serde::Serialize>(result: Result<T, KasbError>) -> Result<Value, KasbError> {
    result.and_then(|value| {
        serde_json::to_value(value).map_err(|_| {
            KasbError::Failure(kasb::KasbFailure {
                code: kasb::KasbFailureCode::InternalFailure,
                message: "Could not serialize the KASB operation result.".to_owned(),
                retryable: false,
                parameter: None,
                source_url: None,
            })
        })
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use kasb::SystemClock;
    use kasb::http::PersonaClient;

    use super::*;

    #[tokio::test]
    async fn ordinary_commands_never_construct_the_release_transport() {
        upgrade::reset_release_transport_constructions();
        for (argv, expected_kasb_transport) in [
            (vec!["kasb", "--help"], false),
            (vec!["kasb", "--version"], false),
            (vec!["kasb", "missing-command"], false),
            (
                vec!["kasb", "search-standards", "--keyword", "leases"],
                true,
            ),
        ] {
            let called = Cell::new(false);
            let output = run_with_client_factory(
                argv,
                &CancellationToken::new(),
                || -> Result<KasbClient<PersonaClient, SystemClock>, ()> {
                    called.set(true);
                    Err(())
                },
            )
            .await;

            assert_eq!(called.get(), expected_kasb_transport);
            assert_eq!(upgrade::release_transport_constructions(), 0);
            assert!(output.stdout.is_some());
        }
    }

    #[tokio::test]
    async fn unmanaged_upgrade_fails_before_constructing_any_transport() {
        upgrade::reset_release_transport_constructions();
        let kasb_transport_called = Cell::new(false);
        let output = run_with_client_factory(
            ["kasb", "upgrade", "--check"],
            &CancellationToken::new(),
            || -> Result<KasbClient<PersonaClient, SystemClock>, ()> {
                kasb_transport_called.set(true);
                Err(())
            },
        )
        .await;

        assert_eq!(output.exit_code, 1);
        assert!(!kasb_transport_called.get());
        assert_eq!(upgrade::release_transport_constructions(), 0);
        assert!(
            output
                .stdout
                .as_deref()
                .is_some_and(|stdout| stdout.contains("unmanaged_installation"))
        );
    }
}
