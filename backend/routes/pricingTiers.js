import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// ============================================================
// 1. GET /api/pricing-tiers (Solo Tenant Admin / B2B Client)
// Retorna todos los Pricing Tiers configurados para el tenant logueado.
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  if (!tenant_id) {
    return res.status(400).json({ error: 'Acceso no permitido para este rol.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, tier_name, discount_percentage, min_order_amount, only_master_cases, created_at
       FROM pricing_tiers
       WHERE tenant_id = $1
       ORDER BY discount_percentage ASC`,
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener pricing tiers:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// 2. POST /api/pricing-tiers (Solo Tenant Admin)
// Crea un nuevo nivel de precios / pricing tier para el tenant.
// ============================================================
router.post('/', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { tier_name, discount_percentage, min_order_amount, only_master_cases } = req.body;

  if (!tier_name) {
    return res.status(400).json({ error: 'El nombre del nivel es obligatorio.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pricing_tiers (tenant_id, tier_name, discount_percentage, min_order_amount, only_master_cases)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tier_name, discount_percentage, min_order_amount, only_master_cases, created_at`,
      [
        tenant_id,
        tier_name,
        parseFloat(discount_percentage) || 0.00,
        parseFloat(min_order_amount) || 0.00,
        only_master_cases === true
      ]
    );

    const newTier = result.rows[0];

    await logAudit(
      req.user.id,
      tenant_id,
      'CREATE_PRICING_TIER',
      `Creado Pricing Tier '${newTier.tier_name}' con descuento de ${newTier.discount_percentage}% y mínimo de orden $${newTier.min_order_amount}.`
    );

    res.status(201).json(newTier);
  } catch (err) {
    console.error('Error al crear pricing tier:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// 3. PUT /api/pricing-tiers/:id (Solo Tenant Admin)
// Modifica un nivel de precios / pricing tier existente.
// ============================================================
router.put('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { tier_name, discount_percentage, min_order_amount, only_master_cases } = req.body;

  if (!tier_name) {
    return res.status(400).json({ error: 'El nombre del nivel es obligatorio.' });
  }

  try {
    const checkResult = await pool.query(
      'SELECT id FROM pricing_tiers WHERE id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Pricing Tier no encontrado o no pertenece a tu empresa.' });
    }

    const result = await pool.query(
      `UPDATE pricing_tiers
       SET tier_name = $1, discount_percentage = $2, min_order_amount = $3, only_master_cases = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6
       RETURNING id, tier_name, discount_percentage, min_order_amount, only_master_cases, created_at`,
      [
        tier_name,
        parseFloat(discount_percentage) || 0.00,
        parseFloat(min_order_amount) || 0.00,
        only_master_cases === true,
        id,
        tenant_id
      ]
    );

    const updatedTier = result.rows[0];

    await logAudit(
      req.user.id,
      tenant_id,
      'UPDATE_PRICING_TIER',
      `Modificado Pricing Tier '${updatedTier.tier_name}' (%: ${updatedTier.discount_percentage}, Mínimo: $${updatedTier.min_order_amount}, Cajas: ${updatedTier.only_master_cases}).`
    );

    res.json(updatedTier);
  } catch (err) {
    console.error('Error al actualizar pricing tier:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// 4. DELETE /api/pricing-tiers/:id (Solo Tenant Admin)
// Elimina un nivel de precios / pricing tier.
// ============================================================
router.delete('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const checkResult = await pool.query(
      'SELECT id, tier_name FROM pricing_tiers WHERE id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: 'Pricing Tier no encontrado o no pertenece a tu empresa.' });
    }

    const tierName = checkResult.rows[0].tier_name;

    await pool.query(
      'DELETE FROM pricing_tiers WHERE id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    await logAudit(
      req.user.id,
      tenant_id,
      'DELETE_PRICING_TIER',
      `Eliminado Pricing Tier '${tierName}' (ID: ${id}).`
    );

    res.json({ message: 'Nivel de precios eliminado exitosamente.' });
  } catch (err) {
    console.error('Error al eliminar pricing tier:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
