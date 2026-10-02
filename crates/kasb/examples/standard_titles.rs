//! Maintainer tool for the bundled standard-title table.
//!
//! `--write` refreshes `data/standard-titles.json` from live KASB structure
//! indexes; `--check` reports drift without writing. Further arguments add
//! standard numbers to the table. Requests always use the SDK's default
//! pacing, so a full pass takes a couple of minutes by design.

use std::collections::BTreeMap;
use std::error::Error;
use std::path::PathBuf;
use std::process::ExitCode;

use kasb::capabilities::get_standard_structure::GetStandardStructureRequest;
use kasb::http::{CancellationToken, DEFAULT_REQUEST_INTERVAL};
use kasb::{KasbClient, KasbError, KasbFailureCode};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Table {
    captured_on: String,
    titles: BTreeMap<String, Option<String>>,
}

#[tokio::main]
async fn main() -> Result<ExitCode, Box<dyn Error>> {
    let mut arguments = std::env::args().skip(1);
    let write = match arguments.next().as_deref() {
        Some("--write") => true,
        Some("--check") => false,
        _ => return Err("usage: standard_titles (--write | --check) [stdNum...]".into()),
    };
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data/standard-titles.json");
    let current: Table = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    let mut std_nums = current.titles.keys().cloned().collect::<Vec<_>>();
    std_nums.extend(arguments);
    std_nums.sort();
    std_nums.dedup();

    // Pin the default interval so the environment cannot speed up this
    // 200-request capture.
    let client = KasbClient::default().with_request_interval(Some(DEFAULT_REQUEST_INTERVAL))?;
    let cancellation = CancellationToken::new();
    let mut titles = BTreeMap::new();
    for (index, std_num) in std_nums.iter().enumerate() {
        let request = GetStandardStructureRequest::new(std_num.clone())?;
        // Mirror search enrichment: the first level-1 section names the
        // standard. Withdrawn standards answer without a structure index, so
        // a source-shape failure counts as untitled, but only where no title
        // is recorded: it must not erase one. Availability failures abort.
        let title = match client.get_standard_structure(request, &cancellation).await {
            Ok(structure) => structure
                .result
                .sections
                .into_iter()
                .find(|section| section.level.as_f64() == Some(1.0))
                .map(|section| section.title),
            Err(KasbError::Failure(failure))
                if failure.code == KasbFailureCode::NotFound
                    || (failure.code == KasbFailureCode::SourceChanged
                        && !matches!(current.titles.get(std_num), Some(Some(_)))) =>
            {
                None
            }
            Err(error) => return Err(format!("standard {std_num}: {error}").into()),
        };
        eprintln!("[{}/{}] {std_num}: {title:?}", index + 1, std_nums.len());
        titles.insert(std_num.clone(), title);
    }

    // A real source change would untitle everything; refuse to record that.
    if titles.values().flatten().count() * 2 < titles.len() {
        return Err("fewer than half of the standards have a title; refusing the capture".into());
    }
    if titles == current.titles {
        eprintln!("standard titles are current");
        return Ok(ExitCode::SUCCESS);
    }
    for (std_num, title) in &titles {
        if current.titles.get(std_num) != Some(title) {
            eprintln!(
                "changed {std_num}: {:?} -> {title:?}",
                current.titles.get(std_num)
            );
        }
    }
    if !write {
        return Ok(ExitCode::FAILURE);
    }
    let table = Table {
        captured_on: chrono::Utc::now().format("%Y-%m-%d").to_string(),
        titles,
    };
    std::fs::write(&path, serde_json::to_string_pretty(&table)? + "\n")?;
    Ok(ExitCode::SUCCESS)
}
