/** Public client config served by GET /api/config (no secrets). */
export interface PublicFirebaseConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
}
export interface PublicAppConfig {
    googleClientId?: string;
    firebase?: PublicFirebaseConfig;
}
export declare function getPublicConfig(env?: NodeJS.ProcessEnv): PublicAppConfig;
