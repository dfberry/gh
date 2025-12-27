export function parseLinkHeader(link?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!link) return out;
  const parts = link.split(',');
  for (const part of parts) {
    const section = part.split(';');
    if (section.length < 2) continue;
    const url = section[0].trim().replace(/^<|>$/g, '');
    const relMatch = section[1].match(/rel="?(.*)"?/);
    const rel = relMatch ? relMatch[1] : '';
    if (rel) out[rel] = url;
  }
  return out;
}

export function getLastPageFromLink(link?: string): number | undefined {
  const parsed = parseLinkHeader(link);
  const last = parsed['last'] ?? parsed['Last'];
  if (!last) return undefined;
  try {
    const u = new URL(last);
    const p = u.searchParams.get('page');
    if (!p) return undefined;
    return Number(p);
  } catch {
    return undefined;
  }
}
