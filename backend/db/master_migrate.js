import pool from './pool.js';

/**
 * MIGRACIÓN MAESTRA - Gosu Int Production
 * Aplica TODOS los cambios acumulados de esquema de forma segura (IF NOT EXISTS).
 * Puede ejecutarse múltiples veces sin efectos secundarios.
 */
async function masterMigrate() {
  console.log('🚀 Iniciando Migración Maestra de Producción (Gosu Int)...');
  const client = await pool.connect();
  try {
    // ============================================================
    // PASO 0: Extensiones
    // ============================================================
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    console.log('✅ [0] Extensión pgcrypto verificada.');

    // ============================================================
    // PASO 1: Tabla PLANS (SaaS)
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(100) UNIQUE NOT NULL,
        max_users  INTEGER NOT NULL,
        price_usd  NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      INSERT INTO plans (name, max_users, price_usd)
      VALUES 
        ('Básico', 5, 99.00),
        ('Pro', 20, 299.00),
        ('Enterprise', 9999, 999.00)
      ON CONFLICT (name) DO UPDATE 
      SET max_users = EXCLUDED.max_users, price_usd = EXCLUDED.price_usd
    `);
    console.log('✅ [1] Tabla plans y datos semilla asegurados.');

    // ============================================================
    // PASO 2: Columnas faltantes en TENANTS
    // ============================================================
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_api_key VARCHAR(512)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resend_api_key VARCHAR(512)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(255)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_incoterm VARCHAR(50) DEFAULT 'FOB China'`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS discount_policy VARCHAR(20) DEFAULT 'tier'`);

    // DROP NOT NULL on plan_id if it exists as a constraint
    await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tenants' AND column_name='plan_id' AND is_nullable='NO') THEN
          ALTER TABLE tenants ALTER COLUMN plan_id DROP NOT NULL;
        END IF;
      END $$;
    `);

    // Asignar plan Básico a tenants sin plan
    const defaultPlanResult = await client.query(`SELECT id FROM plans WHERE name = 'Básico'`);
    if (defaultPlanResult.rows.length > 0) {
      await client.query(`UPDATE tenants SET plan_id = $1 WHERE plan_id IS NULL`, [defaultPlanResult.rows[0].id]);
    }
    console.log('✅ [2] Columnas de tenants aseguradas y plan_id asignado.');

    // ============================================================
    // PASO 3: Columnas faltantes en USERS
    // ============================================================
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    console.log('✅ [3] Columnas de users aseguradas.');

    // ============================================================
    // PASO 4: Tabla PRICING_TIERS
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_tiers (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tier_name           VARCHAR(255) NOT NULL,
        discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
        min_order_amount    NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
        only_master_cases   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pricing_tiers_tenant ON pricing_tiers(tenant_id)`);
    console.log('✅ [4] Tabla pricing_tiers asegurada.');

    // ============================================================
    // PASO 5: Columnas faltantes en B2B_CLIENT_PROFILES
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS b2b_client_profiles (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pricing_tier_id     UUID REFERENCES pricing_tiers(id) ON DELETE SET NULL,
        company_name        VARCHAR(255),
        tax_id              VARCHAR(100),
        billing_address     TEXT,
        forwarder_address   TEXT,
        destination_country VARCHAR(100) NOT NULL DEFAULT 'USA',
        account_status      VARCHAR(50) NOT NULL DEFAULT 'lead_new',
        followup_notes      TEXT,
        last_contact_date   DATE,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_b2b_profiles_tenant ON b2b_client_profiles(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_b2b_profiles_user ON b2b_client_profiles(user_id)`);
    console.log('✅ [5] Tabla b2b_client_profiles asegurada.');

    // ============================================================
    // PASO 6: Tabla WAREHOUSES
    // ============================================================
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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenant_id)`);

    // Insertar almacenes por defecto para cada tenant sin ellos
    const tenantsResult = await client.query(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
    for (const tenant of tenantsResult.rows) {
      await client.query(`
        INSERT INTO warehouses (tenant_id, name, code, address, contact_info, is_virtual)
        VALUES ($1, 'Almacén Principal B2B', 'WH-MAIN', 'Miami Logistics Hub, FL, USA', 'info@gosu.com', FALSE)
        ON CONFLICT (tenant_id, code) DO NOTHING
      `, [tenant.id]);
      await client.query(`
        INSERT INTO warehouses (tenant_id, name, code, address, contact_info, is_virtual)
        VALUES ($1, 'Almacén de Fabricación - China', 'WH-VIRTUAL', 'Fábricas de Proveedores en China', 'N/A', TRUE)
        ON CONFLICT (tenant_id, code) DO NOTHING
      `, [tenant.id]);
    }
    console.log('✅ [6] Tabla warehouses y almacenes por defecto asegurados.');

    // ============================================================
    // PASO 7: Columnas faltantes en PRODUCTS (esquema developer completo)
    // ============================================================
    // Columnas que el esquema developer tiene pero producción puede no tener
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS commercial_description TEXT`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS finished_measurements VARCHAR(100)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_name VARCHAR(255)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_sku VARCHAR(100)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_cost_per_case_usd NUMERIC(12,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pantone_codes VARCHAR(255)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cut_measurements VARCHAR(100)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS fabrication_notes TEXT`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS case_weight_kg NUMERIC(8,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS case_length_cm NUMERIC(8,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS case_width_cm NUMERIC(8,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS case_height_cm NUMERIC(8,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    // Columnas opcionales adicionales
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pvp_price_usd NUMERIC(10,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_usd NUMERIC(10,2)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url VARCHAR(512)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_resources_url VARCHAR(512)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign_id UUID`);
    // Columna case_cbm como columna regular (la función GENERATED puede no estar disponible en producción)
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS case_cbm NUMERIC(10,5)`);
    
    // Sincronizar case_cbm para filas existentes si tiene los datos de dimensiones y NO es una columna generada
    const isGeneratedQuery = await client.query(`
      SELECT is_generated 
      FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'case_cbm'
    `);
    const isGenerated = isGeneratedQuery.rows[0]?.is_generated === 'ALWAYS';
    if (!isGenerated) {
      await client.query(`
        UPDATE products 
        SET case_cbm = (case_length_cm * case_width_cm * case_height_cm) / 1000000.0
        WHERE case_length_cm IS NOT NULL AND case_width_cm IS NOT NULL AND case_height_cm IS NOT NULL AND case_cbm IS NULL
      `);
    }
    console.log('✅ [7] Todas las columnas del esquema developer agregadas a products.');

    // ============================================================
    // PASO 8: CATEGORIES y BRANDS
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        UNIQUE(tenant_id, slug)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        UNIQUE(tenant_id, slug)
      )
    `);
    console.log('✅ [8] Tablas categories y brands aseguradas.');

    // ============================================================
    // PASO 8.5: Tabla INVENTORY
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id                 UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        stock_physical_cases       INTEGER NOT NULL DEFAULT 0,
        stock_in_production_cases  INTEGER NOT NULL DEFAULT 0,
        updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, product_id)
      )
    `);
    // Si la tabla existía pero solo con stock_cases (esquema antiguo), agregar columnas nuevas
    await client.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_physical_cases INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_in_production_cases INTEGER NOT NULL DEFAULT 0`);
    // Si existían filas con stock_cases pero sin stock_physical_cases, migrar el dato
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='stock_cases') THEN
          UPDATE inventory SET stock_physical_cases = stock_cases WHERE stock_physical_cases = 0 AND stock_cases > 0;
        END IF;
      END $$;
    `);
    console.log('✅ [8.5] Tabla inventory asegurada.');

    // ============================================================
    // PASO 9: Tabla y columnas SALES_ORDERS (esquema developer completo)
    // ============================================================
    // Crear tabla si no existe con todos los campos del developer schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        client_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status                 VARCHAR(50) NOT NULL DEFAULT 'Draft',
        incoterm               VARCHAR(50),
        company_name           VARCHAR(255) NOT NULL DEFAULT '',
        tax_id                 VARCHAR(100) NOT NULL DEFAULT '',
        billing_address        TEXT NOT NULL DEFAULT '',
        forwarder_address      TEXT NOT NULL DEFAULT '',
        subtotal_usd           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        discount_usd           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        shipping_cost_usd      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        total_usd              NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        advance_payment_pct    NUMERIC(5,2) DEFAULT 30.00,
        deposit_paid_usd       NUMERIC(12,2) DEFAULT 0.00,
        deposit_receipt_url    VARCHAR(512),
        balance_paid_usd       NUMERIC(12,2) DEFAULT 0.00,
        balance_receipt_url    VARCHAR(512),
        bl_number              VARCHAR(100),
        bl_document_url        VARCHAR(512),
        po_number              VARCHAR(20),
        payment_method         VARCHAR(50),
        payment_status         VARCHAR(50) DEFAULT 'pending',
        campaign_id            UUID,
        credit_due_date        DATE,
        notes                  TEXT,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Agregar columnas que el esquema antiguo puede no tener
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS client_id UUID`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS incoterm VARCHAR(50)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_address TEXT`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS forwarder_address TEXT`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS subtotal_usd NUMERIC(12,2)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_usd NUMERIC(12,2) DEFAULT 0.00`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_cost_usd NUMERIC(12,2) DEFAULT 0.00`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12,2)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS campaign_id UUID`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS advance_payment_pct NUMERIC(5,2) DEFAULT 30.00`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deposit_paid_usd NUMERIC(12,2) DEFAULT 0.00`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deposit_receipt_url VARCHAR(512)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS balance_paid_usd NUMERIC(12,2) DEFAULT 0.00`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS balance_receipt_url VARCHAR(512)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bl_document_url VARCHAR(512)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(20)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending'`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS credit_due_date DATE`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS notes TEXT`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    // Columnas con nombres diferentes en el esquema antiguo de producción — asegurar defaults
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_orders' AND column_name='total_amount_usd') THEN
          ALTER TABLE sales_orders ALTER COLUMN total_amount_usd SET DEFAULT 0.00;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_orders' AND column_name='subtotal_amount_usd') THEN
          ALTER TABLE sales_orders ALTER COLUMN subtotal_amount_usd SET DEFAULT 0.00;
        END IF;
      END $$;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant ON sales_orders(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_orders_client ON sales_orders(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)`);

    // SALES_ORDER_ITEMS
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_order_items (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sales_order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
        product_id       UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        qty_cases        INTEGER NOT NULL DEFAULT 1,
        price_case_usd   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        discount_pct     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
        total_item_usd   NUMERIC(12,2) NOT NULL DEFAULT 0.00
      )
    `);
    await client.query(`ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await client.query(`ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS price_per_case_usd NUMERIC(12,2)`);
    await client.query(`ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0.00`);
    await client.query(`ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS total_item_usd NUMERIC(12,2)`);
    // qty_cases alias (columna price_case_usd puede existir como price_per_case_usd en producción)
    await client.query(`ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS qty_cases INTEGER`);
    console.log('✅ [9] sales_orders y sales_order_items asegurados con esquema developer.');

    // ============================================================
    // PASO 10: PRODUCTION_ORDERS (esquema developer completo)
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_number               VARCHAR(100) NOT NULL,
        factory_name               VARCHAR(255) NOT NULL DEFAULT '',
        status                     VARCHAR(50) NOT NULL DEFAULT 'Quotation',
        estimated_completion_date  DATE,
        actual_completion_date     DATE,
        total_cost_usd             NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        total_cbm                  NUMERIC(10,5) NOT NULL DEFAULT 0.00000,
        tracking_number            VARCHAR(100),
        warehouse_id               UUID REFERENCES warehouses(id) ON DELETE SET NULL,
        created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS estimated_completion_date DATE`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_completion_date DATE`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS total_cbm NUMERIC(10,5) DEFAULT 0.00000`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100)`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_production_orders_tenant ON production_orders(tenant_id)`);
    // Columnas que producción no tiene pero developer sí (con defaults para no romper filas existentes)
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(100)`);
    await client.query(`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS factory_name VARCHAR(255)`);
    // Actualizar filas existentes con valores por defecto para las columnas nuevas
    await client.query(`UPDATE production_orders SET order_number = 'MO-' || LPAD(id::text, 5, '0') WHERE order_number IS NULL`);
    await client.query(`UPDATE production_orders SET factory_name = 'Factory' WHERE factory_name IS NULL`);
    console.log('✅ [10] production_orders asegurado con esquema developer.');

    // ============================================================
    // PASO 11: PRODUCTION_ORDER_ITEMS (esquema developer completo)
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS production_order_items (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
        product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity_cases      INTEGER NOT NULL DEFAULT 0,
        cost_per_case_usd   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        total_item_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        item_cbm            NUMERIC(10,5) NOT NULL DEFAULT 0.00000
      )
    `);
    await client.query(`ALTER TABLE production_order_items ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await client.query(`ALTER TABLE production_order_items ADD COLUMN IF NOT EXISTS total_item_cost_usd NUMERIC(12,2)`);
    await client.query(`ALTER TABLE production_order_items ADD COLUMN IF NOT EXISTS item_cbm NUMERIC(10,5)`);
    console.log('✅ [11] production_order_items asegurado con esquema developer.');

    // ============================================================
    // PASO 12: Tabla INVENTORY_KARDEX
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_kardex (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        movement_type    VARCHAR(50) NOT NULL,
        quantity_cases   INTEGER NOT NULL,
        previous_stock   INTEGER NOT NULL,
        new_stock        INTEGER NOT NULL,
        notes            TEXT,
        created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_kardex_tenant_product ON inventory_kardex(tenant_id, product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_kardex_created_at ON inventory_kardex(created_at DESC)`);
    console.log('✅ [12] Tabla inventory_kardex asegurada.');

    // ============================================================
    // PASO 13: Tabla AUDIT_LOGS
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name  VARCHAR(255),
        tenant_id  UUID,
        action     VARCHAR(100) NOT NULL,
        details    JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)`);
    console.log('✅ [13] Tabla audit_logs asegurada.');

    // ============================================================
    // PASO 14: Tabla CAMPAIGNS (Print Runs)
    // ============================================================
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
        status                         VARCHAR(50) NOT NULL DEFAULT 'open',
        created_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON campaigns(tenant_id, status)`);
    console.log('✅ [14] Tabla campaigns asegurada.');

    // ============================================================
    // PASO 15: Tabla SKU_VOLUME_DISCOUNT_RULES
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sku_volume_discount_rules (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
        min_units   INTEGER NOT NULL,
        discount_pct NUMERIC(5,2) NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sku_vol_rules_tenant ON sku_volume_discount_rules(tenant_id)`);
    console.log('✅ [15] Tabla sku_volume_discount_rules asegurada.');

    // ============================================================
    // PASO 16: VOLUME_DISCOUNT_RULES (Globales)
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS volume_discount_rules (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        min_cases     INTEGER NOT NULL,
        discount_pct  NUMERIC(5,2) NOT NULL,
        UNIQUE(tenant_id, min_cases)
      )
    `);
    console.log('✅ [16] Tabla volume_discount_rules asegurada.');

    console.log('\n🎉 MIGRACIÓN MAESTRA COMPLETADA CON ÉXITO.');
    console.log('   Todos los cambios de esquema de developer ya están presentes en producción.');
  } catch (err) {
    console.error('❌ Error durante la migración maestra:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

masterMigrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
