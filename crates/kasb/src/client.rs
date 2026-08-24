use chrono::{SecondsFormat, Utc};
use serde_json::Value;

use crate::KasbError;
use crate::capabilities::get_paragraph::{GetParagraphRequest, GetParagraphResult};
use crate::capabilities::get_qna::{GetQnaRequest, GetQnaResult};
use crate::capabilities::get_section::{GetSectionRequest, GetSectionResult};
use crate::capabilities::get_standard_structure::{
    GetStandardStructureRequest, GetStandardStructureResult,
};
use crate::capabilities::search_qna::{SearchQnaRequest, SearchQnaResult};
use crate::capabilities::search_standards::{SearchStandardsRequest, SearchStandardsResult};
use crate::http::{
    CancellationToken, HttpTransport, PersonaBuildError, PersonaClient, PersonaConfig,
};
use crate::sources::kasb::operations::{
    get_qna, get_section, get_standard_structure, search_qna, search_standards,
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

    pub async fn execute_search_standards(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<SearchStandardsResult, KasbError> {
        self.search_standards(
            SearchStandardsRequest::from_json(input).map_err(KasbError::from)?,
            cancellation,
        )
        .await
    }

    pub async fn search_standards(
        &self,
        request: SearchStandardsRequest,
        cancellation: &CancellationToken,
    ) -> Result<SearchStandardsResult, KasbError> {
        search_standards(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
    }

    pub async fn execute_get_standard_structure(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<GetStandardStructureResult, KasbError> {
        self.get_standard_structure(
            GetStandardStructureRequest::from_json(input).map_err(KasbError::from)?,
            cancellation,
        )
        .await
    }

    pub async fn get_standard_structure(
        &self,
        request: GetStandardStructureRequest,
        cancellation: &CancellationToken,
    ) -> Result<GetStandardStructureResult, KasbError> {
        get_standard_structure(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
    }

    pub async fn execute_get_section(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<GetSectionResult, KasbError> {
        self.get_section(
            GetSectionRequest::from_json(input).map_err(KasbError::from)?,
            cancellation,
        )
        .await
    }

    pub async fn get_section(
        &self,
        request: GetSectionRequest,
        cancellation: &CancellationToken,
    ) -> Result<GetSectionResult, KasbError> {
        get_section(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
    }

    pub async fn execute_search_qna(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<SearchQnaResult, KasbError> {
        self.search_qna(
            SearchQnaRequest::from_json(input).map_err(KasbError::from)?,
            cancellation,
        )
        .await
    }

    pub async fn search_qna(
        &self,
        request: SearchQnaRequest,
        cancellation: &CancellationToken,
    ) -> Result<SearchQnaResult, KasbError> {
        search_qna(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
    }

    pub async fn execute_get_qna(
        &self,
        input: Value,
        cancellation: &CancellationToken,
    ) -> Result<GetQnaResult, KasbError> {
        self.get_qna(
            GetQnaRequest::from_json(input).map_err(KasbError::from)?,
            cancellation,
        )
        .await
    }

    pub async fn get_qna(
        &self,
        request: GetQnaRequest,
        cancellation: &CancellationToken,
    ) -> Result<GetQnaResult, KasbError> {
        get_qna(&self.transport, &request, cancellation, || {
            self.clock.now_iso8601()
        })
        .await
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
    /// Builds a KASB client with the default browser persona and system clock.
    ///
    /// # Panics
    ///
    /// Panics if the underlying default [`PersonaClient`] cannot be built. Use
    /// [`KasbClient::new`] to handle that construction failure explicitly.
    fn default() -> Self {
        Self::from_parts(PersonaClient::default(), SystemClock)
    }
}
