import pg from 'pg';
const { Pool } = pg;

// Connection pool uses DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Debes proveer DATABASE_URL como variable de entorno.');
  console.error('   Uso: DATABASE_URL="postgresql://..." node db/migrate_warehouses.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('🔄 Iniciando migración de almacenes y estados de fabricación...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear la tabla warehouses
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name          VARCHAR(255) NOT NULL,
        code          VARCHAR(50) NOT NULL,
        address       TEXT,
        contact_info  TEXT,
        is_virtual    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, code)
      )
    `);
    console.log('✅ Tabla "warehouses" creada o verificada.');

    // 2. Insertar almacenes por defecto para cada Tenant existente
    const tenantsResult = await client.query('SELECT id FROM tenants');
    const tenants = tenantsResult.rows;

    for (const tenant of tenants) {
      // Almacén Principal (Físico)
      await client.query(`
        INSERT INTO warehouses (tenant_id, name, code, address, contact_info, is_virtual)
        VALUES ($1, 'Almacén Principal B2B', 'WH-MAIN', 'Miami Logistics Hub, FL, USA', 'info@gosu.com', FALSE)
        ON CONFLICT (tenant_id, code) DO NOTHING
      `, [tenant.id]);

      // Almacén Virtual (En Fabricación)
      await client.query(`
        INSERT INTO warehouses (tenant_id, name, code, address, contact_info, is_virtual)
        VALUES ($1, 'Almacén de Fabricación - China', 'WH-VIRTUAL', 'Fábricas de Proveedores en China', 'N/A', TRUE)
        ON CONFLICT (tenant_id, code) DO NOTHING
      `, [tenant.id]);
    }
    console.log(`✅ Almacenes por defecto (Físico y Virtual) asegurados para ${tenants.length} tenants.`);

    // 3. Añadir columna warehouse_id a la tabla production_orders
    await client.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL
    `);
    console.log('✅ Columna warehouse_id añadida a la tabla production_orders.');

    // 4. Actualizar warehouse_id para órdenes existentes (asociarla al almacén principal del tenant)
    await client.query(`
      UPDATE production_orders po
      SET warehouse_id = w.id
      FROM warehouses w
      WHERE w.tenant_id = po.tenant_id AND w.code = 'WH-MAIN' AND po.warehouse_id IS NULL
    `);
    console.log('✅ warehouse_id inicializada en órdenes de producción existentes.');

    // 5. Migrar estados antiguos en production_orders a los nuevos estados
    // Quotation, Production, Shipped, Delivered
    await client.query(`
      UPDATE production_orders 
      SET status = 'Quotation' 
      WHERE status IN ('Draft', 'Proforma')
    `);
    await client.query(`
      UPDATE production_orders 
      SET status = 'Production' 
      WHERE status IN ('QC Inspection')
    `);
    await client.query(`
      UPDATE production_orders 
      SET status = 'Shipped' 
      WHERE status IN ('Port', 'Transit')
    `);
    console.log('✅ Estados de fabricación actualizados a la nueva nomenclatura en production_orders.');

    await client.query('COMMIT');
    console.log('🎉 Migración de almacenes y estados completada exitosamente.');
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
