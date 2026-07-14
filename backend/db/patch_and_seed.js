import pool from './pool.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.development') });

const patchSql = readFileSync(join(__dirname, 'patch_constraints.sql'), 'utf8');
const seedSql  = readFileSync(join(__dirname, 'seed.sql'), 'utf8');

async function run() {
  const client = await pool.connect();
  try {
    // Aplicar parche de constraints
    console.log('🔧 Aplicando parche de constraints...');
    await client.query(patchSql);
    console.log('✅ Constraints aplicados.\n');

    // Aplicar seed
    console.log('🌱 Aplicando datos semilla...');
    await client.query(seedSql);
    console.log('✅ Datos semilla insertados.\n');

    // Verificar
    const counts = await client.query(`
      SELECT 'tenants' as tabla, count(*) FROM tenants
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'products', count(*) FROM products
      UNION ALL SELECT 'volume_discounts', count(*) FROM volume_discounts
    `);
    console.log('📊 Registros en Neon (developer):');
    counts.rows.forEach(r => console.log(`  - ${r.tabla}: ${r.count}`));
    
    console.log('\n🎉 Setup completado exitosamente.');
    process.exit(0);
  } catch(err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();
