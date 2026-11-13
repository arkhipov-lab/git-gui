use std::path::{Component, Path, PathBuf};

use crate::error::{CommandError, ErrorKind};

pub fn redact_text(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(idx) = rest.find("://") {
        result.push_str(&rest[..idx + 3]);
        rest = &rest[idx + 3..];
        if let Some(at) = rest.find('@') {
            let userinfo = &rest[..at];
            let secret = !userinfo.is_empty()
                && userinfo.is_ascii()
                && !userinfo.contains([' ', '\n', '\t', '\r', '/']);
            if secret {
                result.push_str("***");
                rest = &rest[at..];
                continue;
            }
        }
    }
    result.push_str(rest);
    result
}

pub fn quote_arg(arg: &str) -> String {
    if arg.is_empty()
        || arg
            .chars()
            .any(|ch| ch.is_whitespace() || matches!(ch, '"' | '\'' | '\\'))
    {
        format!("\"{}\"", arg.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        arg.to_string()
    }
}

pub fn display_command(args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push("git".to_string());
    for arg in args {
        parts.push(quote_arg(&redact_text(arg)));
    }
    parts.join(" ")
}

pub fn with_quotepath(args: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut full = vec!["-c".into(), "core.quotepath=false".into()];
    full.extend(args);
    full
}

pub fn split_nul(bytes: &[u8]) -> Vec<&[u8]> {
    let mut parts = Vec::new();
    let mut start = 0;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == 0 {
            parts.push(&bytes[start..index]);
            start = index + 1;
        }
    }
    if start < bytes.len() {
        parts.push(&bytes[start..]);
    }
    parts
}

pub fn bytes_to_string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

pub fn validate_rev(rev: &str, operation: &str, repo: Option<String>) -> Result<(), CommandError> {
    if rev.is_empty()
        || rev.starts_with('-')
        || rev.contains('\0')
        || rev.contains('\n')
        || rev.contains('\r')
    {
        return Err(CommandError::new(
            ErrorKind::Other,
            operation,
            repo,
            format!("Invalid revision `{rev}`"),
        ));
    }
    Ok(())
}

pub fn validate_path_arg(
    path: &str,
    operation: &str,
    repo: Option<String>,
) -> Result<(), CommandError> {
    let outside = path.is_empty()
        || path.starts_with('-')
        || path.starts_with('/')
        || path.contains('\0')
        || Path::new(path)
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir));
    if outside {
        return Err(CommandError::new(
            ErrorKind::Other,
            operation,
            repo,
            format!("Refusing to pass `{path}` to Git as a path"),
        ));
    }
    Ok(())
}

pub fn safe_join(repo: &Path, relative: &str) -> Result<PathBuf, CommandError> {
    let repo_label = Some(repo.to_string_lossy().to_string());
    if relative.is_empty() || Path::new(relative).is_absolute() {
        return Err(CommandError::new(
            ErrorKind::Other,
            "Discard changes",
            repo_label,
            "Path is outside the repository",
        ));
    }
    let mut out = repo.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => {
                return Err(CommandError::new(
                    ErrorKind::Other,
                    "Discard changes",
                    repo_label,
                    "Path is outside the repository",
                ));
            }
        }
    }
    Ok(out)
}

pub fn repo_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

pub fn non_zero_oid(oid: &str) -> Option<String> {
    if oid.is_empty() || oid.chars().all(|ch| ch == '0') {
        None
    } else {
        Some(oid.to_string())
    }
}

pub fn cap_string(text: &str, max: usize) -> (String, bool) {
    if text.len() <= max {
        return (text.to_string(), false);
    }
    let mut end = max;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    (
        format!(
            "{}\n… [truncated, {} bytes omitted]",
            &text[..end],
            text.len() - end
        ),
        true,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_credentials_in_urls() {
        assert_eq!(
            redact_text("https://user:token@github.com/org/repo.git"),
            "https://***@github.com/org/repo.git"
        );
        assert_eq!(
            redact_text("https://github.com/org/repo.git"),
            "https://github.com/org/repo.git"
        );
    }

    #[test]
    fn quotes_only_for_display() {
        let shown = display_command(&["status".into(), "my file.txt".into()]);
        assert_eq!(shown, "git status \"my file.txt\"");
    }
}
