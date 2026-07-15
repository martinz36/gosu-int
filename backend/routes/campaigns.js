import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireTenantAdmin } from '../middleware/auth.js';
import { EmailService } from '../utils/email.js';

const router = Router();

// ============================================================
// GET /api/campaigns
// Retorna las campañas del tenant del usuario
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  try {
    const result = await pool.query(
      `SELECT * FROM campaigns 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener campañas:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// GET /api/campaigns/:id
// Retorna el detalle de una campaña específica
// ============================================================
router.get('/:id', requireAuth, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM campaigns 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaña no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener campaña:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/campaigns (Solo Tenant Admin)
// Crea una nueva campaña
// ============================================================
router.post('/', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const {
    name,
    start_date_reservations,
    end_date_reservations,
    start_date_production,
    estimated_end_date_production,
    advance_payment_pct,
    status
  } = req.body;

  if (!name || !start_date_reservations || !end_date_reservations) {
    return res.status(400).json({ error: 'Nombre y fechas de inicio/cierre de reservas son obligatorios.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO campaigns (
        tenant_id, name, start_date_reservations, end_date_reservations,
        start_date_production, estimated_end_date_production, advance_payment_pct, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenant_id,
        name,
        start_date_reservations,
        end_date_reservations,
        start_date_production || null,
        estimated_end_date_production || null,
        advance_payment_pct !== undefined ? parseFloat(advance_payment_pct) : 30.00,
        status || 'open'
      ]
    );

    const newCampaign = result.rows[0];

    // Si se crea como 'open', disparar la notificación a los clientes
    if (newCampaign.status === 'open') {
      // Disparar email asíncronamente
      EmailService.sendCampaignOpenEmail(newCampaign.id);
    }

    res.status(201).json(newCampaign);
  } catch (err) {
    console.error('Error al crear campaña:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// PUT /api/campaigns/:id (Solo Tenant Admin)
// Actualiza una campaña y dispara correos en cambios de estado
// ============================================================
router.put('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const {
    name,
    start_date_reservations,
    end_date_reservations,
    start_date_production,
    estimated_end_date_production,
    advance_payment_pct,
    status
  } = req.body;

  try {
    // 1. Obtener estado anterior
    const prevResult = await pool.query(
      'SELECT status FROM campaigns WHERE id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (prevResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaña no encontrada.' });
    }

    const previousStatus = prevResult.rows[0].status;

    // 2. Actualizar la campaña
    const result = await pool.query(
      `UPDATE campaigns
       SET name = $1, start_date_reservations = $2, end_date_reservations = $3,
           start_date_production = $4, estimated_end_date_production = $5,
           advance_payment_pct = $6, status = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND tenant_id = $9
       RETURNING *`,
      [
        name,
        start_date_reservations,
        end_date_reservations,
        start_date_production || null,
        estimated_end_date_production || null,
        advance_payment_pct !== undefined ? parseFloat(advance_payment_pct) : 30.00,
        status,
        id,
        tenant_id
      ]
    );

    const updatedCampaign = result.rows[0];

    // 3. Evaluar triggers de correo si el estado cambió
    if (previousStatus !== updatedCampaign.status) {
      console.log(`🔔 Cambio de estado en campaña [${id}]: ${previousStatus} ➡️ ${updatedCampaign.status}`);
      if (updatedCampaign.status === 'open') {
        EmailService.sendCampaignOpenEmail(id);
      } else if (updatedCampaign.status === 'production') {
        EmailService.sendCampaignInProductionEmail(id);
      } else if (updatedCampaign.status === 'finished') {
        // Obtenemos el origin del header para los links del correo
        const origin = req.headers.origin;
        EmailService.sendCampaignFinishedEmail(id, origin);
      }
    }

    res.json(updatedCampaign);
  } catch (err) {
    console.error('Error al actualizar campaña:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// DELETE /api/campaigns/:id (Solo Tenant Admin)
// Elimina una campaña
// ============================================================
router.delete('/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM campaigns WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaña no encontrada.' });
    }

    res.json({ message: 'Campaña eliminada con éxito.' });
  } catch (err) {
    console.error('Error al eliminar campaña:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/campaigns/:id/products (Solo Tenant Admin)
// Asocia de forma masiva productos y cantidades a una campaña
// Body: { products: [ { product_id, qty_cases }, ... ] }
// ============================================================
router.post('/:id/products', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id: campaign_id } = req.params;
  const { products } = req.body;

  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'El cuerpo de la petición debe contener un array "products".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verificar que la campaña exista
    const campCheck = await client.query(
      'SELECT id FROM campaigns WHERE id = $1 AND tenant_id = $2',
      [campaign_id, tenant_id]
    );
    if (campCheck.rows.length === 0) {
      throw new Error('Campaña no encontrada o no pertenece a este tenant.');
    }

    // 2. Quitar esta campaña de todos los productos que la tenían asignada actualmente
    await client.query(
      'UPDATE products SET campaign_id = NULL WHERE campaign_id = $1 AND tenant_id = $2',
      [campaign_id, tenant_id]
    );

    // 3. Asociar los productos seleccionados y actualizar su stock en producción
    for (const p of products) {
      const { product_id, qty_cases } = p;
      const qtyNum = parseInt(qty_cases) || 0;

      // Actualizar campaign_id en la tabla products
      const prodCheck = await client.query(
        'UPDATE products SET campaign_id = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id',
        [campaign_id, product_id, tenant_id]
      );

      if (prodCheck.rows.length > 0) {
        // Upsert en inventory para establecer el stock en producción de pre-venta
        await client.query(
          `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
           VALUES ($1, $2, 0, $3)
           ON CONFLICT (tenant_id, product_id)
           DO UPDATE SET stock_in_production_cases = EXCLUDED.stock_in_production_cases, updated_at = CURRENT_TIMESTAMP`,
          [tenant_id, product_id, qtyNum]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Productos asignados con éxito a la campaña.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al asociar productos a la campaña:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

export default router;
