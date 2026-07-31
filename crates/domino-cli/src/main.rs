use clap::{Args, Parser, Subcommand};
use reqwest::{Client, Method, Url, multipart, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    env,
    fs::{DirBuilder, Permissions},
    os::unix::fs::DirBuilderExt,
    os::unix::fs::{FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::Semaphore,
    time::timeout,
};
use url::Host;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;
const BROKER_MAX_CONNECTIONS: usize = 32;
const BROKER_HEADER_BYTES: usize = 16 * 1024;

#[derive(Parser)]
#[command(
    name = "domino",
    version,
    about = "Search and manage a Domino household warranty library"
)]
struct Cli {
    #[arg(long, env = "DOMINO_SERVER")]
    server: Option<String>,
    #[arg(long, env = "DOMINO_BROKER_SOCKET")]
    socket: Option<PathBuf>,
    #[arg(long, default_value_os_t = default_credential_file())]
    credential_file: PathBuf,
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    Search(SearchArgs),
    Product {
        #[command(subcommand)]
        command: ProductCommand,
    },
    Warranty {
        #[command(subcommand)]
        command: WarrantyCommand,
    },
    Claim {
        #[command(subcommand)]
        command: ClaimCommand,
    },
    Note {
        #[command(subcommand)]
        command: NoteCommand,
    },
    Document {
        #[command(subcommand)]
        command: DocumentCommand,
    },
    Record {
        #[command(subcommand)]
        command: RecordCommand,
    },
    Whoami,
    Broker {
        #[command(subcommand)]
        command: BrokerCommand,
    },
}

#[derive(Subcommand)]
enum AuthCommand {
    Login {
        #[arg(long, default_value = "Domino CLI")]
        name: String,
        #[arg(long)]
        no_open: bool,
    },
}

#[derive(Args)]
struct SearchArgs {
    query: Option<String>,
    #[arg(long)]
    coverage: Option<String>,
    #[arg(long)]
    has_claim: bool,
    #[arg(long)]
    purchased_after: Option<String>,
    #[arg(long)]
    purchased_before: Option<String>,
    #[arg(long)]
    expires_after: Option<String>,
    #[arg(long)]
    expires_before: Option<String>,
    #[arg(long)]
    include_archived: bool,
}

#[derive(Subcommand)]
enum ProductCommand {
    Get {
        id: String,
    },
    Create {
        name: String,
        #[arg(long)]
        brand: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        serial: Vec<String>,
        #[arg(long)]
        retailer: Option<String>,
        #[arg(long)]
        order_number: Option<String>,
        #[arg(long)]
        purchased_at: Option<String>,
        #[arg(long)]
        warranty_ends_at: Option<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        brand: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        serial: Vec<String>,
        #[arg(long)]
        retailer: Option<String>,
        #[arg(long)]
        order_number: Option<String>,
        #[arg(long)]
        purchased_at: Option<String>,
    },
    Archive {
        id: String,
    },
    Restore {
        id: String,
    },
}

#[derive(Subcommand)]
enum WarrantyCommand {
    Add {
        product_id: String,
        #[arg(long)]
        provider: Option<String>,
        #[arg(long)]
        starts_at: Option<String>,
        #[arg(long)]
        ends_at: Option<String>,
        #[arg(long)]
        lifetime: bool,
        #[arg(long)]
        claim_url: Option<String>,
        #[arg(long)]
        claim_phone: Option<String>,
        #[arg(long)]
        claim_email: Option<String>,
        #[arg(long)]
        eligibility_notes: Option<String>,
        #[arg(long)]
        claim_deadline: Option<String>,
        #[arg(long = "instruction")]
        instructions: Vec<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        provider: Option<String>,
        #[arg(long)]
        ends_at: Option<String>,
        #[arg(long)]
        lifetime: Option<bool>,
        #[arg(long)]
        claim_url: Option<String>,
        #[arg(long)]
        claim_phone: Option<String>,
        #[arg(long)]
        claim_email: Option<String>,
        #[arg(long)]
        eligibility_notes: Option<String>,
        #[arg(long)]
        claim_deadline: Option<String>,
        #[arg(long = "instruction")]
        instructions: Vec<String>,
    },
    Delete {
        id: String,
    },
}

#[derive(Subcommand)]
enum ClaimCommand {
    List,
    Get {
        id: String,
    },
    Create {
        product_id: String,
        #[arg(long)]
        issue: String,
        #[arg(long)]
        next_action: Option<String>,
        #[arg(long)]
        noticed_at: Option<String>,
        #[arg(long)]
        preferred_resolution: Option<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        next_action: Option<String>,
        #[arg(long)]
        resolution: Option<String>,
        #[arg(long)]
        explanation: Option<String>,
    },
}

#[derive(Subcommand)]
enum NoteCommand {
    List { product_id: String },
    Add { product_id: String, body: String },
    ListClaim { claim_id: String },
    AddClaim { claim_id: String, body: String },
}

#[derive(Subcommand)]
enum DocumentCommand {
    List {
        #[arg(long)]
        trash: bool,
    },
    Upload {
        path: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        product_id: Option<String>,
        #[arg(long)]
        claim_id: Option<String>,
        #[arg(long, default_value = "other")]
        kind: String,
        #[arg(long)]
        backend: Option<String>,
    },
    LinkPaperless {
        paperless_id: u64,
        #[arg(long)]
        product_id: Option<String>,
        #[arg(long)]
        claim_id: Option<String>,
        #[arg(long, default_value = "other")]
        kind: String,
    },
    Trash {
        id: String,
    },
    Restore {
        id: String,
    },
}

#[derive(Subcommand)]
enum RecordCommand {
    Validate {
        #[arg(long)]
        file: PathBuf,
    },
    Create {
        #[arg(long)]
        file: PathBuf,
    },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordManifest {
    #[serde(default)]
    submission_id: Option<String>,
    product: Value,
    #[serde(default)]
    warranties: Vec<Value>,
    #[serde(default)]
    notes: Vec<String>,
    #[serde(default)]
    sources: Vec<Value>,
    #[serde(default)]
    allow_duplicate_of: Option<String>,
    #[serde(default)]
    image: Option<RecordImage>,
    #[serde(default)]
    documents: Vec<RecordDocument>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordImage {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    path: Option<PathBuf>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordDocument {
    #[serde(default)]
    path: Option<PathBuf>,
    #[serde(default)]
    paperless_document_id: Option<u64>,
    #[serde(default = "default_document_kind")]
    kind: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    backend: Option<String>,
}

fn default_document_kind() -> String {
    "other".to_owned()
}

#[derive(Subcommand)]
enum BrokerCommand {
    Serve {
        #[arg(long, default_value_os_t = default_socket())]
        listen: PathBuf,
        #[arg(long)]
        credential_file: Option<PathBuf>,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    server: String,
    access_token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStart {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

fn config_root() -> PathBuf {
    env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".config")
        })
        .join("domino")
}

fn default_credential_file() -> PathBuf {
    config_root().join("session.json")
}

fn default_socket() -> PathBuf {
    env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("domino")
        .join("broker.sock")
}

fn origin(value: &str) -> Result<String> {
    origin_with_policy(
        value,
        env::var("DOMINO_ALLOW_INSECURE_HTTP").as_deref() == Ok("true"),
    )
}

fn origin_with_policy(value: &str, allow_insecure_http: bool) -> Result<String> {
    let url = Url::parse(value)?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("server must be an HTTP(S) origin".into());
    }
    if url.scheme() == "http" && !url.host().is_some_and(is_loopback_host) && !allow_insecure_http {
        return Err(
            "remote Domino servers must use HTTPS (set DOMINO_ALLOW_INSECURE_HTTP=true only for a trusted internal network)"
                .into(),
        );
    }
    Ok(url.origin().ascii_serialization())
}

fn is_loopback_host(host: Host<&str>) -> bool {
    match host {
        Host::Domain(host) => host.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(address) => address.is_loopback(),
        Host::Ipv6(address) => address.is_loopback(),
    }
}

fn hardened_client() -> Result<Client> {
    Ok(Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()?)
}

fn prepare_private_directory(path: &Path, maximum_mode: u32) -> Result<()> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("{} must be a directory.", path.display()).into());
            }
            let effective_uid = unsafe { libc::geteuid() };
            if effective_uid != 0 && metadata.uid() != effective_uid {
                return Err(format!(
                    "{} is not owned by the current OS identity.",
                    path.display()
                )
                .into());
            }
            if metadata.permissions().mode() & !maximum_mode & 0o777 != 0 {
                return Err(format!("{} has unsafe permissions.", path.display()).into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            DirBuilder::new()
                .recursive(true)
                .mode(maximum_mode)
                .create(path)?;
        }
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

async fn load_session(path: &Path) -> Result<Session> {
    let mut options = std::fs::OpenOptions::new();
    options
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    let file = options.open(path).map_err(|_| {
        format!(
            "No safe Domino credential at {}. Run \"domino auth login\" first.",
            path.display()
        )
    })?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(format!("Credential {} must be a regular file.", path.display()).into());
    }
    if metadata.len() > 64 * 1024 {
        return Err(format!("Credential {} is unexpectedly large.", path.display()).into());
    }
    if metadata.permissions().mode() & 0o077 != 0 {
        return Err(format!(
            "Credential {} must not be accessible by group or other users.",
            path.display()
        )
        .into());
    }
    // A dedicated broker must not accidentally consume a credential owned by a
    // different OS identity, even if an ACL would otherwise make it readable.
    let effective_uid = unsafe { libc::geteuid() };
    if effective_uid != 0 && metadata.uid() != effective_uid {
        return Err(format!(
            "Credential {} is not owned by the current OS identity.",
            path.display()
        )
        .into());
    }
    let mut file = tokio::fs::File::from_std(file);
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

async fn save_session(path: &Path, session: &Session) -> Result<()> {
    let parent = path
        .parent()
        .ok_or("Credential path requires a parent directory")?;
    prepare_private_directory(parent, 0o700)?;
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        let effective_uid = unsafe { libc::geteuid() };
        if !metadata.is_file()
            || metadata.permissions().mode() & 0o077 != 0
            || (effective_uid != 0 && metadata.uid() != effective_uid)
        {
            return Err(
                format!("Refusing to replace unsafe credential {}.", path.display()).into(),
            );
        }
    }
    let bytes = serde_json::to_vec_pretty(session)?;
    let temporary = parent.join(format!(
        ".session-{}-{}.tmp",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    ));
    let mut options = std::fs::OpenOptions::new();
    options
        .create_new(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    let mut file = tokio::fs::File::from_std(options.open(&temporary)?);
    file.write_all(&bytes).await?;
    file.write_all(b"\n").await?;
    file.sync_all().await?;
    drop(file);
    fs::rename(&temporary, path).await?;
    std::fs::File::open(parent)?.sync_all()?;
    Ok(())
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

async fn response_value(response: reqwest::Response) -> Result<Value> {
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
        return Err(format!("Domino returned {}: {}", status, value).into());
    }
    Ok(value)
}

async fn invoke(cli: &Cli, method: Method, path: &str, body: Option<Value>) -> Result<Value> {
    let body = body.map(compact_json);
    if let Some(socket) = &cli.socket {
        return socket_request(socket, method.as_str(), path, body.as_ref()).await;
    }
    let session = load_session(&cli.credential_file).await?;
    direct_request(&session, cli.server.as_deref(), method, path, body).await
}

async fn invoke_idempotent(
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

fn compact_json(mut value: Value) -> Value {
    match &mut value {
        Value::Object(map) => {
            map.retain(|_, child| !child.is_null());
            for child in map.values_mut() {
                *child = compact_json(std::mem::take(child));
            }
        }
        Value::Array(items) => {
            for child in items {
                *child = compact_json(std::mem::take(child));
            }
        }
        _ => {}
    }
    value
}

fn print_value(value: &Value, json_output: bool) {
    if json_output {
        println!(
            "{}",
            serde_json::to_string_pretty(value).expect("serializable response")
        );
    } else if let Some(text) = value.as_str() {
        println!("{text}");
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(value).expect("serializable response")
        );
    }
}

fn open_browser(url: &str) {
    let (program, arguments): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![url])
    } else {
        ("xdg-open", vec![url])
    };
    let _ = std::process::Command::new(program)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

#[tokio::main]
async fn main() {
    if let Err(cause) = run(Cli::parse()).await {
        eprintln!("{cause}");
        std::process::exit(1);
    }
}

async fn run(cli: Cli) -> Result<()> {
    let mut incomplete_record = false;
    let result = match &cli.command {
        Command::Auth { command } => return run_auth(&cli, command).await,
        Command::Search(args) => {
            let mut pairs: Vec<(&str, &str)> = Vec::new();
            if let Some(value) = args.query.as_deref() {
                pairs.push(("q", value));
            }
            if let Some(value) = args.coverage.as_deref() {
                pairs.push(("coverage", value));
            }
            if args.has_claim {
                pairs.push(("hasClaim", "true"));
            }
            if let Some(value) = args.purchased_after.as_deref() {
                pairs.push(("purchasedAfter", value));
            }
            if let Some(value) = args.purchased_before.as_deref() {
                pairs.push(("purchasedBefore", value));
            }
            if let Some(value) = args.expires_after.as_deref() {
                pairs.push(("expiresAfter", value));
            }
            if let Some(value) = args.expires_before.as_deref() {
                pairs.push(("expiresBefore", value));
            }
            if args.include_archived {
                pairs.push(("includeArchived", "true"));
            }
            let query = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(pairs)
                .finish();
            invoke(
                &cli,
                Method::GET,
                &format!("/api/v1/products?{query}"),
                None,
            )
            .await?
        }
        Command::Product { command } => run_product(&cli, command).await?,
        Command::Warranty { command } => run_warranty(&cli, command).await?,
        Command::Claim { command } => run_claim(&cli, command).await?,
        Command::Note { command } => run_note(&cli, command).await?,
        Command::Document { command } => run_document(&cli, command).await?,
        Command::Record { command } => {
            let result = run_record(&cli, command).await?;
            incomplete_record = result.get("complete").and_then(Value::as_bool) == Some(false);
            result
        }
        Command::Whoami => invoke(&cli, Method::GET, "/api/v1/me", None).await?,
        Command::Broker { command } => return run_broker(&cli, command).await,
    };
    print_value(&result, cli.json);
    if incomplete_record {
        return Err(
            "Product metadata was saved, but an attachment failed. Retry the same manifest.".into(),
        );
    }
    Ok(())
}

async fn run_auth(cli: &Cli, command: &AuthCommand) -> Result<()> {
    match command {
        AuthCommand::Login { name, no_open } => {
            let server = origin(cli.server.as_deref().unwrap_or("http://127.0.0.1:3000"))?;
            let client = hardened_client()?;
            let response = client
                .post(Url::parse(&server)?.join("/api/device/start")?)
                .json(&json!({ "name": name }))
                .send()
                .await?;
            let flow: DeviceStart = response.error_for_status()?.json().await?;
            println!("Open {}", flow.verification_uri);
            println!("Confirm code: {}", flow.user_code);
            if !no_open {
                open_browser(&flow.verification_uri);
            }
            let deadline = Instant::now() + Duration::from_secs(flow.expires_in.clamp(30, 15 * 60));
            let polling_interval = Duration::from_secs(flow.interval.clamp(1, 10));
            while Instant::now() < deadline {
                tokio::time::sleep(polling_interval).await;
                let response = client
                    .post(Url::parse(&server)?.join("/api/device/token")?)
                    .json(&json!({ "deviceCode": flow.device_code }))
                    .send()
                    .await?;
                if response.status().as_u16() == 428 {
                    continue;
                }
                let status = response.status();
                let value: Value = response.json().await?;
                let token = value.get("accessToken").and_then(Value::as_str);
                if !status.is_success() || token.is_none() {
                    return Err(value
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("Authorization failed")
                        .into());
                }
                save_session(
                    &cli.credential_file,
                    &Session {
                        server,
                        access_token: token.expect("checked").to_owned(),
                    },
                )
                .await?;
                println!(
                    "Authorized. Credential saved with mode 0600 at {}.",
                    cli.credential_file.display()
                );
                return Ok(());
            }
            Err("Authorization expired before it was approved.".into())
        }
    }
}

async fn run_product(cli: &Cli, command: &ProductCommand) -> Result<Value> {
    match command {
        ProductCommand::Get { id } => {
            invoke(
                cli,
                Method::GET,
                &format!("/api/v1/products/{}", encode(id)),
                None,
            )
            .await
        }
        ProductCommand::Create {
            name,
            brand,
            model,
            category,
            serial,
            retailer,
            order_number,
            purchased_at,
            warranty_ends_at,
        } => {
            invoke(
                cli,
                Method::POST,
                "/api/v1/products",
                Some(json!({
                    "name": name, "brand": brand, "model": model, "category": category,
                    "serialNumbers": serial, "retailer": retailer, "orderNumber": order_number,
                    "purchaseDate": purchased_at,
                    "warranty": warranty_ends_at.as_ref().map(|ends| json!({"endsAt": ends}))
                })),
            )
            .await
        }
        ProductCommand::Update {
            id,
            name,
            brand,
            model,
            category,
            serial,
            retailer,
            order_number,
            purchased_at,
        } => {
            invoke(
                cli,
                Method::PATCH,
                &format!("/api/v1/products/{}", encode(id)),
                Some(json!({
                    "name": name, "brand": brand, "model": model, "category": category,
                    "serialNumbers": if serial.is_empty() { None } else { Some(serial) },
                    "retailer": retailer, "orderNumber": order_number, "purchaseDate": purchased_at
                })),
            )
            .await
        }
        ProductCommand::Archive { id } => {
            invoke(
                cli,
                Method::DELETE,
                &format!("/api/v1/products/{}", encode(id)),
                None,
            )
            .await
        }
        ProductCommand::Restore { id } => {
            invoke(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/restore", encode(id)),
                None,
            )
            .await
        }
    }
}

async fn run_warranty(cli: &Cli, command: &WarrantyCommand) -> Result<Value> {
    match command {
        WarrantyCommand::Add {
            product_id,
            provider,
            starts_at,
            ends_at,
            lifetime,
            claim_url,
            claim_phone,
            claim_email,
            eligibility_notes,
            claim_deadline,
            instructions,
        } => {
            invoke(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/warranties", encode(product_id)),
                Some(json!({
                    "provider": provider, "startsAt": starts_at, "endsAt": ends_at,
                    "lifetime": lifetime, "claimUrl": claim_url, "claimPhone": claim_phone,
                    "claimEmail": claim_email, "eligibilityNotes": eligibility_notes,
                    "claimDeadline": claim_deadline,
                    "claimInstructions": instructions.iter().map(|title| json!({
                        "title": title, "required": true
                    })).collect::<Vec<_>>()
                })),
            )
            .await
        }
        WarrantyCommand::Update {
            id,
            provider,
            ends_at,
            lifetime,
            claim_url,
            claim_phone,
            claim_email,
            eligibility_notes,
            claim_deadline,
            instructions,
        } => {
            invoke(
                cli,
                Method::PATCH,
                &format!("/api/v1/warranties/{}", encode(id)),
                Some(json!({
                    "provider": provider, "endsAt": ends_at, "lifetime": lifetime,
                    "claimUrl": claim_url, "claimPhone": claim_phone,
                    "claimEmail": claim_email, "eligibilityNotes": eligibility_notes,
                    "claimDeadline": claim_deadline,
                    "claimInstructions": if instructions.is_empty() {
                        None
                    } else {
                        Some(instructions.iter().map(|title| json!({
                            "title": title, "required": true
                        })).collect::<Vec<_>>())
                    }
                })),
            )
            .await
        }
        WarrantyCommand::Delete { id } => {
            invoke(
                cli,
                Method::DELETE,
                &format!("/api/v1/warranties/{}", encode(id)),
                None,
            )
            .await
        }
    }
}

async fn run_claim(cli: &Cli, command: &ClaimCommand) -> Result<Value> {
    match command {
        ClaimCommand::List => invoke(cli, Method::GET, "/api/v1/claims", None).await,
        ClaimCommand::Get { id } =>
            invoke(cli, Method::GET, &format!("/api/v1/claims/{}", encode(id)), None).await,
        ClaimCommand::Create {
            product_id,
            issue,
            next_action,
            noticed_at,
            preferred_resolution,
        } =>
            invoke(cli, Method::POST, &format!("/api/v1/products/{}/claims", encode(product_id)),
                Some(json!({
                    "issue": issue, "nextAction": next_action, "noticedAt": noticed_at,
                    "preferredResolution": preferred_resolution
                }))).await,
        ClaimCommand::Update { id, status, next_action, resolution, explanation } =>
            invoke(cli, Method::PATCH, &format!("/api/v1/claims/{}", encode(id)),
                Some(json!({"status": status, "nextAction": next_action, "resolution": resolution, "explanation": explanation}))).await,
    }
}

async fn run_note(cli: &Cli, command: &NoteCommand) -> Result<Value> {
    match command {
        NoteCommand::List { product_id } => {
            invoke(
                cli,
                Method::GET,
                &format!("/api/v1/products/{}/notes", encode(product_id)),
                None,
            )
            .await
        }
        NoteCommand::Add { product_id, body } => {
            invoke(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/notes", encode(product_id)),
                Some(json!({"body": body})),
            )
            .await
        }
        NoteCommand::ListClaim { claim_id } => {
            invoke(
                cli,
                Method::GET,
                &format!("/api/v1/claims/{}/notes", encode(claim_id)),
                None,
            )
            .await
        }
        NoteCommand::AddClaim { claim_id, body } => {
            invoke(
                cli,
                Method::POST,
                &format!("/api/v1/claims/{}/notes", encode(claim_id)),
                Some(json!({"body": body})),
            )
            .await
        }
    }
}

async fn run_document(cli: &Cli, command: &DocumentCommand) -> Result<Value> {
    match command {
        DocumentCommand::List { trash } => {
            invoke(
                cli,
                Method::GET,
                &format!("/api/v1/documents?trash={trash}"),
                None,
            )
            .await
        }
        DocumentCommand::LinkPaperless {
            paperless_id,
            product_id,
            claim_id,
            kind,
        } => {
            invoke(
                cli,
                Method::POST,
                "/api/v1/documents/link-paperless",
                Some(json!({
                    "paperlessDocumentId": paperless_id, "productId": product_id,
                    "claimId": claim_id, "kind": kind
                })),
            )
            .await
        }
        DocumentCommand::Upload {
            path,
            name,
            product_id,
            claim_id,
            kind,
            backend,
        } => {
            let metadata = fs::metadata(path).await?;
            if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_UPLOAD_BYTES {
                return Err("Attachments must be regular files between 1 byte and 50 MiB.".into());
            }
            let bytes = fs::read(path).await?;
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("attachment")
                .to_owned();
            if let Some(socket) = &cli.socket {
                let mut fields = vec![("kind", kind.clone())];
                if let Some(value) = product_id {
                    fields.push(("productId", value.clone()));
                }
                if let Some(value) = claim_id {
                    fields.push(("claimId", value.clone()));
                }
                if let Some(value) = backend {
                    fields.push(("backend", value.clone()));
                }
                if let Some(value) = name {
                    fields.push(("name", value.clone()));
                }
                return socket_multipart_request(socket, "/api/v1/documents", path, &fields, None)
                    .await;
            }
            let session = load_session(&cli.credential_file).await?;
            let session_server = origin(&session.server)?;
            if let Some(requested) = cli.server.as_deref()
                && origin(requested)? != session_server
            {
                return Err("Credential/server origin mismatch.".into());
            }
            let mut form = multipart::Form::new()
                .part("file", multipart::Part::bytes(bytes).file_name(file_name))
                .text("kind", kind.clone());
            if let Some(value) = name {
                form = form.text("name", value.clone());
            }
            if let Some(value) = product_id {
                form = form.text("productId", value.clone());
            }
            if let Some(value) = claim_id {
                form = form.text("claimId", value.clone());
            }
            if let Some(value) = backend {
                form = form.text("backend", value.clone());
            }
            let response = hardened_client()?
                .post(Url::parse(&session_server)?.join("/api/v1/documents")?)
                .bearer_auth(&session.access_token)
                .multipart(form)
                .send()
                .await?;
            response_value(response).await
        }
        DocumentCommand::Trash { id } => {
            invoke(
                cli,
                Method::DELETE,
                &format!("/api/v1/documents/{}", encode(id)),
                None,
            )
            .await
        }
        DocumentCommand::Restore { id } => {
            invoke(
                cli,
                Method::POST,
                &format!("/api/v1/documents/{}/restore", encode(id)),
                None,
            )
            .await
        }
    }
}

async fn read_record_manifest(file: &Path) -> Result<(RecordManifest, PathBuf)> {
    let (bytes, base) = if file == Path::new("-") {
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut std::io::stdin(), &mut bytes)?;
        (bytes, env::current_dir()?)
    } else {
        let bytes = fs::read(file).await?;
        let base = file
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        (bytes, std::fs::canonicalize(base)?)
    };
    let manifest: RecordManifest = serde_json::from_slice(&bytes)?;
    if !manifest.product.is_object() {
        return Err("Record manifest product must be a JSON object.".into());
    }
    Ok((manifest, base))
}

fn record_metadata(manifest: &RecordManifest) -> Value {
    compact_json(json!({
        "product": manifest.product,
        "warranties": manifest.warranties,
        "notes": manifest.notes,
        "sources": manifest.sources,
        "allowDuplicateOf": manifest.allow_duplicate_of
    }))
}

fn stable_record_key(manifest: &RecordManifest) -> Result<String> {
    if let Some(value) = manifest.submission_id.as_deref() {
        if value.len() < 8 || value.len() > 200 {
            return Err("submissionId must contain between 8 and 200 characters.".into());
        }
        if value.chars().any(char::is_control) {
            return Err("submissionId cannot contain control characters.".into());
        }
        return Ok(value.to_owned());
    }
    let digest = Sha256::digest(serde_json::to_vec(manifest)?);
    Ok(format!(
        "manifest-{}",
        digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ))
}

async fn record_attachment_missing_permissions(
    cli: &Cli,
    manifest: &RecordManifest,
) -> Result<Vec<String>> {
    let identity = invoke(cli, Method::GET, "/api/v1/me", None).await?;
    let granted = identity
        .get("actor")
        .and_then(|actor| actor.get("permissions"))
        .and_then(Value::as_array)
        .ok_or("Domino identity response did not include permissions")?
        .iter()
        .filter_map(Value::as_str)
        .collect::<BTreeSet<_>>();
    if granted.contains("*") {
        return Ok(Vec::new());
    }
    let mut missing = BTreeSet::new();
    if manifest.image.is_some() && !granted.contains("images:attach") {
        missing.insert("images:attach");
    }
    if !manifest.documents.is_empty() && !granted.contains("documents:attach") {
        missing.insert("documents:attach");
    }
    if manifest
        .documents
        .iter()
        .any(|document| document.paperless_document_id.is_some())
        && !granted.contains("paperless:discover")
    {
        missing.insert("paperless:discover");
    }
    Ok(missing.into_iter().map(str::to_owned).collect())
}

fn merge_missing_permissions(result: &mut Value, additional: Vec<String>) {
    let Some(object) = result.as_object_mut() else {
        return;
    };
    let mut missing = object
        .get("missingPermissions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    missing.extend(additional);
    if !missing.is_empty() {
        object.insert("valid".to_owned(), Value::Bool(false));
    }
    object.insert(
        "missingPermissions".to_owned(),
        Value::Array(missing.into_iter().map(Value::String).collect()),
    );
}

fn resolve_manifest_path(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_owned()
    } else {
        base.join(path)
    }
}

async fn upload_product_image(
    cli: &Cli,
    product_id: &str,
    path: &Path,
    idempotency_key: &str,
) -> Result<Value> {
    if let Some(socket) = &cli.socket {
        return socket_multipart_request(
            socket,
            &format!("/api/v1/products/{}/images", encode(product_id)),
            path,
            &[],
            Some(idempotency_key),
        )
        .await;
    }
    let metadata = fs::metadata(path).await?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 10 * 1024 * 1024 {
        return Err("Product images must be regular files between 1 byte and 10 MiB.".into());
    }
    let session = load_session(&cli.credential_file).await?;
    let session_server = origin(&session.server)?;
    let bytes = fs::read(path).await?;
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("product-image")
        .to_owned();
    let part = multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(content_type_for_path(path))?;
    let response = hardened_client()?
        .post(
            Url::parse(&session_server)?
                .join(&format!("/api/v1/products/{}/images", encode(product_id)))?,
        )
        .bearer_auth(&session.access_token)
        .header("idempotency-key", idempotency_key)
        .multipart(multipart::Form::new().part("file", part))
        .send()
        .await?;
    response_value(response).await
}

async fn run_record(cli: &Cli, command: &RecordCommand) -> Result<Value> {
    let file = match command {
        RecordCommand::Validate { file } | RecordCommand::Create { file } => file,
    };
    let (manifest, base) = read_record_manifest(file).await?;
    let metadata = record_metadata(&manifest);
    if matches!(command, RecordCommand::Validate { .. }) {
        let mut result = invoke(
            cli,
            Method::POST,
            "/api/v1/product-records/validate",
            Some(metadata),
        )
        .await?;
        merge_missing_permissions(
            &mut result,
            record_attachment_missing_permissions(cli, &manifest).await?,
        );
        return Ok(result);
    }
    let missing_permissions = record_attachment_missing_permissions(cli, &manifest).await?;
    if !missing_permissions.is_empty() {
        return Err(format!(
            "Missing permissions for record attachments: {}",
            missing_permissions.join(", ")
        )
        .into());
    }
    let submission_key = stable_record_key(&manifest)?;
    let mut result = invoke_idempotent(
        cli,
        Method::POST,
        "/api/v1/product-records",
        Some(metadata),
        &submission_key,
    )
    .await?;
    let product_id = result
        .get("product")
        .and_then(|product| product.get("id"))
        .and_then(Value::as_str)
        .ok_or("Product-record response did not include a product id")?
        .to_owned();
    let mut components = Vec::new();

    if let Some(image) = &manifest.image {
        let component_key = format!("{submission_key}:image");
        let uploaded = if let Some(url) = image.url.as_deref() {
            invoke_idempotent(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/images/from-url", encode(&product_id)),
                Some(json!({"imageUrl": url})),
                &component_key,
            )
            .await
        } else if let Some(path) = image.path.as_deref() {
            upload_product_image(
                cli,
                &product_id,
                &resolve_manifest_path(&base, path),
                &component_key,
            )
            .await
        } else {
            Err("Record image requires url or path.".into())
        };
        components.push(match uploaded {
            Ok(value) => json!({"component": "image", "status": "complete", "result": value}),
            Err(cause) => {
                json!({"component": "image", "status": "failed", "error": cause.to_string()})
            }
        });
    }

    for (index, document) in manifest.documents.iter().enumerate() {
        let component = format!("document:{}", index + 1);
        let uploaded = if let Some(paperless_id) = document.paperless_document_id {
            invoke_idempotent(
                cli,
                Method::POST,
                "/api/v1/documents/link-paperless",
                Some(json!({
                    "paperlessDocumentId": paperless_id,
                    "productId": product_id,
                    "kind": document.kind
                })),
                &format!("{submission_key}:{component}"),
            )
            .await
        } else if let Some(path) = document.path.as_deref() {
            let resolved = resolve_manifest_path(&base, path);
            run_document(
                cli,
                &DocumentCommand::Upload {
                    path: resolved,
                    name: document.name.clone(),
                    product_id: Some(product_id.clone()),
                    claim_id: None,
                    kind: document.kind.clone(),
                    backend: document.backend.clone(),
                },
            )
            .await
        } else {
            Err("Record document requires path or paperlessDocumentId.".into())
        };
        components.push(match uploaded {
            Ok(value) => json!({"component": component, "status": "complete", "result": value}),
            Err(cause) => {
                json!({"component": component, "status": "failed", "error": cause.to_string()})
            }
        });
    }
    let complete = components
        .iter()
        .all(|item| item.get("status").and_then(Value::as_str) == Some("complete"));
    if let Some(object) = result.as_object_mut() {
        object.insert("components".to_owned(), Value::Array(components));
        object.insert("complete".to_owned(), Value::Bool(complete));
        object.insert("submissionId".to_owned(), Value::String(submission_key));
    }
    Ok(result)
}

fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

async fn socket_request(
    socket: &Path,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<Value> {
    socket_request_with_headers(socket, method, path, body, &[]).await
}

async fn socket_request_with_headers(
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
        return Err(format!("Domino broker returned {status}: {value}").into());
    }
    Ok(value)
}

async fn socket_multipart_request(
    socket: &Path,
    path: &str,
    file_path: &Path,
    fields: &[(&str, String)],
    idempotency_key: Option<&str>,
) -> Result<Value> {
    let metadata = fs::metadata(file_path).await?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_UPLOAD_BYTES {
        return Err("Attachments must be regular files between 1 byte and 50 MiB.".into());
    }
    let filename = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment")
        .replace(['\r', '\n', '"'], "_");
    let boundary = format!(
        "domino-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    );
    let mut preamble = Vec::with_capacity(4096);
    for (name, value) in fields {
        preamble.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            )
            .as_bytes(),
        );
    }
    preamble.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {}\r\n\r\n",
            content_type_for_path(file_path)
        )
        .as_bytes(),
    );
    let closing = format!("\r\n--{boundary}--\r\n").into_bytes();
    let content_length = preamble.len() as u64 + metadata.len() + closing.len() as u64;
    let mut stream = UnixStream::connect(socket).await?;
    let idempotency = idempotency_key
        .map(|value| format!("Idempotency-Key: {value}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: domino\r\nContent-Type: multipart/form-data; boundary={boundary}\r\n{idempotency}Content-Length: {}\r\nConnection: close\r\n\r\n",
        content_length
    );
    stream.write_all(request.as_bytes()).await?;
    stream.write_all(&preamble).await?;
    let mut file = fs::File::open(file_path).await?;
    let mut chunk = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        stream.write_all(&chunk[..count]).await?;
    }
    stream.write_all(&closing).await?;
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
        return Err(format!("Domino broker returned {status}: {value}").into());
    }
    Ok(value)
}

fn content_type_for_path(path: &Path) -> &'static str {
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

async fn run_broker(cli: &Cli, command: &BrokerCommand) -> Result<()> {
    match command {
        BrokerCommand::Serve {
            listen,
            credential_file,
        } => {
            let session =
                load_session(credential_file.as_deref().unwrap_or(&cli.credential_file)).await?;
            let parent = listen
                .parent()
                .ok_or("Broker socket requires a parent directory")?;
            prepare_private_directory(parent, 0o750)?;
            if let Ok(metadata) = fs::symlink_metadata(listen).await {
                if !metadata.file_type().is_socket() {
                    return Err(format!(
                        "Refusing to replace non-socket path {}.",
                        listen.display()
                    )
                    .into());
                }
                fs::remove_file(listen).await?;
            }
            let listener = UnixListener::bind(listen)?;
            fs::set_permissions(listen, Permissions::from_mode(0o660)).await?;
            println!(
                "Domino broker listening on {} with mode 0660.",
                listen.display()
            );
            println!("The bearer credential will never be returned through this socket.");
            let connections = Arc::new(Semaphore::new(BROKER_MAX_CONNECTIONS));
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
                        tokio::spawn(async move {
                            let _permit = permit;
                            let _ = serve_broker_request(stream, &server, &token).await;
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

async fn serve_broker_request(mut stream: UnixStream, server: &str, token: &str) -> Result<()> {
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
    if multipart && (method != "POST" || !broker_multipart_path_allowed(&path)) {
        return write_broker_error(
            &mut stream,
            403,
            "Multipart requests are limited to document and product-image uploads",
        )
        .await;
    }
    let request_limit = if multipart {
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
    if multipart {
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
        let mut request = hardened_client()?
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
    let mut request = hardened_client()?
        .request(upstream_method, upstream)
        .bearer_auth(token)
        .header("content-type", content_type)
        .body(bytes[header_end..header_end + content_length].to_vec());
    if let Some(value) = idempotency_key {
        request = request.header("idempotency-key", value);
    }
    let response = request.send().await?;
    write_broker_response(&mut stream, response).await
}

fn broker_multipart_path_allowed(path: &str) -> bool {
    if path == "/api/v1/documents" {
        return true;
    }
    let segments = path.split('/').collect::<Vec<_>>();
    segments.len() == 6
        && segments[..4] == ["", "api", "v1", "products"]
        && segments[5] == "images"
        && segments[4].parse::<uuid::Uuid>().is_ok()
}

fn broker_upstream_url(server: &str, path: &str) -> Result<Url> {
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
    use std::os::unix::fs::{PermissionsExt, symlink};

    #[test]
    fn origin_discards_paths_and_normalizes_default_ports() {
        assert_eq!(
            origin("https://domino.example.test:443/some/path").unwrap(),
            "https://domino.example.test"
        );
    }

    #[test]
    fn origin_rejects_remote_plaintext_http_by_default() {
        assert!(origin_with_policy("http://domino.example.test", false).is_err());
        assert!(origin_with_policy("http://127.0.0.1:3000", false).is_ok());
        assert!(origin_with_policy("http://127.0.0.2:3000", false).is_ok());
        assert!(origin_with_policy("http://[::1]:3000", false).is_ok());
        assert!(origin_with_policy("http://127.attacker.example", false).is_err());
    }

    #[test]
    fn broker_rejects_path_traversal_before_forwarding_credentials() {
        assert!(
            broker_upstream_url(
                "https://domino.example.test",
                "/api/v1/../../api/device/token"
            )
            .is_err()
        );
        assert!(
            broker_upstream_url(
                "https://domino.example.test",
                "/api/v1/%2e%2e/%2e%2e/api/device/token"
            )
            .is_err()
        );
        assert!(broker_upstream_url("https://domino.example.test", "/api/v1/products").is_ok());
    }

    #[test]
    fn compact_json_removes_absent_options_recursively() {
        assert_eq!(
            compact_json(json!({
                "name": "Mixer",
                "brand": null,
                "warranty": { "endsAt": null, "lifetime": true }
            })),
            json!({
                "name": "Mixer",
                "warranty": { "lifetime": true }
            })
        );
    }

    #[test]
    fn broker_only_allows_expected_multipart_destinations() {
        assert!(broker_multipart_path_allowed("/api/v1/documents"));
        assert!(broker_multipart_path_allowed(
            "/api/v1/products/8b49ae2f-ec4c-47c9-93ed-c366873c3a82/images"
        ));
        assert!(!broker_multipart_path_allowed(
            "/api/v1/products/not-a-uuid/images"
        ));
        assert!(!broker_multipart_path_allowed(
            "/api/v1/claims/8b49ae2f-ec4c-47c9-93ed-c366873c3a82/images"
        ));
    }

    #[test]
    fn record_key_is_stable_and_honors_an_explicit_submission_id() {
        let manifest: RecordManifest =
            serde_json::from_value(json!({"product": {"name": "Mixer"}})).unwrap();
        assert_eq!(
            stable_record_key(&manifest).unwrap(),
            stable_record_key(&manifest).unwrap()
        );

        let explicit: RecordManifest = serde_json::from_value(json!({
            "submissionId": "hermes-record-42",
            "product": {"name": "Mixer"}
        }))
        .unwrap();
        assert_eq!(stable_record_key(&explicit).unwrap(), "hermes-record-42");

        let unsafe_id: RecordManifest = serde_json::from_value(json!({
            "submissionId": "record-ok\r\nContent-Length: 0",
            "product": {"name": "Mixer"}
        }))
        .unwrap();
        assert!(stable_record_key(&unsafe_id).is_err());
    }

    #[test]
    fn attachment_permissions_merge_with_metadata_validation() {
        let mut result = json!({
            "valid": false,
            "missingPermissions": ["notes:write"]
        });
        merge_missing_permissions(
            &mut result,
            vec!["images:attach".to_owned(), "notes:write".to_owned()],
        );
        assert_eq!(
            result,
            json!({
                "valid": false,
                "missingPermissions": ["images:attach", "notes:write"]
            })
        );
    }

    #[tokio::test]
    async fn credential_loader_rejects_symlinks() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("domino-cli-test-{nonce}"));
        std::fs::create_dir(&root).unwrap();
        let target = root.join("session.json");
        let link = root.join("linked-session.json");
        std::fs::write(
            &target,
            serde_json::to_vec(&Session {
                server: "https://domino.example.test".to_owned(),
                access_token: "not-a-real-token".to_owned(),
            })
            .unwrap(),
        )
        .unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600)).unwrap();
        symlink(&target, &link).unwrap();

        assert!(load_session(&link).await.is_err());

        std::fs::remove_file(&link).unwrap();
        std::fs::remove_file(&target).unwrap();
        std::fs::remove_dir(&root).unwrap();
    }
}
