import type { Config } from "@netlify/functions";

type MediaLink = {
  url: string;
  type: "video" | "audio" | "stream" | "image";
  label: string;
  filename?: string;
  thumb?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const MEDIA_EXT = /\.(mp4|m4v|webm|mov|mkv|m3u8|mpd|mp3|m4a|ogg|wav)(\?|#|$)/i;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Reject localhost / private network targets so the function can't be used to probe internal hosts
function isPublicHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (h.includes(":") && (h === "::1" || h === "::" || /^(fc|fd|fe80|::ffff:)/.test(h))) return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}

function classify(url: string, contentType = ""): MediaLink["type"] {
  const ct = contentType.toLowerCase();
  if (/m3u8|mpd/i.test(url) || ct.includes("mpegurl") || ct.includes("dash+xml")) return "stream";
  if (ct.startsWith("audio/") || /\.(mp3|m4a|wav)(\?|#|$)/i.test(url)) return "audio";
  if (ct.startsWith("image/")) return "image";
  return "video";
}

function filenameFrom(url: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return last || undefined;
  } catch {
    return undefined;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/");
}

// Pull video/audio URLs out of an HTML page: Open Graph tags, <video>/<source> tags,
// JSON-LD contentUrl, and any raw .mp4/.m3u8/... URLs in the markup
function extractFromHtml(html: string, base: string) {
  const found = new Map<string, string>();
  const add = (raw: string | undefined, label: string) => {
    if (!raw) return;
    try {
      const abs = new URL(decodeEntities(raw.trim()), base).toString();
      if (!/^https?:/i.test(abs) || found.has(abs)) return;
      found.set(abs, label);
    } catch {
      /* ignore malformed */
    }
  };

  const metaRe = /<meta\s+[^>]*>/gi;
  for (const tag of html.match(metaRe) ?? []) {
    const prop = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!prop || !content) continue;
    if (["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream", "og:audio"].includes(prop)) {
      add(content, "Page video");
    }
  }

  for (const m of html.matchAll(/<(?:video|source|audio)\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    add(m[1], "Embedded player");
  }

  for (const m of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/gi)) add(m[1], "Structured data");

  for (const m of html.matchAll(/https?:(?:\/\/|\\\/\\\/)[^"'\s<>()]+?\.(?:mp4|m4v|webm|mov|m3u8|mpd|mp3|m4a)(?:\?[^"'\s<>()]*)?/gi)) {
    add(m[0], "Found in page");
  }

  // Blob / data URLs and tiny tracking pixels aren't useful
  return [...found.entries()]
    .filter(([u]) => MEDIA_EXT.test(u) || !/\.(png|jpe?g|gif|svg|webp|js|css)(\?|$)/i.test(u))
    .slice(0, 25)
    .map(([url, label]) => ({ url, label, type: classify(url), filename: filenameFrom(url) }) as MediaLink);
}

// Optional: forward to a self-hosted cobalt instance (https://github.com/imputnet/cobalt)
// for sites like YouTube, TikTok, Instagram that don't expose direct links in their HTML
async function resolveWithCobalt(url: string, quality: string, audioOnly: boolean) {
  const endpoint = Netlify.env.get("COBALT_API_URL");
  if (!endpoint) return null;
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const key = Netlify.env.get("COBALT_API_KEY");
  if (key) headers.Authorization = `Api-Key ${key}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      videoQuality: quality,
      downloadMode: audioOnly ? "audio" : "auto",
      filenameStyle: "pretty",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => ({}));

  if (data.status === "tunnel" || data.status === "redirect") {
    return [{ url: data.url, filename: data.filename, label: "Download", type: audioOnly ? "audio" : "video" } as MediaLink];
  }
  if (data.status === "picker" && Array.isArray(data.picker)) {
    const items: MediaLink[] = data.picker.map((p: any, i: number) => ({
      url: p.url,
      thumb: p.thumb,
      type: p.type === "photo" ? "image" : "video",
      label: `Item ${i + 1}`,
    }));
    if (data.audio) items.push({ url: data.audio, filename: data.audioFilename, type: "audio", label: "Audio" });
    return items;
  }
  const code = data?.error?.code ?? `HTTP ${res.status}`;
  throw new Error(`The download service couldn't process this link (${code}).`);
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const input = String(body?.url ?? "").trim();
  const quality = ["max", "2160", "1440", "1080", "720", "480", "360"].includes(body?.quality) ? body.quality : "1080";
  const audioOnly = Boolean(body?.audioOnly);

  let target: URL;
  try {
    target = new URL(input);
  } catch {
    return json({ error: "Please paste a full link starting with http:// or https://" }, 400);
  }
  if (!/^https?:$/.test(target.protocol) || !isPublicHost(target.hostname)) {
    return json({ error: "That link isn't a public web address." }, 400);
  }

  try {
    const cobalt = await resolveWithCobalt(target.toString(), quality, audioOnly);
    if (cobalt?.length) return json({ source: "service", links: cobalt });
  } catch (err: any) {
    // Fall through to page scanning, but remember the reason
    body.serviceError = err?.message;
  }

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const finalUrl = res.url || target.toString();
    const contentType = res.headers.get("content-type") ?? "";

    if (/^(video|audio)\//i.test(contentType) || /mpegurl|dash\+xml|octet-stream/i.test(contentType) || MEDIA_EXT.test(finalUrl)) {
      res.body?.cancel();
      return json({
        source: "direct",
        links: [{ url: finalUrl, label: "Direct file", type: classify(finalUrl, contentType), filename: filenameFrom(finalUrl) }],
      });
    }

    if (!res.ok) {
      return json({ error: `The site responded with an error (${res.status}). It may block automated access.` }, 502);
    }

    const html = (await res.text()).slice(0, 3_000_000);
    const links = extractFromHtml(html, finalUrl);
    const title = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");

    if (!links.length) {
      return json(
        {
          error:
            body.serviceError ??
            "No downloadable video was found on this page. Sites like YouTube, TikTok or Instagram hide their video files — the site owner can connect a download service to support them.",
        },
        404,
      );
    }
    return json({ source: "page", title, links });
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError";
    return json({ error: timedOut ? "The site took too long to respond." : "Couldn't reach that link." }, 502);
  }
};

export const config: Config = {
  path: "/api/resolve",
};
