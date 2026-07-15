import pool from './pool.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Iniciando Siembra de Tenant de Prueba B2B (Gosu Demo)...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Asegurar esquema de la base de datos (Bancos, Campañas, y compatibilidad de plan_id)
    await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='plan_id') THEN
          ALTER TABLE tenants ALTER COLUMN plan_id DROP NOT NULL;
        END IF;
      END $$;
    `);
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255)');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255)');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(255)');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_routing_number VARCHAR(255)');
    await client.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512)');
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_incoterm VARCHAR(50) DEFAULT 'FOB China'");
    await client.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS discount_policy VARCHAR(20) DEFAULT 'tier'");
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign_id UUID');
    await client.query('ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS campaign_id UUID');

    // 1. Limpieza de datos anteriores si existen
    const existingTenant = await client.query("SELECT id FROM tenants WHERE slug = 'gosu-demo'");
    if (existingTenant.rows.length > 0) {
      console.log('🗑️ Eliminando Gosu Demo anterior...');
      await client.query("DELETE FROM tenants WHERE slug = 'gosu-demo'");
    }

    // 2. Crear Tenant
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug, is_active, bank_name, bank_account_name, bank_account_number, bank_routing_number)
      VALUES ('GOSU Demo B2B', 'gosu-demo', true, 'Chase Manhattan Bank', 'GOSU DEMO INC', '1234567890', '987654321')
      RETURNING id
    `);
    const tenantId = tenantResult.rows[0].id;
    console.log(`✅ Tenant creado con ID: ${tenantId}`);

    // 3. Hashear contraseñas
    const salt = await bcrypt.genSalt(10);
    const adminPassHash = await bcrypt.hash('gosu_demo_pass', salt);
    const clientPassHash = await bcrypt.hash('alpha_pass', salt);
    const leadPassHash = await bcrypt.hash('mega_pass', salt);

    // 4. Crear Administrador del Tenant
    const adminResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Gosu Demo Admin', 'demo@gosu-int.com', $2, 'tenant_admin')
      RETURNING id
    `, [tenantId, adminPassHash]);
    console.log('✅ Administrador creado: demo@gosu-int.com / gosu_demo_pass');

    // 5. Crear Distribuidor Cliente B2B (User)
    const clientUserResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Alpha Distributor Contact', 'alpha@alphadist.com', $2, 'b2b_client')
      RETURNING id
    `, [tenantId, clientPassHash]);
    const clientUserId = clientUserResult.rows[0].id;
    console.log('✅ Cliente B2B creado: alpha@alphadist.com / alpha_pass');

    // 6. Crear Cliente Lead B2B (User)
    const leadUserResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Mega Card Buyer', 'mega@megacards.com', $2, 'b2b_client')
      RETURNING id
    `, [tenantId, leadPassHash]);
    const leadUserId = leadUserResult.rows[0].id;
    console.log('✅ Lead B2B creado: mega@megacards.com / mega_pass');

    // 7. Crear Pricing Tier (Bronze Partner)
    const tierResult = await client.query(`
      INSERT INTO pricing_tiers (tenant_id, tier_name, discount_percentage, min_order_amount, only_master_cases)
      VALUES ($1, 'Bronze Partner', 5.00, 1200.00, true)
      RETURNING id
    `, [tenantId]);
    const tierId = tierResult.rows[0].id;

    // 8. Crear Perfiles de Cliente
    await client.query(`
      INSERT INTO b2b_client_profiles (tenant_id, user_id, pricing_tier_id, company_name, tax_id, billing_address, forwarder_address, destination_country, account_status, followup_notes, last_contact_date)
      VALUES ($1, $2, $3, 'Alpha Distribution LLC', 'TAX-US-998877', '100 Broadway, New York, NY 10005, USA', 'Guangzhou Port Warehouse No. 4, China', 'USA', 'client', 'Cuenta mayorista activa para la costa este.', CURRENT_DATE)
    `, [tenantId, clientUserId, tierId]);

    await client.query(`
      INSERT INTO b2b_client_profiles (tenant_id, user_id, pricing_tier_id, company_name, tax_id, billing_address, forwarder_address, destination_country, account_status, followup_notes, last_contact_date)
      VALUES ($1, $2, NULL, 'Mega Card Store', 'TAX-US-112233', '500 Sunset Blvd, Los Angeles, CA 90028, USA', NULL, 'USA', 'lead_negotiation', 'Interesados en Deck Boxes de Neon Series. Solicitó cotización FOB por 80 cajas.', CURRENT_DATE)
    `, [tenantId, leadUserId]);
    console.log('✅ Perfiles comerciales creados.');

    // 9. Crear Reglas de descuento por volumen global por defecto (para compatibilidad)
    await client.query(`
      INSERT INTO volume_discount_rules (tenant_id, min_cases, discount_pct)
      VALUES
        ($1, 5, 5.00),
        ($1, 10, 8.00),
        ($1, 20, 12.00)
    `, [tenantId]);

    // 10. Crear Almacén Virtual de Fábrica
    const warehouseResult = await client.query(`
      INSERT INTO warehouses (tenant_id, name, code, is_virtual)
      VALUES ($1, 'Virtual Factory Transit', 'VFT-01', true)
      RETURNING id
    `, [tenantId]);
    const warehouseId = warehouseResult.rows[0].id;

    // 11. Crear Productos
    // G00001
    const p1 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00001', 'DECK BOX NEON PINK - 100+ CARDS', 'DECK BOX', 'Premium deck box with neon acrylic structure.', 35.00, 24, '75x90x100mm', 'Neon Pink', 'Dongguan Card Supplies', 'DB-NP-24', 10.00, 'PMS 806C', 8.50, 45.0, 30.0, 35.0)
      RETURNING id
    `, [tenantId]);
    const p1Id = p1.rows[0].id;

    // G00002
    const p2 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00002', 'DECK BOX DEEP BLUE - 100+ CARDS', 'DECK BOX', 'Premium deck box with royal blue deep structure.', 35.00, 24, '75x90x100mm', 'Deep Blue', 'Dongguan Card Supplies', 'DB-DB-24', 10.00, 'PMS 293C', 8.50, 45.0, 30.0, 35.0)
      RETURNING id
    `, [tenantId]);
    const p2Id = p2.rows[0].id;

    // G00003
    const p3 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00003', 'SLEEVES MATTE BLACK - 100 PACK', 'SLEEVES', 'Standard tournament matte black card sleeves.', 8.00, 120, '66x91mm', 'Matte Black', 'Zhejiang Plastic Works', 'SL-MB-120', 2.00, 'PMS Black 6C', 12.00, 50.0, 25.0, 30.0)
      RETURNING id
    `, [tenantId]);
    const p3Id = p3.rows[0].id;

    // G00004 (Sleeves Matte Cyan - para preventa)
    const p4 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00004', 'SLEEVES MATTE CYAN - 100 PACK', 'SLEEVES', 'Neon series matte cyan sleeves. Soft touch.', 8.00, 120, '66x91mm', 'Matte Cyan', 'Zhejiang Plastic Works', 'SL-MC-120', 2.00, 'PMS 801C', 12.00, 50.0, 25.0, 30.0)
      RETURNING id
    `, [tenantId]);
    const p4Id = p4.rows[0].id;

    // G00005 (Playmat Gosu Neon Wave - para preventa)
    const p5 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00005', 'PLAYMAT GOSU NEON WAVE', 'PLAYMAT', 'Stitched edge premium rubber playmat.', 45.00, 12, '610x350x2mm', 'Neon Wave', 'Fujian Rubber Co', 'PM-NW-12', 15.00, 'PMS 802C', 6.00, 65.0, 15.0, 15.0)
      RETURNING id
    `, [tenantId]);
    const p5Id = p5.rows[0].id;

    console.log('✅ Productos creados en catálogo.');

    // 12. Asociar Existencias de Inventario
    await client.query(`
      INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
      VALUES
        ($1, $2, 150, 50),
        ($1, $3, 90, 0),
        ($1, $4, 400, 120),
        ($1, $5, 0, 250),
        ($1, $6, 25, 10)
    `, [tenantId, p1Id, p2Id, p3Id, p4Id, p5Id]);
    console.log('✅ Existencias de inventario asociadas.');

    // 13. Crear Campaña de Preventa
    const campaignResult = await client.query(`
      INSERT INTO campaigns (tenant_id, name, start_date_reservations, end_date_reservations, start_date_production, estimated_end_date_production, advance_payment_pct, status)
      VALUES ($1, 'Print Run Q3 - Neon Series', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 days', CURRENT_TIMESTAMP + INTERVAL '16 days', CURRENT_TIMESTAMP + INTERVAL '45 days', 30.00, 'open')
      RETURNING id
    `, [tenantId]);
    const campaignId = campaignResult.rows[0].id;

    // Enlazar productos de preventa a la campaña
    await client.query(`
      UPDATE products
      SET campaign_id = $1
      WHERE id IN ($2, $3)
    `, [campaignId, p4Id, p5Id]);
    console.log('✅ Campaña de preventa creada y SKUs asociados.');

    // 14. Crear Órdenes de Venta Históricas
    // Orden 1: Stock regular (PO-0001)
    // 10 cajas de G00001 (price: 35.00 * 10 = $350) + 15 cajas de G00003 (price: 8.00 * 15 = $120) => Subtotal = $470.00
    // Descuento: 5% por Pricing Tier Bronze ($23.50) => Total = $446.50
    const o1Result = await client.query(`
      INSERT INTO sales_orders (tenant_id, client_id, status, incoterm, company_name, tax_id, billing_address, forwarder_address, subtotal_usd, discount_usd, shipping_cost_usd, total_usd, po_number, payment_method, payment_status, notes)
      VALUES ($1, $2, 'Proforma', 'FOB China', 'Alpha Distribution LLC', 'TAX-US-998877', '100 Broadway, New York, NY 10005, USA', 'Guangzhou Port Warehouse No. 4, China', 470.00, 23.50, 0.00, 446.50, 'PO-0001', 'bank_transfer', 'pending', 'Orden de stock inicial de demostración.')
      RETURNING id
    `, [tenantId, clientUserId]);
    const o1Id = o1Result.rows[0].id;

    await client.query(`
      INSERT INTO sales_order_items (tenant_id, sales_order_id, product_id, qty_cases, price_case_usd, discount_pct, total_item_usd)
      VALUES
        ($1, $2, $3, 10, 35.00, 5.00, 332.50),
        ($1, $2, $4, 15, 8.00, 5.00, 114.00)
    `, [tenantId, o1Id, p1Id, p3Id]);

    // Orden 2: Preventa (PS-0001)
    // 30 cajas de G00004 (price: 8.00 * 30 = $240)
    // Descuento: 5% Bronze ($12.00) => Total = $228.00
    const o2Result = await client.query(`
      INSERT INTO sales_orders (tenant_id, client_id, status, incoterm, company_name, tax_id, billing_address, forwarder_address, subtotal_usd, discount_usd, shipping_cost_usd, total_usd, po_number, payment_method, payment_status, campaign_id, advance_payment_pct, notes)
      VALUES ($1, $2, 'Draft', 'FOB China', 'Alpha Distribution LLC', 'TAX-US-998877', '100 Broadway, New York, NY 10005, USA', 'Guangzhou Port Warehouse No. 4, China', 240.00, 12.00, 0.00, 228.00, 'PS-0001', 'stripe', 'pending', $3, 30.00, 'Reserva de preventa Neon Q3.')
      RETURNING id
    `, [tenantId, clientUserId, campaignId]);
    const o2Id = o2Result.rows[0].id;

    await client.query(`
      INSERT INTO sales_order_items (tenant_id, sales_order_id, product_id, qty_cases, price_case_usd, discount_pct, total_item_usd)
      VALUES ($1, $2, $3, 30, 8.00, 5.00, 228.00)
    `, [tenantId, o2Id, p4Id]);

    console.log('✅ Órdenes de venta históricas (PO-0001 y PS-0001) creadas.');

    // 15. Crear Orden de Producción de Fábrica (MO-00001)
    // 250 cajas de G00004
    const prodResult = await client.query(`
      INSERT INTO production_orders (tenant_id, order_number, factory_name, status, total_cost_usd, total_cbm, warehouse_id)
      VALUES ($1, 'MO-00001', 'Zhejiang Plastic Works', 'Production', 500.00, 9.37500, $2)
      RETURNING id
    `, [tenantId, warehouseId]);
    const prodId = prodResult.rows[0].id;

    await client.query(`
      INSERT INTO production_order_items (tenant_id, production_order_id, product_id, quantity_cases, cost_per_case_usd, total_item_cost_usd, item_cbm)
      VALUES ($1, $2, $3, 250, 2.00, 500.00, 9.37500)
    `, [tenantId, prodId, p4Id]);

    console.log('✅ Orden de fabricación (MO-00001) creada.');

    await client.query('COMMIT');
    console.log('🎉 Siembra del Tenant de Prueba completada con éxito.');
    console.log('📊 Credenciales de Acceso para demostración:');
    console.log('----------------------------------------------------');
    console.log('👤 Administrador: email: demo@gosu-int.com | pass: gosu_demo_pass');
    console.log('👤 Distribuidor B2B: email: alpha@alphadist.com | pass: alpha_pass');
    console.log('👤 Leads Prospecto: email: mega@megacards.com | pass: mega_pass');
    console.log('🏢 Slug del tenant: gosu-demo');
    console.log('----------------------------------------------------');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error durante la siembra del tenant de prueba:', err);
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
