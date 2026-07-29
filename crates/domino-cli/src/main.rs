use clap::{Args, Parser, Subcommand};
use reqwest::{Client, Method, Url, multipart, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
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
        Command::Whoami => invoke(&cli, Method::GET, "/api/v1/me", None).await?,
        Command::Broker { command } => return run_broker(&cli, command).await,
    };
    print_value(&result, cli.json);
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
            product_id,
            claim_id,
            kind,
            backend,
        } => {
            if cli.socket.is_some() {
                return Err("Document upload is not exposed through the JSON broker. Link an existing Paperless document or use direct mode.".into());
            }
            let session = load_session(&cli.credential_file).await?;
            let session_server = origin(&session.server)?;
            if let Some(requested) = cli.server.as_deref()
                && origin(requested)? != session_server
            {
                return Err("Credential/server origin mismatch.".into());
            }
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
            let mut form = multipart::Form::new()
                .part("file", multipart::Part::bytes(bytes).file_name(file_name))
                .text("kind", kind.clone());
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

fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

async fn socket_request(
    socket: &Path,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<Value> {
    let payload = body
        .map(serde_json::to_vec)
        .transpose()?
        .unwrap_or_default();
    let mut stream = UnixStream::connect(socket).await?;
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: domino\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
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
    let content_length = lines
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-length:")
                .map(str::trim)
                .and_then(|value| value.parse::<usize>().ok())
        })
        .unwrap_or(0);
    if content_length > 1_000_000 {
        return write_broker_error(&mut stream, 413, "Request too large").await;
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
    let mut response = hardened_client()?
        .request(Method::from_bytes(method.as_bytes())?, upstream)
        .bearer_auth(token)
        .header("content-type", "application/json")
        .body(bytes[header_end..header_end + content_length].to_vec())
        .send()
        .await?;
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return write_broker_error(&mut stream, 502, "Upstream response too large").await;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return write_broker_error(&mut stream, 502, "Upstream response too large").await;
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

async fn write_broker_error(stream: &mut UnixStream, status: u16, message: &str) -> Result<()> {
    let body = serde_json::to_vec(&json!({"error": message}))?;
    let header = format!(
        "HTTP/1.1 {status} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
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
