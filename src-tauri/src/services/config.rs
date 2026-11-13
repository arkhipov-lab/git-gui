use std::path::Path;

use serde::Deserialize;

use crate::error::{CommandError, ErrorKind};
use crate::models::{AppConfig, SshKeyRecord, CONFIG_VERSION};

#[derive(Debug)]
pub struct LoadedConfig {
    pub config: AppConfig,
    pub error: Option<String>,
    pub writable: bool,
}

pub fn load(path: &Path) -> LoadedConfig {
    if !path.exists() {
        return LoadedConfig {
            config: AppConfig::default(),
            error: None,
            writable: true,
        };
    }
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) => {
            return LoadedConfig {
                config: AppConfig::default(),
                error: Some(format!("Could not read configuration: {err}")),
                writable: false,
            };
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(err) => {
            return LoadedConfig {
                config: AppConfig::default(),
                error: Some(format!("Configuration file is not valid JSON: {err}")),
                writable: false,
            };
        }
    };
    let version = value
        .get("version")
        .and_then(|version| version.as_u64())
        .unwrap_or(1);
    if version > u64::from(CONFIG_VERSION) {
        return LoadedConfig {
            config: AppConfig::default(),
            error: Some(format!(
                "Configuration version {version} is newer than this version of Git Desktop. The file was left unchanged."
            )),
            writable: false,
        };
    }
    match AppConfig::deserialize(&value) {
        Ok(mut config) => {
            config.version = CONFIG_VERSION;
            migrate_ssh_key(&mut config);
            LoadedConfig {
                config,
                error: None,
                writable: true,
            }
        }
        Err(err) => LoadedConfig {
            config: AppConfig::default(),
            error: Some(format!("Could not read configuration: {err}")),
            writable: false,
        },
    }
}

fn migrate_ssh_key(config: &mut AppConfig) {
    if config.ssh_keys.is_empty() {
        if let Some(path) = config.ssh_key_path.clone().filter(|path| !path.trim().is_empty()) {
            let label = path.rsplit('/').next().unwrap_or("SSH key").to_string();
            config.ssh_keys.push(SshKeyRecord {
                id: "legacy-ssh".into(),
                label,
                path,
            });
        }
    }
    config.ssh_key_path = None;
}

pub fn save(path: &Path, config: &AppConfig) -> Result<(), CommandError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            CommandError::new(
                ErrorKind::Io,
                "Save settings",
                None,
                format!("Could not create the configuration folder: {err}"),
            )
        })?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|err| {
        CommandError::new(ErrorKind::Io, "Save settings", None, err.to_string())
    })?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, format!("{text}\n")).map_err(|err| {
        CommandError::new(
            ErrorKind::Io,
            "Save settings",
            None,
            format!("Could not write configuration: {err}"),
        )
    })?;
    std::fs::rename(&temporary, path).map_err(|err| {
        CommandError::new(
            ErrorKind::Io,
            "Save settings",
            None,
            format!("Could not replace configuration: {err}"),
        )
    })?;
    Ok(())
}
