-- ============================================================
-- GOSU INT — Datos Semilla (Developer Environment)
-- ============================================================

-- 1. Insertar el tenant principal
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Gosu Accessories', 'gosu')
ON CONFLICT (slug) DO NOTHING;

-- 2. Insertar usuarios (con UUIDs fijos)
-- Contraseñas por defecto:
-- admin@gosu.gg -> GosuAdmin2026! (Hash: $2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi)
-- superadmin@gosu.gg -> GosuSuper2026! (Hash: $2b$12$CbVwPDJn/l5RHEYKk02cX.a8XZGmPm7YCv0fuTRjhVuwWBFs1b2su)
-- client@gosu.gg -> GosuAdmin2026! (mismo hash por simplicidad de desarrollo)

-- Tenant Admin
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Admin Gosu',
  'admin@gosu.gg',
  '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi',
  'tenant_admin'
)
ON CONFLICT (email) DO NOTHING;

-- Cliente B2B
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Card Shop Inc (Client)',
  'client@gosu.gg',
  '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi',
  'b2b_client'
)
ON CONFLICT (email) DO NOTHING;

-- Lead Seed 1 (Nuevo)
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'Yugi Muto',
  'lead_yugi@kaiba.com',
  '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi',
  'b2b_client'
)
ON CONFLICT (email) DO NOTHING;

-- Lead Seed 2 (Negociación)
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'Gunter Schmidt',
  'lead_germany@gamers.de',
  '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi',
  'b2b_client'
)
ON CONFLICT (email) DO NOTHING;

-- Super Admin Global (Sin tenant_id, administra la plataforma entera)
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  NULL,
  'Plataforma SuperAdmin',
  'superadmin@gosu.gg',
  '$2b$12$CbVwPDJn/l5RHEYKk02cX.a8XZGmPm7YCv0fuTRjhVuwWBFs1b2su',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

-- 3. Crear Perfil B2B para el Cliente
INSERT INTO b2b_client_profiles (id, tenant_id, user_id, company_name, tax_id, billing_address, forwarder_address, custom_moa_usd, client_category, destination_country, account_status, followup_notes, last_contact_date)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'Card Shop & Games Ltd',
  'US-987654321-TX',
  '123 Gaming Street, Austin, TX 78701, USA',
  'Warehouse A, Lane 88, Yiwu Trade City, Zhejiang, China (Forwarder ID: FW-GOSU-99)',
  1500.00,
  'wholesale_distributor',
  'USA',
  'client',
  'Cuenta activa completamente validada y con historial de órdenes comercialmente aprobadas.',
  CURRENT_DATE
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Perfil para Lead 1 (Nuevo)
INSERT INTO b2b_client_profiles (id, tenant_id, user_id, company_name, tax_id, billing_address, forwarder_address, custom_moa_usd, client_category, destination_country, account_status, followup_notes, last_contact_date)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000005',
  'Kame Games Japan',
  NULL,
  NULL,
  NULL,
  1000.00,
  'retail_store',
  'Japón',
  'lead_new',
  'Contacto inicial por formulario. Solicita catálogo de protectores mate Standard y precios FOB. Aún no cuenta con forwarder en China.',
  CURRENT_DATE
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Perfil para Lead 2 (Negociación)
INSERT INTO b2b_client_profiles (id, tenant_id, user_id, company_name, tax_id, billing_address, forwarder_address, custom_moa_usd, client_category, destination_country, account_status, followup_notes, last_contact_date)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000006',
  'Spiel und Spass Vertriebs GmbH',
  'DE-811122334',
  'Nordring 45, Munich, Germany',
  NULL,
  2500.00,
  'wholesale_distributor',
  'Alemania',
  'lead_negotiation',
  'En negociación de volumen de compra. Se propone un MOA de $2,500.00 con un 5% de descuento adicional por canal de distribuidor regional.',
  CURRENT_DATE
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 4. Insertar reglas de descuento por volumen para el Tenant
INSERT INTO volume_discount_rules (tenant_id, min_cases, discount_pct)
VALUES
  ('00000000-0000-0000-0000-000000000001', 5, 5.00),
  ('00000000-0000-0000-0000-000000000001', 10, 10.00),
  ('00000000-0000-0000-0000-000000000001', 20, 15.00)
ON CONFLICT (tenant_id, min_cases) DO NOTHING;

-- 5. Insertar productos de ejemplo (Catálogo Dual & Logística)
-- Matte Sleeves Black
INSERT INTO products (
  id, tenant_id, sku, name, category, image_url, is_active,
  commercial_description, price_per_case_usd, units_per_case, finished_measurements,
  factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
  case_weight_kg, case_length_cm, case_width_cm, case_height_cm
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'GSL-MAT-BK',
  'GOSU Matte Sleeves Standard - Black',
  'sleeves',
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=400',
  TRUE,
  'Fundas mate premium de alta opacidad y textura rugosa para barajas tamaño Standard (Magic, Pokémon).',
  250.00,
  100, -- 100 packs por caja master
  '66x91 mm',
  'Dongguan Card Supplies Factory',
  'DG-SLV-M01-BK',
  95.00,
  'Pantone Black 6C',
  '68x93 mm',
  'Temperatura de sellado: 145C. Control de textura rugosa trasera nivel 3.',
  12.50,
  45.00,
  35.00,
  25.00
) ON CONFLICT (tenant_id, sku) DO NOTHING;

-- Matte Sleeves Blue
INSERT INTO products (
  id, tenant_id, sku, name, category, image_url, is_active,
  commercial_description, price_per_case_usd, units_per_case, finished_measurements,
  factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
  case_weight_kg, case_length_cm, case_width_cm, case_height_cm
) VALUES (
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'GSL-MAT-BL',
  'GOSU Matte Sleeves Standard - Blue',
  'sleeves',
  'https://images.unsplash.com/photo-1598128558393-70ff21433be0?q=80&w=400',
  TRUE,
  'Fundas mate premium color azul zafiro. Desplazamiento suave para barajas Standard.',
  250.00,
  100,
  '66x91 mm',
  'Dongguan Card Supplies Factory',
  'DG-SLV-M01-BL',
  95.00,
  'Pantone 293C',
  '68x93 mm',
  'Asegurar opacidad en la capa de color trasera mediante doble extrusión.',
  12.50,
  45.00,
  35.00,
  25.00
) ON CONFLICT (tenant_id, sku) DO NOTHING;

-- Zip Binder 9-Pocket
INSERT INTO products (
  id, tenant_id, sku, name, category, image_url, is_active,
  commercial_description, price_per_case_usd, units_per_case, finished_measurements,
  factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
  case_weight_kg, case_length_cm, case_width_cm, case_height_cm
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'GBD-ZIP-9P',
  'GOSU Premium Zip Binder 9-Pocket',
  'binders',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400',
  TRUE,
  'Carpeta de 9 bolsillos con cremallera lateral. Cubierta de cuero sintético y carga lateral libre de ácido.',
  180.00,
  10, -- 10 carpetas por caja master
  '330x260 mm',
  'Wenzhou Binder Specialists Co.',
  'WZ-BND-Z9-PU',
  75.00,
  'Pantone 425C (Grey Cover)',
  '350x280 mm',
  'Costuras dobles reforzadas. Cremallera YKK de alta resistencia.',
  14.00,
  42.00,
  38.00,
  32.00
) ON CONFLICT (tenant_id, sku) DO NOTHING;

-- Deck Box Magnetic
INSERT INTO products (
  id, tenant_id, sku, name, category, image_url, is_active,
  commercial_description, price_per_case_usd, units_per_case, finished_measurements,
  factory_name, factory_sku, factory_cost_per_case_usd, pantone_codes, cut_measurements, fabrication_notes,
  case_weight_kg, case_length_cm, case_width_cm, case_height_cm
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'GDB-MAG-RD',
  'GOSU Deck Box Magnetic - Red Edition',
  'deck_boxes',
  'https://images.unsplash.com/photo-1544654803-b69140b285a1?q=80&w=400',
  TRUE,
  'Caja para mazo premium con cierre magnético extra fuerte. Capacidad para más de 100 cartas con doble funda.',
  220.00,
  20, -- 20 deck boxes por caja master
  '105x80x90 mm',
  'Shenzhen Molded Plastics Corp',
  'SZ-DB-M100-RD',
  82.00,
  'Pantone 186C (Red PU)',
  'N/A (Molded)',
  'Imanes de neodimio N52 (4 por caja). Cubierta de PU microfibra.',
  9.80,
  38.00,
  32.00,
  28.00
) ON CONFLICT (tenant_id, sku) DO NOTHING;

-- 6. Insertar inventarios iniciales para los productos
INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 45, 100), -- 45 físicas, 100 en fabricación
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 30, 50),  -- 30 físicas, 50 en fabricación
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 15, 20),  -- 15 físicas, 20 en fabricación
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 25, 0)    -- 25 físicas, 0 en fabricación
ON CONFLICT (tenant_id, product_id) DO NOTHING;
