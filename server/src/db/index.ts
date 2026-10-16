import { config } from '../config.js';
import { DataStore } from './types.js';
import { SqliteStore } from './sqlite.js';
import { FirestoreStore } from './firestore.js';

function createDataStore(): DataStore {
  const driver = config.DB_DRIVER;

  if (driver === 'firestore') {
    return new FirestoreStore();
  }

  if (driver === 'sqlite') {
    return new SqliteStore();
  }

  // Auto-detect mode:
  // If Firebase credentials or FIREBASE_PROJECT_ID is present, choose Firestore
  if (config.FIREBASE_PROJECT_ID) {
    return new FirestoreStore();
  }

  // Otherwise fallback to SQLite for local development
  return new SqliteStore();
}

export let dataStore: DataStore = createDataStore();

export function setDataStore(store: DataStore): void {
  dataStore = store;
}

export async function initDb(): Promise<void> {
  await dataStore.init();
}

export async function closeDb(): Promise<void> {
  await dataStore.close();
}

export async function isWhitelistModeEnabled(): Promise<boolean> {
  return dataStore.isWhitelistModeEnabled();
}

export async function isEmailWhitelisted(email: string): Promise<boolean> {
  return dataStore.isEmailWhitelisted(email);
}

export function getDbDriver(): 'sqlite' | 'firestore' {
  return dataStore.driverName;
}

export * from './types.js';
export { SqliteStore } from './sqlite.js';
export { FirestoreStore } from './firestore.js';
