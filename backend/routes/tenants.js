import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
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
      'SELECT id, name, slug, whatsapp_api_key, resend_api_key FROM tenants WHERE id = $1 AND deleted_at IS NULL',
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
// Actualiza las API keys del tenant actual.
// ============================================================
router.put('/current/settings', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { whatsapp_api_key, resend_api_key } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET whatsapp_api_key = $1, resend_api_key = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id, name, slug, whatsapp_api_key, resend_api_key`,
      [
        whatsapp_api_key !== undefined && whatsapp_api_key !== null ? whatsapp_api_key.trim() : null,
        resend_api_key !== undefined && resend_api_key !== null ? resend_api_key.trim() : null,
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
      { whatsapp_api_key_configured: !!whatsapp_api_key, resend_api_key_configured: !!resend_api_key }
    );

    res.json({
      message: 'Configuraciones de API actualizadas con éxito.',
      settings: result.rows[0]
    });
  } catch (err) {
    console.error('Error al actualizar configuraciones del tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
