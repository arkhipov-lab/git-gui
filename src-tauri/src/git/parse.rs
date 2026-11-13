use crate::git::util::{bytes_to_string, non_zero_oid, split_nul};
use crate::models::{
    ConflictStages, DiffHunk, DiffLine, DiffLineKind, DiffResult, FileEntry, NumstatFile,
    ParsedStatus, RefKind, RefLabel,
};

pub fn parse_porcelain_v2(bytes: &[u8]) -> Result<ParsedStatus, String> {
    let parts = split_nul(bytes);
    let mut parsed = ParsedStatus {
        branch: None,
        head_oid: None,
        detached: false,
        unborn: false,
        upstream: None,
        ahead: None,
        behind: None,
        files: Vec::new(),
    };
    let mut index = 0;
    while index < parts.len() {
        if parts[index].is_empty() {
            index += 1;
            continue;
        }
        let text = bytes_to_string(parts[index]);
        if let Some(header) = text.strip_prefix("# ") {
            apply_header(header, &mut parsed);
            index += 1;
        } else if text.starts_with("1 ") {
            parsed.files.push(parse_ordinary(&text)?);
            index += 1;
        } else if text.starts_with("2 ") {
            if index + 1 >= parts.len() {
                return Err("Rename record was missing its original path".into());
            }
            let original = bytes_to_string(parts[index + 1]);
            parsed.files.push(parse_rename(&text, original)?);
            index += 2;
        } else if text.starts_with("u ") {
            parsed.files.push(parse_unmerged(&text)?);
            index += 1;
        } else if let Some(path) = text.strip_prefix("? ") {
            parsed.files.push(simple_file(path, false, true));
            index += 1;
        } else if let Some(path) = text.strip_prefix("! ") {
            parsed.files.push(simple_file(path, true, false));
            index += 1;
        } else {
            index += 1;
        }
    }
    Ok(parsed)
}

fn apply_header(header: &str, parsed: &mut ParsedStatus) {
    let (key, value) = header.split_once(' ').unwrap_or((header, ""));
    match key {
        "branch.oid" => {
            if value == "(initial)" {
                parsed.unborn = true;
                parsed.head_oid = None;
            } else if !value.is_empty() {
                parsed.head_oid = Some(value.to_string());
            }
        }
        "branch.head" => {
            if value == "(detached)" {
                parsed.detached = true;
                parsed.branch = None;
            } else if !value.is_empty() {
                parsed.branch = Some(value.to_string());
            }
        }
        "branch.upstream" => {
            if !value.is_empty() {
                parsed.upstream = Some(value.to_string());
            }
        }
        "branch.ab" => {
            let mut numbers = value.split_whitespace();
            if let Some(ahead) = numbers.next() {
                parsed.ahead = ahead.parse::<i64>().ok().map(i64::abs);
            }
            if let Some(behind) = numbers.next() {
                parsed.behind = behind.parse::<i64>().ok().map(i64::abs);
            }
        }
        _ => {}
    }
}

fn parse_ordinary(line: &str) -> Result<FileEntry, String> {
    let (tokens, path) = split_fixed(line, 8)?;
    let (index_status, worktree_status) = xy_statuses(tokens[1]);
    Ok(FileEntry {
        path: path.to_string(),
        original_path: None,
        index_status: index_status.to_string(),
        worktree_status: worktree_status.to_string(),
        staged: index_status != ".",
        unstaged: worktree_status != ".",
        untracked: false,
        ignored: false,
        unmerged: false,
        conflict_markers: false,
        rename_score: None,
        submodule: tokens[2].to_string(),
        stages: None,
    })
}

fn parse_rename(line: &str, original: String) -> Result<FileEntry, String> {
    let (tokens, path) = split_fixed(line, 9)?;
    let (index_status, worktree_status) = xy_statuses(tokens[1]);
    let score = tokens[8]
        .get(1..)
        .and_then(|value| value.parse::<u32>().ok());
    Ok(FileEntry {
        path: path.to_string(),
        original_path: Some(original),
        index_status: index_status.to_string(),
        worktree_status: worktree_status.to_string(),
        staged: index_status != ".",
        unstaged: worktree_status != ".",
        untracked: false,
        ignored: false,
        unmerged: false,
        conflict_markers: false,
        rename_score: score,
        submodule: tokens[2].to_string(),
        stages: None,
    })
}

fn parse_unmerged(line: &str) -> Result<FileEntry, String> {
    let (tokens, path) = split_fixed(line, 10)?;
    let (index_status, worktree_status) = xy_statuses(tokens[1]);
    Ok(FileEntry {
        path: path.to_string(),
        original_path: None,
        index_status: index_status.to_string(),
        worktree_status: worktree_status.to_string(),
        staged: false,
        unstaged: false,
        untracked: false,
        ignored: false,
        unmerged: true,
        conflict_markers: false,
        rename_score: None,
        submodule: tokens[2].to_string(),
        stages: Some(ConflictStages {
            base: non_zero_oid(tokens[7]),
            ours: non_zero_oid(tokens[8]),
            theirs: non_zero_oid(tokens[9]),
        }),
    })
}

fn simple_file(path: &str, ignored: bool, untracked: bool) -> FileEntry {
    FileEntry {
        path: path.to_string(),
        original_path: None,
        index_status: ".".into(),
        worktree_status: if untracked { "?".into() } else { "!".into() },
        staged: false,
        unstaged: false,
        untracked,
        ignored,
        unmerged: false,
        conflict_markers: false,
        rename_score: None,
        submodule: "N...".into(),
        stages: None,
    }
}

fn xy_statuses(xy: &str) -> (&str, &str) {
    let chars: Vec<char> = xy.chars().collect();
    let index = match chars.first() {
        Some('.') => ".",
        Some('A') => "A",
        Some('M') => "M",
        Some('D') => "D",
        Some('R') => "R",
        Some('C') => "C",
        Some('T') => "T",
        Some('U') => "U",
        Some(_) => "?",
        None => ".",
    };
    let worktree = match chars.get(1) {
        Some('.') => ".",
        Some('A') => "A",
        Some('M') => "M",
        Some('D') => "D",
        Some('R') => "R",
        Some('C') => "C",
        Some('T') => "T",
        Some('U') => "U",
        Some(_) => "?",
        None => ".",
    };
    (index, worktree)
}

fn split_fixed(line: &str, count: usize) -> Result<(Vec<&str>, &str), String> {
    let mut rest = line;
    let mut tokens = Vec::with_capacity(count);
    for _ in 0..count {
        let Some((token, next)) = rest.split_once(' ') else {
            return Err(format!("Incomplete Git status record: {line}"));
        };
        tokens.push(token);
        rest = next;
    }
    if rest.is_empty() {
        return Err(format!("Git status record is missing a path: {line}"));
    }
    Ok((tokens, rest))
}

pub fn parse_numstat(bytes: &[u8]) -> Vec<NumstatFile> {
    let parts = split_nul(bytes);
    let mut files = Vec::new();
    let mut index = 0;
    while index < parts.len() {
        if parts[index].is_empty() {
            index += 1;
            continue;
        }
        let record = bytes_to_string(parts[index]);
        let mut fields = record.split('\t');
        let Some(added) = fields.next() else {
            index += 1;
            continue;
        };
        let Some(deleted) = fields.next() else {
            index += 1;
            continue;
        };
        let path = fields.next().unwrap_or("");
        let binary = added == "-" || deleted == "-";
        if path.is_empty() {
            if index + 2 >= parts.len() {
                break;
            }
            let original = bytes_to_string(parts[index + 1]);
            let renamed = bytes_to_string(parts[index + 2]);
            files.push(NumstatFile {
                path: renamed,
                original_path: Some(original),
                additions: parse_count(added),
                deletions: parse_count(deleted),
                binary,
            });
            index += 3;
        } else {
            files.push(NumstatFile {
                path: path.to_string(),
                original_path: None,
                additions: parse_count(added),
                deletions: parse_count(deleted),
                binary,
            });
            index += 1;
        }
    }
    files
}

fn parse_count(value: &str) -> u64 {
    value.parse().unwrap_or(0)
}

pub fn parse_unified_diff(path: &str, text: &str) -> DiffResult {
    let binary = text.contains("Binary files ") || text.contains("GIT binary patch");
    if binary {
        return DiffResult {
            path: path.to_string(),
            binary: true,
            truncated: false,
            insertions: 0,
            deletions: 0,
            file_header: text.to_string(),
            hunks: Vec::new(),
            message: Some("Binary file".into()),
        };
    }

    let mut hunk_starts = Vec::new();
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        if line.starts_with("@@ ") {
            hunk_starts.push(offset);
        }
        offset += line.len();
    }
    let header_end = hunk_starts.first().copied().unwrap_or(text.len());
    let file_header = text[..header_end].to_string();
    let mut hunks = Vec::new();
    let mut insertions = 0;
    let mut deletions = 0;
    for (position, start) in hunk_starts.iter().enumerate() {
        let end = hunk_starts.get(position + 1).copied().unwrap_or(text.len());
        let raw = text[*start..end].to_string();
        let hunk = parse_hunk(&raw);
        insertions += hunk
            .lines
            .iter()
            .filter(|line| line.kind == DiffLineKind::Add)
            .count() as u64;
        deletions += hunk
            .lines
            .iter()
            .filter(|line| line.kind == DiffLineKind::Delete)
            .count() as u64;
        hunks.push(hunk);
    }
    DiffResult {
        path: path.to_string(),
        binary: false,
        truncated: false,
        insertions,
        deletions,
        file_header,
        hunks,
        message: None,
    }
}

fn parse_hunk(raw: &str) -> DiffHunk {
    let mut lines_iter = raw.split_inclusive('\n');
    let header_line = lines_iter.next().unwrap_or(raw);
    let header = header_line.trim_end_matches(['\n', '\r']).to_string();
    let (old_start, old_count, new_start, new_count) =
        parse_hunk_header(&header).unwrap_or((0, 0, 0, 0));
    let mut old_line = old_start;
    let mut new_line = new_start;
    let mut lines = Vec::new();
    for line in lines_iter {
        let content = line.trim_end_matches(['\n', '\r']);
        if content.starts_with('+') {
            lines.push(DiffLine {
                kind: DiffLineKind::Add,
                text: content[1..].to_string(),
                old_line: None,
                new_line: Some(new_line),
            });
            new_line = new_line.saturating_add(1);
        } else if content.starts_with('-') {
            lines.push(DiffLine {
                kind: DiffLineKind::Delete,
                text: content[1..].to_string(),
                old_line: Some(old_line),
                new_line: None,
            });
            old_line = old_line.saturating_add(1);
        } else if content.starts_with('\\') {
            lines.push(DiffLine {
                kind: DiffLineKind::Meta,
                text: content.to_string(),
                old_line: None,
                new_line: None,
            });
        } else {
            let text = content.strip_prefix(' ').unwrap_or(content);
            lines.push(DiffLine {
                kind: DiffLineKind::Context,
                text: text.to_string(),
                old_line: Some(old_line),
                new_line: Some(new_line),
            });
            old_line = old_line.saturating_add(1);
            new_line = new_line.saturating_add(1);
        }
    }
    DiffHunk {
        header,
        raw: raw.to_string(),
        old_start,
        old_count,
        new_start,
        new_count,
        lines,
    }
}

fn parse_hunk_header(header: &str) -> Option<(u32, u32, u32, u32)> {
    let rest = header.strip_prefix("@@ ")?;
    let (ranges, _) = rest.split_once(" @@")?;
    let (old, new) = ranges.split_once(' ')?;
    let (old_start, old_count) = parse_range(old.strip_prefix('-')?)?;
    let (new_start, new_count) = parse_range(new.strip_prefix('+')?)?;
    Some((old_start, old_count, new_start, new_count))
}

fn parse_range(value: &str) -> Option<(u32, u32)> {
    if let Some((start, count)) = value.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((value.parse().ok()?, 1))
    }
}

pub fn parse_decorations(value: &str) -> Vec<RefLabel> {
    if value.trim().is_empty() {
        return Vec::new();
    }
    value
        .split(", ")
        .filter_map(|part| {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            if let Some(name) = part.strip_prefix("HEAD -> ") {
                return Some(label_from_ref(name, true));
            }
            if part == "HEAD" {
                return Some(RefLabel {
                    kind: RefKind::Head,
                    name: "HEAD".into(),
                    head: true,
                });
            }
            Some(label_from_ref(part.strip_prefix("tag: ").unwrap_or(part), false).with_tag_prefix(part.starts_with("tag: ")))
        })
        .collect()
}

fn label_from_ref(name: &str, head: bool) -> RefLabel {
    if let Some(rest) = name.strip_prefix("refs/heads/") {
        RefLabel {
            kind: RefKind::Branch,
            name: rest.to_string(),
            head,
        }
    } else if let Some(rest) = name.strip_prefix("refs/remotes/") {
        RefLabel {
            kind: RefKind::Remote,
            name: rest.to_string(),
            head,
        }
    } else if let Some(rest) = name.strip_prefix("refs/tags/") {
        RefLabel {
            kind: RefKind::Tag,
            name: rest.to_string(),
            head,
        }
    } else if name.starts_with("refs/tags/") {
        RefLabel {
            kind: RefKind::Tag,
            name: name.trim_start_matches("refs/tags/").to_string(),
            head,
        }
    } else {
        RefLabel {
            kind: RefKind::Branch,
            name: name.to_string(),
            head,
        }
    }
}

trait TagOverride {
    fn with_tag_prefix(self, is_tag: bool) -> Self;
}

impl TagOverride for RefLabel {
    fn with_tag_prefix(mut self, is_tag: bool) -> Self {
        if is_tag {
            self.kind = RefKind::Tag;
            self.name = self
                .name
                .trim_start_matches("refs/tags/")
                .to_string();
        }
        self
    }
}

pub fn parse_track(value: &str) -> (Option<i64>, Option<i64>, bool) {
    let value = value.trim().trim_matches(|ch| ch == '[' || ch == ']');
    if value.is_empty() {
        return (Some(0), Some(0), false);
    }
    if value.contains("gone") {
        return (None, None, true);
    }
    let mut ahead = 0;
    let mut behind = 0;
    for part in value.split(',') {
        let part = part.trim();
        if let Some(number) = part.strip_prefix("ahead ") {
            ahead = number.trim().parse().unwrap_or(0);
        } else if let Some(number) = part.strip_prefix("behind ") {
            behind = number.trim().parse().unwrap_or(0);
        }
    }
    (Some(ahead), Some(behind), false)
}

pub fn build_patch(file_header: &str, hunks: &[String]) -> String {
    let mut patch = String::new();
    patch.push_str(file_header);
    if !file_header.is_empty() && !file_header.ends_with('\n') {
        patch.push('\n');
    }
    for hunk in hunks {
        patch.push_str(hunk);
        if !hunk.ends_with('\n') {
            patch.push('\n');
        }
    }
    patch
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_with_spaces_renames_and_conflicts() {
        let raw = b"# branch.oid d997db08d916e70aba89836279108a4e0b466af3\0\
# branch.head main\0\
# branch.upstream origin/main\0\
# branch.ab +1 -2\0\
1 MM N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 422c2b7ab3b3c668038da977e4e93a5fc623169c my file.txt\0\
2 R. N... 100644 100644 100644 d905d9da82c97264ab6f4920e20242e088850ce9 d905d9da82c97264ab6f4920e20242e088850ce9 R100 new name.txt\0\
old name.txt\0\
? new file.txt\0\
u UU N... 100644 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 dca917f3f9346f8d3689f066c9447e3d007c57fd 2fcbcc466e947bb9b89315b7c833ec0e637d57ff conflict.txt\0";
        let parsed = parse_porcelain_v2(raw).unwrap();
        assert_eq!(parsed.branch.as_deref(), Some("main"));
        assert_eq!(parsed.upstream.as_deref(), Some("origin/main"));
        assert_eq!(parsed.ahead, Some(1));
        assert_eq!(parsed.behind, Some(2));
        assert!(parsed.files[0].staged && parsed.files[0].unstaged);
        assert_eq!(parsed.files[0].path, "my file.txt");
        assert_eq!(parsed.files[1].original_path.as_deref(), Some("old name.txt"));
        assert_eq!(parsed.files[1].rename_score, Some(100));
        assert!(parsed.files[2].untracked);
        assert!(parsed.files[3].unmerged);
        assert_eq!(
            parsed.files[3].stages.as_ref().unwrap().ours.as_deref(),
            Some("dca917f3f9346f8d3689f066c9447e3d007c57fd")
        );
    }

    #[test]
    fn parses_unborn_and_detached_headers() {
        let unborn = parse_porcelain_v2(b"# branch.oid (initial)\0# branch.head main\0").unwrap();
        assert!(unborn.unborn);
        assert_eq!(unborn.branch.as_deref(), Some("main"));
        let detached =
            parse_porcelain_v2(b"# branch.oid abcdef\0# branch.head (detached)\0").unwrap();
        assert!(detached.detached);
        assert!(detached.branch.is_none());
    }

    #[test]
    fn parses_newline_in_filename() {
        let raw = b"? we\nird.txt\0";
        let parsed = parse_porcelain_v2(raw).unwrap();
        assert_eq!(parsed.files[0].path, "we\nird.txt");
    }

    #[test]
    fn parses_numstat_rename() {
        let files = parse_numstat(b"0\t0\t\0oldname.txt\0new name.txt\0");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].original_path.as_deref(), Some("oldname.txt"));
        assert_eq!(files[0].path, "new name.txt");
    }

    #[test]
    fn parses_unified_hunks() {
        let diff = "\
diff --git a/file.txt b/file.txt
index 7898192..6a91238 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1,2 @@
 a
+changed
";
        let parsed = parse_unified_diff("file.txt", diff);
        assert_eq!(parsed.hunks.len(), 1);
        assert_eq!(parsed.insertions, 1);
        assert_eq!(parsed.deletions, 0);
        assert_eq!(parsed.hunks[0].new_start, 1);
        assert!(parsed.hunks[0].raw.starts_with("@@ -1 +1,2 @@"));
    }

    #[test]
    fn parses_full_decorations() {
        let refs = parse_decorations(
            "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0",
        );
        assert_eq!(refs.len(), 3);
        assert!(refs[0].head);
        assert_eq!(refs[0].name, "main");
        assert_eq!(refs[1].kind, RefKind::Remote);
        assert_eq!(refs[1].name, "origin/main");
        assert_eq!(refs[2].kind, RefKind::Tag);
        assert_eq!(refs[2].name, "v1.0");
    }

    #[test]
    fn parses_upstream_track() {
        assert_eq!(parse_track("[ahead 2, behind 1]"), (Some(2), Some(1), false));
        assert_eq!(parse_track("gone"), (None, None, true));
        assert_eq!(parse_track(""), (Some(0), Some(0), false));
    }
}
