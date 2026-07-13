-- ============================================================
-- GOSU INT — Schema Multi-Tenant (Developer Environment)
-- ============================================================

-- Habilitar extensión pgcrypto para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpieza de Tablas Existentes (Rama: developer)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS production_order_items CASCADE;
DROP TABLE IF EXISTS production_orders CASCADE;
DROP TABLE IF EXISTS sales_order_items CASCADE;
DROP TABLE IF EXISTS sales_orders CASCADE;
DROP TABLE IF EXISTS volume_discount_rules CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS b2b_client_profiles CASCADE;
DROP TABLE IF EXISTS pricing_tiers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ============================================================
-- 1. TENANTS (Inquilinos/Empresas Cliente)
-- ============================================================
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================
-- 2. USERS (Administradores y Clientes B2B)
-- ============================================================
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL para Super Admins globales
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(50) NOT NULL, -- 'super_admin' | 'tenant_admin' | 'b2b_client'
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- 2.5 PRICING TIERS (Niveles de Cliente Comercial)
-- ============================================================
CREATE TABLE pricing_tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier_name           VARCHAR(255) NOT NULL,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  min_order_amount    NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
  only_master_cases   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_tiers_tenant ON pricing_tiers(tenant_id);

-- ============================================================
-- 3. B2B CLIENT PROFILES (Perfiles de Compradores B2B)
-- ============================================================
CREATE TABLE b2b_client_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pricing_tier_id     UUID REFERENCES pricing_tiers(id) ON DELETE SET NULL,
  company_name        VARCHAR(255), -- Razón Social (Opcional para Leads)
  tax_id              VARCHAR(100), -- Identificación Fiscal (Opcional para Leads)
  billing_address     TEXT,         -- Dirección de Facturación (Opcional para Leads)
  forwarder_address   TEXT,         -- Dirección de Forwarder en China (Opcional para Leads)
  destination_country VARCHAR(100) NOT NULL DEFAULT 'USA', -- País de destino
  account_status      VARCHAR(50) NOT NULL DEFAULT 'lead_new', -- client, lead_new, lead_negotiation, lead_pending_moa, lead_rejected
  followup_notes      TEXT, -- Notas del último contacto comercial
  last_contact_date   DATE, -- Fecha de la última interacción
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_b2b_profiles_tenant ON b2b_client_profiles(tenant_id);
CREATE INDEX idx_b2b_profiles_user ON b2b_client_profiles(user_id);
CREATE INDEX idx_b2b_profiles_tier ON b2b_client_profiles(pricing_tier_id);

-- ============================================================
-- 4. PRODUCTS (Catálogo de Productos Dual: Comercial vs. Fábrica)
-- ============================================================
CREATE TABLE products (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku                        VARCHAR(100) NOT NULL,
  name                       VARCHAR(255) NOT NULL,
  category                   VARCHAR(100) NOT NULL, -- 'sleeves', 'deck_boxes', 'binders'
  image_url                  VARCHAR(512),
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE, -- Estatus comercial de venta
  
  -- Datos de Venta Comercial (Visibles por Clientes B2B y Tenant Admin)
  commercial_description     TEXT,
  price_per_case_usd         NUMERIC(12,2) NOT NULL, -- Precio de venta por Master Case
  units_per_case             INTEGER NOT NULL DEFAULT 1, -- Unidades contenidas en cada Master Case
  finished_measurements      VARCHAR(100), -- Medida final comercial (ej: 66x91mm)
  color                      VARCHAR(100), -- Color o variante (ej: Clear, Matte Black)
  
  -- Datos de Fabricación (Confidenciales: NUNCA visibles por Clientes B2B)
  factory_name               VARCHAR(255),
  factory_sku                VARCHAR(100),
  factory_cost_per_case_usd  NUMERIC(12,2), -- Costo de fabricación por Master Case
  pantone_codes              VARCHAR(255),  -- Códigos Pantone (ej: 293C, Black 6C)
  cut_measurements           VARCHAR(100),  -- Medida de corte para fábrica (ej: 68x93mm)
  fabrication_notes          TEXT,
  
  -- Logística de Master Case
  case_weight_kg             NUMERIC(8,2) NOT NULL,
  case_length_cm             NUMERIC(8,2) NOT NULL,
  case_width_cm              NUMERIC(8,2) NOT NULL,
  case_height_cm             NUMERIC(8,2) NOT NULL,
  case_cbm                   NUMERIC(10,5) GENERATED ALWAYS AS (
    (case_length_cm * case_width_cm * case_height_cm) / 1000000.0
  ) STORED, -- Metros Cúbicos calculados automáticamente
  
  created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, sku)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(sku);

-- ============================================================
-- 5. INVENTORY (Inventario Dual)
-- ============================================================
CREATE TABLE inventory (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id                 UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_physical_cases       INTEGER NOT NULL DEFAULT 0, -- Inventario Físico Disponible (Master Cases)
  stock_in_production_cases  INTEGER NOT NULL DEFAULT 0, -- Inventario en Fabricación / Roadmap (Master Cases)
  updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, product_id)
);

-- ============================================================
-- 6. VOLUME DISCOUNT RULES (Descuentos Configurados por el Tenant)
-- ============================================================
CREATE TABLE volume_discount_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  min_cases     INTEGER NOT NULL, -- Mínimo de Master Cases requeridas
  discount_pct  NUMERIC(5,2) NOT NULL, -- Porcentaje de descuento (ej: 5.00)
  UNIQUE(tenant_id, min_cases)
);

-- ============================================================
-- 7. SALES ORDERS (Pedidos B2B de Venta)
-- ============================================================
CREATE TABLE sales_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Máquina de estados: Draft, Proforma, Production, QC Inspection, Port (FOB/CIF), Transit, Delivered
  status                 VARCHAR(50) NOT NULL DEFAULT 'Draft',
  incoterm               VARCHAR(50), -- e.g. 'FOB', 'CIF', 'EXW', 'DDP'
  
  -- Instantánea de Datos B2B al momento de ordenar
  company_name           VARCHAR(255) NOT NULL,
  tax_id                 VARCHAR(100) NOT NULL,
  billing_address        TEXT NOT NULL,
  forwarder_address      TEXT NOT NULL,
  
  -- Finanzas y Cotización de Envío
  subtotal_usd           NUMERIC(12,2) NOT NULL,
  discount_usd           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  shipping_cost_usd      NUMERIC(12,2) NOT NULL DEFAULT 0.00, -- Cotización envío a Forwarder
  total_usd              NUMERIC(12,2) NOT NULL,
  
  -- Control de Pagos (Dos Fases)
  advance_payment_pct    NUMERIC(5,2) DEFAULT 30.00, -- Porcentaje mínimo depósito requerido (ej: 30%)
  deposit_paid_usd       NUMERIC(12,2) DEFAULT 0.00,
  deposit_receipt_url    VARCHAR(512),
  balance_paid_usd       NUMERIC(12,2) DEFAULT 0.00,
  balance_receipt_url    VARCHAR(512),
  
  -- Documentación de Embarque
  bl_number              VARCHAR(100),
  bl_document_url        VARCHAR(512),
  
  notes                  TEXT,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_orders_tenant ON sales_orders(tenant_id);
CREATE INDEX idx_sales_orders_client ON sales_orders(client_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);

-- ============================================================
-- 8. SALES ORDER ITEMS (Detalles de los Pedidos B2B)
-- ============================================================
CREATE TABLE sales_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_cases        INTEGER NOT NULL,
  price_case_usd   NUMERIC(12,2) NOT NULL, -- Guardado al momento de ordenar
  discount_pct     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  total_item_usd   NUMERIC(12,2) NOT NULL,
  UNIQUE(sales_order_id, product_id)
);

-- ============================================================
-- 9. PRODUCTION ORDERS (Órdenes de Fabricación en China)
-- ============================================================
CREATE TABLE production_orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number               VARCHAR(100) NOT NULL,
  factory_name               VARCHAR(255) NOT NULL,
  status                     VARCHAR(50) NOT NULL DEFAULT 'Draft', -- Draft, Proforma, Production, QC Inspection, Port, Transit, Delivered
  estimated_completion_date  DATE,
  actual_completion_date     DATE,
  total_cost_usd             NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_cbm                  NUMERIC(10,5) NOT NULL DEFAULT 0.00000,
  tracking_number            VARCHAR(100),
  created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, order_number)
);

CREATE INDEX idx_production_orders_tenant ON production_orders(tenant_id);

-- ============================================================
-- 10. PRODUCTION ORDER ITEMS (Detalle de Lote)
-- ============================================================
CREATE TABLE production_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_cases      INTEGER NOT NULL,
  cost_per_case_usd   NUMERIC(12,2) NOT NULL,
  total_item_cost_usd NUMERIC(12,2) NOT NULL,
  item_cbm            NUMERIC(10,5) NOT NULL,
  UNIQUE(production_order_id, product_id)
);

-- ============================================================
-- 11. AUDIT LOGS (Bitácora de Auditoría de Estados B2B)
-- ============================================================
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    UUID NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
