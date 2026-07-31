use serde::Serialize;
use serde_json::Value;
use std::fmt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteError {
    pub(crate) source: &'static str,
    pub(crate) status: u16,
    pub(crate) error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) details: Option<Value>,
}

impl RemoteError {
    pub(crate) fn from_value(source: &'static str, status: u16, value: Value) -> Self {
        let error = value
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string());
        let details = value.is_object().then_some(value);
        Self {
            source,
            status,
            error,
            details,
        }
    }
}

impl fmt::Display for RemoteError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "Domino {} returned {}: {}",
            self.source, self.status, self.error
        )
    }
}

impl std::error::Error for RemoteError {}
