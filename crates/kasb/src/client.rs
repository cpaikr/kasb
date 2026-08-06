use chrono::{SecondsFormat, Utc};
use serde_json::Value;

use crate::KasbError;
use crate::capabilities::get_paragraph::{GetParagraphRequest, GetParagraphResult};
use crate::http::{
    CancellationToken, HttpTransport, PersonaBuildError, PersonaClient, PersonaConfig,
};
use crate::sources::kasb::paragraph::get_paragraph;

pub trait Clock: Send + Sync {
    fn now_iso8601(&self) -> String;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_iso8601(&self) -> String {
        Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FixedClock {
    value: String,
}

impl FixedClock {
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
        }
    }
}

impl Clock for FixedClock {
    fn now_iso8601(&self) -> String {
        self.value.clone()
    }
}

#[derive(Clone)]
pub struct KasbClient<T = PersonaClient, C = SystemClock> {
    transport: T,
    clock: C,
}

impl<T, C> KasbClient<T, C>
where
    T: HttpTransport,
    C: Clock,
{
    pub fn from_parts(transport: T, clock: C) -> Self {
        Self { transport, clock }
    }

    pub async fn execute_get_paragraph(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<GetParagraphResult, KasbError> {
        let request = GetParagraphRequest::from_json(input).map_err(KasbError::from)?;
        self.get_paragraph(request, cancellation).await
    }

    pub async fn get_paragraph(
        &self,
        request: GetParagraphRequest,
        cancellation: &CancellationToken,
    ) -> Result<GetParagraphResult, KasbError> {
        get_paragraph(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
    }
}

impl KasbClient<PersonaClient, SystemClock> {
    pub fn new(config: PersonaConfig) -> Result<Self, PersonaBuildError> {
        Ok(Self::from_parts(PersonaClient::new(config)?, SystemClock))
    }
}

impl Default for KasbClient<PersonaClient, SystemClock> {
    fn default() -> Self {
        Self::from_parts(PersonaClient::default(), SystemClock)
    }
}
