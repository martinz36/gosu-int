import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/production  (Solo admin)
// Lista todas las órdenes de producción del tenant.
// ============================================================
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT
         po.id, po.status, po.total_cost_usd, po.advance_payment_usd,
         po.pending_balance_usd, po.notes, po.created_at,
         json_agg(json_build_object(
           'id',               poi.id,
           'product_id',       poi.product_id,
           'name',             p.name,
           'sku',              p.sku,
           'qty_cases',        poi.qty_cases,
           'cost_per_case_usd',poi.cost_per_case_usd
         ) ORDER BY p.name) AS items
       FROM production_orders po
       JOIN production_order_items poi ON poi.production_order_id = po.id
       JOIN products p ON p.id = poi.product_id
       WHERE po.tenant_id = $1
       GROUP BY po.id
       ORDER BY po.created_at DESC`,
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener órdenes de producción:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/production  (Solo admin)
// Crea una nueva orden de producción con la fábrica.
// Body: { items: [{ product_id, qty_cases, cost_per_case_usd }], advance_payment_usd, notes }
// ============================================================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { items, advance_payment_usd, notes } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La orden debe incluir al menos un producto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calcular costo total
    const totalCostUsd = items.reduce((acc, item) => {
      return acc + (parseFloat(item.cost_per_case_usd) * parseInt(item.qty_cases));
    }, 0);

    const advance = parseFloat(advance_payment_usd) || 0;

    // Crear la orden de producción
    const orderResult = await client.query(
      `INSERT INTO production_orders (tenant_id, total_cost_usd, advance_payment_usd, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenant_id, totalCostUsd, advance, notes || null]
    );
    const order = orderResult.rows[0];

    // Insertar items
    for (const item of items) {
      // Verificar que el producto pertenece al tenant
      const productCheck = await client.query(
        'SELECT id FROM products WHERE id=$1 AND tenant_id=$2',
        [item.product_id, tenant_id]
      );
      if (productCheck.rows.length === 0) {
        throw new Error(`Producto ${item.product_id} no pertenece a este tenant.`);
      }

      await client.query(
        `INSERT INTO production_order_items (production_order_id, product_id, qty_cases, cost_per_case_usd)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.product_id, item.qty_cases, item.cost_per_case_usd]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Orden de producción creada.', order });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear orden de producción:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/production/:id/status  (Solo admin)
// Cambia el estado de la orden de producción.
// ============================================================
router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['sent', 'production_started', 'production_completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE production_orders SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *`,
      [status, id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de producción no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar estado de producción:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
