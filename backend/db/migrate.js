import pool from './pool.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Resolver __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde la raíz del backend
dotenv.config({ path: join(__dirname, '..', '.env.development') });

const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
const seedSql   = readFileSync(join(__dirname, 'seed.sql'), 'utf8');

async function migrate() {
  const client = await pool.connect();
  try {
    // --- FASE 1: DDL (Crear tablas) ---
    console.log('🔄 Fase 1: Aplicando schema (CREATE TABLE)...');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('✅ Tablas creadas/actualizadas con éxito.\n');

    // --- FASE 2: Seed data ---
    console.log('🌱 Fase 2: Aplicando datos semilla (INSERT)...');
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query('COMMIT');
    console.log('✅ Datos semilla insertados con éxito.\n');

    // Verificación final
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('📋 Tablas en Neon (developer):');
    tables.rows.forEach(r => console.log('  -', r.table_name));

    const counts = await client.query(`
      SELECT 'tenants' as tabla, count(*) FROM tenants
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'products', count(*) FROM products
      UNION ALL SELECT 'volume_discounts', count(*) FROM volume_discounts
    `);
    console.log('\n📊 Registros semilla:');
    counts.rows.forEach(r => console.log(`  - ${r.tabla}: ${r.count}`));

    console.log('\n🎉 Migración completada exitosamente en Neon (developer).');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error durante la migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
