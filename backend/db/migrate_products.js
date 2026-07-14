import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración de Catálogo y Configuración (Fase 5)...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear tabla CATEGORIES
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        UNIQUE(tenant_id, slug)
      )
    `);
    console.log('✅ Tabla categories creada/verificada.');

    // 2. Crear tabla BRANDS
    await client.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        UNIQUE(tenant_id, slug)
      )
    `);
    console.log('✅ Tabla brands creada/verificada.');

    // 3. Añadir nuevas columnas a PRODUCTS
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS pvp_price_usd NUMERIC(10,2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_usd NUMERIC(10,2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url VARCHAR(512);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_resources_url VARCHAR(512);
    `);
    console.log('✅ Columnas barcode, brand, pvp, costo, video y marketing_resources agregadas a products.');

    // 4. Semilla de Categorías y Marcas para los Tenants existentes (ej. Gosu)
    const tenantsResult = await client.query('SELECT id FROM tenants WHERE deleted_at IS NULL');
    for (const tenant of tenantsResult.rows) {
      // Categorías por defecto
      await client.query(`
        INSERT INTO categories (tenant_id, name, slug)
        VALUES 
          ($1, 'Sleeves', 'sleeves'),
          ($1, 'Binders', 'binders'),
          ($1, 'Deck Boxes', 'deck_boxes')
        ON CONFLICT (tenant_id, slug) DO NOTHING
      `, [tenant.id]);

      // Marcas por defecto
      await client.query(`
        INSERT INTO brands (tenant_id, name, slug)
        VALUES 
          ($1, 'Gosu', 'gosu'),
          ($1, 'Ultra Pro', 'ultra-pro')
        ON CONFLICT (tenant_id, slug) DO NOTHING
      `, [tenant.id]);
    }
    console.log('✅ Categorías y marcas por defecto sembradas para los tenants activos.');

    // Asignar marca por defecto 'Gosu' a los productos existentes que tengan brand = NULL
    await client.query(`
      UPDATE products 
      SET brand = 'Gosu' 
      WHERE brand IS NULL
    `);
    console.log('✅ Marca asignada a los productos existentes.');

    await client.query('COMMIT');
    console.log('🎉 Migración de catálogo y configuración completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración de catálogo:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
