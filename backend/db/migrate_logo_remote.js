import pg from 'pg';
const { Pool } = pg;

// Este script usa DATABASE_URL del entorno o del argumento --db-url
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Debes proveer DATABASE_URL como variable de entorno.');
  console.error('   Uso: DATABASE_URL="postgresql://..." node db/migrate_logo_remote.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('🔄 Conectando a la base de datos remota...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Añadir columna logo_url si no existe
    await client.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512)
    `);
    console.log('✅ Columna logo_url asegurada en tabla tenants.');

    // Verificar columnas actuales de tenants
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tenants' 
      ORDER BY ordinal_position
    `);
    console.log('\n📋 Columnas actuales de la tabla tenants:');
    cols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

    await client.query('COMMIT');
    console.log('\n🎉 Migración completada exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
