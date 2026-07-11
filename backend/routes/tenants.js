import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/tenants (Solo Super Admin)
// Lista todos los tenants registrados en el sistema
// ============================================================
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.slug, t.is_active, t.created_at,
       (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
       (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as product_count
       FROM tenants t
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
// Crea una nueva empresa (tenant) y su primer usuario Administrador.
// Body: { name, slug, adminName, adminEmail, adminPassword }
// ============================================================
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, slug, adminName, adminEmail, adminPassword } = req.body;

  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      error: 'Nombre de empresa, slug, nombre de administrador, email y contraseña son requeridos.',
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

    // Verificar si el slug ya existe
    const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug.toLowerCase()]);
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
      `INSERT INTO tenants (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, created_at`,
      [name, slug.toLowerCase()]
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
// PUT /api/tenants/:id/status (Solo Super Admin)
// Activa o suspende una marca (tenant) en el sistema.
// Body: { is_active }
// ============================================================
router.put('/:id/status', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'El campo is_active debe ser un booleano.' });
  }

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET is_active = $1
       WHERE id = $2
       RETURNING id, name, slug, is_active`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    res.json({
      message: `Empresa ${is_active ? 'activada' : 'suspendida'} con éxito.`,
      tenant: result.rows[0],
    });
  } catch (err) {
    console.error('Error al actualizar estado del tenant:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
