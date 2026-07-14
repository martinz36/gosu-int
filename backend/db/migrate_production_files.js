import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración para archivos de producción...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Añadir columna production_files_url a products
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS production_files_url VARCHAR(512);
    `);
    console.log('✅ Columna production_files_url agregada a la tabla products.');

    await client.query('COMMIT');
    console.log('🎉 Migración completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
