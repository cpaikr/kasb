use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum KasbFailureCode {
    InvalidInput,
    NotFound,
    SourceUnavailable,
    SourceChanged,
    PartialRetrieval,
    InternalFailure,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct KasbFailure {
    pub code: KasbFailureCode,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
}

impl KasbFailure {
    pub(crate) fn invalid(parameter: &str, message: impl Into<String>) -> Self {
        Self {
            code: KasbFailureCode::InvalidInput,
            message: message.into(),
            retryable: false,
            parameter: Some(parameter.to_owned()),
            source_url: None,
        }
    }

    pub(crate) fn source(
        code: KasbFailureCode,
        message: impl Into<String>,
        retryable: bool,
        source_url: &str,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
            parameter: None,
            source_url: Some(source_url.to_owned()),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum KasbError {
    #[error("KASB request was cancelled")]
    Cancelled,
    #[error("{0}")]
    Failure(KasbFailure),
}

impl From<KasbFailure> for KasbError {
    fn from(value: KasbFailure) -> Self {
        Self::Failure(value)
    }
}
