---
name: b2b-pricing-formatter
description: Estándares de cálculo de precios B2B internacionales, precisión monetaria, Incoterms y descuentos escalonados por volumen.
---

# Precios y Divisas Internacionales (@b2b-pricing-formatter)

Esta guía define las reglas de cálculo monetario y visualización de precios para operaciones de comercio B2B en la plataforma.

## 💰 Reglas Financieras y Matemáticas

1. **Prohibido el uso de punto flotante (`float`) para Dinero**:
   - Para evitar errores de precisión de punto flotante IEEE 754, todos los cálculos financieros deben almacenarse y procesarse en centavos de la moneda base (ej. enteros en centavos de USD) o mediante tipos de datos decimales de alta precisión (`NUMERIC` o `DECIMAL` en PostgreSQL).
2. **Moneda Base**:
   - La moneda principal por defecto del sistema es el Dólar Estadounidense (`USD`). Cualquier conversión de divisa local se calculará en base a la tasa vigente en el momento de creación del pedido.
3. **Precios por Volumen (Descuentos Escalonados)**:
   - Se debe aplicar siempre la lógica de precios decrecientes según el volumen de cajas máster adquiridas:
     - 1-4 cajas: Precio Base.
     - 5-9 cajas: 5% de descuento.
     - 10-19 cajas: 10% de descuento.
     - 20+ cajas: 15% de descuento.
4. **Cálculo de Totales en Frontend y Backend**:
   - Las funciones que calculen subtotales y totales deben compartir la misma firma matemática para evitar discrepancias entre lo mostrado en Vercel y lo cobrado/facturado en Railway.
