import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración de Campañas de Fabricación (Print Runs)...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear tabla CAMPAIGNS
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name                           VARCHAR(255) NOT NULL,
        start_date_reservations        TIMESTAMP NOT NULL,
        end_date_reservations          TIMESTAMP NOT NULL,
        start_date_production          TIMESTAMP,
        estimated_end_date_production  TIMESTAMP,
        advance_payment_pct            NUMERIC(5,2) NOT NULL DEFAULT 30.00,
        status                         VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'production', 'finished'
        created_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla campaigns creada/verificada.');

    // Crear índice para optimizar consultas por tenant y estado
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON campaigns(tenant_id, status);
    `);

    // 2. Modificar tabla PRODUCTS
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
    `);
    console.log('✅ Columna campaign_id agregada a products.');

    // 3. Modificar tabla SALES_ORDERS
    await client.query(`
      ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
    `);
    console.log('✅ Columna campaign_id agregada a sales_orders.');

    await client.query('COMMIT');
    console.log('🎉 Migración de Campañas completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error durante la migración de campañas:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
