import { readFileSync } from "node:fs";
import { classifyCommit } from "./bump-version.mjs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: check-commit-message.mjs <message-file>");
  process.exit(1);
}

classifyCommit(readFileSync(path, "utf8"));
