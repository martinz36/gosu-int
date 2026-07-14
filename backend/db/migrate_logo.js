import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando migración para añadir columna logo_url a tenants...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Agregar columna logo_url a tenants
    await client.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512)
    `);

    console.log('✅ Columna logo_url agregada a tenants.');

    await client.query('COMMIT');
    console.log('🎉 Migración de logo completada exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración de logo:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
