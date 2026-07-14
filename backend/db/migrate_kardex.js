import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración para agregar la tabla de Kardex...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear tabla inventory_kardex
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_kardex (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        movement_type    VARCHAR(50) NOT NULL, -- 'INITIAL', 'ADJUSTMENT', 'PRODUCTION', 'SALE'
        quantity_cases   INTEGER NOT NULL,
        previous_stock   INTEGER NOT NULL,
        new_stock        INTEGER NOT NULL,
        notes            TEXT,
        created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabla inventory_kardex creada/verificada.');

    // 2. Crear índices de rendimiento
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kardex_tenant_product ON inventory_kardex(tenant_id, product_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kardex_created_at ON inventory_kardex(created_at DESC);
    `);
    console.log('✅ Índices de rendimiento creados para la tabla inventory_kardex.');

    await client.query('COMMIT');
    console.log('🎉 Migración de Kardex completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración del Kardex:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
