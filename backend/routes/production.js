import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/production  (Solo admin del Tenant)
// Lista todas las órdenes de producción del tenant con sus items.
// ============================================================
router.get('/', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT
         po.id, po.order_number, po.factory_name, po.status, 
         po.estimated_completion_date, po.actual_completion_date, 
         po.total_cost_usd, po.total_cbm, po.tracking_number, po.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', poi.id,
               'product_id', poi.product_id,
               'name', p.name,
               'sku', p.sku,
               'quantity_cases', poi.quantity_cases,
               'cost_per_case_usd', poi.cost_per_case_usd,
               'total_item_cost_usd', poi.total_item_cost_usd,
               'item_cbm', poi.item_cbm,
               'production_files_url', p.production_files_url,
               'image_url', p.image_url,
               'finished_measurements', p.finished_measurements,
               'cut_measurements', p.cut_measurements,
               'color', p.color
             ) ORDER BY p.name
           ) FILTER (WHERE poi.id IS NOT NULL), '[]'
         ) AS items
       FROM production_orders po
       LEFT JOIN production_order_items poi ON poi.production_order_id = po.id AND poi.tenant_id = po.tenant_id
       LEFT JOIN products p ON p.id = poi.product_id AND p.tenant_id = po.tenant_id
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
// POST /api/production  (Solo admin del Tenant)
// Crea una nueva orden de producción e inicializa su seguimiento.
// ============================================================
router.post('/', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { factory_name, estimated_completion_date, tracking_number, items, status } = req.body;

  if (!factory_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'La fábrica y al menos un producto son requeridos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener correlativo secuencial para order_number
    const countResult = await client.query(
      'SELECT COUNT(*) FROM production_orders WHERE tenant_id = $1',
      [tenant_id]
    );
    const count = parseInt(countResult.rows[0].count);
    const orderNumber = `PO-${(count + 1).toString().padStart(5, '0')}`;

    // 2. Calcular totales (costo y volumen CBM) y verificar items
    let totalCostUsd = 0;
    let totalCbm = 0;
    const validatedItems = [];

    for (const item of items) {
      const { product_id, quantity_cases, cost_per_case_usd } = item;
      
      const productResult = await client.query(
        'SELECT id, case_cbm, units_per_case FROM products WHERE id=$1 AND tenant_id=$2',
        [product_id, tenant_id]
      );
      if (productResult.rows.length === 0) {
        throw new Error(`El producto con ID ${product_id} no pertenece a este tenant.`);
      }
      
      const product = productResult.rows[0];
      const qty = parseInt(quantity_cases) || 0;
      // cost_per_case_usd viene del frontend como costo por UNIDAD (factory_cost_per_unit_usd)
      // El costo real por caja = costo_por_unidad * unidades_por_caja
      const costPerUnit = parseFloat(cost_per_case_usd) || 0;
      const unitsPerCase = parseInt(product.units_per_case) || 1;
      const actualCostPerCase = costPerUnit * unitsPerCase;
      const caseCbm = parseFloat(product.case_cbm) || 0;
      
      const itemCost = qty * actualCostPerCase;
      const itemCbm = qty * caseCbm;
      
      totalCostUsd += itemCost;
      totalCbm += itemCbm;
      
      validatedItems.push({
        product_id,
        quantity_cases: qty,
        cost_per_case_usd: actualCostPerCase,  // guardamos el costo REAL por caja
        total_item_cost_usd: itemCost,
        item_cbm: itemCbm
      });
    }

    const orderStatus = status || 'Draft';

    // 3. Insertar cabecera de orden
    const orderResult = await client.query(
      `INSERT INTO production_orders (
         tenant_id, order_number, factory_name, status, 
         estimated_completion_date, total_cost_usd, total_cbm, tracking_number
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenant_id, orderNumber, factory_name, orderStatus,
        estimated_completion_date || null, totalCostUsd, totalCbm, tracking_number || null
      ]
    );
    const newOrder = orderResult.rows[0];

    // 4. Insertar items y actualizar inventarios (si aplica)
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO production_order_items (
           tenant_id, production_order_id, product_id, quantity_cases, 
           cost_per_case_usd, total_item_cost_usd, item_cbm
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenant_id, newOrder.id, item.product_id, item.quantity_cases,
          item.cost_per_case_usd, item.total_item_cost_usd, item.item_cbm
        ]
      );

      // Si la orden se inicia directamente en Production, incrementamos el stock en producción
      if (orderStatus === 'Production') {
        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, 0, $3)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET 
             stock_in_production_cases = inventory.stock_in_production_cases + EXCLUDED.stock_in_production_cases,
             updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, item.product_id, item.quantity_cases]
        );
      }
    }

    // 5. Registrar log de auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenant_id,
        req.user.id,
        'CREATE_PRODUCTION_ORDER',
        'production_orders',
        newOrder.id,
        null,
        orderStatus
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Orden de producción creada con éxito.', order: newOrder });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al crear orden de producción:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/production/:id/status  (Solo admin del Tenant)
// Cambia el estado de la orden de producción y actualiza stocks.
// ============================================================
router.put('/:id/status', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Draft', 'Proforma', 'Production', 'QC Inspection', 'Port', 'Transit', 'Delivered'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado no válido en la máquina de estados.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener estado actual de la orden y sus items
    const orderResult = await client.query(
      'SELECT id, status, order_number FROM production_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
      [id, tenant_id]
    );
    if (orderResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Orden de producción no encontrada.' });
    }

    const order = orderResult.rows[0];
    const oldStatus = order.status;

    if (oldStatus === status) {
      await client.query('COMMIT');
      client.release();
      return res.json(order);
    }

    // Validación de transición secuencial estricta según @order-state-machine
    const stepNames = ['Draft', 'Proforma', 'Production', 'QC Inspection', 'Port', 'Transit', 'Delivered'];
    const oldStepIdx = stepNames.indexOf(oldStatus);
    const newStepIdx = stepNames.indexOf(status);

    if (newStepIdx > oldStepIdx && newStepIdx !== oldStepIdx + 1) {
      client.release();
      return res.status(400).json({ 
        error: `Transición de estado inválida. Debes avanzar secuencialmente paso a paso: el siguiente estado permitido para "${oldStatus}" es "${stepNames[oldStepIdx + 1]}".` 
      });
    }

    // Obtener los items para actualizar inventario
    const itemsResult = await client.query(
      'SELECT product_id, quantity_cases FROM production_order_items WHERE production_order_id=$1 AND tenant_id=$2',
      [id, tenant_id]
    );
    const items = itemsResult.rows;

    // 2. Lógica de traspaso de inventario inteligente y reversible
    const PRE_PROD = ['Draft', 'Proforma'];
    const IN_PROD = ['Production', 'QC Inspection', 'Port', 'Transit'];
    const POST_PROD = ['Delivered'];

    const wasPre = PRE_PROD.includes(oldStatus);
    const wasIn = IN_PROD.includes(oldStatus);
    const wasPost = POST_PROD.includes(oldStatus);

    const isPre = PRE_PROD.includes(status);
    const isIn = IN_PROD.includes(status);
    const isPost = POST_PROD.includes(status);

    if (wasPre && isIn) {
      // Sumar a stock en producción
      for (const item of items) {
        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, 0, $3)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET 
             stock_in_production_cases = inventory.stock_in_production_cases + EXCLUDED.stock_in_production_cases,
             updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, item.product_id, item.quantity_cases]
        );
      }
    } else if (wasIn && isPre) {
      // Restar de stock en producción (se regresó a borrador/proforma)
      for (const item of items) {
        await client.query(
          `UPDATE inventory
           SET stock_in_production_cases = GREATEST(0, stock_in_production_cases - $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $2 AND product_id = $3`,
          [item.quantity_cases, tenant_id, item.product_id]
        );
      }
    } else if (wasIn && isPost) {
      // Trasladar de stock en producción a stock físico
      for (const item of items) {
        const currentInv = await client.query(
          'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2 FOR UPDATE',
          [item.product_id, tenant_id]
        );
        const prevStock = currentInv.rows.length > 0 ? currentInv.rows[0].stock_physical_cases : 0;
        const nextStock = prevStock + item.quantity_cases;

        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET 
             stock_in_production_cases = GREATEST(0, inventory.stock_in_production_cases - EXCLUDED.stock_physical_cases),
             stock_physical_cases = inventory.stock_physical_cases + EXCLUDED.stock_physical_cases,
             updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, item.product_id, item.quantity_cases]
        );

        await client.query(
          `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
           VALUES ($1, $2, 'PRODUCTION', $3, $4, $5, $6, null)`,
          [tenant_id, item.product_id, item.quantity_cases, prevStock, nextStock, `Ingreso por Orden de Fabricación Finalizada #${order.order_number}`]
        );
      }
    } else if (wasPre && isPost) {
      // Sumar directamente a stock físico (nunca pasó por producción)
      for (const item of items) {
        const currentInv = await client.query(
          'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2 FOR UPDATE',
          [item.product_id, tenant_id]
        );
        const prevStock = currentInv.rows.length > 0 ? currentInv.rows[0].stock_physical_cases : 0;
        const nextStock = prevStock + item.quantity_cases;

        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET 
             stock_physical_cases = inventory.stock_physical_cases + EXCLUDED.stock_physical_cases,
             updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, item.product_id, item.quantity_cases]
        );

        await client.query(
          `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
           VALUES ($1, $2, 'PRODUCTION', $3, $4, $5, $6, null)`,
          [tenant_id, item.product_id, item.quantity_cases, prevStock, nextStock, `Ingreso directo por Orden de Fabricación Finalizada #${order.order_number}`]
        );
      }
    } else if (wasPost && isIn) {
      // Deshacer entregado: Restar de stock físico y sumar a stock en producción
      for (const item of items) {
        const currentInv = await client.query(
          'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2 FOR UPDATE',
          [item.product_id, tenant_id]
        );
        const prevStock = currentInv.rows.length > 0 ? currentInv.rows[0].stock_physical_cases : 0;
        const nextStock = Math.max(0, prevStock - item.quantity_cases);

        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, 0, $3)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET 
             stock_physical_cases = GREATEST(0, inventory.stock_physical_cases - $4),
             stock_in_production_cases = inventory.stock_in_production_cases + EXCLUDED.stock_in_production_cases,
             updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, item.product_id, item.quantity_cases, item.quantity_cases]
        );

        await client.query(
          `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
           VALUES ($1, $2, 'PRODUCTION', $3, $4, $5, $6, null)`,
          [tenant_id, item.product_id, -item.quantity_cases, prevStock, nextStock, `Salida por Reversión de Orden de Fabricación #${order.order_number}`]
        );
      }
    } else if (wasPost && isPre) {
      // Deshacer entregado a borrador/proforma: Restar de stock físico
      for (const item of items) {
        const currentInv = await client.query(
          'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2 FOR UPDATE',
          [item.product_id, tenant_id]
        );
        const prevStock = currentInv.rows.length > 0 ? currentInv.rows[0].stock_physical_cases : 0;
        const nextStock = Math.max(0, prevStock - item.quantity_cases);

        await client.query(
          `UPDATE inventory
           SET stock_physical_cases = GREATEST(0, stock_physical_cases - $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $2 AND product_id = $3`,
          [item.quantity_cases, tenant_id, item.product_id]
        );

        await client.query(
          `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
           VALUES ($1, $2, 'PRODUCTION', $3, $4, $5, $6, null)`,
          [tenant_id, item.product_id, -item.quantity_cases, prevStock, nextStock, `Salida por Reversión de Orden de Fabricación #${order.order_number}`]
        );
      }
    }

    // 3. Actualizar cabecera de la orden
    const updateQuery = `
      UPDATE production_orders 
      SET status = $1, 
          actual_completion_date = CASE WHEN $1 = 'Delivered' THEN CURRENT_DATE ELSE actual_completion_date END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;
    const updatedOrderResult = await client.query(updateQuery, [status, id, tenant_id]);
    const updatedOrder = updatedOrderResult.rows[0];

    // 4. Guardar log de auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenant_id,
        req.user.id,
        'UPDATE_PRODUCTION_ORDER_STATUS',
        'production_orders',
        id,
        oldStatus,
        status
      ]
    );

    await client.query('COMMIT');
    res.json(updatedOrder);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al actualizar estado de producción:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// GET /api/production/:id/audit  (Solo admin del Tenant)
// Obtiene el historial de auditoría de una orden de producción.
// ============================================================
router.get('/:id/audit', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT al.id, al.action, al.old_value, al.new_value, al.created_at, u.name as user_name
       FROM audit_logs al
       JOIN users u ON u.id = al.user_id
       WHERE al.entity_type = 'production_orders' 
         AND al.entity_id = $1 
         AND al.tenant_id = $2
       ORDER BY al.created_at DESC`,
      [id, tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener logs de auditoría:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
