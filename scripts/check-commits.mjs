import { execFileSync } from "node:child_process";
import { classifyCommit } from "./bump-version.mjs";

const base = process.argv[2];
if (!base) {
  console.error("Usage: check-commits.mjs <base-ref>");
  process.exit(1);
}

const log = execFileSync("git", ["log", `${base}..HEAD`, "--format=%B%x1e"], { encoding: "utf8" });
const messages = log
  .split("\x1e")
  .map((entry) => entry.trim())
  .filter(Boolean);

for (const message of messages) classifyCommit(message);
