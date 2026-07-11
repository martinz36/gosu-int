import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/plans (Solo Super Admin)
// Retorna la lista de planes de suscripción disponibles.
// ============================================================
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, max_users, price_usd, created_at FROM plans ORDER BY price_usd ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener planes:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
