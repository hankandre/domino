use reqwest::Url;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    process::Stdio,
    time::{Duration, Instant},
};

use crate::{
    Result,
    commands::{AuthCommand, Cli},
    config::{Session, hardened_client, origin, save_session},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceStart {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
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

pub(crate) async fn run_auth(cli: &Cli, command: &AuthCommand) -> Result<()> {
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
