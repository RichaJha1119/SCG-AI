import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '../db');
const dbPath = path.join(dbDir, 'db.json');

mkdirSync(dbDir, { recursive: true });

const defaultData = {
  components: [],
  deployments: [],
  users: [],
  sessions: [],
};

let _db = null;

export async function initDB() {
  _db = await JSONFilePreset(dbPath, defaultData);
  return _db;
}

export function getDB() {
  if (!_db) throw new Error('Database not initialized. Call initDB() first.');
  return _db;
}
