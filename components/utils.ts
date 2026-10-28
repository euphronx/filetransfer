export const pad = (n: number) => n.toString().padStart(2, "0");

export const padDate = (time: Date) => `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;

export function getToday() {
  return padDate(new Date());
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  let v = Number(n.toFixed(2));

  if (v >= 1024 && i < units.length - 1) {
    v = 1;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(2)} ${units[i]}`;
}

export function resolvePath(path: string): { dir: string | null; name: string } {
  const parts = path.split("/");
  if (parts.length === 1) return { dir: null, name: path };
  return { name: parts.pop()!, dir: parts.join("/") };
}
