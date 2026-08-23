use std::io::{self, Read};

use serde_json::json;

fn main() {
    if std::env::var_os("KASB_PROBE_WAIT_SIGNAL").is_some() {
        eprintln!("probe-ready");
        loop {
            std::thread::park();
        }
    }

    let mut stdin = String::new();
    io::stdin()
        .read_to_string(&mut stdin)
        .expect("probe stdin should be readable");
    let environment = std::env::var("KASB_PROBE_VALUE").unwrap_or_default();
    let payload = json!({
        "args": std::env::args().skip(1).collect::<Vec<_>>(),
        "cwd": std::env::current_dir()
            .expect("probe cwd should be readable")
            .to_string_lossy(),
        "environment": environment,
        "stdin": stdin,
    });
    println!("{payload}");
    eprintln!("probe-stderr:{environment}");

    let exit_code = std::env::var("KASB_PROBE_EXIT_CODE")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    std::process::exit(exit_code);
}
