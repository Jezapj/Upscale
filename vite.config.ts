import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

function firebaseSwConfigPlugin(env: Record<string, string>): Plugin {
  const source = () =>
    `self.__FIREBASE_CONFIG__=${JSON.stringify({
      apiKey: env.VITE_FIREBASE_API_KEY || "",
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: env.VITE_FIREBASE_APP_ID || "",
    })};`;

  return {
    name: "firebase-sw-config",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === "/sw-firebase-config.js") {
          res.setHeader("Content-Type", "application/javascript");
          res.end(source());
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sw-firebase-config.js",
        source: source(),
      });
    },
  };
}

function seoPublicFilesPlugin(env: Record<string, string>): Plugin {
  const site = (env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const files: Record<string, { body: string; type: string }> = {
    "/robots.txt": {
      type: "text/plain",
      body: `User-agent: *\nAllow: /\nDisallow: /api/\n${
        site ? `Sitemap: ${site}/sitemap.xml\n` : ""
      }`,
    },
    "/sitemap.xml": {
      type: "application/xml",
      body: site
        ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><changefreq>weekly</changefreq></url>\n</urlset>\n`
        : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`,
    },
  };

  return {
    name: "seo-public-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[req.url?.split("?")[0] ?? ""];
        if (!file) {
          next();
          return;
        }
        res.setHeader("Content-Type", file.type);
        res.end(file.body);
      });
    },
    generateBundle() {
      for (const [urlPath, file] of Object.entries(files)) {
        this.emitFile({
          type: "asset",
          fileName: urlPath.slice(1),
          source: file.body,
        });
      }
    },
  };
}

const APP_DESCRIPTION =
  "Upscale is a Nintendo 3DS eShop styled habit, routine and goal tracker PWA. Build routines, group them under goals, check in daily, map streaks, and unwind in a built-in arcade.";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const site = (env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      react(),
      firebaseSwConfigPlugin(env),
      seoPublicFilesPlugin(env),
      {
        name: "seo-index-meta",
        transformIndexHtml(html) {
          const canonical = site ? `<link rel="canonical" href="${site}/" />` : "";
          const ogUrl = site
            ? `<meta property="og:url" content="${site}/" />`
            : "";
          const ogImage = site
            ? `<meta property="og:image" content="${site}/icons/icon-512.png" />`
            : `<meta property="og:image" content="/icons/icon-512.png" />`;
          const jsonLd = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Upscale",
            applicationCategory: "LifestyleApplication",
            operatingSystem: "Web",
            description: APP_DESCRIPTION,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            ...(site ? { url: `${site}/` } : {}),
          });
          return html.replace(
            "</head>",
            `    <meta name="robots" content="index,follow" />
    ${canonical}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Upscale — Goals, routines & arcade" />
    <meta property="og:description" content="${APP_DESCRIPTION}" />
    ${ogUrl}
    ${ogImage}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Upscale — Goals, routines & arcade" />
    <meta name="twitter:description" content="${APP_DESCRIPTION}" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>`,
          );
        },
      },
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.png",
          "apple-touch-icon.png",
          "icons/*.png",
          "seo.html",
        ],
        manifest: {
          name: "Upscale: Goals & Routines",
          short_name: "Upscale",
          description:
            "A 3DS eShop styled reminder, self-improvement and goal tracker. Build routines, group them under goals, and map your progress.",
          theme_color: "#eef0f3",
          background_color: "#eef0f3",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/seo\.html$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
          cleanupOutdatedCaches: true,
          importScripts: ["sw-firebase-config.js", "sw-notifications.js"],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
  };
});
