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

export default router;
