use serde_json::Value;

use crate::http::{
    CancellationToken, HttpResponse, HttpTransport, MAX_RESPONSE_BYTES, TransportError,
};
use crate::{KasbError, KasbFailure, KasbFailureCode};

pub(crate) async fn fetch_json<T: HttpTransport>(
    transport: &T,
    source_url: &str,
    cancellation: &CancellationToken,
) -> Result<Value, KasbError> {
    if cancellation.is_cancelled() {
        return Err(KasbError::Cancelled);
    }
    let response = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return Err(KasbError::Cancelled),
        response = transport.get(source_url, cancellation) => response,
    };

    let response = match response {
        Ok(response) => response,
        Err(TransportError::Cancelled) => return Err(KasbError::Cancelled),
        Err(TransportError::ResponseTooLarge { limit }) => {
            return Err(response_too_large_failure(source_url, limit).into());
        }
        Err(TransportError::Timeout | TransportError::Unavailable(_)) => {
            return Err(KasbFailure::source_failure(
                KasbFailureCode::SourceUnavailable,
                "Could not connect to the KASB API.",
                true,
                source_url,
            )
            .into());
        }
    };

    ensure_success(response, source_url)
}

fn ensure_success(response: HttpResponse, source_url: &str) -> Result<Value, KasbError> {
    if !(200..300).contains(&response.status) {
        return Err(KasbFailure::source_failure(
            if response.status == 404 {
                KasbFailureCode::NotFound
            } else {
                KasbFailureCode::SourceUnavailable
            },
            format!("KASB API request failed (status={}).", response.status),
            response.status == 429 || response.status >= 500,
            source_url,
        )
        .into());
    }
    if response.body.len() > MAX_RESPONSE_BYTES {
        return Err(response_too_large_failure(source_url, MAX_RESPONSE_BYTES).into());
    }

    serde_json::from_slice(&response.body).map_err(|_| {
        KasbError::from(KasbFailure::source_failure(
            KasbFailureCode::SourceChanged,
            "KASB API returned a non-JSON response.",
            false,
            source_url,
        ))
    })
}

fn response_too_large_failure(source_url: &str, limit: usize) -> KasbFailure {
    KasbFailure::source_failure(
        KasbFailureCode::SourceChanged,
        format!("KASB API response exceeded the {limit}-byte limit."),
        false,
        source_url,
    )
}
