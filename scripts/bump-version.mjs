import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TYPE_BUMP = {
  feat: "minor",
  fix: "patch",
  perf: "patch",
  docs: "none",
  chore: "none",
  style: "none",
  refactor: "none",
  test: "none",
  ci: "none",
  build: "none",
  revert: "none",
};

const TYPES = Object.keys(TYPE_BUMP).join("|");
const SUBJECT = new RegExp(`^(${TYPES})(\\([^)]+\\))?(!)?:\\s+\\S`);
const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

export function classifyCommit(message) {
  const lines = message.split("\n").filter((line) => !line.startsWith("#"));
  const subject = (lines[0] ?? "").trim();
  if (/^Merge\b/.test(subject)) return { skip: true };
  const match = SUBJECT.exec(subject);
  if (!match) {
    throw new Error(
      `Commit must start with feat, fix, docs, chore, or another conventional type. Received: ${subject}`,
    );
  }
  const body = lines.slice(1).join("\n");
  const breaking = Boolean(match[3]) || /^BREAKING CHANGE:/m.test(body) || /^BREAKING-CHANGE:/m.test(body);
  return { skip: false, bump: breaking ? "major" : TYPE_BUMP[match[1]] };
}

export function highestBump(messages) {
  let best = "none";
  for (const message of messages) {
    const result = classifyCommit(message);
    if (result.skip) continue;
    if (RANK[result.bump] > RANK[best]) best = result.bump;
  }
  return best;
}

export function nextVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Version must look like 0.1.0, received ${version}.`);
  if (bump === "none") return null;
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else if (bump === "patch") {
    patch += 1;
  } else {
    throw new Error(`Unknown bump ${bump}.`);
  }
  return `${major}.${minor}.${patch}`;
}

function readVersion() {
  const match = /"version": "(\d+\.\d+\.\d+)"/.exec(readFileSync("package.json", "utf8"));
  if (!match) throw new Error("package.json has no version.");
  return match[1];
}

function replaceFirst(text, from, to) {
  const index = text.indexOf(from);
  if (index < 0) throw new Error(`Could not find ${from}.`);
  return text.slice(0, index) + to + text.slice(index + from.length);
}

function writeVersion(current, next) {
  const quoted = [`"version": "${current}"`, `"version": "${next}"`];
  writeFileSync("package.json", replaceFirst(readFileSync("package.json", "utf8"), quoted[0], quoted[1]));
  let lock = readFileSync("package-lock.json", "utf8");
  lock = replaceFirst(lock, quoted[0], quoted[1]);
  lock = replaceFirst(lock, quoted[0], quoted[1]);
  writeFileSync("package-lock.json", lock);
  writeFileSync(
    "src-tauri/tauri.conf.json",
    replaceFirst(readFileSync("src-tauri/tauri.conf.json", "utf8"), quoted[0], quoted[1]),
  );
  const cargoFrom = `version = "${current}"`;
  const cargoTo = `version = "${next}"`;
  writeFileSync("src-tauri/Cargo.toml", replaceFirst(readFileSync("src-tauri/Cargo.toml", "utf8"), cargoFrom, cargoTo));
  const cargoLockMarker = `name = "git-desktop"\nversion = "${current}"`;
  writeFileSync(
    "src-tauri/Cargo.lock",
    replaceFirst(readFileSync("src-tauri/Cargo.lock", "utf8"), cargoLockMarker, `name = "git-desktop"\nversion = "${next}"`),
  );
  const publishedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  writeFileSync("src/release.json", `${JSON.stringify({ version: next, publishedAt }, null, 2)}\n`);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function previousReleaseTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*"]);
  } catch {
    return null;
  }
}

function commitMessages() {
  const tag = previousReleaseTag();
  const args = ["log", "--format=%B%x1e"];
  if (tag) {
    args.push(`${tag}..HEAD`);
  } else {
    let merge = false;
    try {
      git(["rev-parse", "--verify", "--quiet", "HEAD^2"]);
      merge = true;
    } catch {
      merge = false;
    }
    if (merge) {
      args.push("HEAD^1..HEAD");
    } else {
      const count = Number(process.env.PR_COMMIT_COUNT || "1");
      args.push("-n", String(count > 0 ? count : 1), "HEAD");
    }
  }
  return git(args)
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function bumpVersion() {
  const current = readVersion();
  const bump = highestBump(commitMessages());
  const next = nextVersion(current, bump);
  if (!next) return null;
  writeVersion(current, next);
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = bumpVersion();
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `released=${version ? "true" : "false"}\n`);
    if (version) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  console.log(version ?? "no release");
}
