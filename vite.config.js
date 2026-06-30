import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { getPublicConfig } from "./api/publicConfig";
function apiConfigPlugin() {
    var handler = function (_req, res) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(getPublicConfig()));
    };
    return {
        name: "api-config",
        configureServer: function (server) {
            server.middlewares.use("/api/config", handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use("/api/config", handler);
        },
    };
}
// https://vite.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    Object.assign(process.env, env);
    return {
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        plugins: [
            apiConfigPlugin(),
            react(),
            VitePWA({
                registerType: "autoUpdate",
                includeAssets: ["favicon.png", "apple-touch-icon.png", "icons/*.png"],
                manifest: {
                    name: "Upscale: Goals & Routines",
                    short_name: "Upscale",
                    description: "A 3DS eShop styled reminder, self-improvement and goal tracker. Build routines, group them under goals, and map your progress.",
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
                    navigateFallbackDenylist: [/^\/api\//],
                    cleanupOutdatedCaches: true,
                },
                devOptions: {
                    enabled: true,
                    type: "module",
                },
            }),
        ],
    };
});
