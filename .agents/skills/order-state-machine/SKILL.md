---
name: order-state-machine
description: Define y valida los estados permitidos en el flujo de pedidos de la cadena de suministro B2B (Draft, Proforma, Producción, Calidad, Puerto, Tránsito, Entregado).
---

# Lógica de Cadena de Suministro (@order-state-machine)

Esta guía define estrictamente la máquina de estados por la que pasan los pedidos de ventas y fabricación en la plataforma.

## 🔄 Flujo de Estados Permitidos

El ciclo de vida de un pedido debe respetar estrictamente el siguiente flujo secuencial:

`Draft` ➡️ `Proforma` ➡️ `Production` ➡️ `QC Inspection` ➡️ `Port (FOB/CIF)` ➡️ `Transit` ➡️ `Delivered`

## ⚙️ Reglas de Transición de Estados

1. **Adelanto de Pago**:
   - No se puede pasar un pedido a estado `Production` sin confirmar previamente el pago de la proforma o depósito correspondiente.
2. **Control de Calidad (QC)**:
   - Ningún lote de producción puede ser enviado al puerto (`Port`) si no ha aprobado previamente la fase de inspección de calidad (`QC Inspection`).
3. **Logística Internacional**:
   - La transición a `Transit` requiere de la confirmación de carga de documentos de embarque (Bill of Lading / Guía de Tránsito) y la asignación del Incoterm aplicable.
4. **Validación en Código**:
   - Al actualizar el estado de un pedido, el backend debe corroborar que el estado actual pertenece al paso inmediatamente anterior o permitido según esta regla.
