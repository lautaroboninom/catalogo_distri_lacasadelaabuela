import fallbackConfigJson from '../firebase-applet-config.json';

type FirebaseClientConfig = {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
};

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env[name] || '').trim();
}

function resolveFirebaseConfig(): FirebaseClientConfig {
  const envConfig: FirebaseClientConfig = {
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    firestoreDatabaseId: readEnv('VITE_FIREBASE_DATABASE_ID') || readEnv('VITE_FIRESTORE_DATABASE_ID'),
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID'),
  };

  const requiredKeys: Array<keyof FirebaseClientConfig> = [
    'projectId',
    'appId',
    'apiKey',
    'authDomain',
    'firestoreDatabaseId',
    'storageBucket',
    'messagingSenderId',
  ];

  const providedCount = requiredKeys.filter((k) => Boolean(envConfig[k])).length;
  const allProvided = providedCount === requiredKeys.length;

  if (providedCount > 0 && !allProvided) {
    const missing = requiredKeys.filter((k) => !envConfig[k]);
    throw new Error(
      `Firebase env config incompleta. Faltan: ${missing.join(', ')}`
    );
  }

  if (allProvided) {
    return envConfig;
  }

  const fallback = fallbackConfigJson as FirebaseClientConfig;
  const missingFallback = requiredKeys.filter((k) => !fallback[k]);
  if (missingFallback.length > 0) {
    throw new Error(
      `firebase-applet-config.json incompleto. Faltan: ${missingFallback.join(', ')}`
    );
  }
  console.warn(
    'Using fallback firebase-applet-config.json. Define VITE_FIREBASE_* env vars to isolate this app in its own Firebase project.'
  );
  return fallback;
}

const firebaseConfig = resolveFirebaseConfig();
export default firebaseConfig;
