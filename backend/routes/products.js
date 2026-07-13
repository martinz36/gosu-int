import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/products
// Retorna todos los productos del tenant del usuario autenticado.
// Filtra campos de fábrica si el usuario es un Cliente B2B.
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { category, search } = req.query;
  const { tenant_id, role } = req.user;

  // Campos comerciales base comunes a todos
  let selectFields = `
    p.id, p.tenant_id, p.sku, p.name, p.category, p.image_url, p.is_active,
    p.commercial_description, p.price_per_case_usd, p.units_per_case, p.finished_measurements,
    p.case_weight_kg, p.case_length_cm, p.case_width_cm, p.case_height_cm, p.case_cbm,
    p.created_at, p.updated_at,
    COALESCE(i.stock_physical_cases, 0) as stock_physical_cases,
    COALESCE(i.stock_in_production_cases, 0) as stock_in_production_cases
  `;

  // Si el usuario es Admin o Super Admin, agregamos los campos confidenciales de producción
  if (role === 'tenant_admin' || role === 'super_admin') {
    selectFields += `,
      p.factory_name, p.factory_sku, p.factory_cost_per_case_usd,
      p.pantone_codes, p.cut_measurements, p.fabrication_notes
    `;
  }

  let query = `
    SELECT ${selectFields}
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
    WHERE p.tenant_id = $1
  `;
  const params = [tenant_id];

  if (category && category !== 'all') {
    params.push(category);
    query += ` AND p.category = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
  }

  query += ' ORDER BY p.category, p.name';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/products  (Solo Tenant Admin)
// Crea un nuevo producto en el catálogo e inicializa su inventario.
// ============================================================
router.post('/', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const {
    name, sku, category, image_url, is_active,
    commercial_description, price_per_case_usd, units_per_case, finished_measurements,
    factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
    case_weight_kg, case_length_cm, case_width_cm, case_height_cm,
    stock_physical_cases, stock_in_production_cases
  } = req.body;

  if (!name || !sku || !category || !price_per_case_usd || !case_weight_kg || !case_length_cm || !case_width_cm || !case_height_cm) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, sku, categoría, precio, peso o dimensiones de caja).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insertar el producto en products
    const productResult = await client.query(
      `INSERT INTO products (
        tenant_id, sku, name, category, image_url, is_active,
        commercial_description, price_per_case_usd, units_per_case, finished_measurements,
        factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
        case_weight_kg, case_length_cm, case_width_cm, case_height_cm
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        tenant_id, sku, name, category, image_url || null, is_active !== false,
        commercial_description || null, price_per_case_usd, units_per_case || 1, finished_measurements || null,
        factory_name || null, factory_sku || null, factory_cost_per_case_usd || null, pantone_codes || null,
        cut_measurements || null, fabrication_notes || null,
        case_weight_kg, case_length_cm, case_width_cm, case_height_cm
      ]
    );

    const newProduct = productResult.rows[0];

    // 2. Insertar inventario correspondiente
    const inventoryResult = await client.query(
      `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
       VALUES ($1, $2, $3, $4)
       RETURNING stock_physical_cases, stock_in_production_cases`,
      [
        tenant_id,
        newProduct.id,
        parseInt(stock_physical_cases) || 0,
        parseInt(stock_in_production_cases) || 0
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...newProduct,
      stock_physical_cases: inventoryResult.rows[0].stock_physical_cases,
      stock_in_production_cases: inventoryResult.rows[0].stock_in_production_cases
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese SKU en este tenant.' });
    }
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/products/:id  (Solo Tenant Admin)
// Actualiza un producto del tenant e incrementa/modifica su inventario.
// ============================================================
router.put('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const {
    name, sku, category, image_url, is_active,
    commercial_description, price_per_case_usd, units_per_case, finished_measurements,
    factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
    case_weight_kg, case_length_cm, case_width_cm, case_height_cm,
    stock_physical_cases, stock_in_production_cases
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Actualizar el producto en products
    const productResult = await client.query(
      `UPDATE products
       SET name=$1, sku=$2, category=$3, image_url=$4, is_active=$5,
           commercial_description=$6, price_per_case_usd=$7, units_per_case=$8, finished_measurements=$9,
           factory_name=$10, factory_sku=$11, factory_cost_per_case_usd=$12, pantone_codes=$13, cut_measurements=$14, fabrication_notes=$15,
           case_weight_kg=$16, case_length_cm=$17, case_width_cm=$18, case_height_cm=$19,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$20 AND tenant_id=$21
       RETURNING *`,
      [
        name, sku, category, image_url, is_active !== false,
        commercial_description, price_per_case_usd, units_per_case, finished_measurements,
        factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
        case_weight_kg, case_length_cm, case_width_cm, case_height_cm,
        id, tenant_id
      ]
    );

    if (productResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const updatedProduct = productResult.rows[0];

    // 2. Actualizar el inventario mediante un UPSERT
    const inventoryResult = await client.query(
      `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, product_id)
       DO UPDATE SET 
         stock_physical_cases = EXCLUDED.stock_physical_cases,
         stock_in_production_cases = EXCLUDED.stock_in_production_cases,
         updated_at = CURRENT_TIMESTAMP
       RETURNING stock_physical_cases, stock_in_production_cases`,
      [
        tenant_id,
        id,
        parseInt(stock_physical_cases) || 0,
        parseInt(stock_in_production_cases) || 0
      ]
    );

    await client.query('COMMIT');

    res.json({
      ...updatedProduct,
      stock_physical_cases: inventoryResult.rows[0].stock_physical_cases,
      stock_in_production_cases: inventoryResult.rows[0].stock_in_production_cases
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// POST /api/products/bulk  (Solo Tenant Admin)
// Carga masiva o actualización de productos e inventarios.
// ============================================================
router.post('/bulk', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { products } = req.body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Debes proporcionar un arreglo de productos bajo la propiedad "products".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const {
        sku, name, category, image_url, is_active,
        commercial_description, price_per_case_usd, units_per_case, finished_measurements,
        factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
        case_weight_kg, case_length_cm, case_width_cm, case_height_cm,
        stock_physical_cases, stock_in_production_cases
      } = p;

      // Validación simple
      if (!sku || !name || !category || price_per_case_usd === undefined) {
        throw new Error(`Fila ${i + 1}: SKU, Nombre, Categoría y Precio por Caja son obligatorios.`);
      }

      // Validar si existe para el conteo de inserts/updates
      const existingProduct = await client.query(
        'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2',
        [tenant_id, sku.trim()]
      );
      const existed = existingProduct.rows.length > 0;

      // Upsert del producto
      const productQuery = `
        INSERT INTO products (
          tenant_id, sku, name, category, image_url, is_active,
          commercial_description, price_per_case_usd, units_per_case, finished_measurements,
          factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
          case_weight_kg, case_length_cm, case_width_cm, case_height_cm
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (tenant_id, sku)
        DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          image_url = COALESCE(EXCLUDED.image_url, products.image_url),
          is_active = EXCLUDED.is_active,
          commercial_description = COALESCE(EXCLUDED.commercial_description, products.commercial_description),
          price_per_case_usd = EXCLUDED.price_per_case_usd,
          units_per_case = EXCLUDED.units_per_case,
          finished_measurements = COALESCE(EXCLUDED.finished_measurements, products.finished_measurements),
          factory_name = COALESCE(EXCLUDED.factory_name, products.factory_name),
          factory_sku = COALESCE(EXCLUDED.factory_sku, products.factory_sku),
          factory_cost_per_case_usd = EXCLUDED.factory_cost_per_case_usd,
          pantone_codes = COALESCE(EXCLUDED.pantone_codes, products.pantone_codes),
          cut_measurements = COALESCE(EXCLUDED.cut_measurements, products.cut_measurements),
          fabrication_notes = COALESCE(EXCLUDED.fabrication_notes, products.fabrication_notes),
          case_weight_kg = EXCLUDED.case_weight_kg,
          case_length_cm = EXCLUDED.case_length_cm,
          case_width_cm = EXCLUDED.case_width_cm,
          case_height_cm = EXCLUDED.case_height_cm,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const productResult = await client.query(productQuery, [
        tenant_id,
        sku.trim(),
        name.trim(),
        category.trim(),
        image_url || null,
        is_active !== false,
        commercial_description || null,
        parseFloat(price_per_case_usd) || 0.00,
        parseInt(units_per_case) || 1,
        finished_measurements || null,
        factory_name || null,
        factory_sku || null,
        factory_cost_per_case_usd !== undefined && factory_cost_per_case_usd !== '' ? parseFloat(factory_cost_per_case_usd) : null,
        pantone_codes || null,
        cut_measurements || null,
        fabrication_notes || null,
        parseFloat(case_weight_kg) || 10.00,
        parseFloat(case_length_cm) || 40.00,
        parseFloat(case_width_cm) || 30.00,
        parseFloat(case_height_cm) || 20.00
      ]);

      const productId = productResult.rows[0].id;

      if (existed) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      // Upsert del inventario
      const inventoryQuery = `
        INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, product_id)
        DO UPDATE SET
          stock_physical_cases = EXCLUDED.stock_physical_cases,
          stock_in_production_cases = EXCLUDED.stock_in_production_cases,
          updated_at = CURRENT_TIMESTAMP;
      `;

      await client.query(inventoryQuery, [
        tenant_id,
        productId,
        parseInt(stock_physical_cases) || 0,
        parseInt(stock_in_production_cases) || 0
      ]);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      processed: products.length,
      inserted: insertedCount,
      updated: updatedCount
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en carga masiva de productos:', err);
    res.status(500).json({ error: err.message || 'Error al procesar la carga masiva en la base de datos.' });
  } finally {
    client.release();
  }
});

// ============================================================
// DELETE /api/products/:id  (Solo Tenant Admin)
// ============================================================
router.delete('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
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
