import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// ============================================================
// GET /api/users/global (Solo Super Admin)
// Retorna la lista de todos los usuarios registrados en el sistema,
// indicando a qué tenant pertenecen y sus roles.
// ============================================================
router.get('/global', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.client_category, u.created_at, t.name as tenant_name, t.slug as tenant_slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios globales:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/users/superadmin (Solo Super Admin)
// Crea un nuevo usuario Super Admin para control y soporte interno.
// ============================================================
router.post('/superadmin', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
  }

  // Los Super Admins se registran bajo el tenant por defecto (Gosu Accessories)
  const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'superadmin')
       RETURNING id, name, email, role, created_at`,
      [PLATFORM_TENANT_ID, name, email.toLowerCase(), password_hash]
    );

    const newSuperAdmin = result.rows[0];

    // Registrar en auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      null,
      'CREATE_SUPERADMIN',
      { new_user_id: newSuperAdmin.id, new_user_email: newSuperAdmin.email }
    );

    res.status(201).json({
      message: 'Nuevo administrador de plataforma registrado con éxito.',
      user: newSuperAdmin,
    });
  } catch (err) {
    console.error('Error al crear superadmin:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
