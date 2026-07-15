import pool from '../db/pool.js';

// Helper centralizado para enviar correos usando la API de Resend
async function sendEmailViaResend({ resendApiKey, tenantName, to, subject, html }) {
  if (!resendApiKey) {
    console.warn(`⚠️ Advertencia: No se puede enviar correo. API Key de Resend no configurada para el tenant: "${tenantName}".`);
    return null;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${tenantName} B2B <onboarding@resend.dev>`,
        to: to,
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`❌ Error en la respuesta de Resend API:`, data);
      return { success: false, error: data.message || 'Error de la API de Resend' };
    }

    console.log(`✉️ Correo enviado con éxito a [${to}]. ID: ${data.id}`);
    return { success: true, data };
  } catch (err) {
    console.error(`❌ Error de conexión al enviar correo a [${to}]:`, err.message);
    return { success: false, error: err.message };
  }
}

export const EmailService = {
  // 1. Notificar Campaña Abierta a todos los clientes B2B
  async sendCampaignOpenEmail(campaignId) {
    try {
      // Obtener datos de la campaña y del tenant
      const queryCampaign = `
        SELECT c.name as campaign_name, t.name as tenant_name, t.resend_api_key, c.tenant_id
        FROM campaigns c
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = $1
      `;
      const campaignResult = await pool.query(queryCampaign, [campaignId]);
      if (campaignResult.rows.length === 0) return;

      const { campaign_name, tenant_name, resend_api_key, tenant_id } = campaignResult.rows[0];

      // Obtener los correos de los clientes B2B
      const queryClients = `
        SELECT email, name FROM users
        WHERE tenant_id = $1 AND role = 'b2b_client' AND is_active = true
      `;
      const clientsResult = await pool.query(queryClients, [tenant_id]);
      if (clientsResult.rows.length === 0) {
        console.log(`ℹ️ No hay clientes B2B activos para notificar la apertura de la campaña.`);
        return;
      }

      console.log(`📢 Notificando apertura de campaña "${campaign_name}" a ${clientsResult.rows.length} clientes...`);

      for (const client of clientsResult.rows) {
        const html = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #121212; padding: 24px; text-align: center; border-bottom: 3px solid #00bcd4;">
              <h1 style="color: #00bcd4; margin: 0; font-size: 24px;">${tenant_name} B2B</h1>
            </div>
            <div style="padding: 24px; line-height: 1.6;">
              <h2 style="color: #111;">¡Nueva Campaña de Fabricación Abierta!</h2>
              <p>Estimado/a <strong>${client.name}</strong>,</p>
              <p>Nos complace anunciarte que hemos abierto una nueva campaña de reservas: <strong>"${campaign_name}"</strong>.</p>
              <p>Ya puedes acceder al catálogo B2B, ver los productos incluidos en este tiraje y asegurar tus reservas con condiciones de pago preferenciales.</p>
              <p style="margin-top: 24px;">¡Asegura tu cupo antes de que cierre el periodo de reservas!</p>
              <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px;">
                Si tienes alguna consulta comercial, por favor responde a este correo electrónico.
              </p>
            </div>
          </div>
        `;

        await sendEmailViaResend({
          resendApiKey: resend_api_key,
          tenantName: tenant_name,
          to: client.email,
          subject: `📢 ¡Nueva Campaña Abierta: ${campaign_name}! - ${tenant_name}`,
          html
        });
      }
    } catch (err) {
      console.error('Error en sendCampaignOpenEmail:', err);
    }
  },

  // 2. Notificar Reserva Creada y solicitar adelanto
  async sendReservationCreatedEmail(orderId, origin) {
    try {
      const queryOrder = `
        SELECT so.id, so.po_number, so.total_usd, so.advance_payment_pct,
               u.email as client_email, u.name as client_name,
               t.name as tenant_name, t.resend_api_key,
               c.name as campaign_name
        FROM sales_orders so
        JOIN users u ON u.id = so.client_id
        JOIN tenants t ON t.id = so.tenant_id
        LEFT JOIN campaigns c ON c.id = so.campaign_id
        WHERE so.id = $1
      `;
      const result = await pool.query(queryOrder, [orderId]);
      if (result.rows.length === 0) return;

      const order = result.rows[0];
      const orderRef = order.po_number || order.id.split('-')[0].toUpperCase();
      const advancePct = parseFloat(order.advance_payment_pct) || 30.00;
      const total = parseFloat(order.total_usd);
      const advanceAmount = (total * (advancePct / 100)).toFixed(2);

      const invoiceUrl = `${origin || 'http://localhost:5173'}/?print_order=${orderId}&doc_type=invoice`;

      const html = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #121212; padding: 24px; text-align: center; border-bottom: 3px solid #00bcd4;">
            <h1 style="color: #00bcd4; margin: 0; font-size: 24px;">${order.tenant_name} B2B</h1>
          </div>
          <div style="padding: 24px; line-height: 1.6;">
            <h2 style="color: #111;">Confirmación de Reserva - Pedido ${orderRef}</h2>
            <p>Hola <strong>${order.client_name}</strong>,</p>
            <p>Hemos registrado tu reserva para la campaña <strong>"${order.campaign_name || 'Print Run'}"</strong>.</p>
            <p>Monto Total del Pedido: <strong>$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></p>
            
            <div style="background-color: #f9f9f9; border-left: 4px solid #e91e63; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #e91e63;">Adelanto Requerido (${advancePct}%)</h3>
              <p style="margin: 0; font-size: 18px; font-weight: bold;">$${parseFloat(advanceAmount).toLocaleString('en-US')} USD</p>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #666;">Por favor, realiza el pago del adelanto para asegurar tu producción.</p>
            </div>

            <div style="margin: 30px 0; text-align: center;">
              <a href="${invoiceUrl}" target="_blank" style="display: inline-block; background-color: #00bcd4; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                📄 Ver Factura Proforma y Métodos de Pago
              </a>
            </div>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px;">
              Para cualquier duda o modificación de tu reserva, por favor comunícate con nosotros respondiendo a este email.
            </p>
          </div>
        </div>
      `;

      await sendEmailViaResend({
        resendApiKey: order.resend_api_key,
        tenantName: order.tenant_name,
        to: order.client_email,
        subject: `✍️ Reserva Registrada: Pedido B2B ${orderRef} - ${order.tenant_name}`,
        html
      });
    } catch (err) {
      console.error('Error en sendReservationCreatedEmail:', err);
    }
  },

  // 3. Notificar que la campaña ha entrado en producción
  async sendCampaignInProductionEmail(campaignId) {
    try {
      const queryCampaign = `
        SELECT c.name as campaign_name, t.name as tenant_name, t.resend_api_key
        FROM campaigns c
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = $1
      `;
      const campaignResult = await pool.query(queryCampaign, [campaignId]);
      if (campaignResult.rows.length === 0) return;

      const { campaign_name, tenant_name, resend_api_key } = campaignResult.rows[0];

      // Obtener los clientes que tienen órdenes vinculadas a esta campaña
      const queryOrders = `
        SELECT DISTINCT u.email, u.name, so.po_number, so.id as order_id
        FROM sales_orders so
        JOIN users u ON u.id = so.client_id
        WHERE so.campaign_id = $1 AND so.payment_status != 'blocked'
      `;
      const ordersResult = await pool.query(queryOrders, [campaignId]);
      if (ordersResult.rows.length === 0) return;

      console.log(`🏭 Notificando inicio de producción de campaña "${campaign_name}" a ${ordersResult.rows.length} clientes...`);

      for (const order of ordersResult.rows) {
        const orderRef = order.po_number || order.order_id.split('-')[0].toUpperCase();
        
        const html = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #121212; padding: 24px; text-align: center; border-bottom: 3px solid #ff9800;">
              <h1 style="color: #ff9800; margin: 0; font-size: 24px;">${tenant_name} B2B</h1>
            </div>
            <div style="padding: 24px; line-height: 1.6;">
              <h2 style="color: #111;">⚙️ ¡Tu pedido ha entrado en producción!</h2>
              <p>Hola <strong>${order.name}</strong>,</p>
              <p>Te informamos que la fase de reservas para el tiraje <strong>"${campaign_name}"</strong> ha finalizado con éxito.</p>
              <p>Tu pedido con referencia <strong>${orderRef}</strong> ya ha sido ingresado al taller y la fabricación de tus productos ha comenzado oficialmente.</p>
              <p>Te mantendremos informado sobre las estimaciones de salida de fábrica y control de calidad.</p>
              <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px;">
                Gracias por confiar en nosotros. Si necesitas detalles de logística, por favor escríbenos a este correo.
              </p>
            </div>
          </div>
        `;

        await sendEmailViaResend({
          resendApiKey: resend_api_key,
          tenantName: tenant_name,
          to: order.email,
          subject: `🏭 ¡Fabricación Iniciada! Campaña ${campaign_name} - ${tenant_name}`,
          html
        });
      }
    } catch (err) {
      console.error('Error en sendCampaignInProductionEmail:', err);
    }
  },

  // 4. Notificar Campaña Finalizada y solicitar pago del saldo restante
  async sendCampaignFinishedEmail(campaignId, origin) {
    try {
      const queryCampaign = `
        SELECT c.name as campaign_name, t.name as tenant_name, t.resend_api_key
        FROM campaigns c
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = $1
      `;
      const campaignResult = await pool.query(queryCampaign, [campaignId]);
      if (campaignResult.rows.length === 0) return;

      const { campaign_name, tenant_name, resend_api_key } = campaignResult.rows[0];

      // Obtener las órdenes de la campaña para cobrarles el saldo pendiente
      const queryOrders = `
        SELECT so.id, so.po_number, so.total_usd, so.advance_payment_pct, so.deposit_paid_usd,
               u.email, u.name
        FROM sales_orders so
        JOIN users u ON u.id = so.client_id
        WHERE so.campaign_id = $1
      `;
      const ordersResult = await pool.query(queryOrders, [campaignId]);
      if (ordersResult.rows.length === 0) return;

      console.log(`📦 Notificando finalización de campaña "${campaign_name}" y cobro de saldos a ${ordersResult.rows.length} clientes...`);

      for (const order of ordersResult.rows) {
        const orderRef = order.po_number || order.id.split('-')[0].toUpperCase();
        const total = parseFloat(order.total_usd);
        const deposit = parseFloat(order.deposit_paid_usd) || 0;
        const balance = (total - deposit).toFixed(2);

        const invoiceUrl = `${origin || 'http://localhost:5173'}/?print_order=${order.id}&doc_type=invoice`;

        const html = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #121212; padding: 24px; text-align: center; border-bottom: 3px solid #4caf50;">
              <h1 style="color: #4caf50; margin: 0; font-size: 24px;">${tenant_name} B2B</h1>
            </div>
            <div style="padding: 24px; line-height: 1.6;">
              <h2 style="color: #111;">🎉 ¡Producción Finalizada! Solicitar Pago de Saldo</h2>
              <p>Hola <strong>${order.name}</strong>,</p>
              <p>Nos alegra informarte que los productos del tiraje <strong>"${campaign_name}"</strong> han salido de producción y ya pasaron con éxito el control de calidad.</p>
              <p>Tu pedido con referencia <strong>${orderRef}</strong> se encuentra listo en puerto para ser embarcado y enviado a tu forwarder.</p>

              <div style="background-color: #f9f9f9; border-left: 4px solid #4caf50; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #4caf50;">Saldo Pendiente de Pago (70% aprox.)</h3>
                <p style="margin: 0; font-size: 18px; font-weight: bold;">$${parseFloat(balance).toLocaleString('en-US')} USD</p>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: #666;">Por favor, realiza la liquidación del saldo restante para autorizar la liberación de la mercancía.</p>
              </div>

              <div style="margin: 30px 0; text-align: center;">
                <a href="${invoiceUrl}" target="_blank" style="display: inline-block; background-color: #4caf50; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  💳 Pagar / Registrar Liquidación de Pedido
                </a>
              </div>

              <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px;">
                Una vez confirmado tu pago, nuestro equipo comercial te enviará la documentación de embarque (Bill of Lading).
              </p>
            </div>
          </div>
        `;

        await sendEmailViaResend({
          resendApiKey: resend_api_key,
          tenantName: tenant_name,
          to: order.email,
          subject: `🎉 ¡Producción Listada! Liquida tu Pedido ${orderRef} - ${tenant_name}`,
          html
        });
      }
    } catch (err) {
      console.error('Error en sendCampaignFinishedEmail:', err);
    }
  }
};
