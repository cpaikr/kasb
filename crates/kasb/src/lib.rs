#![forbid(unsafe_code)]

//! Read-only Rust SDK for KASB standards and Q&A material.

pub mod capabilities;
mod client;
mod error;
pub mod http;
mod sources;

pub use client::{Clock, FixedClock, KasbClient, SystemClock};
pub use error::{KasbError, KasbFailure, KasbFailureCode};
