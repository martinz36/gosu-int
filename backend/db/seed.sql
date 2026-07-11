-- ============================================================
-- GOSU INT — Datos Semilla (Developer Environment)
-- ============================================================

-- Insertar el tenant principal solo si no existe
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Gosu Accessories', 'gosu')
ON CONFLICT (slug) DO NOTHING;

-- Insertar usuario admin (password: GosuAdmin2026!)
-- Hash: bcrypt de 'GosuAdmin2026!'
INSERT INTO users (tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Admin Gosu',
  'admin@gosu.gg',
  '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Insertar usuario superadmin (password: GosuSuper2026!)
-- Hash: bcrypt de 'GosuSuper2026!'
INSERT INTO users (tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Super Admin Plataforma',
  'superadmin@gosu.gg',
  '$2b$12$CbVwPDJn/l5RHEYKk02cX.a8XZGmPm7YCv0fuTRjhVuwWBFs1b2su',
  'superadmin'
)
ON CONFLICT (email) DO NOTHING;

-- Insertar productos de ejemplo
INSERT INTO products (tenant_id, name, sku, category, units_per_case, weight_per_unit_g, length_cm, width_cm, height_cm, price_per_case_usd, stock_cases)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'GOSU Matte Sleeves Standard - Black', 'GSL-MAT-BK', 'sleeves',    100, 110, 32, 24, 20, 250.00, 45),
  ('00000000-0000-0000-0000-000000000001', 'GOSU Matte Sleeves Standard - Blue',  'GSL-MAT-BL', 'sleeves',    100, 110, 32, 24, 20, 250.00, 30),
  ('00000000-0000-0000-0000-000000000001', 'GOSU Premium Zip Binder 9-Pocket',    'GBD-ZIP-9P', 'binders',     10, 950, 40, 35, 30, 180.00, 15),
  ('00000000-0000-0000-0000-000000000001', 'GOSU Deck Box Magnetic - Red Edition','GDB-MAG-RD', 'deck_boxes',  20, 350, 35, 28, 22, 220.00, 25)
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- Insertar reglas de descuento
INSERT INTO volume_discounts (tenant_id, client_category, min_cases, discount_percentage)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'all',                    5,  5.00),
  ('00000000-0000-0000-0000-000000000001', 'all',                   10, 10.00),
  ('00000000-0000-0000-0000-000000000001', 'all',                   20, 15.00),
  ('00000000-0000-0000-0000-000000000001', 'wholesale_distributor',   1,  5.00)
ON CONFLICT (tenant_id, client_category, min_cases) DO NOTHING;
