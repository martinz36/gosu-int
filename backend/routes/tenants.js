import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin, requireTenantAdmin } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// ============================================================
// GET /api/tenants (Solo Super Admin)
// Lista todos los tenants no eliminados registrados en el sistema,
// incluyendo información del plan.
// ============================================================
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.slug, t.status, t.plan_id, t.created_at, p.name as plan_name, p.price_usd as plan_price,
       (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
       (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as product_count
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.deleted_at IS NULL
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener tenants:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/tenants (Solo Super Admin)
// Crea una nueva empresa (tenant) con un plan asignado y su primer admin.
// Body: { name, slug, plan_id, adminName, adminEmail, adminPassword }
// ============================================================
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, slug, plan_id, adminName, adminEmail, adminPassword } = req.body;

  if (!name || !slug || !plan_id || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      error: 'Nombre de empresa, slug, plan, nombre de administrador, email y contraseña son requeridos.',
    });
  }

  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return res.status(400).json({
      error: 'El slug solo puede contener letras minúsculas, números y guiones.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar si el slug ya existe (y no está eliminado)
    const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL', [slug.toLowerCase()]);
    if (slugCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El slug ya está registrado para otra empresa.' });
    }

    // Verificar si el email del administrador ya existe
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail.toLowerCase()]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El email del administrador ya está registrado.' });
    }

    // 1. Crear el Tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, plan_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, name, slug, plan_id, status, created_at`,
      [name, slug.toLowerCase(), plan_id]
    );
    const tenant = tenantResult.rows[0];

    // 2. Hashear la contraseña del administrador
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(adminPassword, salt);

    // 3. Crear el Administrador para el nuevo Tenant
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, client_category)
       VALUES ($1, $2, $3, $4, 'admin', 'retail_store')
       RETURNING id, name, email, role, created_at`,
      [tenant.id, adminName, adminEmail.toLowerCase(), password_hash]
    );
    const admin = userResult.rows[0];

    // 4. Crear reglas de descuento por volumen por defecto para el nuevo Tenant
    await client.query(
      `INSERT INTO volume_discounts (tenant_id, client_category, min_cases, discount_percentage)
       VALUES
         ($1, 'all', 5, 5.00),
         ($1, 'all', 10, 10.00),
         ($1, 'all', 20, 15.00),
         ($1, 'wholesale_distributor', 1, 5.00)`,
      [tenant.id]
    );

    await client.query('COMMIT');

    // Auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      tenant.id,
      'CREATE_TENANT',
      { name: tenant.name, slug: tenant.slug, plan_id }
    );

    res.status(201).json({
      message: 'Empresa (Tenant) y usuario administrador creados con éxito.',
      tenant,
      admin,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor al crear inquilino.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/tenants/:id (Solo Super Admin)
// Modifica los datos principales de un Tenant (nombre, slug, plan, estado).
// ============================================================
router.put('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, slug, plan_id, status } = req.body;

  if (!name || !slug || !plan_id || !status) {
    return res.status(400).json({ error: 'Nombre, slug, plan y estado son requeridos.' });
  }

  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return res.status(400).json({
      error: 'El slug solo puede contener letras minúsculas, números y guiones.',
    });
  }

  try {
    // Verificar si el slug ya existe en otro tenant
    const slugCheck = await pool.query(
      'SELECT id FROM tenants WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL',
      [slug.toLowerCase(), id]
    );
    if (slugCheck.rows.length > 0) {
      return res.status(409).json({ error: 'El slug ya está registrado para otra empresa.' });
    }

    const result = await pool.query(
      `UPDATE tenants
       SET name = $1, slug = $2, plan_id = $3, status = $4
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING id, name, slug, plan_id, status`,
      [name, slug.toLowerCase(), plan_id, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const updatedTenant = result.rows[0];

    // Auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      updatedTenant.id,
      'UPDATE_TENANT',
      { name: updatedTenant.name, slug: updatedTenant.slug, plan_id, status }
    );

    res.json({
      message: 'Empresa actualizada con éxito.',
      tenant: updatedTenant,
    });
  } catch (err) {
    console.error('Error al actualizar tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// DELETE /api/tenants/:id (Solo Super Admin)
// Realiza una eliminación lógica (Soft Delete) de un Tenant
// ============================================================
router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  // Evitar eliminar el tenant por defecto (id 1)
  if (id === '00000000-0000-0000-0000-000000000001') {
    return res.status(400).json({ error: 'No está permitido eliminar el Tenant semilla principal.' });
  }

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, slug`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada o ya eliminada.' });
    }

    const deletedTenant = result.rows[0];

    // Auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      deletedTenant.id,
      'DELETE_TENANT',
      { name: deletedTenant.name, slug: deletedTenant.slug }
    );

    res.json({
      message: 'Empresa eliminada con éxito (eliminación lógica).',
      tenant: deletedTenant,
    });
  } catch (err) {
    console.error('Error al eliminar tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// GET /api/tenants/current/settings (Solo Tenant Admin)
// Retorna las API keys y configuración del tenant actual.
// ============================================================
router.get('/current/settings', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT id, name, slug, whatsapp_api_key, resend_api_key, 
              cloudinary_cloud_name, cloudinary_upload_preset, cloudinary_api_key, cloudinary_api_secret,
              stripe_secret_key, stripe_publishable_key,
              bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url, default_incoterm, discount_policy 
       FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener configuraciones del tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// PUT /api/tenants/current/settings (Solo Tenant Admin)
// Actualiza las API keys, datos de transferencia y marca del tenant actual.
// ============================================================
router.put('/current/settings', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { 
    whatsapp_api_key, 
    resend_api_key,
    cloudinary_cloud_name,
    cloudinary_upload_preset,
    cloudinary_api_key,
    cloudinary_api_secret,
    stripe_secret_key,
    stripe_publishable_key,
    bank_name,
    bank_account_name,
    bank_account_number,
    bank_routing_number,
    logo_url,
    default_incoterm,
    discount_policy
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET whatsapp_api_key = $1, 
           resend_api_key = $2, 
           cloudinary_cloud_name = $3,
           cloudinary_upload_preset = $4,
           cloudinary_api_key = $5,
           cloudinary_api_secret = $6,
           stripe_secret_key = $7,
           stripe_publishable_key = $8,
           bank_name = $9, 
           bank_account_name = $10, 
           bank_account_number = $11, 
           bank_routing_number = $12, 
           logo_url = $13,
           default_incoterm = $14,
           discount_policy = $15,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $16 AND deleted_at IS NULL
       RETURNING id, name, slug, whatsapp_api_key, resend_api_key, 
                 cloudinary_cloud_name, cloudinary_upload_preset, cloudinary_api_key, cloudinary_api_secret,
                 stripe_secret_key, stripe_publishable_key,
                 bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url, default_incoterm, discount_policy`,
      [
        whatsapp_api_key !== undefined && whatsapp_api_key !== null ? whatsapp_api_key.trim() : null,
        resend_api_key !== undefined && resend_api_key !== null ? resend_api_key.trim() : null,
        cloudinary_cloud_name !== undefined && cloudinary_cloud_name !== null ? cloudinary_cloud_name.trim() : null,
        cloudinary_upload_preset !== undefined && cloudinary_upload_preset !== null ? cloudinary_upload_preset.trim() : null,
        cloudinary_api_key !== undefined && cloudinary_api_key !== null ? cloudinary_api_key.trim() : null,
        cloudinary_api_secret !== undefined && cloudinary_api_secret !== null ? cloudinary_api_secret.trim() : null,
        stripe_secret_key !== undefined && stripe_secret_key !== null ? stripe_secret_key.trim() : null,
        stripe_publishable_key !== undefined && stripe_publishable_key !== null ? stripe_publishable_key.trim() : null,
        bank_name !== undefined && bank_name !== null ? bank_name.trim() : null,
        bank_account_name !== undefined && bank_account_name !== null ? bank_account_name.trim() : null,
        bank_account_number !== undefined && bank_account_number !== null ? bank_account_number.trim() : null,
        bank_routing_number !== undefined && bank_routing_number !== null ? bank_routing_number.trim() : null,
        logo_url !== undefined && logo_url !== null ? logo_url.trim() : null,
        default_incoterm !== undefined && default_incoterm !== null ? default_incoterm.trim() : 'FOB China',
        discount_policy !== undefined && discount_policy !== null ? discount_policy.trim() : 'tier',
        tenant_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    // Auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      tenant_id,
      'UPDATE_TENANT_API_KEYS',
      { 
        whatsapp_api_key_configured: !!whatsapp_api_key, 
        resend_api_key_configured: !!resend_api_key,
        bank_details_configured: !!bank_name
      }
    );

    res.json({
      message: 'Configuraciones de empresa actualizadas con éxito.',
      settings: result.rows[0]
    });
  } catch (err) {
    console.error('Error al actualizar configuraciones del tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// GET /api/tenants/current/dashboard (Solo Tenant Admin)
// Retorna estadísticas consolidadas para el panel de control.
// ============================================================
router.get('/current/dashboard', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { start_date, end_date } = req.query;

  let query = `
    SELECT 
      so.id as order_id,
      so.created_at,
      so.subtotal_usd,
      so.discount_usd,
      so.shipping_cost_usd,
      so.total_usd,
      so.status,
      soi.qty_cases,
      soi.price_case_usd,
      soi.total_item_usd,
      p.name as product_name,
      p.sku as product_sku,
      p.category as product_category,
      COALESCE(p.factory_cost_per_case_usd, 0) as factory_cost_per_case_usd,
      COALESCE(p.units_per_case, 1) as units_per_case,
      COALESCE(bcp.destination_country, 'UNK') as destination_country
    FROM sales_orders so
    JOIN sales_order_items soi ON soi.sales_order_id = so.id
    JOIN products p ON p.id = soi.product_id
    LEFT JOIN b2b_client_profiles bcp ON bcp.user_id = so.client_id
    WHERE so.tenant_id = $1
  `;
  const params = [tenant_id];

  if (start_date) {
    params.push(start_date);
    query += ` AND so.created_at >= $${params.length}`;
  }
  if (end_date) {
    params.push(end_date);
    query += ` AND so.created_at <= $${params.length}`;
  }

  query += ` ORDER BY so.created_at ASC`;

  try {
    const result = await pool.query(query, params);
    const rows = result.rows;

    let totalSales = 0;
    let totalCosts = 0;

    const salesByDayMap = {};
    const salesByCategoryMap = {};
    const productsMap = {};

    const salesByCountryMap = {};

    rows.forEach(r => {
      const qty = parseInt(r.qty_cases) || 0;
      const price = parseFloat(r.price_case_usd) || 0;
      const itemRevenue = qty * price;
      // Costo real por case = costo_por_unidad * unidades_por_case
      const unitsPerCase = parseInt(r.units_per_case) || 1;
      const costPerCase = (parseFloat(r.factory_cost_per_case_usd) || 0) * unitsPerCase;
      const itemCost = qty * costPerCase;

      totalSales += itemRevenue;
      totalCosts += itemCost;

      const dateStr = new Date(r.created_at).toISOString().split('T')[0];
      if (!salesByDayMap[dateStr]) {
        salesByDayMap[dateStr] = { date: dateStr, sales: 0, cost: 0, profit: 0 };
      }
      salesByDayMap[dateStr].sales += itemRevenue;
      salesByDayMap[dateStr].cost += itemCost;
      salesByDayMap[dateStr].profit += (itemRevenue - itemCost);

      const cat = r.product_category || 'Otros';
      if (!salesByCategoryMap[cat]) {
        salesByCategoryMap[cat] = { category: cat, sales: 0 };
      }
      salesByCategoryMap[cat].sales += itemRevenue;

      const sku = r.product_sku;
      if (!productsMap[sku]) {
        productsMap[sku] = { name: r.product_name, sku: sku, qty_cases: 0, sales: 0, cost: 0, profit: 0 };
      }
      productsMap[sku].qty_cases += qty;
      productsMap[sku].sales += itemRevenue;
      productsMap[sku].cost += itemCost;
      productsMap[sku].profit += (itemRevenue - itemCost);

      // Agrupar por país de destino (ISO-3)
      const country = (r.destination_country || 'UNK').toUpperCase().trim();
      if (country && country !== 'UNK') {
        if (!salesByCountryMap[country]) {
          salesByCountryMap[country] = { iso3: country, sales: 0, cases: 0 };
        }
        salesByCountryMap[country].sales += itemRevenue;
        salesByCountryMap[country].cases += qty;
      }
    });

    const totalProfit = totalSales - totalCosts;
    const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    const sales_by_day = Object.values(salesByDayMap);
    const sales_by_category = Object.values(salesByCategoryMap);
    const top_products = Object.values(productsMap)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
    // sales_by_country: { ISO3: { iso3, sales, cases } }
    const sales_by_country = salesByCountryMap;

    res.json({
      summary: {
        total_sales: totalSales,
        total_costs: totalCosts,
        total_profit: totalProfit,
        margin_percent: marginPercent
      },
      sales_by_day,
      sales_by_category,
      top_products,
      sales_by_country
    });
  } catch (err) {
    console.error('Error al generar reporte de dashboard:', err);
    res.status(500).json({ error: 'Error interno del servidor al calcular métricas.' });
  }
});

// ============================================================
// GET /api/tenants/current/bank-details (Autenticado, para Clientes B2B)
// Retorna la información pública y bancaria del tenant.
// ============================================================
router.get('/current/bank-details', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT name, bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url, discount_policy 
       FROM tenants 
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener datos bancarios del tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// WAREHOUSES MANAGEMENT (Solo Tenant Admin)
// ============================================================

// GET /api/tenants/current/warehouses
router.get('/current/warehouses', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT id, name, code, address, contact_info, is_virtual FROM warehouses WHERE tenant_id = $1 ORDER BY is_virtual ASC, code ASC',
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener almacenes:', err);
    res.status(500).json({ error: 'Error al cargar los almacenes.' });
  }
});

// POST /api/tenants/current/warehouses (Crear nuevo almacén físico)
router.post('/current/warehouses', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { name, code, address, contact_info } = req.body;

  if (!name || !code) {
    return res.status(400).json({ error: 'El nombre y código de almacén son obligatorios.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO warehouses (tenant_id, name, code, address, contact_info, is_virtual)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING *`,
      [tenant_id, name, code.toUpperCase().trim(), address, contact_info]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear almacén:', err);
    res.status(500).json({ error: 'Error al registrar el almacén (verifique que el código no esté duplicado).' });
  }
});

// PUT /api/tenants/current/warehouses/:id
router.put('/current/warehouses/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { name, address, contact_info } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'El nombre del almacén es obligatorio.' });
  }

  try {
    const result = await pool.query(
      `UPDATE warehouses 
       SET name = $1, address = $2, contact_info = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [name, address, contact_info, id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Almacén no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar almacén:', err);
    res.status(500).json({ error: 'Error al actualizar el almacén.' });
  }
});

// POST /api/tenants/seed-demo
router.post('/seed-demo', async (req, res) => {
  const { secret } = req.body;
  if (secret !== 'gosu_demo_seed_secret_123') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Limpieza de datos anteriores si existen
    const existingTenant = await client.query("SELECT id FROM tenants WHERE slug = 'gosu-demo'");
    if (existingTenant.rows.length > 0) {
      await client.query("DELETE FROM tenants WHERE slug = 'gosu-demo'");
    }

    // 2. Crear Tenant
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug, is_active, bank_name, bank_account_name, bank_account_number, bank_routing_number)
      VALUES ('GOSU Demo B2B', 'gosu-demo', true, 'Chase Manhattan Bank', 'GOSU DEMO INC', '1234567890', '987654321')
      RETURNING id
    `);
    const tenantId = tenantResult.rows[0].id;

    // 3. Hashear contraseñas
    const salt = await bcrypt.genSalt(10);
    const adminPassHash = await bcrypt.hash('gosu_demo_pass', salt);
    const clientPassHash = await bcrypt.hash('alpha_pass', salt);
    const leadPassHash = await bcrypt.hash('mega_pass', salt);

    // 4. Crear Administrador del Tenant
    await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Gosu Demo Admin', 'demo@gosu-int.com', $2, 'tenant_admin')
    `, [tenantId, adminPassHash]);

    // 5. Crear Distribuidor Cliente B2B (User)
    const clientUserResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Alpha Distributor Contact', 'alpha@alphadist.com', $2, 'b2b_client')
      RETURNING id
    `, [tenantId, clientPassHash]);
    const clientUserId = clientUserResult.rows[0].id;

    // 6. Crear Cliente Lead B2B (User)
    const leadUserResult = await client.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Mega Card Buyer', 'mega@megacards.com', $2, 'b2b_client')
      RETURNING id
    `, [tenantId, leadPassHash]);
    const leadUserId = leadUserResult.rows[0].id;

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

    // 9. Crear Reglas de descuento por volumen global por defecto
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
    const p1 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00001', 'DECK BOX NEON PINK - 100+ CARDS', 'DECK BOX', 'Premium deck box with neon acrylic structure.', 35.00, 24, '75x90x100mm', 'Neon Pink', 'Dongguan Card Supplies', 'DB-NP-24', 10.00, 'PMS 806C', 8.50, 45.0, 30.0, 35.0)
      RETURNING id
    `, [tenantId]);
    const p1Id = p1.rows[0].id;

    const p2 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00002', 'DECK BOX DEEP BLUE - 100+ CARDS', 'DECK BOX', 'Premium deck box with royal blue deep structure.', 35.00, 24, '75x90x100mm', 'Deep Blue', 'Dongguan Card Supplies', 'DB-DB-24', 10.00, 'PMS 293C', 8.50, 45.0, 30.0, 35.0)
      RETURNING id
    `, [tenantId]);
    const p2Id = p2.rows[0].id;

    const p3 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00003', 'SLEEVES MATTE BLACK - 100 PACK', 'SLEEVES', 'Standard tournament matte black card sleeves.', 8.00, 120, '66x91mm', 'Matte Black', 'Zhejiang Plastic Works', 'SL-MB-120', 2.00, 'PMS Black 6C', 12.00, 50.0, 25.0, 30.0)
      RETURNING id
    `, [tenantId]);
    const p3Id = p3.rows[0].id;

    const p4 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00004', 'SLEEVES MATTE CYAN - 100 PACK', 'SLEEVES', 'Neon series matte cyan sleeves. Soft touch.', 8.00, 120, '66x91mm', 'Matte Cyan', 'Zhejiang Plastic Works', 'SL-MC-120', 2.00, 'PMS 801C', 12.00, 50.0, 25.0, 30.0)
      RETURNING id
    `, [tenantId]);
    const p4Id = p4.rows[0].id;

    const p5 = await client.query(`
      INSERT INTO products (tenant_id, sku, name, category, commercial_description, price_per_case_usd, units_per_case, finished_measurements, color, factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, case_weight_kg, case_length_cm, case_width_cm, case_height_cm)
      VALUES ($1, 'G00005', 'PLAYMAT GOSU NEON WAVE', 'PLAYMAT', 'Stitched edge premium rubber playmat.', 45.00, 12, '610x350x2mm', 'Neon Wave', 'Fujian Rubber Co', 'PM-NW-12', 15.00, 'PMS 802C', 6.00, 65.0, 15.0, 15.0)
      RETURNING id
    `, [tenantId]);
    const p5Id = p5.rows[0].id;

    // 12. Existencias
    await client.query(`
      INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
      VALUES
        ($1, $2, 150, 50),
        ($1, $3, 90, 0),
        ($1, $4, 400, 120),
        ($1, $5, 0, 250),
        ($1, $6, 25, 10)
    `, [tenantId, p1Id, p2Id, p3Id, p4Id, p5Id]);

    // 13. Campaña
    const campaignResult = await client.query(`
      INSERT INTO campaigns (tenant_id, name, start_date_reservations, end_date_reservations, start_date_production, estimated_end_date_production, advance_payment_pct, status)
      VALUES ($1, 'Print Run Q3 - Neon Series', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 days', CURRENT_TIMESTAMP + INTERVAL '16 days', CURRENT_TIMESTAMP + INTERVAL '45 days', 30.00, 'open')
      RETURNING id
    `, [tenantId]);
    const campaignId = campaignResult.rows[0].id;

    await client.query(`
      UPDATE products
      SET campaign_id = $1
      WHERE id IN ($2, $3)
    `, [campaignId, p4Id, p5Id]);

    // 14. Órdenes
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

    // 15. Fabricación
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

    await client.query('COMMIT');
    res.json({ success: true, message: 'Siembra del tenant de prueba completada con éxito.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error durante la siembra del tenant de prueba:', err);
    res.status(500).json({ error: `Error durante la siembra: ${err.message}` });
  } finally {
    client.release();
  }
});

export default router;
