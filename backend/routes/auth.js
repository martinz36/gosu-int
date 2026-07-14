import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gosu-dev-secret-change-in-prod';

// ============================================================
// POST /api/auth/login
// Body: { email, password }
// ============================================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
  }

  try {
    // Usamos LEFT JOIN para obtener el perfil y el pricing tier si es b2b_client
    const result = await pool.query(
      `SELECT u.*, t.slug as tenant_slug, t.name as tenant_name, t.is_active as tenant_active,
              p.pricing_tier_id,
              pt.tier_name, pt.discount_percentage, pt.min_order_amount, pt.only_master_cases
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN b2b_client_profiles p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
       LEFT JOIN pricing_tiers pt ON pt.id = p.pricing_tier_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Este usuario ha sido desactivado.' });
    }

    // Si no es Super Admin, validamos que su inquilino (Tenant) esté activo.
    if (user.role !== 'super_admin') {
      if (!user.tenant_id || !user.tenant_active) {
        return res.status(403).json({ error: 'Esta cuenta de marca/empresa no está activa o ha sido suspendida.' });
      }
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      {
        id:          user.id,
        tenant_id:   user.tenant_id,
        email:       user.email,
        role:        user.role,
        name:        user.name,
        tenant_slug: user.tenant_slug || null,
        tenant_name: user.tenant_name || null,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        role:                user.role,
        must_change_password:user.must_change_password === true,
        tenant_id:           user.tenant_id,
        tenant_name:         user.tenant_name || null,
        tenant_slug:         user.tenant_slug || null,
        pricing_tier_id:     user.pricing_tier_id || null,
        tier_name:           user.tier_name || null,
        discount_percentage: user.discount_percentage ? parseFloat(user.discount_percentage) : 0,
        min_order_amount:    user.min_order_amount ? parseFloat(user.min_order_amount) : 1000.00,
        only_master_cases:   user.only_master_cases === true
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/auth/register
// Crea un nuevo cliente B2B (solo admins pueden crear clientes)
// Body: { name, email, password, company_name, tax_id, billing_address, forwarder_address }
// ============================================================
router.post('/register', async (req, res) => {
  const { name, email, password, company_name, tax_id, billing_address, forwarder_address } = req.body;
  if (!name || !email || !password || !company_name || !tax_id || !billing_address || !forwarder_address) {
    return res.status(400).json({ error: 'Todos los campos requeridos (nombre, email, password, razón social, tax_id, facturación y forwarder) son obligatorios.' });
  }

  // Por defecto se asocia al tenant de desarrollo principal (gosu)
  const GOSU_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar si el email ya existe
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Este email ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // 1. Insertar en users con rol 'b2b_client'
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'b2b_client')
       RETURNING id, name, email, role, created_at`,
      [GOSU_TENANT_ID, name, email.toLowerCase(), password_hash]
    );

    const newUser = userResult.rows[0];

    // 2. Insertar en b2b_client_profiles
    const profileResult = await client.query(
      `INSERT INTO b2b_client_profiles (tenant_id, user_id, company_name, tax_id, billing_address, forwarder_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING company_name, tax_id, billing_address, forwarder_address`,
      [GOSU_TENANT_ID, newUser.id, company_name, tax_id, billing_address, forwarder_address]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Cliente registrado con éxito.',
      user: {
        ...newUser,
        profile: profileResult.rows[0]
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en register:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// POST /api/auth/bypass-login (Bypass para desarrollo/pruebas)
// Body: { email }
// ============================================================
router.post('/bypass-login', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'El email es requerido.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, t.slug as tenant_slug, t.name as tenant_name, t.is_active as tenant_active,
              p.pricing_tier_id,
              pt.tier_name, pt.discount_percentage, pt.min_order_amount, pt.only_master_cases
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN b2b_client_profiles p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
       LEFT JOIN pricing_tiers pt ON pt.id = p.pricing_tier_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Este usuario ha sido desactivado.' });
    }

    if (user.role !== 'super_admin') {
      if (!user.tenant_id || !user.tenant_active) {
        return res.status(403).json({ error: 'Esta cuenta de marca/empresa no está activa o ha sido suspendida.' });
      }
    }

    const token = jwt.sign(
      {
        id:          user.id,
        tenant_id:   user.tenant_id,
        email:       user.email,
        role:        user.role,
        name:        user.name,
        tenant_slug: user.tenant_slug || null,
        tenant_name: user.tenant_name || null,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        role:                user.role,
        must_change_password:user.must_change_password === true,
        tenant_id:           user.tenant_id,
        tenant_name:         user.tenant_name || null,
        tenant_slug:         user.tenant_slug || null,
        pricing_tier_id:     user.pricing_tier_id || null,
        tier_name:           user.tier_name || null,
        discount_percentage: user.discount_percentage ? parseFloat(user.discount_percentage) : 0,
        min_order_amount:    user.min_order_amount ? parseFloat(user.min_order_amount) : 1000.00,
        only_master_cases:   user.only_master_cases === true
      }
    });
  } catch (err) {
    console.error('Error en bypass-login:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/auth/impersonate/:userId (Solo Super Admin)
// Inicia sesión temporalmente como un administrador de tenant para soporte técnico.
// ============================================================
router.post('/impersonate/:userId', requireAuth, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT u.*, t.slug as tenant_slug, t.name as tenant_name, t.is_active as tenant_active
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [userId]
    );

    const targetUser = result.rows[0];
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado o el inquilino correspondiente ha sido desactivado.' });
    }

    if (targetUser.role === 'super_admin') {
      return res.status(400).json({ error: 'No está permitido impersonar a otros Super Administradores.' });
    }

    const token = jwt.sign(
      {
        id:              targetUser.id,
        tenant_id:       targetUser.tenant_id,
        email:           targetUser.email,
        role:            targetUser.role,
        name:            targetUser.name,
        tenant_slug:     targetUser.tenant_slug,
        tenant_name:     targetUser.tenant_name,
        impersonatedBy:  req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      targetUser.tenant_id,
      'IMPERSONATE_USER',
      { target_user_id: targetUser.id, target_user_email: targetUser.email }
    );

    res.json({
      token,
      user: {
        id:              targetUser.id,
        name:            targetUser.name,
        email:           targetUser.email,
        role:            targetUser.role,
        tenant_id:       targetUser.tenant_id,
        tenant_name:     targetUser.tenant_name,
        tenant_slug:     targetUser.tenant_slug,
        impersonatedBy:  req.user.id,
      }
    });
  } catch (err) {
    console.error('Error al impersonar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/auth/tenant-impersonate/:userId (Solo Tenant Admin)
// Permite a un administrador de tenant ingresar como uno de sus clientes B2B.
// ============================================================
router.post('/tenant-impersonate/:userId', requireAuth, async (req, res) => {
  const { id: impersonatorId, tenant_id, role: impersonatorRole, name: impersonatorName } = req.user;
  const { userId } = req.params;

  if (impersonatorRole !== 'tenant_admin' && impersonatorRole !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Administrador.' });
  }

  try {
    // Obtener los datos del usuario destino
    const result = await pool.query(
      `SELECT u.*, t.slug as tenant_slug, t.name as tenant_name, t.is_active as tenant_active,
              p.pricing_tier_id,
              pt.tier_name, pt.discount_percentage, pt.min_order_amount, pt.only_master_cases
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN b2b_client_profiles p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
       LEFT JOIN pricing_tiers pt ON pt.id = p.pricing_tier_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [userId, tenant_id]
    );

    const targetUser = result.rows[0];
    if (!targetUser) {
      return res.status(404).json({ error: 'Cliente B2B no encontrado en este Tenant.' });
    }

    if (targetUser.role !== 'b2b_client') {
      return res.status(400).json({ error: 'Solo se permite impersonar a clientes distribuidores B2B.' });
    }

    const token = jwt.sign(
      {
        id:              targetUser.id,
        tenant_id:       targetUser.tenant_id,
        email:           targetUser.email,
        role:            targetUser.role,
        name:            targetUser.name,
        tenant_slug:     targetUser.tenant_slug,
        tenant_name:     targetUser.tenant_name,
        impersonatedBy:  impersonatorId,
        impersonatorName: impersonatorName
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Auditoría
    await logAudit(
      impersonatorId,
      impersonatorName,
      tenant_id,
      'IMPERSONATE_CLIENT',
      { target_user_id: targetUser.id, target_user_email: targetUser.email }
    );

    res.json({
      token,
      user: {
        id:                  targetUser.id,
        name:                targetUser.name,
        email:               targetUser.email,
        role:                targetUser.role,
        tenant_id:           targetUser.tenant_id,
        tenant_name:         targetUser.tenant_name,
        tenant_slug:         targetUser.tenant_slug,
        pricing_tier_id:     targetUser.pricing_tier_id || null,
        tier_name:           targetUser.tier_name || null,
        discount_percentage: targetUser.discount_percentage ? parseFloat(targetUser.discount_percentage) : 0,
        min_order_amount:    targetUser.min_order_amount ? parseFloat(targetUser.min_order_amount) : 1000.00,
        only_master_cases:   targetUser.only_master_cases === true,
        impersonatedBy:      impersonatorId,
        impersonatorName:    impersonatorName
      }
    });
  } catch (err) {
    console.error('Error al impersonar cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/auth/change-password
// Permite a un usuario autenticado cambiar su propia contraseña.
// ============================================================
router.post('/change-password', requireAuth, async (req, res) => {
  const { id } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    const user = userResult.rows[0];

    if (currentPassword) {
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, id]
    );

    res.json({ message: 'Contraseña actualizada con éxito.' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
