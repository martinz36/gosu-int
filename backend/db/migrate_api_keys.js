import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración para agregar API Keys a tenants...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Añadir columnas whatsapp_api_key y resend_api_key a tenants
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_api_key VARCHAR(512);
    `);
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resend_api_key VARCHAR(512);
    `);
    console.log('✅ Columnas whatsapp_api_key y resend_api_key agregadas a la tabla tenants.');

    await client.query('COMMIT');
    console.log('🎉 Migración de API Keys completada con éxito.');
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
