use std::io::{self, Write};

use kasb::KasbClient;
use kasb::http::{CancellationToken, PersonaConfig};

#[tokio::main]
async fn main() {
    let argv = std::env::args_os().collect::<Vec<_>>();

    #[cfg(feature = "conformance-fixtures")]
    if let Some(output) = kasb_cli::conformance::try_run(&argv).await {
        exit_with(output);
    }

    let output =
        kasb_cli::run_with_client_factory(argv.iter().cloned(), &CancellationToken::new(), || {
            KasbClient::new(PersonaConfig::default())
        })
        .await;
    exit_with(output);
}

fn exit_with(output: kasb_cli::CliProcessOutput) -> ! {
    let mut handle = io::stdout().lock();
    std::process::exit(write_output(&mut handle, &output));
}

fn write_output(writer: &mut impl Write, output: &kasb_cli::CliProcessOutput) -> i32 {
    let delivered = output.stdout.as_ref().is_none_or(|stdout| {
        writeln!(writer, "{stdout}")
            .and_then(|()| writer.flush())
            .is_ok()
    });
    if delivered { output.exit_code } else { 1 }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FailingWriter;

    impl Write for FailingWriter {
        fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed"))
        }

        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed"))
        }
    }

    #[test]
    fn output_delivery_failure_changes_success_to_failure() {
        let output = kasb_cli::CliProcessOutput {
            stdout: Some("help".to_owned()),
            exit_code: 0,
        };
        assert_eq!(write_output(&mut FailingWriter, &output), 1);
    }
}
