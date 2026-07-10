-- ============================================================
-- GOSU INT — Corrección de Constraints (Developer Environment)
-- ============================================================

-- Agregar UNIQUE constraint a volume_discounts si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'volume_discounts'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'volume_discounts_tenant_cat_min_uq'
  ) THEN
    ALTER TABLE volume_discounts
      ADD CONSTRAINT volume_discounts_tenant_cat_min_uq
      UNIQUE (tenant_id, client_category, min_cases);
  END IF;
END$$;

-- Corregir UNIQUE de products: debe ser (tenant_id, sku) no solo (sku)
DO $$
BEGIN
  -- Eliminar constraint de solo sku si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products'
      AND constraint_name = 'products_sku_key'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_sku_key;
  END IF;
  
  -- Agregar el constraint correcto multi-tenant si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products'
      AND constraint_name = 'products_tenant_sku_uq'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_tenant_sku_uq
      UNIQUE (tenant_id, sku);
  END IF;
END$$;
