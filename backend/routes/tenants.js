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
              bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url 
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
    bank_name,
    bank_account_name,
    bank_account_number,
    bank_routing_number,
    logo_url
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET whatsapp_api_key = $1, 
           resend_api_key = $2, 
           bank_name = $3, 
           bank_account_name = $4, 
           bank_account_number = $5, 
           bank_routing_number = $6, 
           logo_url = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND deleted_at IS NULL
       RETURNING id, name, slug, whatsapp_api_key, resend_api_key, 
                 bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url`,
      [
        whatsapp_api_key !== undefined && whatsapp_api_key !== null ? whatsapp_api_key.trim() : null,
        resend_api_key !== undefined && resend_api_key !== null ? resend_api_key.trim() : null,
        bank_name !== undefined && bank_name !== null ? bank_name.trim() : null,
        bank_account_name !== undefined && bank_account_name !== null ? bank_account_name.trim() : null,
        bank_account_number !== undefined && bank_account_number !== null ? bank_account_number.trim() : null,
        bank_routing_number !== undefined && bank_routing_number !== null ? bank_routing_number.trim() : null,
        logo_url !== undefined && logo_url !== null ? logo_url.trim() : null,
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
      `SELECT name, bank_name, bank_account_name, bank_account_number, bank_routing_number, logo_url 
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

export default router;
