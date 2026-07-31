use reqwest::{Method, Url};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::{
    Result,
    broker::{socket_request, socket_request_with_headers},
    commands::Cli,
    config::{Session, hardened_client, load_session, origin},
    errors::RemoteError,
    output::compact_json,
};

const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

pub(crate) fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

async fn direct_request(
    session: &Session,
    requested_server: Option<&str>,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    direct_request_with_headers(session, requested_server, method, path, body, &[]).await
}

async fn direct_request_with_headers(
    session: &Session,
    requested_server: Option<&str>,
    method: Method,
    path: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> Result<Value> {
    let session_server = origin(&session.server)?;
    if let Some(requested) = requested_server
        && origin(requested)? != session_server
    {
        return Err(format!(
            "This credential is pinned to {}. Authenticate again for {}.",
            session.server, requested
        )
        .into());
    }
    let mut request = hardened_client()?
        .request(method, Url::parse(&session_server)?.join(path)?)
        .bearer_auth(&session.access_token)
        .header("accept", "application/json");
    if let Some(value) = body {
        request = request.json(&value);
    }
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    let response = request.send().await?;
    response_value(response).await
}

pub(crate) async fn response_value(response: reqwest::Response) -> Result<Value> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("Domino response exceeded 10 MiB.".into());
    }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("Domino response exceeded 10 MiB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()));
    if !status.is_success() {
        return Err(RemoteError::from_value("API", status.as_u16(), value).into());
    }
    Ok(value)
}

pub(crate) async fn invoke(
    cli: &Cli,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let body = body.map(compact_json);
    if let Some(socket) = &cli.socket {
        return socket_request(socket, method.as_str(), path, body.as_ref()).await;
    }
    let session = load_session(&cli.credential_file).await?;
    direct_request(&session, cli.server.as_deref(), method, path, body).await
}

pub(crate) async fn invoke_typed<T: DeserializeOwned>(
    cli: &Cli,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<T> {
    let value = invoke(cli, method, path, body).await?;
    serde_json::from_value(value).map_err(|error| {
        format!("Domino returned an unexpected response for {path}: {error}").into()
    })
}

pub(crate) async fn invoke_idempotent(
    cli: &Cli,
    method: Method,
    path: &str,
    body: Option<Value>,
    idempotency_key: &str,
) -> Result<Value> {
    let body = body.map(compact_json);
    if let Some(socket) = &cli.socket {
        return socket_request_with_headers(
            socket,
            method.as_str(),
            path,
            body.as_ref(),
            &[("Idempotency-Key", idempotency_key)],
        )
        .await;
    }
    let session = load_session(&cli.credential_file).await?;
    direct_request_with_headers(
        &session,
        cli.server.as_deref(),
        method,
        path,
        body,
        &[("Idempotency-Key", idempotency_key)],
    )
    .await
}
