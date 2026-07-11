-- ============================================================
-- GOSU INT — Schema Multi-Tenant (Developer Environment)
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (Empresas/Marcas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- ============================================================
-- 2. USERS (Administradores y Clientes B2B)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(50)  NOT NULL DEFAULT 'client', -- 'admin' | 'client'
  client_category   VARCHAR(50)  DEFAULT 'retail_store',   -- 'retail_store' | 'wholesale_distributor'
  country           VARCHAR(100),
  custom_moa_usd    NUMERIC(10,2) DEFAULT 1000.00,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- ============================================================
-- 3. PRODUCTS (Catálogo por Tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  sku                 VARCHAR(100) NOT NULL,
  category            VARCHAR(50)  NOT NULL, -- 'sleeves' | 'binders' | 'deck_boxes'
  units_per_case      INT          NOT NULL DEFAULT 1,
  weight_per_unit_g   INT          NOT NULL DEFAULT 100,
  length_cm           NUMERIC(5,2) DEFAULT 0,
  width_cm            NUMERIC(5,2) DEFAULT 0,
  height_cm           NUMERIC(5,2) DEFAULT 0,
  price_per_case_usd  NUMERIC(10,2) NOT NULL,
  stock_cases         INT           NOT NULL DEFAULT 0,
  image_url           VARCHAR(512),
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);

-- ============================================================
-- 4. VOLUME DISCOUNTS (Descuentos por Volumen por Tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS volume_discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_category     VARCHAR(50) NOT NULL DEFAULT 'all', -- 'all' | 'wholesale_distributor' | 'retail_store'
  min_cases           INT         NOT NULL,
  discount_percentage NUMERIC(5,2) NOT NULL,
  UNIQUE(tenant_id, client_category, min_cases)
);

-- ============================================================
-- 5. PRODUCTION ORDERS (Órdenes de Fábrica - Módulo Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status              VARCHAR(50) NOT NULL DEFAULT 'sent', -- 'sent' | 'production_started' | 'production_completed'
  total_cost_usd      NUMERIC(10,2) NOT NULL DEFAULT 0,
  advance_payment_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_balance_usd NUMERIC(10,2) GENERATED ALWAYS AS (total_cost_usd - advance_payment_usd) STORED,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_production_orders_tenant ON production_orders(tenant_id);

-- ============================================================
-- 6. PRODUCTION ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS production_order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id   UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id),
  qty_cases             INT          NOT NULL,
  cost_per_case_usd     NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- 7. SALES ORDERS (Pedidos B2B de Clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id             UUID NOT NULL REFERENCES users(id),
  status                VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  -- 'pending_payment' | 'payment_confirmed' | 'in_production' | 'ready' | 'in_dispatch' | 'delivered'
  total_amount_usd      NUMERIC(10,2) NOT NULL,
  discount_percent      NUMERIC(5,2)  DEFAULT 0,
  payment_receipt_url   VARCHAR(512),
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant ON sales_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_client ON sales_orders(client_id);

-- ============================================================
-- 8. SALES ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id      UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  qty_cases           INT           NOT NULL,
  price_per_case_usd  NUMERIC(10,2) NOT NULL
);


