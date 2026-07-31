use reqwest::{Method, Url};
use serde_json::{Value, json};
use std::{
    fs::Permissions,
    os::unix::fs::{FileTypeExt, PermissionsExt},
    path::Path,
    sync::Arc,
    time::Duration,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::Semaphore,
    time::timeout,
};

use crate::{
    Result,
    commands::{BrokerCommand, Cli},
    config::{hardened_client, load_session, origin, prepare_private_directory},
    errors::RemoteError,
};

const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;
pub(crate) const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;
const BROKER_MAX_CONNECTIONS: usize = 32;
const BROKER_HEADER_BYTES: usize = 16 * 1024;

pub(crate) async fn socket_request(
    socket: &Path,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<Value> {
    socket_request_with_headers(socket, method, path, body, &[]).await
}

pub(crate) async fn socket_request_with_headers(
    socket: &Path,
    method: &str,
    path: &str,
    body: Option<&Value>,
    headers: &[(&str, &str)],
) -> Result<Value> {
    let payload = body
        .map(serde_json::to_vec)
        .transpose()?
        .unwrap_or_default();
    let mut stream = UnixStream::connect(socket).await?;
    let extra_headers = headers
        .iter()
        .map(|(name, value)| format!("{name}: {value}\r\n"))
        .collect::<String>();
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: domino\r\nContent-Type: application/json\r\n{extra_headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
    );
    stream.write_all(request.as_bytes()).await?;
    stream.write_all(&payload).await?;
    let mut response = Vec::new();
    timeout(
        Duration::from_secs(35),
        stream
            .take((MAX_RESPONSE_BYTES + BROKER_HEADER_BYTES + 1) as u64)
            .read_to_end(&mut response),
    )
    .await
    .map_err(|_| "Timed out waiting for the broker response")??;
    if response.len() > MAX_RESPONSE_BYTES + BROKER_HEADER_BYTES {
        return Err("Broker response exceeded 10 MiB.".into());
    }
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or("Invalid broker response")?;
    let head = String::from_utf8_lossy(&response[..split]);
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(500);
    let value: Value = serde_json::from_slice(&response[split + 4..]).unwrap_or_else(|_| {
        Value::String(String::from_utf8_lossy(&response[split + 4..]).into_owned())
    });
    if status >= 400 {
        return Err(RemoteError::from_value("broker", status, value).into());
    }
    Ok(value)
}

pub(crate) async fn socket_file_request(
    socket: &Path,
    path: &str,
    file_path: &Path,
    content_type: &str,
    idempotency_key: Option<&str>,
) -> Result<Value> {
    let metadata = fs::metadata(file_path).await?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_UPLOAD_BYTES {
        return Err("Attachments must be regular files between 1 byte and 50 MiB.".into());
    }
    let mut stream = UnixStream::connect(socket).await?;
    let idempotency = idempotency_key
        .map(|value| format!("Idempotency-Key: {value}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: domino\r\nContent-Type: {content_type}\r\n{idempotency}Content-Length: {}\r\nConnection: close\r\n\r\n",
        metadata.len()
    );
    stream.write_all(request.as_bytes()).await?;
    let mut file = fs::File::open(file_path).await?;
    let mut chunk = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        stream.write_all(&chunk[..count]).await?;
    }
    read_socket_response(stream).await
}

async fn read_socket_response(stream: UnixStream) -> Result<Value> {
    let mut response = Vec::new();
    timeout(
        Duration::from_secs(65),
        stream
            .take((MAX_RESPONSE_BYTES + BROKER_HEADER_BYTES + 1) as u64)
            .read_to_end(&mut response),
    )
    .await
    .map_err(|_| "Timed out waiting for the broker response")??;
    if response.len() > MAX_RESPONSE_BYTES + BROKER_HEADER_BYTES {
        return Err("Broker response exceeded 10 MiB.".into());
    }
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or("Invalid broker response")?;
    let head = String::from_utf8_lossy(&response[..split]);
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(500);
    let value: Value = serde_json::from_slice(&response[split + 4..]).unwrap_or_else(|_| {
        Value::String(String::from_utf8_lossy(&response[split + 4..]).into_owned())
    });
    if status >= 400 {
        return Err(RemoteError::from_value("broker", status, value).into());
    }
    Ok(value)
}

pub(crate) fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

pub(crate) async fn run_broker(cli: &Cli, command: &BrokerCommand) -> Result<()> {
    match command {
        BrokerCommand::Serve {
            listen,
            credential_file,
        } => {
            let session =
                load_session(credential_file.as_deref().unwrap_or(&cli.credential_file)).await?;
            let listener = bind_broker_listener(listen).await?;
            println!(
                "Domino broker listening on {} with mode 0660.",
                listen.display()
            );
            println!("The bearer credential will never be returned through this socket.");
            let connections = Arc::new(Semaphore::new(BROKER_MAX_CONNECTIONS));
            let client = hardened_client()?;
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        let (mut stream, _) = accepted?;
                        let Ok(permit) = connections.clone().try_acquire_owned() else {
                            let _ = write_broker_error(&mut stream, 503, "Broker is busy").await;
                            continue;
                        };
                        let server = session.server.clone();
                        let token = session.access_token.clone();
                        let client = client.clone();
                        tokio::spawn(async move {
                            let _permit = permit;
                            let _ = serve_broker_request(stream, &server, &token, client).await;
                        });
                    }
                    _ = tokio::signal::ctrl_c() => break,
                }
            }
            let _ = fs::remove_file(listen).await;
            Ok(())
        }
    }
}

async fn bind_broker_listener(listen: &Path) -> Result<UnixListener> {
    let parent = listen
        .parent()
        .ok_or("Broker socket requires a parent directory")?;
    prepare_private_directory(parent, 0o750)?;
    if let Ok(metadata) = fs::symlink_metadata(listen).await {
        if !metadata.file_type().is_socket() {
            return Err(
                format!("Refusing to replace non-socket path {}.", listen.display()).into(),
            );
        }
        fs::remove_file(listen).await?;
    }
    let listener = UnixListener::bind(listen)?;
    fs::set_permissions(listen, Permissions::from_mode(0o660)).await?;
    Ok(listener)
}

async fn serve_broker_request(
    mut stream: UnixStream,
    server: &str,
    token: &str,
    client: reqwest::Client,
) -> Result<()> {
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 8192];
    let header_end;
    loop {
        let count = timeout(Duration::from_secs(5), stream.read(&mut chunk))
            .await
            .map_err(|_| "Timed out reading broker request headers")??;
        if count == 0 {
            return Ok(());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.len() > BROKER_HEADER_BYTES {
            return write_broker_error(&mut stream, 431, "Request headers too large").await;
        }
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = index + 4;
            break;
        }
    }
    let head = String::from_utf8_lossy(&bytes[..header_end]).into_owned();
    let mut lines = head.lines();
    let request_line = lines.next().ok_or("Missing request line")?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().ok_or("Missing method")?.to_owned();
    let path = request_parts.next().ok_or("Missing path")?.to_owned();
    let upstream = match broker_upstream_url(server, &path) {
        Ok(url) => url,
        Err(_) => {
            return write_broker_error(
                &mut stream,
                403,
                "The broker only exposes normalized authenticated v1 API operations",
            )
            .await;
        }
    };
    if !upstream.path().starts_with("/api/v1/") {
        return write_broker_error(
            &mut stream,
            403,
            "The broker only exposes authenticated v1 API operations",
        )
        .await;
    }
    let header_lines = lines.collect::<Vec<_>>();
    let content_length = header_lines
        .iter()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-length:")
                .map(str::trim)
                .and_then(|value| value.parse::<usize>().ok())
        })
        .unwrap_or(0);
    let content_type = header_lines
        .iter()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-type:")
                .map(str::trim)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "application/json".to_owned());
    let idempotency_key = header_lines.iter().find_map(|line| {
        line.to_ascii_lowercase()
            .strip_prefix("idempotency-key:")
            .map(str::trim)
            .map(str::to_owned)
    });
    let multipart = content_type.starts_with("multipart/form-data;");
    let raw_upload = broker_stream_path_allowed(&path);
    if multipart && (method != "POST" || !broker_multipart_path_allowed(&path)) {
        return write_broker_error(
            &mut stream,
            403,
            "Multipart requests are limited to document and product-image uploads",
        )
        .await;
    }
    if raw_upload && method != "POST" {
        return write_broker_error(&mut stream, 403, "Uploads require POST").await;
    }
    let streaming_upload = multipart || raw_upload;
    let request_limit = if streaming_upload {
        MAX_UPLOAD_BYTES as usize + 256 * 1024
    } else {
        1_000_000
    };
    if content_length > request_limit {
        return write_broker_error(&mut stream, 413, "Request too large").await;
    }
    let upstream_method = match Method::from_bytes(method.as_bytes()) {
        Ok(value) => value,
        Err(_) => {
            return write_broker_error(&mut stream, 400, "Invalid HTTP method").await;
        }
    };
    if streaming_upload {
        let initial_body = bytes[header_end..]
            .get(..content_length.min(bytes.len().saturating_sub(header_end)))
            .unwrap_or_default()
            .to_vec();
        let remaining = content_length.saturating_sub(initial_body.len());
        let (mut socket_reader, mut socket_writer) = tokio::io::split(stream);
        let (mut body_writer, body_reader) = tokio::io::duplex(64 * 1024);
        let mut feeder = tokio::spawn(async move {
            body_writer.write_all(&initial_body).await?;
            let mut remaining = remaining;
            let mut chunk = [0u8; 64 * 1024];
            while remaining > 0 {
                let maximum = remaining.min(chunk.len());
                let count = timeout(
                    Duration::from_secs(10),
                    socket_reader.read(&mut chunk[..maximum]),
                )
                .await
                .map_err(|_| "Timed out reading broker request body")??;
                if count == 0 {
                    return Err::<(), Box<dyn std::error::Error + Send + Sync>>(
                        "Incomplete request body".into(),
                    );
                }
                body_writer.write_all(&chunk[..count]).await?;
                remaining -= count;
            }
            body_writer.shutdown().await?;
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });
        let mut request = client
            .request(upstream_method, upstream)
            .bearer_auth(token)
            .header("content-type", content_type)
            .header("content-length", content_length)
            .body(reqwest::Body::wrap_stream(
                tokio_util::io::ReaderStream::new(body_reader),
            ));
        if let Some(value) = idempotency_key {
            request = request.header("idempotency-key", value);
        }
        let mut upstream_request = Box::pin(request.send());
        let response = tokio::select! {
            result = &mut upstream_request => {
                feeder.abort();
                result
            }
            feed_result = &mut feeder => {
                match feed_result {
                    Ok(Ok(())) => upstream_request.await,
                    Ok(Err(_)) | Err(_) => {
                        return write_broker_error(
                            &mut socket_writer,
                            400,
                            "Incomplete or timed-out request body",
                        )
                        .await;
                    }
                }
            }
        };
        return match response {
            Ok(response) => write_broker_response(&mut socket_writer, response).await,
            Err(_) => write_broker_error(&mut socket_writer, 502, "Upstream request failed").await,
        };
    }
    while bytes.len() < header_end + content_length {
        let count = timeout(Duration::from_secs(10), stream.read(&mut chunk))
            .await
            .map_err(|_| "Timed out reading broker request body")??;
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
    if bytes.len() < header_end + content_length {
        return write_broker_error(&mut stream, 400, "Incomplete request body").await;
    }
    let (mut socket_reader, mut socket_writer) = tokio::io::split(stream);
    let mut request = client
        .request(upstream_method, upstream)
        .bearer_auth(token)
        .header("content-type", content_type)
        .body(bytes[header_end..header_end + content_length].to_vec());
    if let Some(value) = idempotency_key {
        request = request.header("idempotency-key", value);
    }
    let mut upstream_request = Box::pin(request.send());
    let mut unexpected = [0u8; 1];
    let response = tokio::select! {
        result = &mut upstream_request => result?,
        read = socket_reader.read(&mut unexpected) => {
            match read {
                Ok(0) => return Ok(()),
                Ok(_) => {
                    return write_broker_error(
                        &mut socket_writer,
                        400,
                        "Unexpected bytes after request body",
                    )
                    .await;
                }
                Err(error) => return Err(error.into()),
            }
        }
    };
    write_broker_response(&mut socket_writer, response).await
}

pub(crate) fn broker_multipart_path_allowed(path: &str) -> bool {
    if path == "/api/v1/documents" {
        return true;
    }
    let segments = path.split('/').collect::<Vec<_>>();
    segments.len() == 6
        && segments[..4] == ["", "api", "v1", "products"]
        && segments[5] == "images"
        && segments[4].parse::<uuid::Uuid>().is_ok()
}

pub(crate) fn broker_stream_path_allowed(path: &str) -> bool {
    let path = path.split('?').next().unwrap_or(path);
    if path == "/api/v1/documents/upload" {
        return true;
    }
    let segments = path.split('/').collect::<Vec<_>>();
    segments.len() == 7
        && segments[..4] == ["", "api", "v1", "products"]
        && segments[5..] == ["images", "upload"]
        && segments[4].parse::<uuid::Uuid>().is_ok()
}

pub(crate) fn broker_upstream_url(server: &str, path: &str) -> Result<Url> {
    let lower = path.to_ascii_lowercase();
    if !path.starts_with("/api/v1/")
        || lower.contains("%2e")
        || lower.contains("%2f")
        || lower.contains("%5c")
        || path.split('/').any(|segment| matches!(segment, "." | ".."))
    {
        return Err("The broker only exposes normalized v1 API paths.".into());
    }
    let base = Url::parse(&origin(server)?)?;
    let target = base.join(path)?;
    if target.origin() != base.origin() || !target.path().starts_with("/api/v1/") {
        return Err("The broker only exposes same-origin v1 API paths.".into());
    }
    Ok(target)
}

async fn write_broker_error<W>(stream: &mut W, status: u16, message: &str) -> Result<()>
where
    W: tokio::io::AsyncWrite + Unpin,
{
    let body = serde_json::to_vec(&json!({"error": message}))?;
    let header = format!(
        "HTTP/1.1 {status} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    stream.write_all(&body).await?;
    Ok(())
}

async fn write_broker_response<W>(stream: &mut W, mut response: reqwest::Response) -> Result<()>
where
    W: tokio::io::AsyncWrite + Unpin,
{
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return write_broker_error(stream, 502, "Upstream response too large").await;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return write_broker_error(stream, 502, "Upstream response too large").await;
        }
        body.extend_from_slice(&chunk);
    }
    let reason = status.canonical_reason().unwrap_or("Response");
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        status.as_u16(),
        reason,
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    stream.write_all(&body).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        os::unix::fs::PermissionsExt,
        time::{SystemTime, UNIX_EPOCH},
    };
    use tokio::{net::TcpListener, sync::oneshot};

    fn temporary_socket(name: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        std::env::temp_dir()
            .join(format!(
                "domino-broker-{name}-{}-{nonce}",
                std::process::id()
            ))
            .join("broker.sock")
    }

    async fn upstream_once(
        status: u16,
        body: &'static str,
        delay: Option<Duration>,
    ) -> (String, oneshot::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind upstream");
        let address = listener.local_addr().expect("upstream address");
        let (request_tx, request_rx) = oneshot::channel();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept upstream");
            let mut request = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let count = stream.read(&mut chunk).await.expect("read request");
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = request_tx.send(String::from_utf8_lossy(&request).into_owned());
            if let Some(delay) = delay {
                tokio::time::sleep(delay).await;
            }
            let reason = if status == 200 {
                "OK"
            } else {
                "Service Unavailable"
            };
            let response = format!(
                "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
        (format!("http://{address}"), request_rx)
    }

    async fn broker_exchange(server: &str, token: &str, request: &str) -> String {
        let (mut client, broker) = UnixStream::pair().expect("Unix stream pair");
        let server = server.to_owned();
        let token = token.to_owned();
        let task = tokio::spawn(async move {
            serve_broker_request(broker, &server, &token, hardened_client().unwrap()).await
        });
        client
            .write_all(request.as_bytes())
            .await
            .expect("write broker request");
        let mut response = Vec::new();
        timeout(Duration::from_secs(2), client.read_to_end(&mut response))
            .await
            .expect("broker response timeout")
            .expect("read broker response");
        task.await.expect("broker task").expect("broker exchange");
        String::from_utf8(response).expect("UTF-8 broker response")
    }

    #[tokio::test]
    async fn broker_socket_has_group_only_access_and_refuses_regular_files() {
        let socket = temporary_socket("permissions");
        let listener = bind_broker_listener(&socket).await.expect("bind broker");
        let mode = std::fs::metadata(&socket)
            .expect("socket metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o660);
        drop(listener);
        std::fs::remove_file(&socket).expect("remove socket");

        std::fs::write(&socket, b"not a socket").expect("create collision");
        assert!(bind_broker_listener(&socket).await.is_err());
        std::fs::remove_file(&socket).expect("remove collision");
        std::fs::remove_dir(socket.parent().expect("socket parent")).expect("remove temp dir");
    }

    #[tokio::test]
    async fn broker_forwards_credentials_upstream_without_disclosing_them_downstream() {
        let token = "secret-bearer-value";
        let (server, upstream_request) = upstream_once(200, r#"{"actor":{"id":"a1"}}"#, None).await;
        let response = broker_exchange(
            &server,
            token,
            "GET /api/v1/me HTTP/1.1\r\nHost: domino\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        let upstream_request = upstream_request.await.expect("captured upstream request");

        assert!(
            upstream_request
                .to_ascii_lowercase()
                .contains("authorization: bearer secret-bearer-value")
        );
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#"{"actor":{"id":"a1"}}"#));
        assert!(!response.contains(token));
    }

    #[tokio::test]
    async fn broker_preserves_upstream_error_status_and_body() {
        let (server, _) = upstream_once(503, r#"{"error":"maintenance"}"#, None).await;
        let response = broker_exchange(
            &server,
            "secret",
            "GET /api/v1/products HTTP/1.1\r\nHost: domino\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;

        assert!(response.starts_with("HTTP/1.1 503"));
        assert!(response.contains(r#"{"error":"maintenance"}"#));
    }

    #[tokio::test]
    async fn dropping_the_agent_socket_cancels_an_in_flight_upstream_request() {
        let (server, upstream_request) =
            upstream_once(200, r#"{"ok":true}"#, Some(Duration::from_secs(30))).await;
        let (mut client, broker) = UnixStream::pair().expect("Unix stream pair");
        let task = tokio::spawn(async move {
            serve_broker_request(broker, &server, "secret", hardened_client().unwrap()).await
        });
        client
            .write_all(
                b"GET /api/v1/products HTTP/1.1\r\nHost: domino\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .await
            .expect("write broker request");
        upstream_request.await.expect("upstream request started");
        drop(client);

        timeout(Duration::from_secs(2), task)
            .await
            .expect("broker did not cancel promptly")
            .expect("broker task panicked")
            .expect("broker cancellation failed");
    }
}
