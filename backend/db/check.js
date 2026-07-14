import pool from './pool.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.development') });

async function check() {
  try {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('Tablas existentes:', tables.rows.map(r => r.table_name));

    const constraints = await pool.query(
      "SELECT constraint_name, constraint_type, table_name FROM information_schema.table_constraints WHERE table_schema = 'public'"
    );
    console.log('\nConstraints:', JSON.stringify(constraints.rows, null, 2));
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
check();
