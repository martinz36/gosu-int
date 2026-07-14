import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/orders
// Admin: ve todos los pedidos del tenant con sus detalles.
// Cliente: ve solo sus propios pedidos.
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { tenant_id, role, id: userId } = req.user;

  let query = `
    SELECT
      so.id, so.status, so.incoterm, so.company_name, so.tax_id, 
      so.billing_address, so.forwarder_address, so.subtotal_usd, 
      so.discount_usd, so.shipping_cost_usd, so.total_usd,
      so.advance_payment_pct, so.deposit_paid_usd, so.deposit_receipt_url,
      so.balance_paid_usd, so.balance_receipt_url, so.bl_number, so.bl_document_url,
      so.notes, so.created_at,
      u.name as client_name, u.email as client_email,
      SUM(soi.qty_cases * p.case_cbm) as total_cbm,
      SUM(soi.qty_cases) as total_cases,
      json_agg(json_build_object(
        'id', soi.id,
        'product_id', soi.product_id,
        'name', p.name,
        'sku', p.sku,
        'qty_cases', soi.qty_cases,
        'price_case_usd', soi.price_case_usd,
        'discount_pct', soi.discount_pct,
        'total_item_usd', soi.total_item_usd,
        'case_cbm', p.case_cbm,
        'units_per_case', p.units_per_case
      ) ORDER BY p.name) AS items
    FROM sales_orders so
    JOIN users u ON u.id = so.client_id
    JOIN sales_order_items soi ON soi.sales_order_id = so.id AND soi.tenant_id = so.tenant_id
    JOIN products p ON p.id = soi.product_id AND p.tenant_id = so.tenant_id
    WHERE so.tenant_id = $1
  `;

  const params = [tenant_id];

  if (role === 'b2b_client') {
    params.push(userId);
    query += ` AND so.client_id = $${params.length}`;
  }

  query += `
    GROUP BY so.id, u.name, u.email 
    ORDER BY so.created_at DESC
  `;

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
// Crea un nuevo pedido B2B calculando descuentos e inyectando datos del perfil.
// Body: { items: [{ product_id, qty_cases }], notes, incoterm }
// ============================================================
router.post('/', requireAuth, async (req, res) => {
  const { tenant_id, id: client_id, role } = req.user;
  const { items, notes, incoterm } = req.body;

  if (role !== 'b2b_client') {
    return res.status(403).json({ error: 'Solo los clientes B2B pueden realizar pedidos.' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe incluir al menos un producto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener perfil B2B del cliente para datos fiscales y MOA (uniendo a su Pricing Tier)
    const profileResult = await client.query(
      `SELECT p.company_name, p.tax_id, p.billing_address, p.forwarder_address,
              COALESCE(pt.min_order_amount, 1000.00) as min_order_amount,
              COALESCE(pt.discount_percentage, 0.00) as discount_percentage
       FROM b2b_client_profiles p
       LEFT JOIN pricing_tiers pt ON pt.id = p.pricing_tier_id
       WHERE p.user_id = $1 AND p.tenant_id = $2`,
      [client_id, tenant_id]
    );

    if (profileResult.rows.length === 0) {
      throw new Error('No tienes un perfil B2B registrado. Contacta al administrador.');
    }
    const profile = profileResult.rows[0];

    // 2. Obtener productos y validar pertenencia al tenant
    const productIds = items.map(i => i.product_id);
    const productsResult = await client.query(
      `SELECT id, name, sku, price_per_case_usd, case_cbm FROM products
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenant_id]
    );

    if (productsResult.rows.length !== productIds.length) {
      throw new Error('Uno o más productos no pertenecen al catálogo de este tenant.');
    }

    const productMap = Object.fromEntries(productsResult.rows.map(p => [p.id, p]));

    // 3. Calcular subtotal bruto y total de cajas
    let subtotalUsd = 0;
    let totalCases = 0;

    for (const item of items) {
      const prod = productMap[item.product_id];
      const qty = parseInt(item.qty_cases) || 0;
      subtotalUsd += (parseFloat(prod.price_per_case_usd) * qty);
      totalCases += qty;
    }

    // 4. Calcular descuentos de forma secuencial (Internacional B2B)
    // a. Descuento por Volumen
    const discountRulesResult = await client.query(
      `SELECT min_cases, discount_pct
       FROM volume_discount_rules
       WHERE tenant_id = $1
       ORDER BY min_cases DESC`,
      [tenant_id]
    );

    let volumeDiscountPct = 0;
    for (const rule of discountRulesResult.rows) {
      if (totalCases >= rule.min_cases) {
        volumeDiscountPct = parseFloat(rule.discount_pct);
        break;
      }
    }

    const volumeDiscountAmount = subtotalUsd * (volumeDiscountPct / 100);
    const subtotalAfterVolume = subtotalUsd - volumeDiscountAmount;

    // b. Descuento por Pricing Tier comercial
    const distributorDiscountPct = parseFloat(profile.discount_percentage) || 0.00;
    const distributorDiscountAmount = subtotalAfterVolume * (distributorDiscountPct / 100);

    const totalDiscountUsd = volumeDiscountAmount + distributorDiscountAmount;
    const finalTotalUsd = subtotalUsd - totalDiscountUsd;

    // 5. Validar MOA (Monto Mínimo de Orden)
    const moaLimit = parseFloat(profile.min_order_amount) || 1000.00;
    if (finalTotalUsd < moaLimit) {
      throw new Error(`Monto Mínimo de Orden no alcanzado. Orden mínima: $${moaLimit.toFixed(2)} USD. Total actual: $${finalTotalUsd.toFixed(2)} USD.`);
    }

    // 6. Generar número secuencial de pedido (correlativo)
    const countResult = await client.query(
      'SELECT COUNT(*) FROM sales_orders WHERE tenant_id = $1',
      [tenant_id]
    );
    const count = parseInt(countResult.rows[0].count);
    const orderNumber = `B2B-${(count + 1).toString().padStart(5, '0')}`;

    // 7. Insertar cabecera de orden en sales_orders
    const insertOrderQuery = `
      INSERT INTO sales_orders (
        tenant_id, client_id, status, incoterm, company_name, tax_id, 
        billing_address, forwarder_address, subtotal_usd, discount_usd, total_usd
      )
      VALUES ($1, $2, 'Proforma', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const orderResult = await client.query(insertOrderQuery, [
      tenant_id, client_id, incoterm || 'FOB China',
      profile.company_name, profile.tax_id, profile.billing_address, profile.forwarder_address,
      subtotalUsd, totalDiscountUsd, finalTotalUsd
    ]);
    const newOrder = orderResult.rows[0];

    // 8. Insertar items, descontar stock físico comercial, y guardar detalles
    for (const item of items) {
      const prod = productMap[item.product_id];
      const qty = parseInt(item.qty_cases) || 0;
      const priceCase = parseFloat(prod.price_per_case_usd);
      
      // Descuento prorrateado del item para auditoría
      const itemSubtotal = qty * priceCase;
      const itemVolumeDiscount = itemSubtotal * (volumeDiscountPct / 100);
      const itemDistributorDiscount = (itemSubtotal - itemVolumeDiscount) * (distributorDiscountPct / 100);
      const itemTotalDiscount = itemVolumeDiscount + itemDistributorDiscount;
      const itemFinalTotal = itemSubtotal - itemTotalDiscount;
      const itemDiscountPct = itemSubtotal > 0 ? ((itemTotalDiscount / itemSubtotal) * 100) : 0;

      await client.query(
        `INSERT INTO sales_order_items (
           tenant_id, sales_order_id, product_id, qty_cases, 
           price_case_usd, discount_pct, total_item_usd
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenant_id, newOrder.id, item.product_id, qty, priceCase, itemDiscountPct, itemFinalTotal]
      );

      // Descontar del inventario físico comercial
      const currentInv = await client.query(
        'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2 FOR UPDATE',
        [item.product_id, tenant_id]
      );
      const prevStock = currentInv.rows.length > 0 ? currentInv.rows[0].stock_physical_cases : 0;
      const nextStock = Math.max(0, prevStock - qty);

      await client.query(
        `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (tenant_id, product_id)
         DO UPDATE SET 
           stock_physical_cases = GREATEST(0, inventory.stock_physical_cases - EXCLUDED.stock_physical_cases),
           updated_at = CURRENT_TIMESTAMP`,
        [tenant_id, item.product_id, qty]
      );

      // Registrar en Kardex
      await client.query(
        `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
         VALUES ($1, $2, 'SALE', $3, $4, $5, $6, $7)`,
        [tenant_id, item.product_id, -qty, prevStock, nextStock, `Salida por Pedido B2B #${newOrder.id.split('-')[0].toUpperCase()}`, client_id]
      );
    }

    // 9. Registrar auditoría de creación de orden
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenant_id, client_id, 'CREATE_SALES_ORDER', 'sales_orders', newOrder.id, null, 'Proforma']
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Pedido B2B registrado con éxito.', order: newOrder });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al crear pedido B2B:', err);
    res.status(400).json({ error: err.message || 'Error interno al registrar pedido.' });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/orders/:id/status  (Solo admin del Tenant)
// Actualiza el estado del pedido B2B y guarda logs.
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

    // Obtener estado anterior
    const orderResult = await client.query(
      'SELECT status FROM sales_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
      [id, tenant_id]
    );

    if (orderResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const oldStatus = orderResult.rows[0].status;

    // Actualizar estado
    const result = await client.query(
      `UPDATE sales_orders 
       SET status=$1, updated_at=CURRENT_TIMESTAMP 
       WHERE id=$2 AND tenant_id=$3 
       RETURNING *`,
      [status, id, tenant_id]
    );

    // Guardar auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenant_id, req.user.id, 'UPDATE_SALES_ORDER_STATUS', 'sales_orders', id, oldStatus, status]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// ============================================================
// GET /api/orders/:id/invoice  (Descarga en caliente de Proforma/Invoice)
// Retorna un layout HTML premium listo para guardar en PDF/Imprimir.
// ============================================================
router.get('/:id/invoice', requireAuth, async (req, res) => {
  const { tenant_id, role, id: userId } = req.user;
  const { id } = req.params;

  try {
    // 1. Obtener la cabecera
    const orderQuery = `
      SELECT so.*, u.name as client_name, u.email as client_email, t.name as tenant_name, t.logo_url as tenant_logo_url
      FROM sales_orders so
      JOIN users u ON u.id = so.client_id
      JOIN tenants t ON t.id = so.tenant_id
      WHERE so.id = $1 AND so.tenant_id = $2
    `;
    const orderRes = await pool.query(orderQuery, [id, tenant_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).send('<h1>Error 404: Pedido no encontrado</h1>');
    }
    const order = orderRes.rows[0];

    // Clientes B2B solo pueden ver su propio invoice
    if (role === 'b2b_client' && order.client_id !== userId) {
      return res.status(403).send('<h1>Error 403: No autorizado</h1>');
    }

    // 2. Obtener los items
    const itemsQuery = `
      SELECT soi.*, p.name as product_name, p.sku as product_sku, p.units_per_case, p.case_weight_kg
      FROM sales_order_items soi
      JOIN products p ON p.id = soi.product_id
      WHERE soi.sales_order_id = $1 AND soi.tenant_id = $2
    `;
    const itemsRes = await pool.query(itemsQuery, [id, tenant_id]);
    const items = itemsRes.rows;

    const subtotal = parseFloat(order.subtotal_usd);
    const discount = parseFloat(order.discount_usd);
    const shipping = parseFloat(order.shipping_cost_usd);
    const total = parseFloat(order.total_usd);

    const totalCbm = items.reduce((acc, item) => acc + (item.qty_cases * 0.039), 0); // Estimador CBM

    // 3. Renderizar HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Commercial Invoice - ${order.id.split('-')[0].toUpperCase()}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Outfit', sans-serif;
            background: #09090b;
            color: #e2e8f0;
            margin: 0;
            padding: 40px 20px;
            font-size: 13.5px;
            line-height: 1.6;
          }
          .invoice-card {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(15, 15, 20, 0.7);
            border: 1px solid rgba(0, 232, 255, 0.15);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 16px;
            padding: 40px;
            box-sizing: border-box;
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          .logo-img { max-height: 60px; max-width: 250px; object-fit: contain; }
          .logo-text { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: #00e8ff; text-shadow: 0 0 12px rgba(0, 232, 255, 0.4); }
          .invoice-title { font-size: 28px; font-weight: 800; text-align: right; text-transform: uppercase; color: #ff007f; text-shadow: 0 0 12px rgba(255, 0, 127, 0.4); }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid rgba(0, 232, 255, 0.2); padding-bottom: 6px; margin-bottom: 12px; letter-spacing: 1px; color: #00e8ff; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .items-table th { background: rgba(255, 255, 255, 0.02); color: #fff; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 12px 10px; border-bottom: 1.5px solid rgba(0, 232, 255, 0.3); text-align: left; }
          .items-table td { padding: 12px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); color: #cbd5e1; }
          .totals-table { width: 45%; margin-left: 55%; border-collapse: collapse; margin-top: 20px; }
          .totals-table td { padding: 8px 10px; }
          .totals-table tr.grand-total { font-weight: 800; border-top: 2px solid #ff007f; border-bottom: 2px solid #ff007f; font-size: 17px; color: #ff007f; }
          .footer-note { margin-top: 60px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px; font-size: 11px; color: #71717a; text-align: center; }
          .print-btn { background: linear-gradient(135deg, #00e8ff, #ff007f); color: #fff; border: none; padding: 12px 32px; font-weight: 800; border-radius: 8px; cursor: pointer; display: block; margin: 0 auto 30px auto; box-shadow: 0 4px 15px rgba(255, 0, 127, 0.4); text-transform: uppercase; font-size: 11px; letter-spacing: 1px; transition: transform 0.2s; }
          .print-btn:hover { transform: scale(1.03); }
          .mono { font-family: 'Share Tech Mono', monospace; }
          @media print {
            body { background: #fff; color: #000; padding: 0; }
            .invoice-card { border: none; box-shadow: none; padding: 0; background: transparent; }
            .logo-text { color: #000; text-shadow: none; }
            .invoice-title { color: #000; text-shadow: none; }
            .section-title { color: #000; border-bottom: 2px solid #000; }
            .items-table th { background: #f4f4f5; color: #000; border-bottom: 2.5px solid #000; }
            .items-table td { border-bottom: 1px solid #e4e4e7; color: #000; }
            .totals-table tr.grand-total { border-top: 2.5px solid #000; border-bottom: 2.5px solid #000; color: #000; }
            .print-btn { display: none; }
            .logo-img { filter: grayscale(1) contrast(1.2); }
          }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        
        <div class="invoice-card">
          <table class="header-table">
            <tr>
              <td>
                <div class="logo-container">
                  ${order.tenant_logo_url ? `<img src="${order.tenant_logo_url}" class="logo-img" />` : `<div class="logo-text">${order.tenant_name.toUpperCase()} B2B</div>`}
                </div>
                <div style="margin-top: 8px; color: #a1a1aa; font-size: 12.5px;">Export Department - China Office</div>
              </td>
              <td style="text-align: right;">
                <div class="invoice-title">Commercial Invoice</div>
                <div style="margin-top: 8px; font-weight: 800; font-size: 15px;" class="mono">No: ${order.id.split('-')[0].toUpperCase()}</div>
                <div style="color: #a1a1aa; font-size: 12.5px;">Fecha: ${new Date(order.created_at).toLocaleDateString('es-ES')}</div>
              </td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <tr>
              <td style="width: 50%; padding-right: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Exporter / Manufacturer</div>
                <strong style="color: #fff;">${order.tenant_name} Co., Ltd.</strong><br>
                Shenzhen High-Tech Industrial Park, Nanshan,<br>
                Shenzhen, Guangdong, China<br>
                Contact: export@${order.tenant_name.toLowerCase().replace(/\s+/g, '')}.com
              </td>
              <td style="width: 50%; padding-left: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Importer / Buyer (B2B Client)</div>
                <strong style="color: #fff;">${order.company_name}</strong><br>
                Tax ID: ${order.tax_id}<br>
                Dirección: ${order.billing_address}<br>
                Contacto: ${order.client_name} (${order.client_email})
              </td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <tr>
              <td style="width: 50%; padding-right: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Logistics & Shipping Details</div>
                Incoterm: <strong style="color: #fff;">${order.incoterm || 'FOB China'}</strong><br>
                Forwarder en China:<br>
                <span class="mono" style="font-size: 11.5px; color: #a1a1aa;">${order.forwarder_address}</span>
              </td>
              <td style="width: 50%; padding-left: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Payment terms</div>
                Condición: <strong>30% Deposit / 70% Balance</strong><br>
                Depósito: ${order.status !== 'Proforma' ? '<span style="color: #4ade80;">✓ Confirmado</span>' : '<span style="color: #fb923c;">⚠️ Pendiente</span>'}<br>
                Status General: <strong style="text-transform: uppercase; color: #00e8ff;">${order.status}</strong>
              </td>
            </tr>
          </table>

          <div class="section-title">Lote de Insumos / Catálogo Comercial</div>
          <table class="items-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripción del Producto</th>
                <th style="text-align: right;">Cajas Master</th>
                <th style="text-align: right;">Precio Caja (USD)</th>
                <th style="text-align: right;">Dcto %</th>
                <th style="text-align: right;">Total Item (USD)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td class="mono" style="font-weight: 700; color: #00e8ff;">${item.product_sku}</td>
                  <td><span style="color: #fff; font-weight: 600;">${item.product_name}</span><br><span style="font-size: 10.5px; color: #71717a;">(${item.units_per_case} packs/caja)</span></td>
                  <td style="text-align: right; font-weight: 700; color: #fff;">${item.qty_cases}</td>
                  <td style="text-align: right;">$${parseFloat(item.price_case_usd).toFixed(2)}</td>
                  <td style="text-align: right;">${parseFloat(item.discount_pct).toFixed(1)}%</td>
                  <td style="text-align: right; font-weight: 600; color: #fff;">$${parseFloat(item.total_item_usd).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td style="color: #a1a1aa;">Subtotal Bruto:</td>
              <td style="text-align: right; font-weight: 600;">$${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color: #a1a1aa;">Descuentos Aplicados:</td>
              <td style="text-align: right; color: #f43f5e; font-weight: 600;">-$${discount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color: #a1a1aa;">Gastos Envío China:</td>
              <td style="text-align: right; font-weight: 600;">$${shipping.toFixed(2)}</td>
            </tr>
            <tr class="grand-total">
              <td>Total FOB (USD):</td>
              <td style="text-align: right;">$${total.toFixed(2)}</td>
            </tr>
          </table>

          <div class="footer-note">
            Esta es una Factura Comercial emitida digitalmente para comercio internacional B2B.<br>
            ${order.tenant_name} Co., Ltd. - Todos los derechos reservados.
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error al generar Commercial Invoice:', err);
    res.status(500).send('<h1>Error 500: Error interno al procesar el documento.</h1>');
  }
});

// ============================================================
// GET /api/orders/:id/packing-list  (Descarga de Packing List)
// Retorna un layout HTML detallado de empaque, dimensiones y pesos.
// ============================================================
router.get('/:id/packing-list', requireAuth, async (req, res) => {
  const { tenant_id, role, id: userId } = req.user;
  const { id } = req.params;

  try {
    // 1. Obtener la cabecera
    const orderQuery = `
      SELECT so.*, u.name as client_name, u.email as client_email, t.name as tenant_name, t.logo_url as tenant_logo_url
      FROM sales_orders so
      JOIN users u ON u.id = so.client_id
      JOIN tenants t ON t.id = so.tenant_id
      WHERE so.id = $1 AND so.tenant_id = $2
    `;
    const orderRes = await pool.query(orderQuery, [id, tenant_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).send('<h1>Error 404: Pedido no encontrado</h1>');
    }
    const order = orderRes.rows[0];

    if (role === 'b2b_client' && order.client_id !== userId) {
      return res.status(403).send('<h1>Error 403: No autorizado</h1>');
    }

    // 2. Obtener los items con dimensiones de caja
    const itemsQuery = `
      SELECT soi.*, p.name as product_name, p.sku as product_sku, p.units_per_case,
             p.case_weight_kg, p.case_length_cm, p.case_width_cm, p.case_height_cm, p.case_cbm
      FROM sales_order_items soi
      JOIN products p ON p.id = soi.product_id
      WHERE soi.sales_order_id = $1 AND soi.tenant_id = $2
    `;
    const itemsRes = await pool.query(itemsQuery, [id, tenant_id]);
    const items = itemsRes.rows;

    let totalCases = 0;
    let totalWeight = 0;
    let totalCbm = 0;

    items.forEach(item => {
      totalCases += item.qty_cases;
      totalWeight += (item.qty_cases * parseFloat(item.case_weight_kg));
      totalCbm += (item.qty_cases * parseFloat(item.case_cbm));
    });

    // 3. Renderizar HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Packing List - ${order.id.split('-')[0].toUpperCase()}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Outfit', sans-serif;
            background: #09090b;
            color: #e2e8f0;
            margin: 0;
            padding: 40px 20px;
            font-size: 13.5px;
            line-height: 1.6;
          }
          .invoice-card {
            max-width: 950px;
            margin: 0 auto;
            background: rgba(15, 15, 20, 0.7);
            border: 1px solid rgba(0, 232, 255, 0.15);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 16px;
            padding: 40px;
            box-sizing: border-box;
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          .logo-img { max-height: 60px; max-width: 250px; object-fit: contain; }
          .logo-text { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: #00e8ff; text-shadow: 0 0 12px rgba(0, 232, 255, 0.4); }
          .invoice-title { font-size: 28px; font-weight: 800; text-align: right; text-transform: uppercase; color: #ff007f; text-shadow: 0 0 12px rgba(255, 0, 127, 0.4); }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid rgba(0, 232, 255, 0.2); padding-bottom: 6px; margin-bottom: 12px; letter-spacing: 1px; color: #00e8ff; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .items-table th { background: rgba(255, 255, 255, 0.02); color: #fff; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 12px 10px; border-bottom: 1.5px solid rgba(0, 232, 255, 0.3); text-align: left; }
          .items-table td { padding: 12px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); color: #cbd5e1; }
          .summary-box { background: rgba(255,255,255,0.01); border: 1px solid rgba(255, 255, 255, 0.06); padding: 20px; border-radius: 8px; margin-top: 30px; }
          .footer-note { margin-top: 60px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px; font-size: 11px; color: #71717a; text-align: center; }
          .print-btn { background: linear-gradient(135deg, #00e8ff, #ff007f); color: #fff; border: none; padding: 12px 32px; font-weight: 800; border-radius: 8px; cursor: pointer; display: block; margin: 0 auto 30px auto; box-shadow: 0 4px 15px rgba(255, 0, 127, 0.4); text-transform: uppercase; font-size: 11px; letter-spacing: 1px; transition: transform 0.2s; }
          .print-btn:hover { transform: scale(1.03); }
          .mono { font-family: 'Share Tech Mono', monospace; }
          @media print {
            body { background: #fff; color: #000; padding: 0; }
            .invoice-card { border: none; box-shadow: none; padding: 0; background: transparent; }
            .logo-text { color: #000; text-shadow: none; }
            .invoice-title { color: #000; text-shadow: none; }
            .section-title { color: #000; border-bottom: 2px solid #000; }
            .items-table th { background: #f4f4f5; color: #000; border-bottom: 2.5px solid #000; }
            .items-table td { border-bottom: 1px solid #e4e4e7; color: #000; }
            .summary-box { border: 1px solid #ddd; background: #fafafa; color: #000; }
            .print-btn { display: none; }
            .logo-img { filter: grayscale(1) contrast(1.2); }
          }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        
        <div class="invoice-card">
          <table class="header-table">
            <tr>
              <td>
                <div class="logo-container">
                  ${order.tenant_logo_url ? `<img src="${order.tenant_logo_url}" class="logo-img" />` : `<div class="logo-text">${order.tenant_name.toUpperCase()} B2B</div>`}
                </div>
                <div style="margin-top: 8px; color: #a1a1aa; font-size: 12.5px;">Export Department - China Office</div>
              </td>
              <td style="text-align: right;">
                <div class="invoice-title">Packing List</div>
                <div style="margin-top: 8px; font-weight: 800; font-size: 15px;" class="mono">No: ${order.id.split('-')[0].toUpperCase()}-PL</div>
                <div style="color: #a1a1aa; font-size: 12.5px;">Fecha: ${new Date(order.created_at).toLocaleDateString('es-ES')}</div>
              </td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <tr>
              <td style="width: 50%; padding-right: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Exporter / Manufacturer</div>
                <strong style="color: #fff;">${order.tenant_name} Co., Ltd.</strong><br>
                Shenzhen High-Tech Industrial Park, Nanshan,<br>
                Shenzhen, Guangdong, China
              </td>
              <td style="width: 50%; padding-left: 20px; vertical-align: top; box-sizing: border-box;">
                <div class="section-title">Ship To (B2B Client)</div>
                <strong style="color: #fff;">${order.company_name}</strong><br>
                Dirección: ${order.billing_address}<br>
                Forwarder en China:<br>
                <span class="mono" style="font-size: 11.5px; color: #a1a1aa;">${order.forwarder_address}</span>
              </td>
            </tr>
          </table>

          <div class="section-title">Detalle Logístico de Contenedores y Cajas Master</div>
          <table class="items-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripción del Producto</th>
                <th style="text-align: right;">Cajas Master</th>
                <th style="text-align: right;">Cant. Packs</th>
                <th style="text-align: right;">Peso Neto Caja</th>
                <th style="text-align: right;">Dimensiones Caja</th>
                <th style="text-align: right;">Volumen (CBM)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td class="mono" style="font-weight: 700; color: #00e8ff;">${item.product_sku}</td>
                  <td><span style="color: #fff; font-weight: 600;">${item.product_name}</span></td>
                  <td style="text-align: right; font-weight: 700; color: #fff;">${item.qty_cases}</td>
                  <td style="text-align: right;">${item.qty_cases * item.units_per_case} packs</td>
                  <td style="text-align: right;">${parseFloat(item.case_weight_kg).toFixed(2)} kg</td>
                  <td style="text-align: right;">${item.case_length_cm}x${item.case_width_cm}x${item.case_height_cm} cm</td>
                  <td class="mono" style="text-align: right; font-weight: 600; color: #00e8ff;">${(item.qty_cases * parseFloat(item.case_cbm)).toFixed(4)} CBM</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="summary-box">
            <h3 style="margin-top: 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; text-transform: uppercase; color: #ff007f;">Resumen Logístico de Carga</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 8px 0; color: #a1a1aa;">📦 Total Cajas Master:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #fff;">${totalCases} cajas</td>
              </tr>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 8px 0; color: #a1a1aa;">⚖️ Peso Bruto Total Proyectado:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #fff;">${totalWeight.toFixed(2)} kg</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a1a1aa;">🚢 Volumen Total Proyectado:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #00e8ff;">${totalCbm.toFixed(4)} CBM</td>
              </tr>
            </table>
          </div>

          <div class="footer-note">
            Este es un Packing List oficial emitido digitalmente para aduanas y logística.<br>
            ${order.tenant_name} Co., Ltd. - Todos los derechos reservados.
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error al generar Packing List:', err);
    res.status(500).send('<h1>Error 500: Error interno al procesar el documento.</h1>');
  }
});

// ============================================================
// POST /api/orders/:id/pay-stripe (Autenticado, para Clientes B2B)
// Simula o concreta el pago con tarjeta a través de Stripe.
// Actualiza el estado de la orden a 'Paid' tras la confirmación.
// ============================================================
router.post('/:id/pay-stripe', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  const { id: orderId } = req.params;

  try {
    const orderRes = await pool.query(
      'SELECT id, status FROM sales_orders WHERE id = $1 AND tenant_id = $2 AND client_id = $3',
      [orderId, tenant_id, req.user.id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const order = orderRes.rows[0];
    if (order.status === 'Paid') {
      return res.status(400).json({ error: 'El pedido ya se encuentra pagado.' });
    }

    await pool.query(
      "UPDATE sales_orders SET status = 'Paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [orderId]
    );

    res.json({
      success: true,
      message: 'Pago con tarjeta simulado con éxito. Pedido actualizado a Pagado.'
    });
  } catch (err) {
    console.error('Error al simular pago con Stripe:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
