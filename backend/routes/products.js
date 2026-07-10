import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/products
// Retorna todos los productos del tenant del usuario autenticado.
// Query params: ?category=sleeves&search=black
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { category, search } = req.query;
  const { tenant_id } = req.user;

  let query = `
    SELECT id, name, sku, category, units_per_case, weight_per_unit_g,
           length_cm, width_cm, height_cm, price_per_case_usd, stock_cases, image_url, created_at
    FROM products
    WHERE tenant_id = $1
  `;
  const params = [tenant_id];

  if (category && category !== 'all') {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (name ILIKE $${params.length} OR sku ILIKE $${params.length})`;
  }

  query += ' ORDER BY category, name';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/products  (Solo admin)
// Crea un nuevo producto en el catálogo del tenant.
// ============================================================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const {
    name, sku, category, units_per_case, weight_per_unit_g,
    length_cm, width_cm, height_cm, price_per_case_usd, stock_cases, image_url
  } = req.body;

  if (!name || !sku || !category || !price_per_case_usd) {
    return res.status(400).json({ error: 'Nombre, SKU, categoría y precio son requeridos.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (tenant_id, name, sku, category, units_per_case, weight_per_unit_g,
        length_cm, width_cm, height_cm, price_per_case_usd, stock_cases, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        tenant_id, name, sku, category,
        units_per_case || 1, weight_per_unit_g || 100,
        length_cm || 0, width_cm || 0, height_cm || 0,
        price_per_case_usd, stock_cases || 0, image_url || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese SKU en este tenant.' });
    }
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// PUT /api/products/:id  (Solo admin)
// Actualiza un producto del tenant.
// ============================================================
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const {
    name, sku, category, units_per_case, weight_per_unit_g,
    length_cm, width_cm, height_cm, price_per_case_usd, stock_cases, image_url
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE products
       SET name=$1, sku=$2, category=$3, units_per_case=$4, weight_per_unit_g=$5,
           length_cm=$6, width_cm=$7, height_cm=$8, price_per_case_usd=$9,
           stock_cases=$10, image_url=$11
       WHERE id=$12 AND tenant_id=$13
       RETURNING *`,
      [
        name, sku, category, units_per_case, weight_per_unit_g,
        length_cm, width_cm, height_cm, price_per_case_usd,
        stock_cases, image_url, id, tenant_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// DELETE /api/products/:id  (Solo admin)
// ============================================================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id=$1 AND tenant_id=$2 RETURNING id',
      [id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json({ message: 'Producto eliminado con éxito.' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
