const KEYWORDS = new Set([
  "fn", "let", "const", "var", "function", "return", "if", "else", "for", "while", "match", "struct",
  "enum", "impl", "pub", "use", "mod", "class", "interface", "type", "import", "export", "from",
  "async", "await", "def", "self", "true", "false", "null", "None", "Some", "package", "public",
]);

export type TokenKind = "plain" | "keyword" | "string" | "comment" | "number";

export interface Token {
  text: string;
  kind: TokenKind;
}

export function highlightLine(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const push = (kind: TokenKind, value: string) => {
    if (value.length > 0) tokens.push({ kind, text: value });
  };
  while (index < text.length) {
    const rest = text.slice(index);
    if (rest.startsWith("//") || rest.startsWith("#")) {
      push("comment", rest);
      break;
    }
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let end = 1;
      while (end < rest.length) {
        if (rest[end] === "\\") {
          end += 2;
          continue;
        }
        if (rest[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      push("string", rest.slice(0, end));
      index += end;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) {
      push(KEYWORDS.has(word[0]) ? "keyword" : "plain", word[0]);
      index += word[0].length;
      continue;
    }
    const number = /^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)/.exec(rest);
    if (number) {
      push("number", number[0]);
      index += number[0].length;
      continue;
    }
    push("plain", rest[0] ?? "");
    index += 1;
  }
  return tokens;
}

export function applyBranchTemplate(
  pattern: string,
  values: { type: string; ticket: string; description: string },
): string {
  const slug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");
  return pattern
    .replaceAll("{type}", slug(values.type))
    .replaceAll("{ticket}", slug(values.ticket))
    .replaceAll("{description}", slug(values.description))
    .replace(/\/{2,}/g, "/")
    .replace(/^[-/]+|[-/]+$/g, "");
}
