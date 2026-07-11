import { useState, useEffect, useCallback } from 'react';
import './App.css';
import LoginPage from './components/LoginPage';
import { auth, products as productsApi, orders as ordersApi, production as productionApi, tenants as tenantsApi, plans as plansApi, users as usersApi, audit as auditApi, config as configApi } from './services/api';

// Reglas de descuento (se obtendrán del backend en futuras versiones)
const VOLUME_DISCOUNTS = [
  { min_cases: 5,  discount_percentage: 5  },
  { min_cases: 10, discount_percentage: 10 },
  { min_cases: 20, discount_percentage: 15 },
];

function App() {
  // -------------------------------------------------------
  // Estado de Autenticación
  // -------------------------------------------------------
  const [currentUser, setCurrentUser] = useState(() => auth.getUser());

  // -------------------------------------------------------
  // Datos del servidor
  // -------------------------------------------------------
  const [productList, setProductList] = useState([]);
  const [clientOrders, setClientOrders] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [tenantsList, setTenantsList] = useState([]);
  const [plansList, setPlansList] = useState([]);
  const [globalUsersList, setGlobalUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [saasMetrics, setSaasMetrics] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  // -------------------------------------------------------
  // UI State
  // -------------------------------------------------------
  const [activeTab, setActiveTab] = useState(() => {
    const user = auth.getUser();
    return user?.role === 'superadmin' ? 'saas-tenants' : 'catalog';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const [selectedOrderForDoc, setSelectedOrderForDoc] = useState(null);
  const [docType, setDocType] = useState('invoice');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Formulario para nuevo Tenant / Edición
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    plan_id: '',
    status: 'active',
    adminName: '',
    adminEmail: '',
    adminPassword: ''
  });
  const [editingTenant, setEditingTenant] = useState(null);
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Formulario para registrar otro Super Admin
  const [showSuperAdminForm, setShowSuperAdminForm] = useState(false);
  const [newSuperAdmin, setNewSuperAdmin] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [creatingSuperAdmin, setCreatingSuperAdmin] = useState(false);

  // Configuración dinámica de inquilinos
  const [catalogViewMode, setCatalogViewMode] = useState('grid');
  const [categoriesList, setCategoriesList] = useState([]);
  const [brandsList, setBrandsList] = useState([]);

  // Formulario para Marcas/Categorías
  const [newCategory, setNewCategory] = useState({ name: '', slug: '' });
  const [newBrand, setNewBrand] = useState({ name: '', slug: '' });
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingBrand, setEditingBrand] = useState(null);

  // Formulario para Productos (con campos extendidos B2B)
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    category: '',
    brand: '',
    barcode: '',
    units_per_case: 1,
    weight_per_unit_g: 100,
    length_cm: 0,
    width_cm: 0,
    height_cm: 0,
    price_per_case_usd: '',
    pvp_price_usd: '',
    cost_price_usd: '',
    stock_cases: 0,
    image_url: '',
    video_url: '',
    marketing_resources_url: ''
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [creatingProduct, setCreatingProduct] = useState(false);

  // MOA del usuario actual
  const MOA_LIMIT = parseFloat(currentUser?.custom_moa_usd) || 1000.00;
  const isAdmin = currentUser?.role === 'admin';
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isImpersonating = !!localStorage.getItem('gosu_superadmin_token');

  // -------------------------------------------------------
  // Carga de datos
  // -------------------------------------------------------
  const loadProducts = useCallback(async () => {
    try {
      const params = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (searchQuery) params.search = searchQuery;
      const data = await productsApi.getAll(params);
      setProductList(data);
    } catch (err) {
      console.error('Error cargando productos:', err);
    }
  }, [selectedCategory, searchQuery]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await ordersApi.getAll();
      setClientOrders(data);
    } catch (err) {
      console.error('Error cargando pedidos:', err);
    }
  }, []);

  const loadProduction = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await productionApi.getAll();
      setProductionOrders(data);
    } catch (err) {
      console.error('Error cargando producción:', err);
    }
  }, [isAdmin]);

  const loadTenants = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const [tData, pData, uData, alData, mData] = await Promise.all([
        tenantsApi.getAll(),
        plansApi.getAll(),
        usersApi.getGlobal(),
        auditApi.getLogs(),
        auditApi.getMetrics()
      ]);
      setTenantsList(tData);
      setPlansList(pData);
      setGlobalUsersList(uData);
      setAuditLogs(alData);
      setSaasMetrics(mData);
    } catch (err) {
      console.error('Error cargando datos SaaS:', err);
    }
  }, [isSuperAdmin]);

  const loadCatalogConfig = useCallback(async () => {
    if (!currentUser || isSuperAdmin) return;
    try {
      const [catData, brandData] = await Promise.all([
        configApi.categories.getAll(),
        configApi.brands.getAll()
      ]);
      setCategoriesList(catData);
      setBrandsList(brandData);
    } catch (err) {
      console.error('Error cargando marcas/categorías:', err);
    }
  }, [currentUser, isSuperAdmin]);

  // Carga inicial cuando el usuario se autentifica
  useEffect(() => {
    if (!currentUser) return;
    
    const loadAll = async () => {
      setDataLoading(true);
      setDataError('');
      try {
        if (isSuperAdmin) {
          await loadTenants();
        } else {
          await Promise.all([loadProducts(), loadOrders(), loadProduction(), loadCatalogConfig()]);
        }
      } catch (err) {
        setDataError('Error al cargar datos del servidor.');
      } finally {
        setDataLoading(false);
      }
    };
    loadAll();
  }, [currentUser, isSuperAdmin, loadTenants, loadProducts, loadOrders, loadProduction, loadCatalogConfig]);

  // Recargar productos cuando cambian los filtros
  useEffect(() => {
    if (!currentUser || isSuperAdmin) return;
    const timeout = setTimeout(loadProducts, 300); // debounce
    return () => clearTimeout(timeout);
  }, [selectedCategory, searchQuery, currentUser, isSuperAdmin, loadProducts]);

  // Recargar según la tab activa
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'admin') loadProduction();
    if (activeTab === 'catalog' || activeTab === 'config') loadCatalogConfig();
    if (['saas-tenants', 'saas-users', 'saas-billing', 'saas-audit'].includes(activeTab)) {
      loadTenants();
    }
  }, [activeTab, currentUser, loadOrders, loadProduction, loadTenants, loadCatalogConfig]);

  // Aligerar la vista del Super Admin forzando la redirección de tab
  useEffect(() => {
    if (currentUser && currentUser.role === 'superadmin' && !['saas-tenants', 'saas-users', 'saas-billing', 'saas-audit'].includes(activeTab)) {
      setActiveTab('saas-tenants');
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (plansList.length > 0 && !newTenant.plan_id) {
      setNewTenant(prev => ({ ...prev, plan_id: plansList[0].id }));
    }
  }, [plansList, newTenant.plan_id]);

  useEffect(() => {
    if (categoriesList.length > 0 && !newProduct.category) {
      setNewProduct(prev => ({ ...prev, category: categoriesList[0].slug }));
    }
  }, [categoriesList, newProduct.category]);

  useEffect(() => {
    if (brandsList.length > 0 && !newProduct.brand) {
      setNewProduct(prev => ({ ...prev, brand: brandsList[0].name }));
    }
  }, [brandsList, newProduct.brand]);

  // -------------------------------------------------------
  // Login / Logout
  // -------------------------------------------------------
  const handleLogin = (user) => {
    setCurrentUser(user);
    setActiveTab(user.role === 'superadmin' ? 'saas-tenants' : 'catalog');
  };

  const handleLogout = () => {
    auth.logout();
    setCurrentUser(null);
    setCart({});
    setProductList([]);
    setClientOrders([]);
    setProductionOrders([]);
    setTenantsList([]);
    setPlansList([]);
    setGlobalUsersList([]);
    setAuditLogs([]);
    setSaasMetrics(null);
  };

  const handleCreateOrUpdateTenant = async (e) => {
    e.preventDefault();
    if (!newTenant.name || !newTenant.slug || !newTenant.plan_id) {
      alert('Por favor complete todos los campos requeridos.');
      return;
    }

    if (!editingTenant && (!newTenant.adminName || !newTenant.adminEmail || !newTenant.adminPassword)) {
      alert('Por favor complete los campos del Administrador.');
      return;
    }

    setCreatingTenant(true);
    try {
      if (editingTenant) {
        await tenantsApi.update(editingTenant.id, {
          name: newTenant.name,
          slug: newTenant.slug,
          plan_id: newTenant.plan_id,
          status: newTenant.status
        });
        alert('🎉 Empresa actualizada correctamente.');
        setEditingTenant(null);
      } else {
        await tenantsApi.create(newTenant);
        alert('🎉 Empresa y Administrador creados correctamente.');
      }
      setNewTenant({
        name: '',
        slug: '',
        plan_id: plansList[0]?.id || '',
        status: 'active',
        adminName: '',
        adminEmail: '',
        adminPassword: ''
      });
      await loadTenants();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleDeleteTenant = async (id) => {
    if (!confirm('¿Está seguro que desea eliminar esta empresa? Se realizará una desactivación lógica de sus datos.')) {
      return;
    }

    try {
      await tenantsApi.delete(id);
      alert('Empresa eliminada correctamente.');
      await loadTenants();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleImpersonate = async (userId) => {
    try {
      localStorage.setItem('gosu_superadmin_token', localStorage.getItem('gosu_token'));
      localStorage.setItem('gosu_superadmin_user', localStorage.getItem('gosu_user'));

      const data = await auth.impersonate(userId);
      localStorage.setItem('gosu_token', data.token);
      localStorage.setItem('gosu_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setActiveTab('catalog');
      alert(`⚡ Iniciando sesión de soporte como ${data.user.name} (${data.user.tenant_name})`);
    } catch (err) {
      alert(`❌ Error al suplantar identidad: ${err.message}`);
    }
  };

  const handleStopImpersonation = () => {
    const origToken = localStorage.getItem('gosu_superadmin_token');
    const origUser = localStorage.getItem('gosu_superadmin_user');

    if (!origToken || !origUser) {
      alert('No se encontró una sesión previa de Super Admin.');
      return;
    }

    localStorage.setItem('gosu_token', origToken);
    localStorage.setItem('gosu_user', origUser);
    localStorage.removeItem('gosu_superadmin_token');
    localStorage.removeItem('gosu_superadmin_user');

    const parsedUser = JSON.parse(origUser);
    setCurrentUser(parsedUser);
    setActiveTab('saas-tenants');
    alert('✓ Sesión de soporte finalizada. Volviendo a Super Admin.');
  };

  const handleCreateSuperAdmin = async (e) => {
    e.preventDefault();
    if (!newSuperAdmin.name || !newSuperAdmin.email || !newSuperAdmin.password) {
      alert('Complete todos los campos del nuevo Super Admin.');
      return;
    }

    setCreatingSuperAdmin(true);
    try {
      await usersApi.createSuperAdmin(newSuperAdmin);
      alert('🎉 Nuevo Administrador de Plataforma (Super Admin) creado correctamente.');
      setNewSuperAdmin({ name: '', email: '', password: '' });
      setShowSuperAdminForm(false);
      await loadTenants();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setCreatingSuperAdmin(false);
    }
  };

  // ============================================================
  // CRUD de Categorías
  // ============================================================
  const handleCreateOrUpdateCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name || !newCategory.slug) {
      alert('Nombre y slug son requeridos.');
      return;
    }
    try {
      if (editingCategory) {
        await configApi.categories.update(editingCategory.id, newCategory);
        alert('🎉 Categoría actualizada con éxito.');
        setEditingCategory(null);
      } else {
        await configApi.categories.create(newCategory);
        alert('🎉 Categoría creada con éxito.');
      }
      setNewCategory({ name: '', slug: '' });
      await loadCatalogConfig();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('¿Está seguro de eliminar esta categoría?')) return;
    try {
      await configApi.categories.delete(id);
      alert('Categoría eliminada.');
      await loadCatalogConfig();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  // ============================================================
  // CRUD de Marcas
  // ============================================================
  const handleCreateOrUpdateBrand = async (e) => {
    e.preventDefault();
    if (!newBrand.name || !newBrand.slug) {
      alert('Nombre y slug son requeridos.');
      return;
    }
    try {
      if (editingBrand) {
        await configApi.brands.update(editingBrand.id, newBrand);
        alert('🎉 Marca actualizada con éxito.');
        setEditingBrand(null);
      } else {
        await configApi.brands.create(newBrand);
        alert('🎉 Marca creada con éxito.');
      }
      setNewBrand({ name: '', slug: '' });
      await loadCatalogConfig();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleDeleteBrand = async (id) => {
    if (!confirm('¿Está seguro de eliminar esta marca?')) return;
    try {
      await configApi.brands.delete(id);
      alert('Marca eliminada.');
      await loadCatalogConfig();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  // ============================================================
  // CRUD de Productos (Campos Extendidos B2B)
  // ============================================================
  const handleCreateOrUpdateProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.sku || !newProduct.category || !newProduct.price_per_case_usd) {
      alert('Nombre, SKU, Categoría y Precio por caja son campos obligatorios.');
      return;
    }

    setCreatingProduct(true);
    try {
      if (editingProduct) {
        await productsApi.update(editingProduct.id, newProduct);
        alert('🎉 Producto actualizado con éxito.');
        setEditingProduct(null);
      } else {
        await productsApi.create(newProduct);
        alert('🎉 Producto creado con éxito.');
      }
      setNewProduct({
        name: '',
        sku: '',
        category: categoriesList[0]?.slug || '',
        brand: brandsList[0]?.name || '',
        barcode: '',
        units_per_case: 1,
        weight_per_unit_g: 100,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        price_per_case_usd: '',
        pvp_price_usd: '',
        cost_price_usd: '',
        stock_cases: 0,
        image_url: '',
        video_url: '',
        marketing_resources_url: ''
      });
      await loadProducts();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('¿Está seguro de eliminar este producto del catálogo?')) return;
    try {
      await productsApi.delete(id);
      alert('Producto eliminado con éxito.');
      await loadProducts();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  // -------------------------------------------------------
  // Lógica del Carrito
  // -------------------------------------------------------
  const handleAddToCart = (productId) => {
    setCart(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const handleRemoveFromCart = (productId) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[productId] > 1) {
        updated[productId] -= 1;
      } else {
        delete updated[productId];
      }
      return updated;
    });
  };

  const getCartTotals = () => {
    let totalItemsCases = 0;
    let subtotal = 0;
    const itemsDetail = [];

    Object.entries(cart).forEach(([id, qty]) => {
      const product = productList.find(p => p.id === id);
      if (product) {
        totalItemsCases += qty;
        subtotal += parseFloat(product.price_per_case_usd) * qty;
        itemsDetail.push({ ...product, qty });
      }
    });

    // Descuento por categoría
    let categoryDiscountPercent = currentUser?.client_category === 'wholesale_distributor' ? 5 : 0;

    // Descuento por volumen
    let volumeDiscountPercent = 0;
    VOLUME_DISCOUNTS.forEach(d => {
      if (totalItemsCases >= d.min_cases) volumeDiscountPercent = d.discount_percentage;
    });

    const totalDiscountPercent = categoryDiscountPercent + volumeDiscountPercent;
    const discountAmount = subtotal * (totalDiscountPercent / 100);
    const finalTotal = subtotal - discountAmount;

    return { subtotal, discountPercent: totalDiscountPercent, discountAmount, finalTotal, totalCases: totalItemsCases, items: itemsDetail };
  };

  const cartTotals = getCartTotals();

  // -------------------------------------------------------
  // Checkout
  // -------------------------------------------------------
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cartTotals.finalTotal < MOA_LIMIT) return;
    
    setCheckoutLoading(true);
    try {
      const items = cartTotals.items.map(i => ({
        product_id: i.id,
        qty_cases: i.qty,
      }));

      await ordersApi.create(items);
      setCart({});
      setReceiptUploaded(false);
      setShowCart(false);
      await loadOrders();
      setActiveTab('orders');
      alert('🎉 Pedido enviado con éxito. Esperando validación de pago.');
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  // -------------------------------------------------------
  // Si no está autenticado, mostrar Login
  // -------------------------------------------------------
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // -------------------------------------------------------
  // Render Principal
  // -------------------------------------------------------
  return (
    <div className="app-container" style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Barra de Impersonación para Soporte Técnico */}
      {isImpersonating && (
        <div style={{ background: 'var(--orange-neon)', color: '#000', padding: '10px 24px', fontWeight: '800', textAlign: 'center', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 1000 }}>
          <span>🔴 Sesión de Soporte: Impersonando a <strong>{currentUser.name}</strong> ({currentUser.tenant_name})</span>
          <button 
            onClick={handleStopImpersonation} 
            style={{ background: '#000', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
          >
            Volver a mi sesión Super Admin
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        {/* Sidebar Lateral */}
        <aside className="sidebar" style={{ width: '260px', background: 'rgba(10, 10, 10, 0.98)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px 16px', boxSizing: 'border-box', flexShrink: 0 }}>
          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h1 className="logo-text" style={{ margin: 0, fontSize: '20px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {isSuperAdmin ? 'Gosu SaaS' : currentUser.tenant_name || 'Gosu B2B'}
            </h1>
            {!isSuperAdmin && (
              <span className="badge badge-cyan" style={{ fontSize: '9px', marginTop: '6px' }}>{currentUser.tenant_slug}</span>
            )}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
            {isSuperAdmin ? (
              <>
                <span className={`nav-link-btn ${activeTab === 'saas-tenants' ? 'active' : ''}`} onClick={() => setActiveTab('saas-tenants')} style={{ cursor: 'pointer' }}>
                  🏢 Inquilinos (Tenants)
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-users' ? 'active' : ''}`} onClick={() => setActiveTab('saas-users')} style={{ cursor: 'pointer' }}>
                  👥 Usuarios Globales
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-billing' ? 'active' : ''}`} onClick={() => setActiveTab('saas-billing')} style={{ cursor: 'pointer' }}>
                  💳 Planes & Billing
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-audit' ? 'active' : ''}`} onClick={() => setActiveTab('saas-audit')} style={{ cursor: 'pointer' }}>
                  📋 Auditoría & Logs
                </span>
              </>
            ) : (
              <>
                <span className={`nav-link-btn ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')} style={{ cursor: 'pointer' }}>
                  📂 Catálogo B2B
                </span>
                <span className={`nav-link-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')} style={{ cursor: 'pointer' }}>
                  📜 Mis Pedidos & Bóveda
                </span>
                {isAdmin && (
                  <>
                    <span className={`nav-link-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={{ cursor: 'pointer' }}>
                      🏭 Fábrica & Producción
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')} style={{ cursor: 'pointer' }}>
                      ⚙️ Configuración
                    </span>
                  </>
                )}
              </>
            )}
          </nav>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <div style={{ color: '#fff', fontWeight: '700', wordBreak: 'break-all' }}>{currentUser.name}</div>
              <div style={{ fontSize: '10px', marginTop: '2px', wordBreak: 'break-all' }}>{currentUser.email}</div>
              <span className={`badge ${isSuperAdmin ? 'badge-pink' : isAdmin ? 'badge-pink' : 'badge-cyan'}`} style={{ fontSize: '8px', padding: '1px 4px', marginTop: '4px' }}>
                {isSuperAdmin ? 'SUPER ADMIN' : isAdmin ? 'ADMIN' : currentUser.client_category?.replace('_', ' ')}
              </span>
            </div>
            <button onClick={handleLogout} className="btn-neon" style={{ width: '100%', padding: '8px', fontSize: '12px' }}>
              Salir
            </button>
          </div>
        </aside>

        {/* Contenido Principal */}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header Bar */}
          <header className="nav-header" style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end', padding: '16px 24px', background: 'rgba(0, 0, 0, 0.95)', borderBottom: '1px solid var(--border-color)', backdropFilter: 'blur(20px)' }}>
            {!isSuperAdmin && (
              <button className="btn-neon" onClick={() => setShowCart(true)}>
                🛒 Carrito ({cartTotals.totalCases} {cartTotals.totalCases === 1 ? 'Caja' : 'Cajas'})
              </button>
            )}
          </header>

          {/* Mobile Nav */}
          <div className="mobile-bottom-nav">
            {isSuperAdmin ? (
              <>
                <span className={`mobile-nav-item ${activeTab === 'saas-tenants' ? 'active' : ''}`} onClick={() => setActiveTab('saas-tenants')}>🏢 Tenants</span>
                <span className={`mobile-nav-item ${activeTab === 'saas-users' ? 'active' : ''}`} onClick={() => setActiveTab('saas-users')}>👥 Users</span>
                <span className={`mobile-nav-item ${activeTab === 'saas-billing' ? 'active' : ''}`} onClick={() => setActiveTab('saas-billing')}>💳 Billing</span>
                <span className={`mobile-nav-item ${activeTab === 'saas-audit' ? 'active' : ''}`} onClick={() => setActiveTab('saas-audit')}>📋 Logs</span>
              </>
            ) : (
              <>
                <span className={`mobile-nav-item ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>📂 Catálogo</span>
                <span className={`mobile-nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>📜 Pedidos</span>
                {isAdmin && (
                  <>
                    <span className={`mobile-nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>🏭 Fábrica</span>
                    <span className={`mobile-nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>⚙️ Config</span>
                  </>
                )}
              </>
            )}
          </div>

          <main className="main-content" style={{ flexGrow: 1, padding: '24px', boxSizing: 'border-box' }}>
            {/* Loading global */}
            {dataLoading && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--cyan-neon)' }}>
                ⏳ Cargando datos desde Neon...
              </div>
            )}

            {dataError && (
              <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--orange-neon)', marginBottom: '24px', color: 'var(--orange-neon)' }}>
                ⚠️ {dataError}
              </div>
            )}

        {/* ===================================================== */}
        {/* TAB SAAS 1: SAAS TENANTS                              */}
        {/* ===================================================== */}
        {activeTab === 'saas-tenants' && isSuperAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Panel de Control SaaS</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Crea, modifica y gestiona múltiples marcas independientes (inquilinos) conectadas a la plataforma.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
              {/* Formulario de creación/edición */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px', color: editingTenant ? 'var(--cyan-neon)' : 'var(--pink-neon)' }}>
                  {editingTenant ? '✏️ Editar Empresa' : '🏢 Registrar Nueva Empresa (Tenant)'}
                </h2>
                <form onSubmit={handleCreateOrUpdateTenant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                      Nombre de la Empresa / Marca
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Ultra Card Sleeves"
                      value={newTenant.name}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, name: e.target.value }))}
                      required
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                      Slug (Identificador URL)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. ultrasleeves"
                      value={newTenant.slug}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                      required
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                      Solo minúsculas, números y guiones.
                    </small>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                      Plan de Suscripción
                    </label>
                    <select
                      value={newTenant.plan_id}
                      onChange={(e) => setNewTenant(prev => ({ ...prev, plan_id: e.target.value }))}
                      required
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    >
                      <option value="">-- Seleccionar Plan --</option>
                      {plansList.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (${p.price_usd}/mes - Max {p.max_users} users)</option>
                      ))}
                    </select>
                  </div>

                  {editingTenant && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                        Estado del Inquilino
                      </label>
                      <select
                        value={newTenant.status}
                        onChange={(e) => setNewTenant(prev => ({ ...prev, status: e.target.value }))}
                        required
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      >
                        <option value="active">Activo</option>
                        <option value="suspended">Suspendido (Soft Delete)</option>
                        <option value="blocked">Bloqueado por Falta de Pago</option>
                      </select>
                    </div>
                  )}

                  {!editingTenant && (
                    <>
                      <div style={{ margin: '10px 0', borderTop: '1px dotted var(--border-color)', paddingTop: '10px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '8px', color: 'var(--cyan-neon)' }}>
                          Administrador Inicial
                        </h3>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                          Nombre Completo
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Juan Pérez"
                          value={newTenant.adminName}
                          onChange={(e) => setNewTenant(prev => ({ ...prev, adminName: e.target.value }))}
                          required
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                          Email
                        </label>
                        <input
                          type="email"
                          placeholder="Ej. admin@ultrasleeves.com"
                          value={newTenant.adminEmail}
                          onChange={(e) => setNewTenant(prev => ({ ...prev, adminEmail: e.target.value }))}
                          required
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                          Contraseña del Administrador
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={newTenant.adminPassword}
                          onChange={(e) => setNewTenant(prev => ({ ...prev, adminPassword: e.target.value }))}
                          required
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </>
                  )}

                  <button type="submit" className="btn-pink" style={{ width: '100%', padding: '12px', marginTop: '10px' }} disabled={creatingTenant}>
                    {creatingTenant ? '⏳ Procesando...' : editingTenant ? 'Guardar Cambios' : 'Crear Empresa & Admin'}
                  </button>

                  {editingTenant && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTenant(null);
                        setNewTenant({
                          name: '',
                          slug: '',
                          plan_id: plansList[0]?.id || '',
                          status: 'active',
                          adminName: '',
                          adminEmail: '',
                          adminPassword: ''
                        });
                      }}
                      style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
                    >
                      Cancelar Edición
                    </button>
                  )}
                </form>
              </div>

              {/* Lista de Tenants */}
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px' }}>
                  Empresas Registradas ({tenantsList.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {tenantsList.map(t => {
                    const tenantAdmin = globalUsersList.find(u => u.tenant_slug === t.slug && u.role === 'admin');
                    return (
                      <div key={t.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{t.name}</h3>
                              <span className={`badge ${
                                t.status === 'active' ? 'badge-green' : t.status === 'suspended' ? 'badge-orange' : 'badge-pink'
                              }`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                                {t.status === 'active' ? '✓ Activa' : t.status === 'suspended' ? '⚠️ Suspendida' : '🚫 Bloqueada'}
                              </span>
                            </div>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Slug: <strong>{t.slug}</strong></span><br />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {t.id}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '10px', display: 'inline-block', marginBottom: '6px' }}>
                              {t.plan_name} (${parseFloat(t.plan_price).toFixed(0)}/m)
                            </span><br />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              👤 {t.user_count} Users | 📦 {t.product_count} Prods
                            </span>
                          </div>
                        </div>

                        {/* Botones de acción CRUD e Impersonación */}
                        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px', flexWrap: 'wrap' }}>
                          {tenantAdmin && (
                            <button
                              onClick={() => handleImpersonate(tenantAdmin.id)}
                              className="btn-neon"
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700' }}
                              title="Iniciar sesión de soporte como administrador de esta empresa"
                            >
                              ⚡ Soporte (Log in as)
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingTenant(t);
                              setNewTenant({
                                name: t.name,
                                slug: t.slug,
                                plan_id: t.plan_id,
                                status: t.status,
                                adminName: '',
                                adminEmail: '',
                                adminPassword: ''
                              });
                            }}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                          >
                            ✏️ Editar
                          </button>
                          {t.id !== '00000000-0000-0000-0000-000000000001' && (
                            <button
                              onClick={() => handleDeleteTenant(t.id)}
                              style={{ background: 'rgba(255, 9, 187, 0.05)', border: '1px solid var(--pink-neon)', color: 'var(--pink-neon)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                            >
                              🗑️ Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB SAAS 2: SAAS GLOBAL USERS                         */}
        {/* ===================================================== */}
        {activeTab === 'saas-users' && isSuperAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Usuarios Globales</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Audita a todos los usuarios del sistema, sus roles e inquilino de pertenencia.
                </p>
              </div>
              <button onClick={() => setShowSuperAdminForm(!showSuperAdminForm)} className="btn-pink">
                👤 {showSuperAdminForm ? 'Ocultar Formulario' : 'Crear Super Admin'}
              </button>
            </div>

            {showSuperAdminForm && (
              <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', maxWidth: '500px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--cyan-neon)' }}>
                  Registrar Administrador de Plataforma (Super Admin)
                </h2>
                <form onSubmit={handleCreateSuperAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nombre</label>
                    <input
                      type="text"
                      placeholder="Ej. Soporte Interno"
                      value={newSuperAdmin.name}
                      required
                      onChange={(e) => setNewSuperAdmin(prev => ({ ...prev, name: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</label>
                    <input
                      type="email"
                      placeholder="soporte@plataforma.com"
                      value={newSuperAdmin.email}
                      required
                      onChange={(e) => setNewSuperAdmin(prev => ({ ...prev, email: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={newSuperAdmin.password}
                      required
                      onChange={(e) => setNewSuperAdmin(prev => ({ ...prev, password: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button type="submit" className="btn-pink" disabled={creatingSuperAdmin}>
                    {creatingSuperAdmin ? '⏳ Creando...' : 'Crear Super Admin'}
                  </button>
                </form>
              </div>
            )}

            <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                    <th style={{ padding: '12px' }}>Nombre</th>
                    <th style={{ padding: '12px' }}>Email</th>
                    <th style={{ padding: '12px' }}>Rol</th>
                    <th style={{ padding: '12px' }}>Marca / Tenant</th>
                    <th style={{ padding: '12px' }}>Fecha Registro</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '14px' }}>
                  {globalUsersList.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', hover: { background: 'rgba(255,255,255,0.01)' } }}>
                      <td style={{ padding: '14px', fontWeight: '700' }}>{u.name}</td>
                      <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ padding: '14px' }}>
                        <span className={`badge ${
                          u.role === 'superadmin' ? 'badge-pink' : u.role === 'admin' ? 'badge-cyan' : 'badge-orange'
                        }`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {u.role === 'superadmin' ? (
                          <span style={{ color: 'var(--cyan-neon)', fontWeight: '700' }}>Platform Suite</span>
                        ) : (
                          <span>{u.tenant_name} <strong style={{ color: 'var(--text-muted)' }}>({u.tenant_slug})</strong></span>
                        )}
                      </td>
                      <td style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB SAAS 3: PLANS & BILLING                           */}
        {/* ===================================================== */}
        {activeTab === 'saas-billing' && isSuperAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Planes & Suscripciones (Billing)</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Controla la facturación mensual estimada, limites de usuarios y asigna planes a tus clientes.
              </p>
            </div>

            {/* Tarjetas de Métricas de Facturación */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--cyan-neon)' }}>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 6px', textTransform: 'uppercase' }}>Ingresos Mensuales Estimados</h4>
                <span style={{ fontSize: '28px', fontWeight: '900', color: 'var(--cyan-neon)' }}>${saasMetrics?.monthlyRevenueEstim?.toFixed(2)} USD</span>
              </div>
              {saasMetrics?.planDistribution?.map(p => (
                <div key={p.plan_name} className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--pink-neon)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 6px', textTransform: 'uppercase' }}>Plan {p.plan_name}</h4>
                  <span style={{ fontSize: '28px', fontWeight: '900', color: '#fff' }}>{p.count} {p.count === '1' ? 'Empresa' : 'Empresas'}</span>
                </div>
              ))}
            </div>

            {/* Listado de Facturación de Clientes */}
            <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                    <th style={{ padding: '12px' }}>Empresa (Tenant)</th>
                    <th style={{ padding: '12px' }}>Plan Actual</th>
                    <th style={{ padding: '12px' }}>Costo Mensual</th>
                    <th style={{ padding: '12px' }}>Estado Cobro</th>
                    <th style={{ padding: '12px' }}>Acciones Facturación</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '14px' }}>
                  {tenantsList.map(t => {
                    const handlePlanChange = async (planId) => {
                      try {
                        await tenantsApi.update(t.id, {
                          name: t.name,
                          slug: t.slug,
                          plan_id: planId,
                          status: t.status
                        });
                        alert('Plan actualizado correctamente.');
                        await loadTenants();
                      } catch (err) {
                        alert(`❌ Error al cambiar plan: ${err.message}`);
                      }
                    };

                    const handleToggleLock = async () => {
                      const nextStatus = t.status === 'blocked' ? 'active' : 'blocked';
                      const msg = nextStatus === 'blocked'
                        ? `¿Está seguro de BLOQUEAR el acceso de ${t.name} por impago?`
                        : `¿Desea desbloquear el acceso de ${t.name}?`;
                      
                      if (!confirm(msg)) return;

                      try {
                        await tenantsApi.update(t.id, {
                          name: t.name,
                          slug: t.slug,
                          plan_id: t.plan_id,
                          status: nextStatus
                        });
                        alert(`Cliente ${nextStatus === 'blocked' ? 'bloqueado' : 'desbloqueado'} con éxito.`);
                        await loadTenants();
                      } catch (err) {
                        alert(`❌ Error: ${err.message}`);
                      }
                    };

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '14px', fontWeight: '700' }}>{t.name}</td>
                        <td style={{ padding: '14px' }}>
                          <select
                            value={t.plan_id}
                            onChange={(e) => handlePlanChange(e.target.value)}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '13px' }}
                          >
                            {plansList.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '14px', fontWeight: '700', color: 'var(--cyan-neon)' }}>
                          ${parseFloat(t.plan_price).toFixed(2)} USD/mes
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span className={`badge ${t.status === 'blocked' ? 'badge-pink' : 'badge-green'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {t.status === 'blocked' ? '🚫 Bloqueado por Impago' : '✓ Al día'}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          {t.id !== '00000000-0000-0000-0000-000000000001' && (
                            <button
                              onClick={handleToggleLock}
                              className={t.status === 'blocked' ? 'btn-neon' : 'btn-pink'}
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', minWidth: '130px' }}
                            >
                              {t.status === 'blocked' ? '✓ Desbloquear' : '🚫 Bloquear Acceso'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB SAAS 4: MONITORING & AUDIT LOGS                   */}
        {/* ===================================================== */}
        {activeTab === 'saas-audit' && isSuperAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Historial de Auditoría & Logs</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Monitoreo global en tiempo real de operaciones críticas en la infraestructura B2B SaaS.
              </p>
            </div>

            {/* KPIs Rápidos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>INQUILINOS ACTIVOS</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--green-neon)' }}>{saasMetrics?.activeTenants || 0}</div>
              </div>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>INQUILINOS SUSPENDIDOS</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--orange-neon)' }}>{saasMetrics?.suspendedTenants || 0}</div>
              </div>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>INQUILINOS BLOQUEADOS</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--pink-neon)' }}>{saasMetrics?.blockedTenants || 0}</div>
              </div>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>NUEVOS USUARIOS ESTE MES</div>
                <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--cyan-neon)' }}>{saasMetrics?.newUsersThisMonth || 0}</div>
              </div>
            </div>

            {/* Listado de Logs */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px' }}>
                Registro de Actividad Global (Audit Logs)
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto', paddingRight: '8px' }}>
                {auditLogs.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>No hay registros de actividad disponibles.</p>
                ) : (
                  auditLogs.map(log => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: '12px 16px', borderRadius: '8px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <span className={`badge ${
                            log.action.includes('CREATE') ? 'badge-green' : log.action.includes('DELETE') ? 'badge-pink' : log.action.includes('IMPERSONATE') ? 'badge-orange' : 'badge-cyan'
                          }`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {log.action}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: '700' }}>{log.user_name}</span>
                          {log.tenant_name && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                              en <strong>{log.tenant_name}</strong>
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                          Detalles: {Object.entries(log.details || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 1: CATÁLOGO B2B                                   */}
        {/* ===================================================== */}
        {activeTab === 'catalog' && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Catálogo Mayorista</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Precios especiales para distribuidores despachados directamente de fábrica.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {isAdmin && (
                  <button 
                    onClick={() => { setCreatingProduct(prev => !prev); setEditingProduct(null); }}
                    className="btn-pink"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    {creatingProduct ? 'Cerrar Formulario' : '➕ Añadir Producto'}
                  </button>
                )}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
                  <button
                    onClick={() => setCatalogViewMode('grid')}
                    style={{ background: catalogViewMode === 'grid' ? 'var(--cyan-neon)' : 'transparent', color: catalogViewMode === 'grid' ? '#000' : '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    🔲 Vista Rejilla
                  </button>
                  <button
                    onClick={() => setCatalogViewMode('list')}
                    style={{ background: catalogViewMode === 'list' ? 'var(--cyan-neon)' : 'transparent', color: catalogViewMode === 'list' ? '#000' : '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    ≡ Vista Lista
                  </button>
                </div>
                <input
                  type="text"
                  id="product-search"
                  placeholder="Buscar producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 16px', borderRadius: '8px', width: '200px' }}
                />
              </div>
            </div>

            {/* Formulario de creación/edición de Producto (Solo Admin del Tenant) */}
            {isAdmin && (creatingProduct || editingProduct) && (
              <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px', color: editingProduct ? 'var(--cyan-neon)' : 'var(--pink-neon)' }}>
                  {editingProduct ? `✏️ Editar Producto: ${editingProduct.name}` : '➕ Añadir Nuevo Producto'}
                </h2>
                <form onSubmit={handleCreateOrUpdateProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nombre del Producto *</label>
                    <input
                      type="text"
                      placeholder="Ej. Protectores Standard Negro"
                      value={newProduct.name}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>SKU *</label>
                    <input
                      type="text"
                      placeholder="Ej. GSU-SLV-001"
                      value={newProduct.sku}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, sku: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Código de Barras (EAN / UPC)</label>
                    <input
                      type="text"
                      placeholder="Ej. 7427246231221"
                      value={newProduct.barcode}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, barcode: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Categoría *</label>
                    <select
                      value={newProduct.category}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    >
                      {categoriesList.map(cat => (
                        <option key={cat.id} value={cat.slug}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Marca *</label>
                    <select
                      value={newProduct.brand}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, brand: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    >
                      {brandsList.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Costo de Caja B2B ($ USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 45.00"
                      value={newProduct.price_per_case_usd}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, price_per_case_usd: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>PVP Sugerido ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 5.99"
                      value={newProduct.pvp_price_usd}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, pvp_price_usd: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Costo Unitario Interno ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 1.20"
                      value={newProduct.cost_price_usd}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, cost_price_usd: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Unidades por Caja Master</label>
                    <input
                      type="number"
                      value={newProduct.units_per_case}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, units_per_case: parseInt(e.target.value) || 1 }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Stock Cajas Master *</label>
                    <input
                      type="number"
                      value={newProduct.stock_cases}
                      required
                      onChange={(e) => setNewProduct(prev => ({ ...prev, stock_cases: parseInt(e.target.value) || 0 }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Imagen URL</label>
                    <input
                      type="url"
                      placeholder="https://ejemplo.com/imagen.jpg"
                      value={newProduct.image_url}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, image_url: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Video URL</label>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={newProduct.video_url}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, video_url: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Carpeta Recursos de Marketing (Google Drive / Dropbox)</label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={newProduct.marketing_resources_url}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, marketing_resources_url: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <button type="submit" className="btn-neon" style={{ flexGrow: 1, padding: '12px' }}>
                      {editingProduct ? 'Guardar Cambios' : 'Registrar Producto'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(null);
                        setCreatingProduct(false);
                        setNewProduct({
                          name: '', sku: '', category: categoriesList[0]?.slug || '', brand: brandsList[0]?.name || '',
                          barcode: '', units_per_case: 1, weight_per_unit_g: 100, length_cm: 0, width_cm: 0, height_cm: 0,
                          price_per_case_usd: '', pvp_price_usd: '', cost_price_usd: '', stock_cases: 0, image_url: '',
                          video_url: '', marketing_resources_url: ''
                        });
                      }}
                      style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Filtros de Categoría Dinámicos */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {[{ id: 'all', name: 'Ver Todos', slug: 'all' }, ...categoriesList].map(cat => (
                <button
                  key={cat.id || cat.slug}
                  id={`filter-${cat.slug}`}
                  onClick={() => setSelectedCategory(cat.slug)}
                  style={{
                    background: selectedCategory === cat.slug ? 'var(--cyan-neon)' : 'rgba(255,255,255,0.05)',
                    color: selectedCategory === cat.slug ? '#000' : '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s',
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Banner de Descuentos */}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', borderLeft: '3px solid var(--pink-neon)' }}>
              <span className="badge badge-pink" style={{ marginBottom: '8px' }}>Descuentos Automáticos por Volumen</span>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Comprar <strong>5+ cajas</strong> da 5% | <strong>10+ cajas</strong> da 10% | <strong>20+ cajas</strong> da 15% de descuento.
                {currentUser?.client_category === 'wholesale_distributor' && <> + <strong>5% extra</strong> como Distribuidor Mayorista.</>}
              </p>
            </div>

            {/* Renderizado de Catálogo según el Modo de Vista */}
            {productList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                {searchQuery ? `Sin resultados para "${searchQuery}"` : 'No hay productos disponibles.'}
              </div>
            ) : catalogViewMode === 'grid' ? (
              <div className="catalog-grid">
                {productList.map(product => {
                  const inCartQty = cart[product.id] || 0;
                  const priceNum = parseFloat(product.price_per_case_usd);
                  return (
                    <div key={product.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '420px' }}>
                      <div>
                        {/* Imagen del Producto */}
                        <div style={{ width: '100%', height: '160px', background: 'rgba(0,232,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', overflow: 'hidden' }}>
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
                              stroke="var(--cyan-neon)"
                              strokeWidth="1">
                              <rect x="4" y="2" width="16" height="20" rx="2" />
                            </svg>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <span className="badge badge-cyan" style={{ fontSize: '9px' }}>{product.brand || 'Gosu'}</span>
                          <span className="badge badge-pink" style={{ fontSize: '9px' }}>{product.category}</span>
                        </div>
                        <h3 style={{ fontSize: '18px', margin: '0 0 4px', fontWeight: '700', lineHeight: '1.2' }}>{product.name}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'monospace' }}>SKU: {product.sku}</p>
                        {product.barcode && <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>EAN: {product.barcode}</p>}
                        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                          Stock: <strong style={{ color: product.stock_cases > 10 ? 'var(--green-neon)' : 'var(--orange-neon)' }}>{product.stock_cases} cajas</strong>
                        </p>

                        {/* Recursos de Marketing */}
                        {(product.video_url || product.marketing_resources_url) && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '10px', fontSize: '11px' }}>
                            {product.video_url && (
                              <a href={product.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan-neon)', textDecoration: 'none' }}>
                                🎥 Video Demo
                              </a>
                            )}
                            {product.marketing_resources_url && (
                              <a href={product.marketing_resources_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pink-neon)', textDecoration: 'none' }}>
                                📂 Assets Drive
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '20px', fontWeight: '900', color: 'var(--cyan-neon)' }}>${priceNum.toFixed(2)}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}> / caja</span>
                            {product.pvp_price_usd && (
                              <div style={{ fontSize: '10px', color: 'var(--orange-neon)', marginTop: '2px' }}>PVP Sugerido: ${parseFloat(product.pvp_price_usd).toFixed(2)}</div>
                            )}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>({product.units_per_case} packs/caja)</span>
                        </div>

                        {/* Controles de Carrito para Clientes */}
                        {!isAdmin && (
                          inCartQty > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                              <button onClick={() => handleRemoveFromCart(product.id)} style={{ padding: '6px 12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>-</button>
                              <span style={{ fontWeight: '700', fontSize: '16px' }}>{inCartQty} {inCartQty === 1 ? 'Caja' : 'Cajas'}</span>
                              <button onClick={() => handleAddToCart(product.id)} style={{ padding: '6px 12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>+</button>
                            </div>
                          ) : (
                            <button
                              id={`add-to-cart-${product.id}`}
                              className="btn-neon"
                              style={{ width: '100%' }}
                              onClick={() => handleAddToCart(product.id)}
                              disabled={product.stock_cases === 0}
                            >
                              {product.stock_cases === 0 ? 'Sin Stock' : 'Añadir al Carrito B2B'}
                            </button>
                          )
                        )}

                        {/* Botones de Administración (Solo Admin) */}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button 
                              onClick={() => {
                                setEditingProduct(product);
                                setCreatingProduct(false);
                                setNewProduct({
                                  name: product.name, sku: product.sku, category: product.category, brand: product.brand || brandsList[0]?.name || '',
                                  barcode: product.barcode || '', units_per_case: product.units_per_case, weight_per_unit_g: product.weight_per_unit_g,
                                  length_cm: product.length_cm, width_cm: product.width_cm, height_cm: product.height_cm,
                                  price_per_case_usd: product.price_per_case_usd, pvp_price_usd: product.pvp_price_usd || '',
                                  cost_price_usd: product.cost_price_usd || '', stock_cases: product.stock_cases, image_url: product.image_url || '',
                                  video_url: product.video_url || '', marketing_resources_url: product.marketing_resources_url || ''
                                });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              style={{ flexGrow: 1, padding: '8px', background: 'rgba(0, 232, 255, 0.1)', border: '1px solid var(--cyan-neon)', color: 'var(--cyan-neon)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                            >
                              ✏️ Editar
                            </button>
                            <button 
                              onClick={() => handleDeleteProduct(product.id)}
                              style={{ padding: '8px 14px', background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--pink-neon)', color: 'var(--pink-neon)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Vista Lista ( spreadsheet / tabla de alta densidad) */
              <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                      <th style={{ padding: '12px' }}>Miniatura</th>
                      <th style={{ padding: '12px' }}>Producto</th>
                      <th style={{ padding: '12px' }}>SKU / EAN</th>
                      <th style={{ padding: '12px' }}>Marca / Categoría</th>
                      <th style={{ padding: '12px' }}>Costo Caja B2B</th>
                      <th style={{ padding: '12px' }}>PVP Sugerido</th>
                      <th style={{ padding: '12px' }}>Stock</th>
                      <th style={{ padding: '12px' }}>Recursos Marketing</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Acciones B2B</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '13px' }}>
                    {productList.map(product => {
                      const inCartQty = cart[product.id] || 0;
                      return (
                        <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#fff' }}>{product.name}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <div>SKU: <strong style={{ fontFamily: 'monospace' }}>{product.sku}</strong></div>
                            {product.barcode && <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>EAN: {product.barcode}</div>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '9px', marginRight: '4px' }}>{product.brand || 'Gosu'}</span>
                            <span className="badge badge-pink" style={{ fontSize: '9px' }}>{product.category}</span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--cyan-neon)' }}>
                            ${parseFloat(product.price_per_case_usd).toFixed(2)} USD
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>({product.units_per_case} uds/caja)</div>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--orange-neon)', fontWeight: '600' }}>
                            {product.pvp_price_usd ? `$${parseFloat(product.pvp_price_usd).toFixed(2)} USD` : 'N/A'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className={product.stock_cases > 0 ? 'badge badge-green' : 'badge-pink'} style={{ fontSize: '9px' }}>
                              {product.stock_cases > 0 ? `${product.stock_cases} Cajas` : 'Sin Stock'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {product.video_url && (
                                <a href={product.video_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--cyan-neon)' }} title="Ver Video Demostrativo">
                                  🎥 Video
                                </a>
                              )}
                              {product.marketing_resources_url && (
                                <a href={product.marketing_resources_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--pink-neon)' }} title="Recursos de Marketing (Fotos, Banners)">
                                  📂 Assets
                                </a>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {/* Vista Cliente: Controles de compra */}
                            {!isAdmin && (
                              product.stock_cases > 0 ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                  {inCartQty > 0 && (
                                    <>
                                      <button onClick={() => handleRemoveFromCart(product.id)} className="btn-pink" style={{ padding: '2px 8px', fontSize: '11px' }}>-</button>
                                      <strong style={{ minWidth: '20px', textAlign: 'center' }}>{inCartQty}</strong>
                                    </>
                                  )}
                                  <button onClick={() => handleAddToCart(product.id)} className="btn-neon" style={{ padding: '4px 10px', fontSize: '11px' }}>
                                    {inCartQty > 0 ? '+' : 'Añadir'}
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', display: 'block', textAlign: 'center' }}>Agotado</span>
                              )
                            )}

                            {/* Vista Admin: Controles de edición */}
                            {isAdmin && (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setCreatingProduct(false);
                                    setNewProduct({
                                      name: product.name, sku: product.sku, category: product.category, brand: product.brand || brandsList[0]?.name || '',
                                      barcode: product.barcode || '', units_per_case: product.units_per_case, weight_per_unit_g: product.weight_per_unit_g,
                                      length_cm: product.length_cm, width_cm: product.width_cm, height_cm: product.height_cm,
                                      price_per_case_usd: product.price_per_case_usd, pvp_price_usd: product.pvp_price_usd || '',
                                      cost_price_usd: product.cost_price_usd || '', stock_cases: product.stock_cases, image_url: product.image_url || '',
                                      video_url: product.video_url || '', marketing_resources_url: product.marketing_resources_url || ''
                                    });
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', cursor: 'pointer', fontSize: '14px' }}
                                  title="Editar Producto"
                                >
                                  ✏️
                                </button>
                                <button 
                                  onClick={() => handleDeleteProduct(product.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--pink-neon)', cursor: 'pointer', fontSize: '14px' }}
                                  title="Eliminar Producto"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 2: MIS PEDIDOS Y BÓVEDA DE DOCUMENTOS             */}
        {/* ===================================================== */}
        {activeTab === 'orders' && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Bóveda de Documentos B2B</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Monitorea el tracking de tus pedidos y descarga tus Invoices y Packing Lists.
              </p>
            </div>

            {clientOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '18px', marginBottom: '8px' }}>No tienes pedidos aún.</p>
                <button className="btn-neon" onClick={() => setActiveTab('catalog')}>Ir al Catálogo</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {clientOrders.map(order => (
                  <div key={order.id} className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                      <div>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Pedido</span>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', fontFamily: 'monospace' }}>#{order.id.split('-')[0].toUpperCase()}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString('es-ES')}</span>
                        {isAdmin && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Cliente: <strong>{order.client_name}</strong></div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'block' }}>Total Pedido</span>
                        <strong style={{ fontSize: '20px', color: 'var(--cyan-neon)' }}>${parseFloat(order.total_amount_usd).toFixed(2)} USD</strong>
                        {parseFloat(order.discount_percent) > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--pink-neon)' }}>-{order.discount_percent}% descuento aplicado</div>
                        )}
                      </div>
                      <span className={`badge ${
                        order.status === 'in_production' ? 'badge-orange' :
                        order.status === 'ready' || order.status === 'payment_confirmed' ? 'badge-cyan' :
                        order.status === 'delivered' ? 'badge-green' : 'badge-pink'
                      }`}>
                        {{
                          'pending_payment':   '⏳ Pendiente de Pago',
                          'payment_confirmed': '✅ Pago Confirmado',
                          'in_production':     '⚙️ En Fabricación',
                          'ready':             '📦 Listo para Despacho',
                          'in_dispatch':       '🚢 En Tránsito',
                          'delivered':         '✓ Entregado',
                        }[order.status] || order.status}
                      </span>

                      {/* Admin: cambiar estado */}
                      {isAdmin && (
                        <select
                          value={order.status}
                          onChange={async (e) => {
                            try {
                              await ordersApi.updateStatus(order.id, e.target.value);
                              await loadOrders();
                            } catch(err) {
                              alert(`Error: ${err.message}`);
                            }
                          }}
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
                        >
                          <option value="pending_payment">Pendiente de Pago</option>
                          <option value="payment_confirmed">Pago Confirmado</option>
                          <option value="in_production">En Fabricación</option>
                          <option value="ready">Listo</option>
                          <option value="in_dispatch">En Tránsito</option>
                          <option value="delivered">Entregado</option>
                        </select>
                      )}
                    </div>

                    {/* Items del pedido */}
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Detalle de cajas:</h4>
                      <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
                        {order.items?.map((item, idx) => (
                          <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dotted rgba(255,255,255,0.05)', fontSize: '14px' }}>
                            <span>{item.name}</span>
                            <strong>{item.qty_cases} {item.qty_cases === 1 ? 'Caja master' : 'Cajas master'}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Botones de Documentos */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button className="btn-neon" onClick={() => { setSelectedOrderForDoc(order); setDocType('invoice'); }}>
                        📄 Commercial Invoice
                      </button>
                      <button className="btn-pink" onClick={() => { setSelectedOrderForDoc(order); setDocType('packing_list'); }}>
                        📦 Packing List
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 3: FÁBRICA & PRODUCCIÓN (Solo Admin)              */}
        {/* ===================================================== */}
        {activeTab === 'admin' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Control Interno de Fabricación</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Monitoreo de costos de insumos, pagos adelantados y saldos pendientes con la fábrica.
              </p>
            </div>

            {/* KPIs financieros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              {(() => {
                const totalCost = productionOrders.reduce((a, o) => a + parseFloat(o.total_cost_usd || 0), 0);
                const totalAdvance = productionOrders.reduce((a, o) => a + parseFloat(o.advance_payment_usd || 0), 0);
                const totalPending = productionOrders.reduce((a, o) => a + parseFloat(o.pending_balance_usd || 0), 0);
                return (
                  <>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--cyan-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Costo Total de Fabricación</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#fff', marginTop: '8px' }}>${totalCost.toFixed(2)}</h2>
                    </div>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--green-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Pagos Realizados</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--green-neon)', marginTop: '8px' }}>${totalAdvance.toFixed(2)}</h2>
                    </div>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--orange-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Saldo Pendiente con Planta</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--orange-neon)', marginTop: '8px' }}>${totalPending.toFixed(2)}</h2>
                    </div>
                  </>
                );
              })()}
            </div>

            <h2 style={{ fontSize: '20px', marginBottom: '16px', fontWeight: '700' }}>Órdenes de Producción</h2>
            {productionOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                No hay órdenes de producción activas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {productionOrders.map(pOrder => (
                  <div key={pOrder.id} className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Orden #{pOrder.id.split('-')[0].toUpperCase()}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(pOrder.created_at).toLocaleDateString('es-ES')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className={`badge ${pOrder.status === 'sent' ? 'badge-cyan' : pOrder.status === 'production_started' ? 'badge-orange' : 'badge-green'}`}>
                          {{ 'sent': 'Enviada', 'production_started': 'En Fabricación', 'production_completed': 'Completada' }[pOrder.status]}
                        </span>
                        <select
                          value={pOrder.status}
                          onChange={async (e) => {
                            try {
                              await productionApi.updateStatus(pOrder.id, e.target.value);
                              await loadProduction();
                            } catch(err) {
                              alert(`Error: ${err.message}`);
                            }
                          }}
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
                        >
                          <option value="sent">Enviada</option>
                          <option value="production_started">En Fabricación</option>
                          <option value="production_completed">Completada</option>
                        </select>
                      </div>
                    </div>

                    {/* Financial summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px', fontSize: '13px' }}>
                      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Costo Total</div>
                        <strong style={{ color: '#fff', fontSize: '15px' }}>${parseFloat(pOrder.total_cost_usd).toFixed(2)}</strong>
                      </div>
                      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Adelanto</div>
                        <strong style={{ color: 'var(--green-neon)', fontSize: '15px' }}>${parseFloat(pOrder.advance_payment_usd).toFixed(2)}</strong>
                      </div>
                      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Pendiente</div>
                        <strong style={{ color: 'var(--orange-neon)', fontSize: '15px' }}>${parseFloat(pOrder.pending_balance_usd).toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Items */}
                    <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Productos del Lote:</h4>
                    <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
                      {pOrder.items?.map((item, idx) => (
                        <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '13px' }}>
                          <span>{item.name}</span>
                          <strong>{item.qty_cases} Cajas master</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 4: CONFIGURACIÓN (Solo Admin del Tenant)          */}
        {/* ===================================================== */}
        {activeTab === 'config' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Configuración de Marca</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Administra las marcas y categorías de productos disponibles para tu catálogo mayorista.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
              {/* CRUD CATEGORIAS */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--pink-neon)' }}>
                  {editingCategory ? '✏️ Editar Categoría' : '📁 Nueva Categoría'}
                </h2>
                <form onSubmit={handleCreateOrUpdateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nombre</label>
                    <input
                      type="text"
                      placeholder="Ej. Protectores"
                      value={newCategory.name}
                      required
                      onChange={(e) => setNewCategory({ name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Slug</label>
                    <input
                      type="text"
                      placeholder="ej. protectores"
                      value={newCategory.slug}
                      required
                      onChange={(e) => setNewCategory(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="btn-pink" style={{ flexGrow: 1, padding: '10px' }}>
                      {editingCategory ? 'Guardar' : 'Crear'}
                    </button>
                    {editingCategory && (
                      <button type="button" onClick={() => { setEditingCategory(null); setNewCategory({ name: '', slug: '' }); }} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px', padding: '10px', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>

                <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px' }}>Categorías ({categoriesList.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categoriesList.map(cat => (
                    <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '8px' }}>
                      <div>
                        <strong>{cat.name}</strong> <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({cat.slug})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setEditingCategory(cat); setNewCategory({ name: cat.name, slug: cat.slug }); }} style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                        <button onClick={() => handleDeleteCategory(cat.id)} style={{ background: 'transparent', border: 'none', color: 'var(--pink-neon)', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CRUD BRANDS */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--cyan-neon)' }}>
                  {editingBrand ? '✏️ Editar Marca' : '🏷️ Nueva Marca'}
                </h2>
                <form onSubmit={handleCreateOrUpdateBrand} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nombre</label>
                    <input
                      type="text"
                      placeholder="Ej. Gosu Sleeves"
                      value={newBrand.name}
                      required
                      onChange={(e) => setNewBrand({ name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Slug</label>
                    <input
                      type="text"
                      placeholder="ej. gosu-sleeves"
                      value={newBrand.slug}
                      required
                      onChange={(e) => setNewBrand(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="btn-neon" style={{ flexGrow: 1, padding: '10px' }}>
                      {editingBrand ? 'Guardar' : 'Crear'}
                    </button>
                    {editingBrand && (
                      <button type="button" onClick={() => { setEditingBrand(null); setNewBrand({ name: '', slug: '' }); }} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px', padding: '10px', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>

                <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px' }}>Marcas ({brandsList.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {brandsList.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '8px' }}>
                      <div>
                        <strong>{b.name}</strong> <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({b.slug})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setEditingBrand(b); setNewBrand({ name: b.name, slug: b.slug }); }} style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                        <button onClick={() => handleDeleteBrand(b.id)} style={{ background: 'transparent', border: 'none', color: 'var(--pink-neon)', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer style={{ padding: '32px', textAlign: 'center', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px' }}>
        © {new Date().getFullYear()} {isSuperAdmin ? 'Gosu B2B SaaS Platform' : 'Gosu Accessories Ltd'}. Todos los derechos reservados.
        {isAdmin && <span style={{ marginLeft: '8px', color: 'var(--pink-neon)' }}>• Admin Panel</span>}
      </footer>
        </div>
      </div>

      {/* ===================================================== */}
      {/* PANEL LATERAL: CARRITO B2B                            */}
      {/* ===================================================== */}
      {showCart && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', zIndex: '100', display: 'flex', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', height: '100%', borderRadius: '0', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px', position: 'relative' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '800' }}>Carrito B2B</h2>
                <button onClick={() => setShowCart(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>
              </div>

              {cartTotals.items.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>Tu carrito está vacío.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 400px)' }}>
                  {cartTotals.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '700' }}>{item.name}</h4>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>${parseFloat(item.price_per_case_usd).toFixed(2)} x {item.qty} {item.qty === 1 ? 'caja' : 'cajas'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => handleRemoveFromCart(item.id)} style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#333', border: 'none', color: '#fff', cursor: 'pointer' }}>-</button>
                        <span>{item.qty}</span>
                        <button onClick={() => handleAddToCart(item.id)} style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#333', border: 'none', color: '#fff', cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cartTotals.items.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                  <span>Subtotal</span>
                  <span>${cartTotals.subtotal.toFixed(2)} USD</span>
                </div>
                {cartTotals.discountPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px', color: 'var(--pink-neon)' }}>
                    <span>Descuento ({cartTotals.discountPercent}%)</span>
                    <span>-${cartTotals.discountAmount.toFixed(2)} USD</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800', marginBottom: '16px', borderTop: '1px dotted #333', paddingTop: '12px' }}>
                  <span>Total de la Orden</span>
                  <span style={{ color: 'var(--cyan-neon)' }}>${cartTotals.finalTotal.toFixed(2)} USD</span>
                </div>

                {cartTotals.finalTotal < MOA_LIMIT ? (
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--orange-neon)', marginBottom: '16px', background: 'rgba(255, 92, 0, 0.05)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--orange-neon)', fontWeight: '700' }}>MOA no alcanzado</span>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Mínimo: <strong>${MOA_LIMIT.toFixed(2)} USD</strong>. Faltan ${(MOA_LIMIT - cartTotals.finalTotal).toFixed(2)} USD.
                    </p>
                  </div>
                ) : (
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--green-neon)', marginBottom: '16px', background: 'rgba(34, 239, 0, 0.05)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--green-neon)', fontWeight: '700' }}>✓ Pedido Listo — MOA cumplido</span>
                  </div>
                )}

                {cartTotals.finalTotal >= MOA_LIMIT && (
                  <form onSubmit={handleCheckoutSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Adjuntar comprobante (Opcional):</label>
                      <input
                        type="file"
                        onChange={() => setReceiptUploaded(true)}
                        style={{ display: 'block', width: '100%', fontSize: '12px', color: 'var(--text-secondary)' }}
                      />
                      {receiptUploaded && <p style={{ fontSize: '11px', color: 'var(--green-neon)', marginTop: '4px' }}>✓ Archivo listo</p>}
                    </div>
                    <button
                      id="checkout-submit"
                      type="submit"
                      className="btn-neon"
                      style={{ width: '100%', padding: '12px' }}
                      disabled={checkoutLoading}
                    >
                      {checkoutLoading ? '⏳ Enviando pedido...' : 'Confirmar y Crear Pedido B2B'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: VISUALIZADOR DE DOCUMENTOS                     */}
      {/* ===================================================== */}
      {selectedOrderForDoc && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)', zIndex: '150', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => setSelectedOrderForDoc(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '16px', marginBottom: '24px' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '20px', color: docType === 'invoice' ? 'var(--cyan-neon)' : 'var(--pink-neon)' }}>
                {docType === 'invoice' ? 'Commercial Invoice' : 'Commercial Packing List'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Gosu Accessories Ltd. / Shenzhen Export Warehouse, China</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', marginBottom: '24px' }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>Cliente B2B:</strong>
                <span>{selectedOrderForDoc.client_name || currentUser?.name}</span><br />
                <span style={{ color: 'var(--text-muted)' }}>{selectedOrderForDoc.client_email || currentUser?.email}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>Doc. No.:</strong> #{selectedOrderForDoc.id.split('-')[0].toUpperCase()}<br />
                <strong>Fecha:</strong> {new Date(selectedOrderForDoc.created_at).toLocaleDateString('es-ES')}
              </div>
            </div>

            {docType === 'invoice' ? (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', marginBottom: '24px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px 0' }}>Producto</th>
                      <th style={{ padding: '8px 0', textAlign: 'center' }}>Cajas</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>Precio/Caja</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrderForDoc.items?.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 0' }}>{item.name}</td>
                        <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.qty_cases}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right' }}>${parseFloat(item.price_per_case_usd).toFixed(2)}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right' }}>${(item.qty_cases * parseFloat(item.price_per_case_usd)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', fontSize: '15px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Facturado: </span>
                  <strong style={{ color: 'var(--cyan-neon)', fontSize: '18px' }}>${parseFloat(selectedOrderForDoc.total_amount_usd).toFixed(2)} USD</strong>
                </div>
              </div>
            ) : (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', marginBottom: '24px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px 0' }}>Descripción</th>
                      <th style={{ padding: '8px 0', textAlign: 'center' }}>Cajas</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>Peso Neto</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>Dimensiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrderForDoc.items?.map((item, idx) => {
                      const prod = productList.find(p => p.name === item.name) || { units_per_case: 10, weight_per_unit_g: 500, length_cm: 30, width_cm: 30, height_cm: 30 };
                      const totalUnits = item.qty_cases * prod.units_per_case;
                      const weightKg = (totalUnits * prod.weight_per_unit_g) / 1000;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '10px 0' }}>{item.name}</td>
                          <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.qty_cases}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right' }}>{weightKg.toFixed(2)} kg</td>
                          <td style={{ padding: '10px 0', textAlign: 'right' }}>{prod.length_cm}x{prod.width_cm}x{prod.height_cm} cm</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ background: '#050505', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '8px', fontSize: '13px' }}>
                  <h4 style={{ color: 'var(--pink-neon)', marginBottom: '8px' }}>Info Logística Consolidada:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <span>Cajas Master: <strong>{selectedOrderForDoc.items?.reduce((a, c) => a + c.qty_cases, 0)}</strong></span>
                    <span>Puerto: <strong>Shenzhen Port, China</strong></span>
                    <span>Peso Bruto: <strong>
                      {(selectedOrderForDoc.items?.reduce((acc, curr) => {
                        const prod = productList.find(p => p.name === curr.name) || { units_per_case: 10, weight_per_unit_g: 500 };
                        return acc + ((curr.qty_cases * prod.units_per_case * prod.weight_per_unit_g) / 1000);
                      }, 0) * 1.05).toFixed(2)} kg
                    </strong> (+5% tara)</span>
                    <span>Incoterm: <strong>FOB Shenzhen</strong></span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '32px', textAlign: 'center' }}>
              <button className="btn-neon" style={{ padding: '10px 32px' }} onClick={() => window.print()}>
                🖨️ Imprimir / Guardar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
