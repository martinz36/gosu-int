import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando migración para añadir columnas de configuración bancaria a tenants...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Agregar columnas a tenants
    await client.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(255)
    `);

    console.log('✅ Columnas bank_name, bank_account_name, bank_account_number, bank_routing_number agregadas a tenants.');

    await client.query('COMMIT');
    console.log('🎉 Migración bancaria completada exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración bancaria:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
