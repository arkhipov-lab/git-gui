import release from "./release.json";

export const appName = "Git Desktop";
export const appVersion = release.version;
export const publishedAt = release.publishedAt;

export function formatPublished(iso: string): string | null {
  if (!iso.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
