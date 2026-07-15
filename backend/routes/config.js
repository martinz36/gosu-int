import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// CATEGORIES CRUD (Filtered by tenant_id)
// ============================================================

router.get('/categories', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT id, name, slug FROM categories WHERE tenant_id = $1 ORDER BY name',
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener categorías:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/categories', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { name, slug } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug son requeridos.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO categories (tenant_id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenant_id, name, slug.toLowerCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una categoría con este slug en tu empresa.' });
    }
    console.error('Error al crear categoría:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.put('/categories/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { name, slug } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug son requeridos.' });
  }

  try {
    const result = await pool.query(
      `UPDATE categories
       SET name = $1, slug = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [name, slug.toLowerCase(), id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.delete('/categories/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }
    res.json({ message: 'Categoría eliminada con éxito.' });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// BRANDS CRUD (Filtered by tenant_id)
// ============================================================

router.get('/brands', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT id, name, slug FROM brands WHERE tenant_id = $1 ORDER BY name',
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener marcas:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/brands', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { name, slug } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug son requeridos.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO brands (tenant_id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenant_id, name, slug.toLowerCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una marca con este slug en tu empresa.' });
    }
    console.error('Error al crear marca:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.put('/brands/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { name, slug } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug son requeridos.' });
  }

  try {
    const result = await pool.query(
      `UPDATE brands
       SET name = $1, slug = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [name, slug.toLowerCase(), id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Marca no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar marca:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.delete('/brands/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM brands WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Marca no encontrada.' });
    }
    res.json({ message: 'Marca eliminada con éxito.' });
  } catch (err) {
    console.error('Error al eliminar marca:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// SKU VOLUME DISCOUNT RULES CRUD (Filtered by tenant_id)
// ============================================================

router.get('/sku-volume-rules', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  try {
    const result = await pool.query(
      'SELECT id, min_units, discount_pct FROM sku_volume_discount_rules WHERE tenant_id = $1 ORDER BY min_units',
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener reglas de volumen SKU:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/sku-volume-rules', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { min_units, discount_pct } = req.body;

  if (min_units === undefined || discount_pct === undefined) {
    return res.status(400).json({ error: 'Cantidad mínima y porcentaje de descuento son requeridos.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sku_volume_discount_rules (tenant_id, min_units, discount_pct)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenant_id, parseInt(min_units), parseFloat(discount_pct)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una regla para esta cantidad de unidades.' });
    }
    console.error('Error al crear regla de volumen SKU:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.put('/sku-volume-rules/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { min_units, discount_pct } = req.body;

  if (min_units === undefined || discount_pct === undefined) {
    return res.status(400).json({ error: 'Cantidad mínima y porcentaje de descuento son requeridos.' });
  }

  try {
    const result = await pool.query(
      `UPDATE sku_volume_discount_rules
       SET min_units = $1, discount_pct = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [parseInt(min_units), parseFloat(discount_pct), id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de volumen SKU no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar regla de volumen SKU:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.delete('/sku-volume-rules/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM sku_volume_discount_rules WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de volumen SKU no encontrada.' });
    }
    res.json({ message: 'Regla de volumen SKU eliminada con éxito.' });
  } catch (err) {
    console.error('Error al eliminar regla de volumen SKU:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
