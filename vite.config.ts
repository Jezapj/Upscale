import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import fs from "node:fs";

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

const APP_TITLE = "Upscale: Game Your Goals";

function absolutizeSeoHtml(html: string, site: string): string {
  if (!site) return html;
  return html
    .replace(/content="\/icons\/icon-512\.png"/g, `content="${site}/icons/icon-512.png"`)
    .replace(
      /"image": "\/icons\/icon-512\.png"/g,
      `"image": "${site}/icons/icon-512.png"`,
    )
    .replace(
      /href="\/favicon\.png"/g,
      `href="${site}/favicon.png"`,
    )
    .replace(
      /href="\/icons\/icon-192\.png"/g,
      `href="${site}/icons/icon-192.png"`,
    )
    .replace(
      /href="\/apple-touch-icon\.png"/g,
      `href="${site}/apple-touch-icon.png"`,
    );
}

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
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const file = id.replaceAll("\\", "/");
            if (!file.includes("node_modules/")) return;
            if (file.includes("firebase") || file.includes("@firebase")) return "firebase";
            if (file.includes("@revenuecat")) return "revenuecat";
            if (file.includes("lucide-react")) return "lucide";
            if (
              file.includes("/react-dom/") ||
              file.includes("/react-router") ||
              file.includes("/scheduler/") ||
              file.includes("/node_modules/react/")
            ) {
              return "react";
            }
          },
        },
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
          const imagePath = site
            ? `${site}/icons/icon-512.png`
            : "/icons/icon-512.png";
          const ogImage = `<meta property="og:image" content="${imagePath}" />`;
          const twitterImage = `<meta name="twitter:image" content="${imagePath}" />`;
          const jsonLd = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Upscale",
            alternateName: APP_TITLE,
            applicationCategory: "LifestyleApplication",
            operatingSystem: "Web",
            description: APP_DESCRIPTION,
            image: imagePath,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            ...(site ? { url: `${site}/` } : {}),
          });
          return html.replace(
            "</head>",
            `    <meta name="robots" content="index,follow" />
    ${canonical}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${APP_TITLE}" />
    <meta property="og:description" content="${APP_DESCRIPTION}" />
    ${ogUrl}
    ${ogImage}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${APP_TITLE}" />
    <meta name="twitter:description" content="${APP_DESCRIPTION}" />
    ${twitterImage}
    <script type="application/ld+json">${jsonLd}</script>
  </head>`,
          );
        },
      },
      {
        name: "seo-html-absolute-urls",
        generateBundle() {
          const seoPath = path.resolve(__dirname, "public/seo.html");
          if (!fs.existsSync(seoPath)) return;
          const raw = fs.readFileSync(seoPath, "utf8");
          this.emitFile({
            type: "asset",
            fileName: "seo.html",
            source: absolutizeSeoHtml(raw, site),
          });
        },
      },
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.png",
          "apple-touch-icon.png",
          "icons/*.png",
          "seo.html",
          "10secloopmenumusic.mp3",
          "Breakout_menusong.mp3",
          "tapchime.mp3",
          "tapchime2low.mp3",
          "tapchime3medium.mp3",
          "tapchime4high.mp3",
          "popupchime.mp3",
          "informationchime.mp3",
          "alertchime.mp3",
          "successchime.mp3",
          "scrollchime.mp3",
          "scrollchime (2).mp3",
        ],
        manifest: {
          name: APP_TITLE,
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
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          // iOS status bar theming for PWA
          "apple-mobile-web-app-status-bar-style": "black-translucent",
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/seo\.html$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
          cleanupOutdatedCaches: true,
          importScripts: ["sw-firebase-config.js", "sw-notifications.js"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
  };
});
