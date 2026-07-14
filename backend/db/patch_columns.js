import pool from './pool.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.development') });

async function patch() {
  try {
    console.log('🔧 Añadiendo columna image_url a products...');
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS image_url VARCHAR(512)
    `);
    console.log('✅ Columna image_url añadida.');
    
    // Verificar columnas actuales de products
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'products'
      ORDER BY ordinal_position
    `);
    console.log('\n📋 Columnas de products:');
    cols.rows.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
    
    process.exit(0);
  } catch(err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

patch();
