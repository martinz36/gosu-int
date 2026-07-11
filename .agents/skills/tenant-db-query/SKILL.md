---
name: tenant-db-query
description: Instrucciones y reglas para asegurar que todas las consultas SQL o de ORM incluyan obligatoriamente el filtro de tenant_id, garantizando el aislamiento de datos entre inquilinos.
---

# Gestión Multitenant Segura (@tenant-db-query)

Esta guía define las directrices críticas y obligatorias para garantizar el aislamiento de datos (Data Isolation) entre los inquilinos (tenants) de la plataforma B2B SaaS.

## 🚨 Reglas de Oro

1. **Aislamiento Absoluto**:
   - Ninguna consulta a la base de datos (con excepción de procesos de Super Admin global) puede omitir el filtro de `tenant_id`.
   - Queda estrictamente prohibido realizar consultas directas sin validar la pertenencia del usuario al inquilino objetivo.

2. **Extracción Segura del `tenant_id`**:
   - En el backend, el `tenant_id` debe obtenerse siempre del token JWT decodificado en `req.user.tenant_id`, nunca de parámetros del cuerpo de la petición (`req.body`) o query string (`req.query`) que puedan ser manipulados por el cliente.

3. **Ejemplo de Consulta Segura (SQL)**:
   - *Incorrecto*:
     ```sql
     SELECT * FROM products WHERE sku = $1;
     ```
   - *Correcto*:
     ```sql
     SELECT * FROM products WHERE sku = $1 AND tenant_id = $2;
     ```

4. **Validación en Rutas**:
   - Cada vez que se cree un endpoint B2B (`/api/products`, `/api/orders`, etc.), el middleware de autenticación debe inyectar el usuario logueado en la petición y asegurar que se filtre por su `tenant_id`.
