import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

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
    const result = await pool.query(
      `SELECT u.*, t.slug as tenant_slug, t.name as tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      {
        id:        user.id,
        tenant_id: user.tenant_id,
        email:     user.email,
        role:      user.role,
        name:      user.name,
        client_category: user.client_category,
        tenant_slug: user.tenant_slug,
        tenant_name: user.tenant_name,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id:              user.id,
        name:            user.name,
        email:           user.email,
        role:            user.role,
        client_category: user.client_category,
        tenant_id:       user.tenant_id,
        tenant_name:     user.tenant_name,
        tenant_slug:     user.tenant_slug,
        custom_moa_usd:  user.custom_moa_usd,
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
// Body: { name, email, password, client_category, country, custom_moa_usd }
// ============================================================
router.post('/register', async (req, res) => {
  const { name, email, password, client_category, country, custom_moa_usd } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
  }

  // Para registro público, solo se pueden crear clientes en el tenant por defecto (gosu)
  const GOSU_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, client_category, country, custom_moa_usd)
       VALUES ($1, $2, $3, $4, 'client', $5, $6, $7)
       RETURNING id, name, email, role, client_category, country, custom_moa_usd, created_at`,
      [
        GOSU_TENANT_ID,
        name,
        email.toLowerCase(),
        password_hash,
        client_category || 'retail_store',
        country || null,
        custom_moa_usd || 1000.00
      ]
    );

    res.status(201).json({ message: 'Cliente registrado con éxito.', user: result.rows[0] });
  } catch (err) {
    console.error('Error en register:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
