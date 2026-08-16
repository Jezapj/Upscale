/** Crawler-only rewrite: people still get the same SPA. */

const CRAWLER =
  /Googlebot|Google-InspectionTool|Bingbot|DuckDuckBot|Baiduspider|YandexBot|Slurp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Applebot|GPTBot|ChatGPT-User|ClaudeBot|anthropic-ai|CCBot|Bytespider|ia_archiver/i;

export default function middleware(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!CRAWLER.test(ua)) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return;

  return fetch(new URL("/seo.html", request.url));
}

export const config = {
  matcher: ["/((?!api/|icons/|assets/).*)"],
};
