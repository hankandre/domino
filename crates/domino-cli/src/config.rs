use reqwest::{Client, Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::DirBuilder,
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
};
use url::Host;

use crate::Result;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Session {
    pub(crate) server: String,
    pub(crate) access_token: String,
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

pub(crate) fn default_credential_file() -> PathBuf {
    config_root().join("session.json")
}

pub(crate) fn default_socket() -> PathBuf {
    env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("domino")
        .join("broker.sock")
}

pub(crate) fn origin(value: &str) -> Result<String> {
    origin_with_policy(
        value,
        env::var("DOMINO_ALLOW_INSECURE_HTTP").as_deref() == Ok("true"),
    )
}

pub(crate) fn origin_with_policy(value: &str, allow_insecure_http: bool) -> Result<String> {
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

pub(crate) fn hardened_client() -> Result<Client> {
    Ok(Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()?)
}

pub(crate) fn prepare_private_directory(path: &Path, maximum_mode: u32) -> Result<()> {
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

pub(crate) async fn load_session(path: &Path) -> Result<Session> {
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

pub(crate) async fn save_session(path: &Path, session: &Session) -> Result<()> {
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
