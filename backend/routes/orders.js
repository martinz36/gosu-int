import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/orders
// Admin: ve todos los pedidos del tenant.
// Cliente: ve solo sus pedidos.
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { tenant_id, role, id: userId } = req.user;

  let query = `
    SELECT
      so.id, so.status, so.total_amount_usd, so.discount_percent,
      so.payment_receipt_url, so.notes, so.created_at,
      u.name as client_name, u.email as client_email,
      json_agg(json_build_object(
        'id',                 soi.id,
        'product_id',         soi.product_id,
        'name',               p.name,
        'sku',                p.sku,
        'qty_cases',          soi.qty_cases,
        'price_per_case_usd', soi.price_per_case_usd
      ) ORDER BY p.name) AS items
    FROM sales_orders so
    JOIN users u ON u.id = so.client_id
    JOIN sales_order_items soi ON soi.sales_order_id = so.id
    JOIN products p ON p.id = soi.product_id
    WHERE so.tenant_id = $1
  `;

  const params = [tenant_id];

  if (role !== 'admin') {
    params.push(userId);
    query += ` AND so.client_id = $${params.length}`;
  }

  query += ' GROUP BY so.id, u.name, u.email ORDER BY so.created_at DESC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener pedidos:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/orders
// Crea un nuevo pedido B2B.
// Body: { items: [{ product_id, qty_cases }] }
// ============================================================
router.post('/', requireAuth, async (req, res) => {
  const { tenant_id, id: client_id, client_category, custom_moa_usd } = req.user;
  const { items, notes } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe incluir al menos un producto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener precios reales de los productos y verificar que pertenecen al tenant
    const productIds = items.map(i => i.product_id);
    const productsResult = await client.query(
      `SELECT id, price_per_case_usd, stock_cases FROM products
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenant_id]
    );

    if (productsResult.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Uno o más productos no son válidos para este tenant.' });
    }

    const priceMap = Object.fromEntries(productsResult.rows.map(p => [p.id, p]));

    // Calcular subtotal
    let subtotal = 0;
    let totalCases = 0;
    const enrichedItems = items.map(item => {
      const product = priceMap[item.product_id];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado.`);
      subtotal += product.price_per_case_usd * item.qty_cases;
      totalCases += item.qty_cases;
      return { ...item, price_per_case_usd: product.price_per_case_usd };
    });

    // Obtener descuentos para el tenant
    const discountsResult = await client.query(
      `SELECT min_cases, discount_percentage, client_category
       FROM volume_discounts
       WHERE tenant_id = $1
       ORDER BY min_cases DESC`,
      [tenant_id]
    );

    // Aplicar descuento por categoría (wholesale_distributor)
    let categoryDiscount = 0;
    const categoryDiscountRow = discountsResult.rows.find(
      d => d.client_category === client_category && d.min_cases === 1
    );
    if (categoryDiscountRow) categoryDiscount = parseFloat(categoryDiscountRow.discount_percentage);

    // Aplicar descuento por volumen
    let volumeDiscount = 0;
    for (const d of discountsResult.rows) {
      if (d.client_category === 'all' && totalCases >= d.min_cases) {
        volumeDiscount = parseFloat(d.discount_percentage);
        break;
      }
    }

    const totalDiscountPercent = categoryDiscount + volumeDiscount;
    const discountAmount = subtotal * (totalDiscountPercent / 100);
    const finalTotal = subtotal - discountAmount;

    // Validar MOA
    const moaLimit = parseFloat(custom_moa_usd) || 1000;
    if (finalTotal < moaLimit) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `El pedido no alcanza el Monto Mínimo de Orden de $${moaLimit.toFixed(2)} USD. Total actual: $${finalTotal.toFixed(2)} USD.`
      });
    }

    // Crear la orden
    const orderResult = await client.query(
      `INSERT INTO sales_orders (tenant_id, client_id, total_amount_usd, discount_percent, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenant_id, client_id, finalTotal, totalDiscountPercent, notes || null]
    );
    const order = orderResult.rows[0];

    // Insertar los items
    for (const item of enrichedItems) {
      await client.query(
        `INSERT INTO sales_order_items (sales_order_id, product_id, qty_cases, price_per_case_usd)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.product_id, item.qty_cases, item.price_per_case_usd]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Pedido creado con éxito.',
      order: {
        ...order,
        items: enrichedItems,
        subtotal,
        discount_percent: totalDiscountPercent,
        discount_amount: discountAmount,
        final_total: finalTotal
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear pedido:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/orders/:id/status  (Solo admin)
// Actualiza el estado de un pedido.
// Body: { status }
// ============================================================
router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending_payment', 'payment_confirmed', 'in_production', 'ready', 'in_dispatch', 'delivered'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE sales_orders SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *`,
      [status, id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
