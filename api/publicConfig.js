/** Public client config served by GET /api/config (no secrets). */
function envFirst(env) {
    var _a;
    var keys = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        keys[_i - 1] = arguments[_i];
    }
    for (var _b = 0, keys_1 = keys; _b < keys_1.length; _b++) {
        var key = keys_1[_b];
        var value = (_a = env[key]) === null || _a === void 0 ? void 0 : _a.trim();
        if (value)
            return value;
    }
    return undefined;
}
export function getPublicConfig(env) {
    if (env === void 0) { env = process.env; }
    var googleClientId = envFirst(env, "GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID");
    var apiKey = envFirst(env, "FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY");
    var projectId = envFirst(env, "FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
    var appId = envFirst(env, "FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID");
    var authDomain = envFirst(env, "FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN");
    var storageBucket = envFirst(env, "FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET");
    var messagingSenderId = envFirst(env, "FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID");
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
