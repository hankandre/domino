use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    env,
    path::{Path, PathBuf},
};
use tokio::fs;

use crate::{
    Result,
    api::{encode, invoke, invoke_idempotent, response_value},
    broker::{content_type_for_path, socket_file_request},
    commands::{Cli, DocumentCommand, RecordCommand},
    config::{hardened_client, load_session, origin},
    output::compact_json,
    run_document,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordManifest {
    #[serde(default)]
    pub(crate) submission_id: Option<String>,
    pub(crate) product: Value,
    #[serde(default)]
    pub(crate) warranties: Vec<Value>,
    #[serde(default)]
    pub(crate) notes: Vec<String>,
    #[serde(default)]
    pub(crate) sources: Vec<Value>,
    #[serde(default)]
    pub(crate) allow_duplicate_of: Option<String>,
    #[serde(default)]
    pub(crate) image: Option<RecordImage>,
    #[serde(default)]
    pub(crate) documents: Vec<RecordDocument>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordImage {
    #[serde(default)]
    pub(crate) url: Option<String>,
    #[serde(default)]
    pub(crate) path: Option<PathBuf>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordDocument {
    #[serde(default)]
    pub(crate) path: Option<PathBuf>,
    #[serde(default)]
    pub(crate) paperless_document_id: Option<u64>,
    #[serde(default = "default_document_kind")]
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) backend: Option<String>,
}

fn default_document_kind() -> String {
    "other".to_owned()
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

pub(crate) fn stable_record_key(manifest: &RecordManifest) -> Result<String> {
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

pub(crate) fn merge_missing_permissions(result: &mut Value, additional: Vec<String>) {
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
    let metadata = fs::metadata(path).await?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 10 * 1024 * 1024 {
        return Err("Product images must be regular files between 1 byte and 10 MiB.".into());
    }
    let request_path = format!("/api/v1/products/{}/images/upload", encode(product_id));
    if let Some(socket) = &cli.socket {
        return socket_file_request(
            socket,
            &request_path,
            path,
            content_type_for_path(path),
            Some(idempotency_key),
        )
        .await;
    }
    let session = load_session(&cli.credential_file).await?;
    let session_server = origin(&session.server)?;
    let file = fs::File::open(path).await?;
    let response = hardened_client()?
        .post(Url::parse(&session_server)?.join(&request_path)?)
        .bearer_auth(&session.access_token)
        .header("idempotency-key", idempotency_key)
        .header("content-type", content_type_for_path(path))
        .header("content-length", metadata.len())
        .body(reqwest::Body::wrap_stream(
            tokio_util::io::ReaderStream::new(file),
        ))
        .send()
        .await?;
    response_value(response).await
}

pub(crate) async fn run_record(cli: &Cli, command: &RecordCommand) -> Result<Value> {
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
