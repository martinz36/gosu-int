import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración para agregar color a productos...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Añadir columna color a products
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(100);
    `);
    console.log('✅ Columna color agregada a la tabla products.');

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
