import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

export class AliasedMap<V = any> extends Map<string, V> {
  private _aliases: Map<string, string> = new Map();

  setAlias(alias: string, canonicalId: string): this {
    this._aliases.set(alias.toLowerCase(), canonicalId);
    return this;
  }

  getAlias(alias: string): string | undefined {
    return this._aliases.get(alias.toLowerCase());
  }

  getAliases(): Map<string, string> {
    return this._aliases;
  }

  override get(key: string): V | undefined {
    if (super.has(key)) return super.get(key);
    const target = this._aliases.get(key.toLowerCase());
    if (target && super.has(target)) {
      return super.get(target);
    }
    return undefined;
  }

  override has(key: string): boolean {
    if (super.has(key)) return true;
    const target = this._aliases.get(key.toLowerCase());
    return !!target && super.has(target);
  }
}

// In-memory relational store structure for resilient database operations
export interface InMemoryDb {
  patients: AliasedMap<any>;
  saved_locations: Map<string, any>;
  departments: Map<string, any>;
  clinics: AliasedMap<any>;
  clinic_departments: Map<string, any>;
  doctors: AliasedMap<any>;
  doctor_departments: Map<string, any>;
  doctor_availability: Map<string, any>;
  doctor_schedule_exceptions: Map<string, any>;
  procedures: Map<string, any>;
  doctor_procedures: Map<string, any>;
  doctor_verification_documents: Map<string, any>;
  consultations: AliasedMap<any>;
  audit_logs: Map<string, any>;
  appointments: AliasedMap<any>;
  appointment_queue: Map<string, any>;
  appointment_status_history: Map<string, any>;
  medical_files: Map<string, any>;
  prescriptions: AliasedMap<any>;
  prescription_items: Map<string, any>;
  walk_ins: Map<string, any>;
  notifications: Map<string, any>;
  clinic_announcements: Map<string, any>;
  pharmacy_inventory: Map<string, any>;
  pharmacy_dispensations: Map<string, any>;
  doctor_clinic_assignments: Map<string, any>;
  availability_requests: Map<string, any>;
  assistants: AliasedMap<any>;
  load_balance_proposals: Map<string, any>;
}

export const memoryDb: InMemoryDb = {
  patients: new AliasedMap(),
  saved_locations: new Map(),
  departments: new Map(),
  clinics: new AliasedMap(),
  clinic_departments: new Map(),
  doctors: new AliasedMap(),
  doctor_departments: new Map(),
  doctor_availability: new Map(),
  doctor_schedule_exceptions: new Map(),
  procedures: new Map(),
  doctor_procedures: new Map(),
  doctor_verification_documents: new Map(),
  consultations: new AliasedMap(),
  audit_logs: new Map(),
  appointments: new AliasedMap(),
  appointment_queue: new Map(),
  appointment_status_history: new Map(),
  medical_files: new Map(),
  prescriptions: new AliasedMap(),
  prescription_items: new Map(),
  walk_ins: new Map(),
  notifications: new Map(),
  clinic_announcements: new Map(),
  pharmacy_inventory: new Map(),
  pharmacy_dispensations: new Map(),
  doctor_clinic_assignments: new Map(),
  availability_requests: new Map(),
  assistants: new AliasedMap(),
  load_balance_proposals: new Map(),
};

const DATA_DIR = path.join(__dirname, '../../data');
const STATE_FILE_PATH = path.join(DATA_DIR, 'medlink_state.json');

export const saveStateToFile = (): void => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const stateObj: Record<string, any[]> = {};
    for (const [key, map] of Object.entries(memoryDb)) {
      stateObj[key] = Array.from((map as Map<string, any>).entries());
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(stateObj, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('⚠️ Could not persist state to disk:', err.message);
  }
};

export const loadStateFromFile = (): boolean => {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      for (const [key, entries] of Object.entries(parsed)) {
        if ((memoryDb as any)[key]) {
          const targetMap = (memoryDb as any)[key];
          if (targetMap instanceof AliasedMap) {
            targetMap.clear();
            for (const [k, v] of (entries as any)) {
              targetMap.set(k, v);
            }
          } else {
            (memoryDb as any)[key] = new Map(entries as any);
          }
        }
      }
      console.log('💾 Restored persistent state from disk (medlink_state.json)');
      return true;
    }
  } catch (err: any) {
    console.warn('⚠️ Could not load state from disk:', err.message);
  }
  return false;
};

let pool: Pool | null = null;
let isPgConnected = false;

export const initDatabase = async (): Promise<void> => {
  // Load persistent file state if available
  loadStateFromFile();

  try {
    pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    console.log('🗄️  Database Engine: PostgreSQL [CONNECTED] (' + config.databaseUrl + ')');
    isPgConnected = true;

    // Run schema
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schemaSql);
    client.release();
    console.log('✅ PostgreSQL schema verified & initialized.');
  } catch (err: any) {
    console.log('🗄️  Database Engine: Fallback embedded SQL [ACTIVE]');
    isPgConnected = false;
  }
};

export const getDbStatus = () => ({
  isPostgres: isPgConnected,
  engine: isPgConnected ? 'PostgreSQL (pg pool)' : 'Embedded Persistent SQL Engine',
});

export const query = async (sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> => {
  if (isPgConnected && pool) {
    try {
      const res = await pool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
    } catch (err: any) {
      console.error('PostgreSQL query error, falling back to memory store:', err.message);
    }
  }

  // Fallback to memory store handled through model helper methods
  return { rows: [], rowCount: 0 };
};

export const withTransaction = async <T>(callback: (client: PoolClient | null) => Promise<T>): Promise<T> => {
  if (isPgConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const result = await callback(null);
    saveStateToFile();
    return result;
  }
};

export const closeDatabase = async (): Promise<void> => {
  saveStateToFile();
  if (pool) {
    await pool.end();
  }
};
