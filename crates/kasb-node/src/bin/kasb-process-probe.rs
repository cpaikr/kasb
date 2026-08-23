use std::io::{self, Read};

use serde_json::json;

fn main() {
    if let Some(process_group) = std::env::var_os("KASB_PROBE_SEND_CTRL_BREAK") {
        send_console_break(&process_group.to_string_lossy());
        return;
    }

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

#[cfg(windows)]
fn send_console_break(process_group: &str) {
    type HandlerRoutine = Option<unsafe extern "system" fn(u32) -> i32>;

    unsafe extern "system" fn ignore_console_event(_event: u32) -> i32 {
        1
    }

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn FreeConsole() -> i32;
        fn AttachConsole(process_id: u32) -> i32;
        fn SetConsoleCtrlHandler(handler: HandlerRoutine, add: i32) -> i32;
        fn GenerateConsoleCtrlEvent(ctrl_event: u32, process_group_id: u32) -> i32;
        fn GetLastError() -> u32;
    }

    let process_group = process_group
        .parse::<u32>()
        .expect("console process group must be a Windows process id");
    let failure = |operation: &str| -> ! {
        // SAFETY: GetLastError has no preconditions and returns thread-local state.
        let code = unsafe { GetLastError() };
        panic!("{operation} failed with Windows error {code}");
    };

    // The sender must share the target's console. Ignore control events in the
    // sender itself so only the target process group observes CTRL_BREAK_EVENT.
    // SAFETY: these calls use the documented Windows console API contracts and
    // pass no borrowed pointers.
    unsafe {
        let _ = FreeConsole();
        if AttachConsole(process_group) == 0 {
            failure("AttachConsole");
        }
        if SetConsoleCtrlHandler(Some(ignore_console_event), 1) == 0 {
            failure("SetConsoleCtrlHandler");
        }
        if GenerateConsoleCtrlEvent(1, process_group) == 0 {
            failure("GenerateConsoleCtrlEvent");
        }
    }
}

#[cfg(not(windows))]
fn send_console_break(_process_group: &str) {
    panic!("KASB_PROBE_SEND_CTRL_BREAK is supported only on Windows");
}
