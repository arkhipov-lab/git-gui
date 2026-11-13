use std::io::{self, Write};
use std::path::{Path, PathBuf};

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE: &str = "Git Desktop SSH";
const NOT_FOUND: i32 = -25300;

pub fn install_askpass(dir: &Path) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let script = dir.join("ssh-askpass");
    let body = format!(
        "#!/bin/sh\ncase \"$1\" in\n  *assphrase*)\n    exec {} --ssh-askpass\n    ;;\n  *)\n    exit 1\n    ;;\nesac\n",
        shell_quote(&exe)
    );
    std::fs::write(&script, body).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700))
            .map_err(|err| err.to_string())?;
    }
    Ok(script)
}

pub fn validate_key_path(path: &str) -> Result<(), String> {
    if path.contains(['\n', '\r', '\0']) || !path.starts_with('/') || !Path::new(path).is_file() {
        return Err("Choose an absolute path to a private SSH key.".into());
    }
    Ok(())
}

pub fn validate_passphrase(passphrase: &str) -> Result<(), String> {
    if passphrase.is_empty() || passphrase.contains(['\n', '\r', '\0']) {
        return Err("Enter the passphrase without line breaks.".into());
    }
    Ok(())
}

pub fn store(account: &str, password: &[u8]) -> Result<(), String> {
    validate_key_path(account)?;
    match set_generic_password(SERVICE, account, password) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = delete_generic_password(SERVICE, account);
            set_generic_password(SERVICE, account, password).map_err(keychain_error)
        }
    }
}

pub fn exists(account: &str) -> Result<bool, String> {
    validate_key_path(account)?;
    match get_generic_password(SERVICE, account) {
        Ok(mut bytes) => {
            bytes.fill(0);
            Ok(true)
        }
        Err(err) if err.code() == NOT_FOUND => Ok(false),
        Err(err) => Err(keychain_error(err)),
    }
}

pub fn clear(account: &str) -> Result<(), String> {
    validate_key_path(account)?;
    match delete_generic_password(SERVICE, account) {
        Ok(()) => Ok(()),
        Err(err) if err.code() == NOT_FOUND => Ok(()),
        Err(err) => Err(keychain_error(err)),
    }
}

pub fn print_for_askpass() -> i32 {
    let account = std::env::var("GIT_DESKTOP_SSH_ACCOUNT").unwrap_or_default();
    if validate_key_path(&account).is_err() {
        return 1;
    }
    let mut bytes = match get_generic_password(SERVICE, &account) {
        Ok(bytes) => bytes,
        Err(_) => return 1,
    };
    let mut stdout = io::stdout().lock();
    let wrote = stdout.write_all(&bytes).and_then(|_| stdout.write_all(b"\n")).and_then(|_| stdout.flush());
    bytes.fill(0);
    if wrote.is_err() { 1 } else { 0 }
}

fn keychain_error(err: security_framework::base::Error) -> String {
    if err.code() == -128 {
        return "Keychain access was cancelled.".into();
    }
    format!("The macOS Keychain returned status {}.", err.code())
}

fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}
