export function progressText(fallback: string, line?: string): string {
  const text = (line ?? "").replace(/\s+/g, " ").trim();
  if (!text) return `${fallback}…`;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

export function remoteActionId(label?: string): "fetch" | "pull" | "push" | null {
  if (!label) return null;
  if (label === "Fetch" || label.startsWith("Fetch ")) return "fetch";
  if (label === "Pull" || label === "Force pull") return "pull";
  if (label === "Push" || label === "Force push" || label === "Push tag") return "push";
  return null;
}
