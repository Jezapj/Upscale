/** Public client config served by GET /api/config (no secrets). */
export function getPublicConfig(env) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (env === void 0) { env = process.env; }
    var googleClientId = (_a = env.GOOGLE_CLIENT_ID) === null || _a === void 0 ? void 0 : _a.trim();
    var apiKey = (_b = env.FIREBASE_API_KEY) === null || _b === void 0 ? void 0 : _b.trim();
    var projectId = (_c = env.FIREBASE_PROJECT_ID) === null || _c === void 0 ? void 0 : _c.trim();
    var appId = (_d = env.FIREBASE_APP_ID) === null || _d === void 0 ? void 0 : _d.trim();
    var authDomain = (_e = env.FIREBASE_AUTH_DOMAIN) === null || _e === void 0 ? void 0 : _e.trim();
    var storageBucket = (_f = env.FIREBASE_STORAGE_BUCKET) === null || _f === void 0 ? void 0 : _f.trim();
    var messagingSenderId = (_g = env.FIREBASE_MESSAGING_SENDER_ID) === null || _g === void 0 ? void 0 : _g.trim();
    var config = {};
    if (googleClientId)
        config.googleClientId = googleClientId;
    if (apiKey &&
        projectId &&
        appId &&
        authDomain &&
        storageBucket &&
        messagingSenderId) {
        config.firebase = {
            apiKey: apiKey,
            authDomain: authDomain,
            projectId: projectId,
            storageBucket: storageBucket,
            messagingSenderId: messagingSenderId,
            appId: appId,
        };
    }
    return config;
}
