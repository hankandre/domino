use clap::Parser;
use reqwest::{Method, Url};
use serde_json::{Value, json};
use tokio::fs;
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
mod api;
mod auth;
mod broker;
mod commands;
mod config;
mod errors;
mod output;
mod record;
mod responses;
mod search;

use api::*;
use auth::*;
use broker::*;
use commands::*;
use config::*;
use output::*;
use record::*;
use responses::*;
use search::*;

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let json_output = cli.json;
    if let Err(cause) = run(cli).await {
        print_error(cause.as_ref(), json_output);
        std::process::exit(1);
    }
}

async fn run(cli: Cli) -> Result<()> {
    let mut incomplete_record = false;
    let result = match &cli.command {
        Command::Auth { command } => return run_auth(&cli, command).await,
        Command::Search(args) => run_search(&cli, args).await?,
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
        Command::Whoami => as_value(
            invoke_typed::<IdentityResponse>(&cli, Method::GET, "/api/v1/me", None).await?,
        )?,
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

async fn run_product(cli: &Cli, command: &ProductCommand) -> Result<Value> {
    match command {
        ProductCommand::Get { id } => {
            let path = format!("/api/v1/products/{}", encode(id));
            as_value(invoke_typed::<ProductResponse>(cli, Method::GET, &path, None).await?)
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
        } => as_value(
            invoke_typed::<ProductResponse>(
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
            .await?,
        ),
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
        } => as_value(
            invoke_typed::<ProductResponse>(
                cli,
                Method::PATCH,
                &format!("/api/v1/products/{}", encode(id)),
                Some(json!({
                    "name": name, "brand": brand, "model": model, "category": category,
                    "serialNumbers": if serial.is_empty() { None } else { Some(serial) },
                    "retailer": retailer, "orderNumber": order_number, "purchaseDate": purchased_at
                })),
            )
            .await?,
        ),
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
            submission_methods,
            required_evidence,
            optional_evidence,
            instructions,
            optional_instructions,
        } => as_value(
            invoke_typed::<WarrantyResponse>(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/warranties", encode(product_id)),
                Some(json!({
                    "provider": provider, "startsAt": starts_at, "endsAt": ends_at,
                    "lifetime": lifetime, "claimUrl": claim_url, "claimPhone": claim_phone,
                    "claimEmail": claim_email, "eligibilityNotes": eligibility_notes,
                    "claimDeadline": claim_deadline,
                    "submissionMethods": submission_methods,
                    "requiredEvidence": required_evidence.iter().map(|label| json!({
                        "label": label, "required": true
                    })).chain(optional_evidence.iter().map(|label| json!({
                        "label": label, "required": false
                    }))).collect::<Vec<_>>(),
                    "claimInstructions": instructions.iter().map(|title| json!({
                        "title": title, "required": true
                    })).chain(optional_instructions.iter().map(|title| json!({
                        "title": title, "required": false
                    }))).collect::<Vec<_>>()
                })),
            )
            .await?,
        ),
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
            submission_methods,
            required_evidence,
            optional_evidence,
            instructions,
            optional_instructions,
        } => as_value(
            invoke_typed::<WarrantyResponse>(
                cli,
                Method::PATCH,
                &format!("/api/v1/warranties/{}", encode(id)),
                Some(json!({
                    "provider": provider, "endsAt": ends_at, "lifetime": lifetime,
                    "claimUrl": claim_url, "claimPhone": claim_phone,
                    "claimEmail": claim_email, "eligibilityNotes": eligibility_notes,
                    "claimDeadline": claim_deadline,
                    "submissionMethods": if submission_methods.is_empty() {
                        None
                    } else {
                        Some(submission_methods)
                    },
                    "requiredEvidence": if required_evidence.is_empty() && optional_evidence.is_empty() {
                        None
                    } else {
                        Some(required_evidence.iter().map(|label| json!({
                            "label": label, "required": true
                        })).chain(optional_evidence.iter().map(|label| json!({
                            "label": label, "required": false
                        }))).collect::<Vec<_>>())
                    },
                    "claimInstructions": if instructions.is_empty() && optional_instructions.is_empty() {
                        None
                    } else {
                        Some(instructions.iter().map(|title| json!({
                            "title": title, "required": true
                        })).chain(optional_instructions.iter().map(|title| json!({
                            "title": title, "required": false
                        }))).collect::<Vec<_>>())
                    }
                })),
            )
            .await?,
        ),
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
        ClaimCommand::List => as_value(
            invoke_typed::<ClaimListResponse>(cli, Method::GET, "/api/v1/claims", None).await?,
        ),
        ClaimCommand::Get { id } => {
            let path = format!("/api/v1/claims/{}", encode(id));
            as_value(invoke_typed::<ClaimResponse>(cli, Method::GET, &path, None).await?)
        }
        ClaimCommand::Create {
            product_id,
            issue,
            next_action,
            noticed_at,
            preferred_resolution,
        } => as_value(
            invoke_typed::<ClaimResponse>(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/claims", encode(product_id)),
                Some(json!({
                    "issue": issue, "nextAction": next_action, "noticedAt": noticed_at,
                    "preferredResolution": preferred_resolution
                })),
            )
            .await?,
        ),
        ClaimCommand::Update {
            id,
            status,
            next_action,
            resolution,
            explanation,
        } => as_value(
            invoke_typed::<ClaimResponse>(
                cli,
                Method::PATCH,
                &format!("/api/v1/claims/{}", encode(id)),
                Some(json!({
                    "status": status,
                    "nextAction": next_action,
                    "resolution": resolution,
                    "explanation": explanation
                })),
            )
            .await?,
        ),
    }
}

async fn run_note(cli: &Cli, command: &NoteCommand) -> Result<Value> {
    match command {
        NoteCommand::List { product_id } => {
            let path = format!("/api/v1/products/{}/notes", encode(product_id));
            as_value(invoke_typed::<NoteListResponse>(cli, Method::GET, &path, None).await?)
        }
        NoteCommand::Add { product_id, body } => as_value(
            invoke_typed::<NoteResponse>(
                cli,
                Method::POST,
                &format!("/api/v1/products/{}/notes", encode(product_id)),
                Some(json!({"body": body})),
            )
            .await?,
        ),
        NoteCommand::ListClaim { claim_id } => {
            let path = format!("/api/v1/claims/{}/notes", encode(claim_id));
            as_value(invoke_typed::<NoteListResponse>(cli, Method::GET, &path, None).await?)
        }
        NoteCommand::AddClaim { claim_id, body } => as_value(
            invoke_typed::<NoteResponse>(
                cli,
                Method::POST,
                &format!("/api/v1/claims/{}/notes", encode(claim_id)),
                Some(json!({"body": body})),
            )
            .await?,
        ),
    }
}

async fn run_document(cli: &Cli, command: &DocumentCommand) -> Result<Value> {
    match command {
        DocumentCommand::List { trash } => {
            let path = format!("/api/v1/documents?trash={trash}");
            as_value(invoke_typed::<DocumentListResponse>(cli, Method::GET, &path, None).await?)
        }
        DocumentCommand::LinkPaperless {
            paperless_id,
            product_id,
            claim_id,
            kind,
        } => as_value(
            invoke_typed::<DocumentResponse>(
                cli,
                Method::POST,
                "/api/v1/documents/link-paperless",
                Some(json!({
                    "paperlessDocumentId": paperless_id, "productId": product_id,
                    "claimId": claim_id, "kind": kind
                })),
            )
            .await?,
        ),
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
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("attachment")
                .to_owned();
            let mut endpoint = Url::parse("http://domino/api/v1/documents/upload")?;
            {
                let mut query = endpoint.query_pairs_mut();
                query.append_pair("name", name.as_deref().unwrap_or(&file_name));
                query.append_pair("kind", kind);
                if let Some(value) = product_id {
                    query.append_pair("productId", value);
                }
                if let Some(value) = claim_id {
                    query.append_pair("claimId", value);
                }
                if let Some(value) = backend {
                    query.append_pair("backend", value);
                }
            }
            let request_path = match endpoint.query() {
                Some(query) => format!("{}?{query}", endpoint.path()),
                None => endpoint.path().to_owned(),
            };
            if let Some(socket) = &cli.socket {
                return socket_file_request(
                    socket,
                    &request_path,
                    path,
                    content_type_for_path(path),
                    None,
                )
                .await;
            }
            let session = load_session(&cli.credential_file).await?;
            let session_server = origin(&session.server)?;
            if let Some(requested) = cli.server.as_deref()
                && origin(requested)? != session_server
            {
                return Err("Credential/server origin mismatch.".into());
            }
            let mut target = Url::parse(&session_server)?.join("/api/v1/documents/upload")?;
            target.set_query(endpoint.query());
            let file = fs::File::open(path).await?;
            let response = hardened_client()?
                .post(target)
                .bearer_auth(&session.access_token)
                .header("content-type", content_type_for_path(path))
                .header("content-length", metadata.len())
                .body(reqwest::Body::wrap_stream(
                    tokio_util::io::ReaderStream::new(file),
                ))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{PermissionsExt, symlink};
    use std::time::{SystemTime, UNIX_EPOCH};

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
    fn broker_only_allows_expected_upload_destinations() {
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
        assert!(broker_stream_path_allowed(
            "/api/v1/documents/upload?name=receipt.pdf&kind=receipt"
        ));
        assert!(broker_stream_path_allowed(
            "/api/v1/products/8b49ae2f-ec4c-47c9-93ed-c366873c3a82/images/upload"
        ));
        assert!(!broker_stream_path_allowed(
            "/api/v1/products/not-a-uuid/images/upload"
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
