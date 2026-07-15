import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import LoginPage from './components/LoginPage';
import SalesMapWidget, { COUNTRY_OPTIONS, getCountryName } from './components/SalesMapWidget';
import { auth, products as productsApi, orders as ordersApi, production as productionApi, tenants as tenantsApi, plans as plansApi, users as usersApi, audit as auditApi, config as configApi, pricingTiers as pricingTiersApi, campaigns as campaignsApi, API_URL } from './services/api';

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
    return user?.role === 'super_admin' ? 'saas-tenants' : 'catalog';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [allProducts, setAllProducts] = useState([]); // cache completo para filtrado local
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [adminFilterCategory, setAdminFilterCategory] = useState('all');
  const [adminFilterStockStatus, setAdminFilterStockStatus] = useState('all');
  const [adminFilterFactory, setAdminFilterFactory] = useState('all');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  
  // Estados para Filtros en la vista de Inventario & Stock
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [invFilterCategory, setInvFilterCategory] = useState('all');
  const [invFilterStockStatus, setInvFilterStockStatus] = useState('all');
  const [invFilterFactory, setInvFilterFactory] = useState('all');
  // Estados para compartir documentos de forma pública (Vistas de impresión)
  const [publicPrintOrder, setPublicPrintOrder] = useState(null);
  const [publicPrintDocType, setPublicPrintDocType] = useState('');
  const [loadingPublicPrint, setLoadingPublicPrint] = useState(false);

  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const [billingFilter, setBillingFilter] = useState('all'); // 'all' | 'pending' | 'review' | 'credit' | 'paid'
  const [selectedOrderForDoc, setSelectedOrderForDoc] = useState(null);
  const [docType, setDocType] = useState('invoice');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Estados para Modal de Selección de Pago Post-Checkout
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Estados para Modal de Detalle de Pedido (Rediseño Listado)
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [bankDetails, setBankDetails] = useState(null);
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(''); // 'bank' | 'stripe'
  const [simulatingStripePayment, setSimulatingStripePayment] = useState(false);
  const [stripePaidSuccess, setStripePaidSuccess] = useState(false);
  const [selectedProdOrder, setSelectedProdOrder] = useState(null);
  const [showProdOrderDetailModal, setShowProdOrderDetailModal] = useState(false);

  // Estados para Almacenes (Warehouses)
  const [warehouses, setWarehouses] = useState([]);
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [newWarehouseForm, setNewWarehouseForm] = useState({ name: '', code: '', address: '', contact_info: '' });
  const [editingWarehouseId, setEditingWarehouseId] = useState(null);
  const [tenantPublicInfo, setTenantPublicInfo] = useState(null);

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
  const [pricingTiersList, setPricingTiersList] = useState([]);
  const [campaignsList, setCampaignsList] = useState([]);
  const [newCampaign, setNewCampaign] = useState({ name: '', start_date_reservations: '', end_date_reservations: '', start_date_production: '', estimated_end_date_production: '', advance_payment_pct: 30.00, status: 'open' });
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [showCampaignProductsModal, setShowCampaignProductsModal] = useState(false);
  const [selectedCampaignForProducts, setSelectedCampaignForProducts] = useState(null);
  const [campaignProductSelections, setCampaignProductSelections] = useState({});
  const [campaignProductsFilter, setCampaignProductsFilter] = useState('');

  // Formulario para Marcas/Categorías/PricingTiers
  const [newCategory, setNewCategory] = useState({ name: '', slug: '' });
  const [newBrand, setNewBrand] = useState({ name: '', slug: '' });
  const [newPricingTier, setNewPricingTier] = useState({ tier_name: '', discount_percentage: 0, min_order_amount: 1000, only_master_cases: false });
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingBrand, setEditingBrand] = useState(null);
  const [editingPricingTier, setEditingPricingTier] = useState(null);
  const [skuVolumeRulesList, setSkuVolumeRulesList] = useState([]);
  const [newSkuVolumeRule, setNewSkuVolumeRule] = useState({ min_units: '', discount_pct: '' });
  const [editingSkuVolumeRule, setEditingSkuVolumeRule] = useState(null);
  const [showSkuVolumeRulesModal, setShowSkuVolumeRulesModal] = useState(false);
  const [showPricingTiersModal, setShowPricingTiersModal] = useState(false);

  const isSleevesCategory = (categorySlug) => {
    if (!categorySlug) return false;
    const cat = categorySlug.toLowerCase();
    return cat.includes('sleeves');
  };

  // Estados para Carga Masiva (Productos/Inventario)
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [activeUploadOrderId, setActiveUploadOrderId] = useState(null);
  const fileInputRef = useRef(null);

  // Estados para API Keys (json.pe y Resend)
  const [tenantSettings, setTenantSettings] = useState({ 
    whatsapp_api_key: '', 
    resend_api_key: '',
    cloudinary_cloud_name: '',
    cloudinary_upload_preset: '',
    cloudinary_api_key: '',
    cloudinary_api_secret: '',
    stripe_secret_key: '',
    stripe_publishable_key: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
    bank_routing_number: '',
    logo_url: '',
    default_incoterm: 'FOB China'
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Estados para el Dashboard / Control de Mando
  const [dashboardData, setDashboardData] = useState({
    summary: { total_sales: 0, total_costs: 0, total_profit: 0, margin_percent: 0 },
    sales_by_day: [],
    sales_by_category: [],
    top_products: [],
    sales_by_country: null
  });
  const [dashboardFilter, setDashboardFilter] = useState('30days'); // '7days' | '30days' | 'thismonth' | 'thisyear' | 'custom'
  const [dashboardStartDate, setDashboardStartDate] = useState('');
  const [dashboardEndDate, setDashboardEndDate] = useState('');
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Estados para Kardex de Inventario
  const [kardexModalOpen, setKardexModalOpen] = useState(false);
  const [kardexProduct, setKardexProduct] = useState(null);
  const [kardexHistory, setKardexHistory] = useState([]);
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [adjustType, setAdjustType] = useState('INITIAL'); // 'INITIAL' | 'ADJUSTMENT'
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);

  // Formulario para Productos (con campos extendidos B2B)
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    category: '',
    image_url: '',
    commercial_description: '',
    price_per_case_usd: '',
    units_per_case: 100,
    finished_measurements: '',
    color: '',
    
    // Datos de Fabricación
    factory_name: '',
    factory_sku: '',
    factory_cost_per_case_usd: '',
    pantone_codes: '',
    cut_measurements: '',
    fabrication_notes: '',
    
    // Logística de Master Case
    case_weight_kg: 10,
    case_length_cm: 40,
    case_width_cm: 30,
    case_height_cm: 20,
    
    // Inventarios
    stock_physical_cases: 0,
    stock_in_production_cases: 0,
    production_files_url: '',
    campaign_id: ''
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [expandedFactoryProductId, setExpandedFactoryProductId] = useState(null);
  
  // Formulario y Estados de Producción
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodForm, setProdForm] = useState({
    factory_name: 'Dongguan Card Supplies Factory',
    estimated_completion_date: '',
    tracking_number: '',
    status: 'Proforma',
    items: []
  });
  const [productionAuditLogs, setProductionAuditLogs] = useState([]);
  const [activeAuditOrderId, setActiveAuditOrderId] = useState(null);
  const [selectedProductionOrder, setSelectedProductionOrder] = useState(null);
  const [showProductionDetailModal, setShowProductionDetailModal] = useState(false);

  // Estados para Módulo de Selección Rápida en Fabricación
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [quickSelectSearch, setQuickSelectSearch] = useState('');
  const [quickSelectChecked, setQuickSelectChecked] = useState({}); // { [productId]: boolean }
  const [quickSelectQuantities, setQuickSelectQuantities] = useState({}); // { [productId]: number }

  // Estados para Gestión de Clientes B2B (Fase 6.5)
  // Estados para Gestión de Clientes B2B (Fase 6.5)
  const [configSubTab, setConfigSubTab] = useState('catalog');
  const [clientSubTab, setClientSubTab] = useState('directorio'); // 'directorio' | 'pricing_tiers'
  const [clientFilter, setClientFilter] = useState('all'); // 'all' | 'clients' | 'leads'
  const [clientsList, setClientsList] = useState([]);
  const [editingClient, setEditingClient] = useState(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    password: '',
    company_name: '',
    tax_id: '',
    billing_address: '',
    forwarder_address: '',
    pricing_tier_id: '',
    destination_country: 'USA',
    account_status: 'lead_new',
    followup_notes: '',
    last_contact_date: new Date().toISOString().split('T')[0]
  });

  // MOA del usuario actual
  const MOA_LIMIT = currentUser?.min_order_amount !== undefined ? parseFloat(currentUser.min_order_amount) : 1000.00;
  const isAdmin = currentUser?.role === 'tenant_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isImpersonating = !!localStorage.getItem('gosu_superadmin_token');
  const isTenantImpersonating = !!localStorage.getItem('gosu_admin_token');

  // Valuaciones e Inventario Filtrado
  const pctTienda = (() => {
    const t = pricingTiersList.find(x => x.tier_name.toLowerCase().includes('tienda'));
    return t ? parseFloat(t.discount_percentage) : 35.00;
  })();
  const pctDist = (() => {
    const t = pricingTiersList.find(x => x.tier_name.toLowerCase().includes('distrib') || x.tier_name.toLowerCase().includes('distribut'));
    return t ? parseFloat(t.discount_percentage) : 40.00;
  })();
  const pctPartner = (() => {
    const t = pricingTiersList.find(x => x.tier_name.toLowerCase().includes('partner'));
    return t ? parseFloat(t.discount_percentage) : 70.00;
  })();

  const filteredInventoryList = allProducts.filter(p => {
    if (invSearchQuery.trim()) {
      const q = invSearchQuery.toLowerCase();
      const match = (p.name || '').toLowerCase().includes(q) ||
                    (p.sku || '').toLowerCase().includes(q) ||
                    (p.commercial_description || '').toLowerCase().includes(q) ||
                    (p.factory_name || '').toLowerCase().includes(q) ||
                    (p.factory_sku || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (invFilterCategory !== 'all' && p.category !== invFilterCategory) {
      return false;
    }
    if (invFilterStockStatus === 'in_stock') {
      if ((p.stock_physical_cases || 0) <= 0) return false;
    } else if (invFilterStockStatus === 'low_stock') {
      if ((p.stock_physical_cases || 0) <= 0 || (p.stock_physical_cases || 0) >= 50) return false;
    } else if (invFilterStockStatus === 'out_of_stock') {
      if ((p.stock_physical_cases || 0) !== 0) return false;
    } else if (invFilterStockStatus === 'in_production') {
      if ((p.stock_in_production_cases || 0) === 0) return false;
    }
    if (invFilterFactory !== 'all' && p.factory_name !== invFilterFactory) {
      return false;
    }
    return true;
  });

  const invTotals = filteredInventoryList.reduce((acc, p) => {
    const stock = parseInt(p.stock_physical_cases) || 0;
    const cost = parseFloat(p.factory_cost_per_case_usd) || 0;
    const price = parseFloat(p.price_per_case_usd) || 0;

    acc.cost += stock * cost;
    acc.tienda += stock * price * (1 - pctTienda / 100);
    acc.distributor += stock * price * (1 - pctDist / 100);
    acc.partner += stock * price * (1 - pctPartner / 100);

    return acc;
  }, { cost: 0, tienda: 0, distributor: 0, partner: 0 });

  // -------------------------------------------------------
  // Carga de datos
  // -------------------------------------------------------
  const loadProducts = useCallback(async () => {
    try {
      const params = {};
      if (!isAdmin && selectedCategory !== 'all') params.category = selectedCategory;
      // searchQuery ya NO va al servidor – se filtra localmente
      const data = await productsApi.getAll(params);
      setAllProducts(data);
      setProductList(data);
    } catch (err) {
      console.error('Error cargando productos:', err);
    }
  }, [selectedCategory, isAdmin]);

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

  const loadClients = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await usersApi.getClients();
      setClientsList(data);
    } catch (err) {
      console.error('Error cargando clientes distribuidores:', err);
    }
  }, [isAdmin]);

  const loadWarehouses = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await tenantsApi.getCurrentWarehouses();
      setWarehouses(data);
    } catch (err) {
      console.error('Error cargando almacenes:', err);
    }
  }, [isAdmin]);

  const handleCreateOrUpdateWarehouse = async (e) => {
    e.preventDefault();
    try {
      if (editingWarehouseId) {
        await tenantsApi.updateWarehouse(editingWarehouseId, newWarehouseForm);
        alert('Almacén actualizado con éxito.');
      } else {
        await tenantsApi.createWarehouse(newWarehouseForm);
        alert('Almacén registrado con éxito.');
      }
      setNewWarehouseForm({ name: '', code: '', address: '', contact_info: '' });
      setEditingWarehouseId(null);
      setShowWarehouseForm(false);
      loadWarehouses();
    } catch (err) {
      alert(err.error || err.message || 'Error al procesar el almacén.');
    }
  };

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

  const loadPricingTiers = useCallback(async () => {
    if (!currentUser || isSuperAdmin || !isAdmin) return;
    try {
      const data = await pricingTiersApi.getAll();
      setPricingTiersList(data);
    } catch (err) {
      console.error('Error cargando Pricing Tiers:', err);
    }
  }, [currentUser, isSuperAdmin, isAdmin]);

  const loadCampaigns = useCallback(async () => {
    if (!currentUser || isSuperAdmin) return;
    try {
      const data = await campaignsApi.getAll();
      setCampaignsList(data);
    } catch (err) {
      console.error('Error cargando Campañas:', err);
    }
  }, [currentUser, isSuperAdmin]);

  const loadSkuVolumeRules = useCallback(async () => {
    if (!currentUser || isSuperAdmin || !isAdmin) return;
    try {
      const data = await configApi.skuVolumeRules.getAll();
      setSkuVolumeRulesList(data);
    } catch (err) {
      console.error('Error cargando reglas de volumen SKU:', err);
    }
  }, [currentUser, isSuperAdmin, isAdmin]);

  const loadCatalogConfig = useCallback(async () => {
    if (!currentUser || isSuperAdmin) return;
    try {
      const [catData, brandData] = await Promise.all([
        configApi.categories.getAll(),
        configApi.brands.getAll()
      ]);
      setCategoriesList(catData);
      setBrandsList(brandData);
      if (isAdmin) {
        await Promise.all([loadClients(), loadPricingTiers(), loadCampaigns(), loadSkuVolumeRules()]);
      } else {
        await loadCampaigns();
      }
    } catch (err) {
      console.error('Error cargando marcas/categorías:', err);
    }
  }, [currentUser, isSuperAdmin, isAdmin, loadClients, loadPricingTiers, loadCampaigns, loadSkuVolumeRules]);

  const loadTenantPublicInfo = useCallback(async () => {
    if (!currentUser || isSuperAdmin || isAdmin) return;
    try {
      const publicData = await tenantsApi.getCurrentBankDetails();
      setTenantPublicInfo(publicData);
    } catch (err) {
      console.error('Error al cargar marca/logo del tenant:', err);
    }
  }, [currentUser, isSuperAdmin, isAdmin]);

  const loadTenantSettings = useCallback(async () => {
    if (!currentUser || isSuperAdmin || !isAdmin) return;
    try {
      const data = await tenantsApi.getCurrentSettings();
      setTenantSettings({
        whatsapp_api_key: data.whatsapp_api_key || '',
        resend_api_key: data.resend_api_key || '',
        cloudinary_cloud_name: data.cloudinary_cloud_name || '',
        cloudinary_upload_preset: data.cloudinary_upload_preset || '',
        cloudinary_api_key: data.cloudinary_api_key || '',
        cloudinary_api_secret: data.cloudinary_api_secret || '',
        stripe_secret_key: data.stripe_secret_key || '',
        stripe_publishable_key: data.stripe_publishable_key || '',
        bank_name: data.bank_name || '',
        bank_account_name: data.bank_account_name || '',
        bank_account_number: data.bank_account_number || '',
        bank_routing_number: data.bank_routing_number || '',
        logo_url: data.logo_url || '',
        default_incoterm: data.default_incoterm || 'FOB China',
        discount_policy: data.discount_policy || 'tier'
      });
    } catch (err) {
      console.error('Error al cargar API keys del tenant:', err);
    }
  }, [currentUser, isSuperAdmin, isAdmin]);

  const handleUpdateTenantSettings = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSettings(true);
    try {
      await tenantsApi.updateCurrentSettings(tenantSettings);
      alert('🎉 Configuraciones de API Keys actualizadas con éxito.');
    } catch (err) {
      alert(`❌ Error al guardar configuraciones: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const loadDashboardData = useCallback(async () => {
    if (!currentUser || isSuperAdmin || !isAdmin) return;
    setLoadingDashboard(true);
    try {
      let start = '';
      let end = '';

      if (dashboardFilter === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
      } else if (dashboardFilter === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
      } else if (dashboardFilter === 'thismonth') {
        const d = new Date();
        start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (dashboardFilter === 'thisyear') {
        const d = new Date();
        start = `${d.getFullYear()}-01-01`;
      } else if (dashboardFilter === 'custom') {
        start = dashboardStartDate;
        end = dashboardEndDate;
      }

      const params = {};
      if (start) params.start_date = start;
      if (end) params.end_date = end;

      const data = await tenantsApi.getCurrentDashboard(params);
      setDashboardData(data);
    } catch (err) {
      console.error('Error al cargar datos del dashboard:', err);
    } finally {
      setLoadingDashboard(false);
    }
  }, [currentUser, isSuperAdmin, isAdmin, dashboardFilter, dashboardStartDate, dashboardEndDate]);

  // Carga inicial cuando el usuario se autentifica
  useEffect(() => {
    if (!currentUser) return;
    
    const loadAll = async () => {
      setDataLoading(true);
      setDataError('');
      try {
        if (isSuperAdmin) {
          await loadTenants();
        } else if (isAdmin) {
          await Promise.all([
            loadProducts(),
            loadOrders(),
            loadProduction(),
            loadCatalogConfig(),
            loadTenantSettings(),
            loadDashboardData()
          ]);
        } else {
          await Promise.all([
            loadProducts(),
            loadOrders(),
            loadTenantPublicInfo()
          ]);
        }
      } catch (err) {
        setDataError('Error al cargar datos del servidor.');
      } finally {
        setDataError(''); // Clear error just in case
        setDataLoading(false);
      }
    };
    loadAll();
  }, [currentUser, isSuperAdmin, isAdmin, loadTenants, loadProducts, loadOrders, loadProduction, loadCatalogConfig, loadTenantSettings, loadDashboardData, loadTenantPublicInfo]);

  // Hook de inicio para revisar si hay solicitudes públicas de visualización/impresión de documentos
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const printOrderId = params.get('print_order');
    const docTypeParam = params.get('doc_type');
    if (printOrderId && docTypeParam) {
      setLoadingPublicPrint(true);
      setPublicPrintDocType(docTypeParam);
      ordersApi.getPublicDetail(printOrderId)
        .then(data => {
          setPublicPrintOrder(data);
          setLoadingPublicPrint(false);
          // Disparar la ventana de impresión del navegador tras un breve delay para permitir el renderizado
          setTimeout(() => {
            window.print();
          }, 1000);
        })
        .catch(err => {
          console.error(err);
          alert('❌ Error al cargar el documento público: ' + err.message);
          setLoadingPublicPrint(false);
        });
    }

    // Manejar el retorno exitoso o cancelado de Stripe Checkout
    const stripeSuccess = params.get('stripe_success');
    const stripeCancel = params.get('stripe_cancel');
    const orderId = params.get('order_id');
    const sessionId = params.get('session_id');

    if (stripeSuccess === 'true' && orderId && sessionId) {
      const verifyPayment = async () => {
        try {
          console.log(`Verificando pago Stripe para pedido ${orderId}...`);
          const res = await ordersApi.verifyStripePayment(orderId, sessionId);
          if (res && res.success) {
            alert('🎉 ¡Pago procesado con éxito! Tu pedido ha sido registrado como Pagado.');
          } else {
            alert('⚠️ El pago de Stripe aún no se ha reflejado. Lo verificaremos a la brevedad.');
          }
          await loadOrders();
        } catch (err) {
          console.error('Error verificando pago:', err);
          alert(`❌ Error al verificar pago de Stripe: ${err.message}`);
        } finally {
          // Limpiar la URL de los parámetros para evitar ejecuciones repetidas en recargas de página
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      verifyPayment();
    } else if (stripeCancel === 'true' && orderId) {
      alert('⚠️ El proceso de pago por tarjeta de crédito fue cancelado o no se concretó.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadOrders]);

  // Recargar desde servidor solo cuando cambia categoría
  useEffect(() => {
    if (!currentUser || isSuperAdmin) return;
    loadProducts();
  }, [selectedCategory, currentUser, isSuperAdmin, loadProducts]);

  // Filtrado local instantáneo cuando cambia el texto de búsqueda o filtros admin
  useEffect(() => {
    let filtered = [...allProducts];

    // 1. Filtrar por búsqueda de texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.commercial_description || '').toLowerCase().includes(q) ||
        (p.factory_name || '').toLowerCase().includes(q) ||
        (p.factory_sku || '').toLowerCase().includes(q)
      );
    }

    // Filtros específicos para el Admin
    if (isAdmin) {
      // 2. Filtrar por categoría
      if (adminFilterCategory !== 'all') {
        filtered = filtered.filter(p => p.category === adminFilterCategory);
      }

      // 3. Filtrar por estado de stock
      if (adminFilterStockStatus === 'out_of_stock') {
        filtered = filtered.filter(p => (p.stock_physical_cases || 0) === 0);
      } else if (adminFilterStockStatus === 'low_stock') {
        filtered = filtered.filter(p => (p.stock_physical_cases || 0) > 0 && (p.stock_physical_cases || 0) < 10);
      } else if (adminFilterStockStatus === 'in_production') {
        filtered = filtered.filter(p => (p.stock_in_production_cases || 0) > 0);
      }

      // 4. Filtrar por fábrica
      if (adminFilterFactory !== 'all') {
        filtered = filtered.filter(p => p.factory_name === adminFilterFactory);
      }
    }

    setProductList(filtered);
  }, [searchQuery, allProducts, isAdmin, adminFilterCategory, adminFilterStockStatus, adminFilterFactory]);

  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'admin') {
      loadProduction();
      loadWarehouses();
    }
    if (activeTab === 'dashboard') loadDashboardData();
    if (activeTab === 'clients') {
      loadClients();
      loadPricingTiers();
    }
    if (activeTab === 'catalog' || activeTab === 'config' || activeTab === 'inventory' || activeTab === 'campaigns') {
      loadCatalogConfig();
      loadTenantSettings();
      loadWarehouses();
      loadCampaigns();
    }
    if (['saas-tenants', 'saas-users', 'saas-billing', 'saas-audit'].includes(activeTab)) {
      loadTenants();
    }
  }, [activeTab, currentUser, loadOrders, loadProduction, loadClients, loadPricingTiers, loadTenants, loadCatalogConfig, loadTenantSettings, loadDashboardData, loadWarehouses, loadCampaigns]);

  // Recargar datos del dashboard cuando cambian los filtros
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    }
  }, [activeTab, dashboardFilter, dashboardStartDate, dashboardEndDate, loadDashboardData]);

  // Aligerar la vista del Super Admin forzando la redirección de tab
  useEffect(() => {
    if (currentUser && currentUser.role === 'super_admin' && !['saas-tenants', 'saas-users', 'saas-billing', 'saas-audit'].includes(activeTab)) {
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
    setActiveTab(user.role === 'super_admin' ? 'saas-tenants' : 'catalog');
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

  const handleTenantImpersonate = async (userId) => {
    if (!confirm('¿Estás seguro de ingresar al portal como si fueras este cliente?')) return;
    try {
      localStorage.setItem('gosu_admin_token', localStorage.getItem('gosu_token'));
      localStorage.setItem('gosu_admin_user', localStorage.getItem('gosu_user'));

      const data = await auth.tenantImpersonate(userId);
      localStorage.setItem('gosu_token', data.token);
      localStorage.setItem('gosu_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setActiveTab('catalog');
      alert(`👁️ Navegando como cliente: ${data.user.name}`);
      window.location.reload();
    } catch (err) {
      alert(`❌ Error al impersonar: ${err.message}`);
    }
  };

  const handleStopTenantImpersonation = () => {
    const origToken = localStorage.getItem('gosu_admin_token');
    const origUser = localStorage.getItem('gosu_admin_user');

    if (!origToken || !origUser) {
      alert('No se encontró una sesión previa de Administrador.');
      return;
    }

    localStorage.setItem('gosu_token', origToken);
    localStorage.setItem('gosu_user', origUser);
    localStorage.removeItem('gosu_admin_token');
    localStorage.removeItem('gosu_admin_user');

    const parsedUser = JSON.parse(origUser);
    setCurrentUser(parsedUser);
    setActiveTab('clients');
    alert('✓ Sesión finalizada. Volviendo a cuenta Administrador.');
    window.location.reload();
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
  // CRUD de Campañas (Print Runs)
  // ============================================================
  const handleCreateOrUpdateCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaign.name || !newCampaign.start_date_reservations || !newCampaign.end_date_reservations) {
      alert('Nombre y fechas de reservas son requeridos.');
      return;
    }
    try {
      if (editingCampaign) {
        await campaignsApi.update(editingCampaign.id, newCampaign);
        alert('🎉 Campaña actualizada con éxito.');
        setEditingCampaign(null);
      } else {
        await campaignsApi.create(newCampaign);
        alert('🎉 Campaña creada con éxito.');
      }
      setNewCampaign({ name: '', start_date_reservations: '', end_date_reservations: '', start_date_production: '', estimated_end_date_production: '', advance_payment_pct: 30.00, status: 'open' });
      await loadCampaigns();
    } catch (err) {
      console.error('Error al guardar campaña:', err);
      alert('❌ Error al guardar campaña: ' + (err.error || err.message || err));
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('⚠️ ¿Estás seguro de que deseas eliminar esta campaña?')) return;
    try {
      await campaignsApi.delete(id);
      alert('🗑️ Campaña eliminada.');
      await loadCampaigns();
    } catch (err) {
      console.error('Error al eliminar campaña:', err);
      alert('❌ Error al eliminar campaña: ' + (err.error || err.message || err));
    }
  };

  const handleOpenCampaignProductsModal = (campaign) => {
    setSelectedCampaignForProducts(campaign);
    setCampaignProductsFilter('');
    
    const selections = {};
    allProducts.forEach(p => {
      const isAssigned = p.campaign_id === campaign.id;
      selections[p.id] = {
        selected: isAssigned,
        qty_cases: isAssigned ? (p.stock_in_production_cases || 0) : 0
      };
    });
    setCampaignProductSelections(selections);
    setShowCampaignProductsModal(true);
  };

  const handleSaveCampaignProducts = async () => {
    if (!selectedCampaignForProducts) return;
    
    const productsToAssign = [];
    Object.entries(campaignProductSelections).forEach(([prodId, val]) => {
      if (val.selected) {
        productsToAssign.push({
          product_id: prodId,
          qty_cases: parseInt(val.qty_cases) || 0
        });
      }
    });

    try {
      await campaignsApi.assignProducts(selectedCampaignForProducts.id, productsToAssign);
      alert('🎉 Productos y cantidades asociados con éxito a la campaña.');
      setShowCampaignProductsModal(false);
      await loadProducts();
    } catch (err) {
      console.error('Error al guardar productos de campaña:', err);
      alert('❌ Error al guardar productos: ' + (err.error || err.message || err));
    }
  };

  // ============================================================
  // CRUD de Reglas de Volumen SKU
  // ============================================================
  const handleCreateOrUpdateSkuVolumeRule = async (e) => {
    e.preventDefault();
    if (!newSkuVolumeRule.min_units || !newSkuVolumeRule.discount_pct) {
      alert('Cantidad mínima y porcentaje de descuento son requeridos.');
      return;
    }

    try {
      if (editingSkuVolumeRule) {
        await configApi.skuVolumeRules.update(editingSkuVolumeRule.id, {
          min_units: parseInt(newSkuVolumeRule.min_units),
          discount_pct: parseFloat(newSkuVolumeRule.discount_pct)
        });
        alert('🎉 Regla de volumen actualizada.');
      } else {
        await configApi.skuVolumeRules.create({
          min_units: parseInt(newSkuVolumeRule.min_units),
          discount_pct: parseFloat(newSkuVolumeRule.discount_pct)
        });
        alert('🎉 Regla de volumen creada.');
      }
      setNewSkuVolumeRule({ min_units: '', discount_pct: '' });
      setEditingSkuVolumeRule(null);
      await loadSkuVolumeRules();
    } catch (err) {
      console.error('Error al guardar regla de volumen SKU:', err);
      alert('❌ Error al guardar regla: ' + (err.error || err.message || err));
    }
  };

  const handleDeleteSkuVolumeRule = async (id) => {
    if (!window.confirm('⚠️ ¿Estás seguro de que deseas eliminar esta regla?')) return;
    try {
      await configApi.skuVolumeRules.delete(id);
      alert('🗑️ Regla de volumen eliminada.');
      await loadSkuVolumeRules();
    } catch (err) {
      console.error('Error al eliminar regla de volumen SKU:', err);
      alert('❌ Error al eliminar regla: ' + (err.error || err.message || err));
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
  // Handlers para Carga Masiva de Catálogo (Fase 7)
  // ============================================================
  const parseCSV = (text) => {
    let delimiter = ',';
    let content = text;

    if (text.startsWith('sep=')) {
      const lineEnd = text.indexOf('\n');
      if (lineEnd !== -1) {
        delimiter = text.substring(4, lineEnd).trim();
        content = text.substring(lineEnd + 1);
      }
    } else {
      const firstLine = text.split('\n')[0] || '';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      if (semicolonCount > commaCount) {
        delimiter = ';';
      }
    }

    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      const next = content[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        row.push('');
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
  };

  const handleCSVFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const rawRows = parseCSV(text);

        if (rawRows.length < 2) {
          alert('❌ El archivo CSV está vacío o no contiene una fila de cabecera.');
          return;
        }

        const headers = rawRows[0].map(h => h.trim().toLowerCase());

        const skuIdx = headers.indexOf('sku');
        const nameIdx = headers.indexOf('name');
        const categoryIdx = headers.indexOf('category');
        const priceIdx = headers.indexOf('price_per_case_usd');

        if (skuIdx === -1 || nameIdx === -1 || categoryIdx === -1 || priceIdx === -1) {
          alert('❌ Cabecera del CSV inválida. Debe contener al menos: sku, name, category, price_per_case_usd.');
          return;
        }

        const previewData = [];

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (row.length === 1 && row[0] === '') continue;

          const getValue = (columnName) => {
            const idx = headers.indexOf(columnName);
            return (idx !== -1 && row[idx] !== undefined) ? row[idx].trim() : '';
          };

          const sku = getValue('sku');
          const name = getValue('name');
          const category = getValue('category');
          const price = getValue('price_per_case_usd');

          if (!sku || !name || !category || !price) {
            previewData.push({
              error: `Línea ${i + 1}: Faltan campos obligatorios.`,
              sku: sku || 'N/A',
              name: name || 'N/A',
              category: category || 'N/A',
              price_per_case_usd: price || '0'
            });
            continue;
          }

          previewData.push({
            sku,
            name,
            category,
            price_per_case_usd: parseFloat(price) || 0,
            image_url: getValue('image_url') || '',
            is_active: getValue('is_active').toLowerCase() !== 'false',
            commercial_description: getValue('commercial_description') || '',
            units_per_case: parseInt(getValue('units_per_case')) || 1,
            finished_measurements: getValue('finished_measurements') || '',
            color: getValue('color') || '',
            factory_name: getValue('factory_name') || '',
            factory_sku: getValue('factory_sku') || '',
            factory_cost_per_case_usd: getValue('factory_cost_per_case_usd') !== '' ? parseFloat(getValue('factory_cost_per_case_usd')) : '',
            pantone_codes: getValue('pantone_codes') || '',
            cut_measurements: getValue('cut_measurements') || '',
            fabrication_notes: getValue('fabrication_notes') || '',
            case_weight_kg: parseFloat(getValue('case_weight_kg')) || 10.0,
            case_length_cm: parseFloat(getValue('case_length_cm')) || 40.0,
            case_width_cm: parseFloat(getValue('case_width_cm')) || 30.0,
            case_height_cm: parseFloat(getValue('case_height_cm')) || 20.0,
            stock_physical_cases: parseInt(getValue('stock_physical_cases')) || 0,
            stock_in_production_cases: parseInt(getValue('stock_in_production_cases')) || 0,
            production_files_url: getValue('production_files_url') || ''
          });
        }

        setBulkPreview(previewData);
        setBulkResult(null);
      } catch (err) {
        alert(`❌ Error al procesar el archivo: ${err.message}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleBulkUploadSubmit = async () => {
    if (bulkPreview.length === 0) return;

    const hasErrors = bulkPreview.some(p => p.error);
    if (hasErrors) {
      alert('❌ Corrige los errores en la vista previa del archivo CSV antes de continuar.');
      return;
    }

    setBulkUploading(true);
    setBulkResult(null);

    try {
      const res = await productsApi.bulkUpload(bulkPreview);
      setBulkResult({
        success: true,
        processed: res.processed,
        inserted: res.inserted,
        updated: res.updated
      });
      setBulkPreview([]);
      
      // Limpiar input del file selector
      const fileInput = document.getElementById('csv-file-selector');
      if (fileInput) fileInput.value = '';

      alert(`🎉 Carga masiva completada con éxito. ${res.processed} productos procesados.`);
      await loadProducts();
    } catch (err) {
      setBulkResult({
        success: false,
        error: err.message || 'Error desconocido al subir archivo CSV.'
      });
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDownloadCSVTemplate = () => {
    const csvContent = 
      "sep=;\n" +
      "sku;name;category;price_per_case_usd;units_per_case;case_weight_kg;case_length_cm;case_width_cm;case_height_cm;stock_physical_cases;stock_in_production_cases;image_url;commercial_description;finished_measurements;color;factory_name;factory_sku;factory_cost_per_case_usd;pantone_codes;cut_measurements;fabrication_notes;production_files_url\n" +
      "GOSU-SLV-001;Protectores de Cartas Mate - Black;Protectores;35.00;100;12.5;42;32;22;250;50;https://ejemplo.com/black.jpg;Protectores premium mate tamaño Standard.;66x91 mm;Black;Fábrica Dongguan;FAC-SKU-99;18.00;Pantone 426C;68x93 mm;Embalado especial anti-humedad;https://drive.google.com/drive/folders/ejemplo1\n" +
      "GOSU-SLV-002;Protectores de Cartas Mate - Red;Protectores;35.00;100;12.5;42;32;22;180;0;https://ejemplo.com/red.jpg;Protectores premium mate color rojo.;66x91 mm;Red;Fábrica Dongguan;FAC-SKU-100;18.00;Pantone 186C;68x93 mm;Sin notas;https://drive.google.com/drive/folders/ejemplo2\n";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "gosu_catalog_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============================================================
  // CRUD de Pricing Tiers (Niveles de Cliente Comercial)
  // ============================================================
  const handleCreateOrUpdatePricingTier = async (e) => {
    e.preventDefault();
    if (!newPricingTier.tier_name) {
      alert('El nombre del nivel es obligatorio.');
      return;
    }
    try {
      if (editingPricingTier) {
        await pricingTiersApi.update(editingPricingTier.id, newPricingTier);
        alert('🎉 Nivel de precios actualizado con éxito.');
        setEditingPricingTier(null);
      } else {
        await pricingTiersApi.create(newPricingTier);
        alert('🎉 Nivel de precios creado con éxito.');
      }
      setNewPricingTier({ tier_name: '', discount_percentage: 0, min_order_amount: 1000, only_master_cases: false });
      await loadPricingTiers();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleDeletePricingTier = async (id) => {
    if (!confirm('¿Está seguro de eliminar este nivel de precios? Los clientes que lo usen quedarán sin nivel asignado.')) return;
    try {
      await pricingTiersApi.delete(id);
      alert('Nivel de precios eliminado.');
      await loadPricingTiers();
      await loadClients();
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

    if (isSleevesCategory(newProduct.category)) {
      if (!newProduct.finished_measurements || !newProduct.cut_measurements || !newProduct.color) {
        alert('⚠️ Para la categoría de protectores (Sleeves), los campos Medida Final, Medida de Fabricación (Corte) y Color son obligatorios.');
        return;
      }
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
        image_url: '',
        commercial_description: '',
        price_per_case_usd: '',
        units_per_case: 100,
        finished_measurements: '',
        color: '',
        factory_name: '',
        factory_sku: '',
        factory_cost_per_case_usd: '',
        pantone_codes: '',
        cut_measurements: '',
        fabrication_notes: '',
        case_weight_kg: 10,
        case_length_cm: 40,
        case_width_cm: 30,
        case_height_cm: 20,
        stock_physical_cases: 0,
        stock_in_production_cases: 0,
        production_files_url: '',
        campaign_id: ''
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
      setSelectedProductIds(prev => prev.filter(pId => pId !== id));
      await loadProducts();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleBulkDeleteProducts = async () => {
    if (selectedProductIds.length === 0) return;
    if (!confirm(`¿Está seguro de eliminar los ${selectedProductIds.length} productos seleccionados del catálogo? Esta acción es irreversible.`)) return;
    try {
      const res = await productsApi.bulkDelete(selectedProductIds);
      
      let msg = '';
      if (res.deleted_count > 0) {
        msg += `🎉 Se eliminaron exitosamente ${res.deleted_count} producto(s).\n\n`;
      }
      
      if (res.referenced_count > 0) {
        msg += `⚠️ ${res.referenced_count} producto(s) no se pudieron eliminar por tener historial de transacciones (ventas o producción):\n`;
        res.referenced_products.forEach(p => {
          msg += `- [${p.sku}] ${p.name}\n`;
        });
      }
      
      alert(msg || 'Operación completada.');
      setSelectedProductIds([]);
      await loadProducts();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleTriggerEditProduct = (product) => {
    setActiveTab('catalog');
    setEditingProduct(product);
    setCreatingProduct(false);
    setNewProduct({
      name: product.name,
      sku: product.sku,
      category: product.category,
      image_url: product.image_url || '',
      commercial_description: product.commercial_description || '',
      price_per_case_usd: product.price_per_case_usd,
      units_per_case: product.units_per_case,
      finished_measurements: product.finished_measurements || '',
      factory_name: product.factory_name || '',
      factory_sku: product.factory_sku || '',
      factory_cost_per_case_usd: product.factory_cost_per_case_usd || '',
      pantone_codes: product.pantone_codes || '',
      cut_measurements: product.cut_measurements || '',
      fabrication_notes: product.fabrication_notes || '',
      production_files_url: product.production_files_url || '',
      case_weight_kg: product.case_weight_kg || '',
      case_length_cm: product.case_length_cm || '',
      case_width_cm: product.case_width_cm || '',
      case_height_cm: product.case_height_cm || '',
      stock_physical_cases: product.stock_physical_cases || '',
      stock_in_production_cases: product.stock_in_production_cases || '',
      color: product.color || '',
      brand: product.brand || '',
      campaign_id: product.campaign_id || ''
    });
  };

  const handleOpenKardex = async (product) => {
    setKardexProduct(product);
    setKardexModalOpen(true);
    setLoadingKardex(true);
    setAdjustQty('');
    setAdjustNotes('');
    try {
      const history = await productsApi.getKardex(product.id);
      setKardexHistory(history);
    } catch (err) {
      console.error('Error al cargar historial de Kardex:', err);
      alert('❌ Error al cargar historial de Kardex.');
    } finally {
      setLoadingKardex(false);
    }
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!kardexProduct) return;
    if (!adjustQty || isNaN(parseInt(adjustQty))) {
      alert('⚠️ Por favor ingresa una cantidad numérica válida.');
      return;
    }

    setSubmittingAdjustment(true);
    try {
      const res = await productsApi.adjustInventory(kardexProduct.id, {
        movement_type: adjustType,
        quantity_cases: parseInt(adjustQty),
        notes: adjustNotes
      });

      alert(`🎉 ${res.message}`);
      
      // Actualizar localmente el producto
      setKardexProduct(prev => ({
        ...prev,
        stock_physical_cases: res.new_stock
      }));

      // Recargar lista de productos para actualizar grilla
      await loadProducts();

      // Recargar historial del Kardex
      const history = await productsApi.getKardex(kardexProduct.id);
      setKardexHistory(history);

      setAdjustQty('');
      setAdjustNotes('');
    } catch (err) {
      alert(`❌ Error al procesar ajuste: ${err.message}`);
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  // ============================================================
  // Handlers del Módulo de Fabricación y Producción (Fase 5)
  // ============================================================
  const handleCreateProductionOrder = async (e) => {
    e.preventDefault();
    if (prodForm.items.length === 0) {
      alert('⚠️ Debes añadir al menos un producto a la orden de producción.');
      return;
    }
    try {
      await productionApi.create(prodForm);
      alert('🎉 Orden de producción registrada con éxito en Neon.');
      setProdForm({
        factory_name: 'Dongguan Card Supplies Factory',
        estimated_completion_date: '',
        tracking_number: '',
        status: 'Draft',
        items: []
      });
      setShowProdForm(false);
      await Promise.all([loadProduction(), loadProducts()]);
    } catch (err) {
      alert(`❌ Error al registrar orden de producción: ${err.message}`);
    }
  };

  const handleLoadQuickSelection = () => {
    const selectedItems = [];
    Object.entries(quickSelectChecked).forEach(([productId, isChecked]) => {
      if (isChecked) {
        const prod = productList.find(p => p.id === productId);
        if (prod) {
          const qty = quickSelectQuantities[productId] || 10;
          selectedItems.push({
            product_id: productId,
            quantity_cases: qty,
            cost_per_case_usd: prod.factory_cost_per_case_usd || 0
          });
        }
      }
    });

    if (selectedItems.length === 0) {
      alert('⚠️ Debes marcar al menos un producto con su check para agregarlo.');
      return;
    }

    setProdForm(prev => {
      const updatedItems = [...prev.items];
      selectedItems.forEach(newItem => {
        const existingIdx = updatedItems.findIndex(item => item.product_id === newItem.product_id);
        if (existingIdx > -1) {
          updatedItems[existingIdx].quantity_cases = newItem.quantity_cases;
          updatedItems[existingIdx].cost_per_case_usd = newItem.cost_per_case_usd;
        } else {
          updatedItems.push(newItem);
        }
      });
      return { ...prev, items: updatedItems };
    });

    // Reset & Close
    setQuickSelectChecked({});
    setQuickSelectQuantities({});
    setQuickSelectSearch('');
    setShowQuickSelect(false);
    alert(`🎉 Se cargaron ${selectedItems.length} productos seleccionados al lote de fabricación.`);
  };

  const handleLoadProductionAuditLogs = async (orderId) => {
    try {
      const logs = await productionApi.getAuditLogs(orderId);
      setProductionAuditLogs(logs);
      setActiveAuditOrderId(orderId);
    } catch (err) {
      alert(`❌ Error al obtener bitácora de auditoría: ${err.message}`);
    }
  };

  const handleUpdateProductionStatus = async (orderId, newStatus) => {
    try {
      await productionApi.updateStatus(orderId, newStatus);
      alert(`🎉 Estado actualizado a: ${newStatus}`);
      await Promise.all([loadProduction(), loadProducts()]);
    } catch (err) {
      alert(`❌ Error al cambiar estado: ${err.message}`);
    }
  };

  const handleShareWhatsApp = async (order) => {
    const num = prompt(`Ingresa el número de WhatsApp del cliente para enviar los enlaces del pedido B2B ${order.po_number || order.id.split('-')[0].toUpperCase()} (código de país seguido del número, sin espacios ni caracteres especiales, ej: 51987654321):`, "");
    if (!num) return;
    try {
      await ordersApi.sendWhatsApp(order.id, num, window.location.origin);
      alert('🎉 Mensaje enviado por WhatsApp con éxito (vía json.pe).');
    } catch(err) {
      alert(`❌ Error al enviar WhatsApp: ${err.message}`);
    }
  };

  const handleShareEmail = async (order) => {
    const defaultEmail = order.client_email || "";
    const email = prompt(`Ingresa el correo electrónico del cliente para enviar la factura y packing list del pedido ${order.po_number || order.id.split('-')[0].toUpperCase()}:`, defaultEmail);
    if (!email) return;
    try {
      await ordersApi.sendEmail(order.id, email, window.location.origin);
      alert('🎉 Correo electrónico enviado con éxito (vía Resend).');
    } catch(err) {
      alert(`❌ Error al enviar correo: ${err.message}`);
    }
  };

  const handleUpdatePaymentStatus = async (orderId, paymentStatus, currentUrl) => {
    let balance_receipt_url = currentUrl;
    if (paymentStatus === 'Pagado' && !currentUrl) {
      const inputUrl = prompt('Ingrese la URL del comprobante de pago / voucher (Opcional):');
      if (inputUrl !== null) {
        balance_receipt_url = inputUrl;
      }
    }
    try {
      await ordersApi.updatePayment(orderId, paymentStatus, balance_receipt_url);
      alert('🎉 Estado de pago actualizado con éxito.');
      await loadOrders();
    } catch (err) {
      alert(`❌ Error al actualizar pago: ${err.message}`);
    }
  };

  const handleEditPaymentReceipt = async (order) => {
    const inputUrl = prompt('Ingrese la URL del comprobante de pago / voucher:', order.balance_receipt_url || '');
    if (inputUrl === null) return;
    try {
      await ordersApi.updatePayment(order.id, order.payment_status || 'Pagado', inputUrl);
      alert('🎉 Comprobante de pago actualizado con éxito.');
      await loadOrders();
    } catch (err) {
      alert(`❌ Error al actualizar comprobante: ${err.message}`);
    }
  };

  const handleUploadPaymentReceipt = async (orderId, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('❌ Error: El archivo supera el límite de tamaño de 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      try {
        alert('📤 Subiendo comprobante a Cloudinary...');
        await ordersApi.uploadVoucher(orderId, base64Data, file.type);
        alert('🎉 Comprobante de pago subido e integrado con éxito.');
        await loadOrders();
      } catch (err) {
        alert(`❌ Error al subir comprobante: ${err.message}`);
      }
    };
    reader.onerror = () => {
      alert('❌ Error al leer el archivo local.');
    };
    reader.readAsDataURL(file);
  };

  const handleViewStripeReceipt = async (orderId) => {
    try {
      alert('⏳ Recuperando comprobante de Stripe...');
      const res = await ordersApi.getStripeReceipt(orderId);
      if (res && res.url) {
        window.open(res.url, '_blank');
        await loadOrders();
      } else {
        throw new Error('La transacción no posee una URL de recibo disponible.');
      }
    } catch (err) {
      alert(`❌ Error al cargar comprobante de Stripe: ${err.message}`);
    }
  };

  const handleApprovePayment = async (orderId) => {
    if (!window.confirm('¿Está seguro de que desea aprobar el comprobante y marcar esta orden como Pagada?')) return;
    try {
      await ordersApi.approvePayment(orderId);
      alert('🎉 Pago aprobado con éxito.');
      await loadOrders();
    } catch (err) {
      alert(`❌ Error al aprobar pago: ${err.message}`);
    }
  };

  const handleUpdateCreditDueDate = async (orderId, dateValue) => {
    try {
      await ordersApi.updateCreditDueDate(orderId, dateValue);
      await loadOrders();
    } catch (err) {
      alert(`❌ Error al actualizar fecha de vencimiento: ${err.message}`);
    }
  };

  const handleExportPDF = (pOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('❌ Error: El navegador bloqueó la ventana emergente de impresión.');
      return;
    }

    const itemsRows = pOrder.items.map(item => {
      const imgCell = item.image_url 
        ? `<img src="${item.image_url}" style="width: 35px; height: 35px; border-radius: 4px; object-fit: cover;" />` 
        : '-';
      const finishedSize = item.finished_measurements ? item.finished_measurements : '-';
      const cutSize = item.cut_measurements ? item.cut_measurements : '-';
      const itemColor = item.color ? item.color : '-';

      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px; text-align: center;">${imgCell}</td>
          <td style="padding: 10px; font-family: monospace; font-size: 13px;">${item.sku}</td>
          <td style="padding: 10px; font-weight: 600;">${item.name}</td>
          <td style="padding: 10px; text-align: center;">${finishedSize}</td>
          <td style="padding: 10px; text-align: center;">${cutSize}</td>
          <td style="padding: 10px; text-align: center;">${itemColor}</td>
          <td style="padding: 10px; text-align: center;">${item.quantity_cases}</td>
          <td style="padding: 10px; text-align: right;">$${parseFloat(item.cost_per_case_usd).toFixed(2)}</td>
          <td style="padding: 10px; text-align: right; font-weight: 700;">$${parseFloat(item.total_item_cost_usd).toFixed(2)}</td>
          <td style="padding: 10px; text-align: center;">${parseFloat(item.item_cbm).toFixed(4)} CBM</td>
          <td style="padding: 10px; text-align: center;">
            ${item.production_files_url ? `
              <a href="${item.production_files_url}" target="_blank" style="color: #00bcd4; font-weight: bold; text-decoration: underline;">Ver Archivos</a>
            ` : '<span style="color: #888;">N/A</span>'}
          </td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Ficha de Fabricación B2B - ${pOrder.order_number}</title>
          <style>
            body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222; padding: 40px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #00bcd4; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; color: #00bcd4; font-weight: 800; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
            .info-grid div { font-size: 14px; }
            .info-grid strong { color: #00bcd4; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #333; color: #fff; padding: 12px 10px; text-align: left; font-size: 13px; text-transform: uppercase; }
            td { font-size: 13.5px; }
            .totals-box { display: flex; justify-content: flex-end; gap: 30px; font-size: 16px; margin-top: 20px; border-top: 2px solid #333; padding-top: 15px; }
            .totals-box div { font-weight: bold; }
            .footer { text-align: center; margin-top: 80px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px; text-align: right;">
            <button onclick="window.print()" style="background: #00bcd4; color: #fff; border: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,188,212,0.3);">
              🖨️ Imprimir / Guardar como PDF
            </button>
          </div>

          <div class="header">
            <div>
              <h1>FICHA DE FABRICACIÓN</h1>
              <div style="font-size: 18px; font-weight: bold; color: #555;">Orden de Producción: ${pOrder.order_number}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 20px; font-weight: bold; color: #333;">GOSU ACCESSORIES</div>
              <div style="font-size: 12px; color: #666;">Sistema Multitenant B2B</div>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <div>🏭 <strong>Fábrica Proveedora:</strong> ${pOrder.factory_name}</div>
              <div style="margin-top: 8px;">📅 <strong>Fecha Registro:</strong> ${new Date(pOrder.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div>
              <div>📊 <strong>Estado Actual:</strong> ${pOrder.status}</div>
              <div style="margin-top: 8px;">🚢 <strong>Tracking de Embarque:</strong> ${pOrder.tracking_number || 'N/A'}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; color: #333;">PRODUCTOS EN ORDEN DE PRODUCCIÓN</h2>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">Foto</th>
                <th>SKU</th>
                <th>Nombre del Producto</th>
                <th style="text-align: center;">Medida</th>
                <th style="text-align: center;">Medida Fab.</th>
                <th style="text-align: center;">Color</th>
                <th style="text-align: center;">Cajas Master</th>
                <th style="text-align: right;">Costo/Caja</th>
                <th style="text-align: right;">Subtotal</th>
                <th style="text-align: center;">Volumen CBM</th>
                <th style="text-align: center;">Archivos Producción</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals-box">
            <div>Volumen Total: <span style="color: #00bcd4;">${parseFloat(pOrder.total_cbm).toFixed(4)} CBM</span></div>
            <div>Inversión Total Lote: <span style="color: #4caf50;">$${parseFloat(pOrder.total_cost_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
          </div>

          <div class="footer">
            <p>Este documento es confidencial y contiene especificaciones técnicas y comerciales privadas de la cadena de suministro.</p>
            <p>© Gosu Accessories Ltd. - Control Interno de Fabricación.</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ============================================================
  // Handlers de Gestión de Clientes Distribuidores B2B (Fase 6.5)
  // ============================================================
  const handleCreateOrUpdateClient = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await usersApi.updateClient(editingClient.id, newClientForm);
        alert('🎉 Datos del distribuidor B2B actualizados con éxito.');
      } else {
        await usersApi.createClient(newClientForm);
        alert('🎉 Distribuidor B2B registrado con éxito en el sistema.');
      }
      setNewClientForm({
        name: '',
        email: '',
        password: '',
        company_name: '',
        tax_id: '',
        billing_address: '',
        forwarder_address: '',
        pricing_tier_id: '',
        destination_country: 'USA',
        account_status: 'lead_new',
        followup_notes: '',
        last_contact_date: new Date().toISOString().split('T')[0]
      });
      setEditingClient(null);
      setCreatingClient(false);
      await loadClients();
    } catch (err) {
      alert(`❌ Error al guardar distribuidor: ${err.message}`);
    }
  };

  const handleDeleteClient = async (id) => {
    if (!confirm('⚠️ ¿Estás seguro de eliminar este distribuidor del sistema B2B?')) return;
    try {
      await usersApi.deleteClient(id);
      alert('🎉 Distribuidor eliminado con éxito.');
      await loadClients();
    } catch (err) {
      alert(`❌ Error al eliminar distribuidor: ${err.message}`);
    }
  };

  // -------------------------------------------------------
  // Lógica del Carrito
  // -------------------------------------------------------
  const validateCartAddition = (productId) => {
    const productToAdd = allProducts.find(p => p.id === productId);
    if (!productToAdd) return true;

    const targetCampaignId = productToAdd.campaign_id || null;
    const cartItemIds = Object.keys(cart);

    if (cartItemIds.length === 0) return true;

    for (const itemId of cartItemIds) {
      const existingProduct = allProducts.find(p => p.id === itemId);
      if (existingProduct) {
        const existingCampaignId = existingProduct.campaign_id || null;
        if (existingCampaignId !== targetCampaignId) {
          alert('⚠️ Restricción de preventa B2B:\nNo puedes mezclar productos de diferentes campañas de fabricación o productos regulares en el mismo pedido.\n\nPor favor realiza una orden independiente para cada tiraje o limpia tu carrito.');
          return false;
        }
      }
    }
    return true;
  };

  const handleAddToCart = (productId) => {
    if (!validateCartAddition(productId)) return;
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

  const handleSetCartQty = (productId, qty) => {
    if (!validateCartAddition(productId)) return;
    const parsedQty = parseInt(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setCart(prev => {
        const updated = { ...prev };
        delete updated[productId];
        return updated;
      });
      return;
    }
    const product = productList.find(p => p.id === productId);
    const maxStock = product ? (product.stock_physical_cases || 0) : 1000;
    const finalQty = Math.min(parsedQty, maxStock);
    setCart(prev => ({ ...prev, [productId]: finalQty }));
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

    const discountPolicy = isAdmin ? (tenantSettings.discount_policy || 'tier') : (tenantPublicInfo?.discount_policy || 'tier');

    let totalDiscountAmount = 0;

    if (discountPolicy === 'volume') {
      const sortedRules = [...skuVolumeRulesList].sort((a, b) => b.min_units - a.min_units);

      itemsDetail.forEach(item => {
        const unitsPerCase = parseInt(item.units_per_case) || 1;
        const totalUnits = item.qty * unitsPerCase;
        const itemSubtotal = parseFloat(item.price_per_case_usd) * item.qty;

        let itemDiscountPct = 0;
        for (const rule of sortedRules) {
          if (totalUnits >= rule.min_units) {
            itemDiscountPct = parseFloat(rule.discount_pct);
            break;
          }
        }

        totalDiscountAmount += itemSubtotal * (itemDiscountPct / 100);
      });
    } else {
      let volumeDiscountPercent = 0;
      VOLUME_DISCOUNTS.forEach(d => {
        if (totalItemsCases >= d.min_cases) volumeDiscountPercent = d.discount_percentage;
      });
      const volumeDiscountAmount = subtotal * (volumeDiscountPercent / 100);
      const subtotalAfterVolume = subtotal - volumeDiscountAmount;

      let categoryDiscountPercent = currentUser?.discount_percentage !== undefined ? parseFloat(currentUser.discount_percentage) : 0;
      const distributorDiscountAmount = subtotalAfterVolume * (categoryDiscountPercent / 100);

      totalDiscountAmount = volumeDiscountAmount + distributorDiscountAmount;
    }

    const finalTotal = subtotal - totalDiscountAmount;
    const effectiveDiscountPercent = subtotal > 0 ? ((totalDiscountAmount / subtotal) * 100) : 0;

    return { 
      subtotal, 
      discountPercent: effectiveDiscountPercent, 
      discountAmount: totalDiscountAmount, 
      finalTotal, 
      totalCases: totalItemsCases, 
      items: itemsDetail 
    };
  };

  const cartTotals = getCartTotals();

  const activeLogoUrl = isSuperAdmin 
    ? null 
    : (isAdmin ? tenantSettings.logo_url : tenantPublicInfo?.logo_url);

  // -------------------------------------------------------
  // Checkout
  // -------------------------------------------------------
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cartTotals.finalTotal < MOA_LIMIT) return;
    
    const formData = new FormData(e.target);
    const incoterm = formData.get('incoterm') || 'FOB China';
    
    setCheckoutLoading(true);
    try {
      const items = cartTotals.items.map(i => ({
        product_id: i.id,
        qty_cases: i.qty,
      }));

      const firstCartItem = cartTotals.items[0];
      const matchedProduct = allProducts.find(p => p.id === firstCartItem.id);
      const campaignId = matchedProduct ? matchedProduct.campaign_id : null;

      const res = await ordersApi.create(items, null, incoterm, campaignId);
      
      // Intentar cargar la info bancaria del tenant de forma pública y segura
      setLoadingBankDetails(true);
      try {
        const bankData = await tenantsApi.getCurrentBankDetails();
        setBankDetails(bankData);
      } catch (err) {
        console.error('Error al cargar datos bancarios del tenant:', err);
      } finally {
        setLoadingBankDetails(false);
      }

      setCreatedOrder(res.order);
      setCart({});
      setShowCart(false);
      setSelectedPaymentMethod('');
      setStripePaidSuccess(false);
      setShowPaymentModal(true); // Mostrar modal de selección de pago
      await loadOrders();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleRealStripePayment = async () => {
    if (!createdOrder) return;
    setSimulatingStripePayment(true);
    try {
      // 1. Obtener la sesión de Stripe Checkout real desde el backend
      const res = await ordersApi.payWithStripe(createdOrder.id, window.location.origin);
      if (res && res.url) {
        // 2. Redirigir al cliente al portal seguro de Stripe Checkout
        window.location.href = res.url;
      } else {
        throw new Error('No se recibió la URL de redirección de Stripe.');
      }
    } catch (err) {
      alert(`❌ Error al iniciar pago con Stripe: ${err.message}`);
    } finally {
      setSimulatingStripePayment(false);
    }
  };

  // -------------------------------------------------------
  // Renderizar la vista de impresión pública si se solicita
  // -------------------------------------------------------
  if (loadingPublicPrint) {
    return (
      <div style={{ background: '#0d0d0f', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--cyan-neon)' }}>⏳ Cargando Documento...</h2>
          <p style={{ color: '#888' }}>Preparando la vista de impresión oficial</p>
        </div>
      </div>
    );
  }

  if (publicPrintOrder) {
    const order = publicPrintOrder;
    const isInvoice = publicPrintDocType === 'invoice';
    const clientName = order.client_name || order.company_name;
    const clientEmail = order.client_email || '';

    return (
      <div className="public-print-container" style={{ background: '#fff', color: '#000', padding: '40px', fontFamily: 'Segoe UI, sans-serif', minHeight: '100vh', boxSizing: 'border-box' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body { background: #fff !important; color: #000 !important; padding: 0 !important; }
            .no-print { display: none !important; }
            .public-print-container { padding: 0 !important; }
          }
        `}} />
        
        <div className="no-print" style={{ background: '#f5f5f7', borderBottom: '1px solid #ddd', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderRadius: '8px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#111' }}>Modo de Visualización de Documento B2B</h3>
            <span style={{ fontSize: '12px', color: '#666' }}>Esta vista está formateada para imprimir o exportar como PDF directamente en tu navegador.</span>
          </div>
          <button 
            onClick={() => window.print()} 
            style={{ background: '#00bcd4', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
          >
            🖨️ Imprimir / Guardar como PDF
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #00bcd4', paddingBottom: '20px', marginBottom: '30px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: '#00bcd4', fontWeight: '800' }}>
              {isInvoice ? 'COMMERCIAL INVOICE' : 'COMMERCIAL PACKING LIST'}
            </h1>
            <span style={{ fontSize: '14px', color: '#555' }}>Gosu Accessories Ltd. / Shenzhen Export Warehouse, China</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#111' }}>Orden: {order.po_number || order.id.split('-')[0].toUpperCase()}</span><br />
            <span style={{ fontSize: '13px', color: '#666' }}>Fecha: {new Date(order.created_at).toLocaleDateString('es-ES')}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px', background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <div>
            <h4 style={{ margin: '0 0 8px', color: '#00bcd4', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>Destinatario (Cliente B2B)</h4>
            <strong style={{ fontSize: '15px', color: '#111' }}>{clientName}</strong><br />
            {clientEmail && <span style={{ color: '#555', fontSize: '13px' }}>{clientEmail}</span>}<br />
            <span style={{ color: '#666', fontSize: '13px' }}>Tax ID: {order.tax_id || '-'}</span>
          </div>
          <div>
            <h4 style={{ margin: '0 0 8px', color: '#00bcd4', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>Dirección de Facturación / Envío</h4>
            <span style={{ color: '#111', fontSize: '13px', display: 'block', marginBottom: '4px' }}><strong>Factura:</strong> {order.billing_address || '-'}</span>
            <span style={{ color: '#111', fontSize: '13px', display: 'block' }}><strong>Forwarder:</strong> {order.forwarder_address || '-'}</span>
          </div>
        </div>

        {isInvoice ? (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
              <thead>
                <tr style={{ background: '#333', color: '#fff' }}>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left' }}>Producto</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '100px' }}>SKU</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '80px' }}>Cajas</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right', width: '120px' }}>Precio/Caja</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right', width: '140px' }}>Total USD</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 10px', fontSize: '13.5px', fontWeight: '600' }}>{item.name}</td>
                    <td style={{ padding: '12px 10px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center' }}>{item.sku}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'center' }}>{item.qty_cases}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'right' }}>${parseFloat(item.price_case_usd || item.price_per_case_usd || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'right', fontWeight: 'bold' }}>${parseFloat(item.total_item_usd || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '16px', borderTop: '2px solid #333', paddingTop: '15px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#555' }}>Total Comercial FOB: </span>
                <strong style={{ fontSize: '20px', color: '#000', marginLeft: '10px' }}>${parseFloat(order.total_usd || order.total_amount_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
              <thead>
                <tr style={{ background: '#333', color: '#fff' }}>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left' }}>Descripción del Producto</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '120px' }}>SKU</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '100px' }}>Cajas Master</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right', width: '120px' }}>Total Unidades</th>
                  <th style={{ padding: '12px 10px', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '140px' }}>Volumen (CBM)</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, idx) => {
                  const totalUnits = (item.qty_cases || 0) * (item.units_per_case || 100);
                  const itemCbm = (item.qty_cases || 0) * (parseFloat(item.case_cbm) || 0.024);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px 10px', fontSize: '13.5px', fontWeight: '600' }}>{item.name}</td>
                      <td style={{ padding: '12px 10px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center' }}>{item.sku}</td>
                      <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'center' }}>{item.qty_cases}</td>
                      <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'right' }}>{totalUnits.toLocaleString('en-US')} uds</td>
                      <td style={{ padding: '12px 10px', fontSize: '13.5px', textAlign: 'center' }}>{itemCbm.toFixed(4)} CBM</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '15px', borderTop: '2px solid #333', paddingTop: '15px', gap: '40px' }}>
              <div>Cajas Totales: <strong>{order.total_cases || order.items?.reduce((a, c) => a + c.qty_cases, 0)}</strong></div>
              <div>Volumen Total: <strong>{parseFloat(order.total_cbm || 0).toFixed(4)} CBM</strong></div>
            </div>
          </div>
        )}

        <div className="footer" style={{ textAlign: 'center', marginTop: '80px', fontSize: '12px', color: '#666', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          Documento comercial auto-generado por la plataforma B2B de Gosu Accessories Ltd.<br />
          Soporte: info@gosu.com | Shenzhen Port Logistics Hub, China
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // Si no está autenticado, mostrar Login
  // -------------------------------------------------------
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // -------------------------------------------------------
  // Si debe cambiar su contraseña por primera vez, forzar cambio
  // -------------------------------------------------------
  if (currentUser && currentUser.must_change_password) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0d0d0f',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div className="glass-panel" style={{
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.5), 0 0 2px var(--cyan-neon) inset',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '450px',
          padding: '40px',
          boxSizing: 'border-box',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '800', margin: '0 0 10px 0', textShadow: '0 0 10px rgba(0, 188, 212, 0.3)' }}>Establece tu nueva contraseña</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '30px' }}>
            Para garantizar la seguridad de tu cuenta B2B, es obligatorio que cambies tu contraseña temporal en tu primer inicio de sesión o tras un reseteo administrativo.
          </p>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const currentPass = e.target.currentPass.value;
            const newPass = e.target.newPass.value;
            const confirmPass = e.target.confirmPass.value;

            if (newPass.length < 6) {
              alert('⚠️ La nueva contraseña debe tener al menos 6 caracteres.');
              return;
            }
            if (newPass !== confirmPass) {
              alert('⚠️ Las contraseñas no coinciden.');
              return;
            }

            try {
              await auth.changePassword(currentPass, newPass);
              
              // Actualizar el estado local y localStorage
              const updatedUser = { ...currentUser, must_change_password: false };
              localStorage.setItem('gosu_user', JSON.stringify(updatedUser));
              setCurrentUser(updatedUser);
              
              alert('🎉 Contraseña establecida con éxito. Bienvenido al sistema.');
            } catch (err) {
              alert(`❌ Error: ${err.message}`);
            }
          }}>
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>Contraseña Temporal/Actual</label>
              <input
                type="password"
                name="currentPass"
                required
                placeholder="Contraseña con la que ingresaste"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>Nueva Contraseña</label>
              <input
                type="password"
                name="newPass"
                required
                placeholder="Mínimo 6 caracteres"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '30px', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>Confirmar Nueva Contraseña</label>
              <input
                type="password"
                name="confirmPass"
                required
                placeholder="Repite la nueva contraseña"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              className="glow-btn glow-btn-cyan"
              style={{ width: '100%', padding: '14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              🔒 Guardar y Acceder
            </button>

            <button
              type="button"
              onClick={() => {
                auth.logout();
                setCurrentUser(null);
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--pink-neon)', marginTop: '20px', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancelar e iniciar sesión con otra cuenta
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // Render Principal
  // -------------------------------------------------------
  return (
    <div className="app-container">
      {/* Barra de Impersonación para Soporte Técnico */}
      {isImpersonating && (
        <div style={{ background: 'var(--orange-neon)', color: '#000', padding: '10px 24px', fontWeight: '800', textAlign: 'center', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0 }}>
          <span>🔴 Sesión de Soporte: Impersonando a <strong>{currentUser.name}</strong> ({currentUser.tenant_name})</span>
          <button 
            onClick={handleStopImpersonation} 
            style={{ background: '#000', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
          >
            Volver a mi sesión Super Admin
          </button>
        </div>
      )}

      {/* Barra de Impersonación para Tenant Admin (Ingresar como Cliente) */}
      {isTenantImpersonating && (
        <div style={{ background: 'var(--cyan-neon)', color: '#000', padding: '10px 24px', fontWeight: '800', textAlign: 'center', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0 }}>
          <span>👁️ Navegando como: <strong>{currentUser.name}</strong> ({currentUser.email}) | Distribuidor B2B</span>
          <button 
            onClick={handleStopTenantImpersonation} 
            style={{ background: '#000', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
          >
            Volver a mi cuenta Administrador
          </button>
        </div>
      )}

      <div className="layout-wrapper" style={{ marginTop: (isImpersonating || isTenantImpersonating) ? '43px' : 0 }}>
        {/* Sidebar Lateral */}
        <aside className="premium-sidebar">
          <div style={{ marginBottom: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {activeLogoUrl ? (
              <img 
                src={activeLogoUrl} 
                alt="Logo" 
                style={{ maxHeight: '55px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', padding: '4px' }} 
              />
            ) : (
              <h1 className="logo-text" style={{ margin: 0, fontSize: '20px' }}>
                {isSuperAdmin ? 'GOSU SAAS' : currentUser.tenant_name?.toUpperCase() || 'GOSU B2B'}
              </h1>
            )}
            {!isSuperAdmin && (
              <span className="badge badge-cyan" style={{ fontSize: '9px' }}>{currentUser.tenant_slug}</span>
            )}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
            {isSuperAdmin ? (
              <>
                <span className={`nav-link-btn ${activeTab === 'saas-tenants' ? 'active' : ''}`} onClick={() => setActiveTab('saas-tenants')}>
                  🏢 Inquilinos (Tenants)
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-users' ? 'active' : ''}`} onClick={() => setActiveTab('saas-users')}>
                  👥 Usuarios Globales
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-billing' ? 'active' : ''}`} onClick={() => setActiveTab('saas-billing')}>
                  💳 Planes & Billing
                </span>
                <span className={`nav-link-btn ${activeTab === 'saas-audit' ? 'active' : ''}`} onClick={() => setActiveTab('saas-audit')}>
                  📋 Auditoría & Logs
                </span>
              </>
            ) : (
              <>
                {isAdmin && (
                  <span className={`nav-link-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                    📈 DashBoard
                  </span>
                )}
                <span className={`nav-link-btn ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
                  📂 {isAdmin ? 'Productos' : 'Catálogo B2B'}
                </span>
                {!isAdmin && (
                  <>
                    <span className={`nav-link-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                      📜 Mis Pedidos & Bóveda
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'campaigns' ? 'active' : ''}`} onClick={() => setActiveTab('campaigns')}>
                      📅 Preventas / Print Runs
                    </span>
                  </>
                )}
                {isAdmin && (
                  <>
                    <span className={`nav-link-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                      📦 Inventario & Stock
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                      📊 Registro de Ventas
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
                      💳 Cobranzas B2B
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                      🏭 Fábrica & Producción
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'campaigns' ? 'active' : ''}`} onClick={() => setActiveTab('campaigns')}>
                      📅 Preventas / Print Runs
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>
                      👥 Clientes & Leads
                    </span>
                    <span className={`nav-link-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
                      ⚙️ Configuración
                    </span>
                  </>
                )}
              </>
            )}
          </nav>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <div style={{ color: '#fff', fontWeight: '700', wordBreak: 'break-all' }}>{currentUser.name}</div>
              <div style={{ fontSize: '10px', marginTop: '2px', wordBreak: 'break-all', opacity: 0.7 }}>{currentUser.email}</div>
              <span className={`badge ${isSuperAdmin ? 'badge-pink' : isAdmin ? 'badge-pink' : 'badge-cyan'}`} style={{ fontSize: '8px', padding: '1px 4px', marginTop: '6px' }}>
                {isSuperAdmin ? 'SUPER ADMIN' : isAdmin ? 'ADMIN' : currentUser.client_category?.replace('_', ' ')}
              </span>
            </div>
            <button onClick={() => setActiveTab('profile')} className="btn-glass-cyan" style={{ width: '100%', padding: '8px', fontSize: '12px', marginBottom: '-4px' }}>
              ⚙️ Mi Perfil
            </button>
            <button onClick={handleLogout} className="btn-glass-pink" style={{ width: '100%', padding: '8px', fontSize: '12px' }}>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Contenido Principal */}
        <div className="main-layout">
          {/* Header Bar */}
          <header className="premium-header">
            {/* Logo en versión mobile */}
            <div className="mobile-only-logo" style={{ display: 'none' }}>
              {activeLogoUrl ? (
                <img src={activeLogoUrl} alt="Logo" style={{ maxHeight: '35px', objectFit: 'contain' }} />
              ) : (
                <span className="logo-text" style={{ fontSize: '16px', fontWeight: '900' }}>
                  {isSuperAdmin ? 'GOSU SAAS' : currentUser.tenant_name?.toUpperCase() || 'GOSU B2B'}
                </span>
              )}
            </div>
            <div className="premium-header-content">
              {!isSuperAdmin && (
                <button className="btn-glass-neon" onClick={() => setShowCart(true)}>
                  🛒 Carrito ({cartTotals.totalCases} {cartTotals.totalCases === 1 ? 'Caja' : 'Cajas'})
                </button>
              )}
            </div>
          </header>

          {/* Mobile Floating Nav */}
          <div className="floating-mobile-nav">
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
                {!isAdmin && (
                  <span className={`mobile-nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>📜 Pedidos</span>
                )}
                {isAdmin && (
                  <>
                    <span className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📈 Dash</span>
                    <span className={`mobile-nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>📦 Stock</span>
                    <span className={`mobile-nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>📊 Ventas</span>
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
                    const tenantAdmin = globalUsersList.find(u => u.tenant_slug === t.slug && u.role === 'tenant_admin');
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
                          u.role === 'super_admin' ? 'badge-pink' : u.role === 'tenant_admin' ? 'badge-cyan' : 'badge-orange'
                        }`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {u.role === 'super_admin' ? (
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
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>
                  {isAdmin ? '⚙️ Gestión de Productos' : '📂 Catálogo Mayorista'}
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {isAdmin
                    ? 'Crea, edita, actualiza y monitorea los parámetros técnicos y costos confidenciales de tus productos.'
                    : 'Precios especiales para distribuidores despachados directamente de fábrica.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {isAdmin && (
                  <button 
                    onClick={() => { setCreatingProduct(prev => !prev); setEditingProduct(null); }}
                    className="btn-pink"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    {creatingProduct ? 'Cerrar Formulario' : '➕ Registrar Producto'}
                  </button>
                )}
                {!isAdmin && (
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
                )}
                <input
                  type="text"
                  id="product-search"
                  placeholder="Buscar por SKU, Nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 16px', borderRadius: '8px', width: '200px' }}
                />
              </div>
            </div>

            {currentUser && currentUser.role === 'b2b_client' && (
              <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', background: 'rgba(0, 232, 255, 0.05)', border: '1px solid rgba(0, 232, 255, 0.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🏷️</span>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '15px', color: 'var(--cyan-neon)', fontWeight: '800' }}>
                    Tu Nivel de Precios Comercial: {currentUser.tier_name || 'Precio Base Comercial'}
                  </h3>
                  <p style={{ margin: '0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Beneficios activos: <strong>-{currentUser.discount_percentage || 0}% de descuento</strong> en todo el catálogo y un Monto Mínimo de Orden (MOV) de <strong>${parseFloat(currentUser.min_order_amount || 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>.
                    {currentUser.only_master_cases && <span style={{ color: 'var(--orange-neon)', marginLeft: '6px', fontWeight: '600' }}>📦 Compras restringidas únicamente a Master Cases (cajas enteras).</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Formulario de creación/edición de Producto (Solo Admin del Tenant) */}
            {isAdmin && (creatingProduct || editingProduct) && (
              <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '24px', color: editingProduct ? 'var(--cyan-neon)' : 'var(--pink-neon)', letterSpacing: '0.5px' }}>
                  {editingProduct ? `✏️ Editar Producto: ${editingProduct.name}` : '➕ Registrar Nuevo Producto'}
                </h2>
                
                <form onSubmit={handleCreateOrUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Seccion 1: Datos Comerciales */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--cyan-neon)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      🛍️ Datos de Venta Comercial
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Nombre del Producto *</label>
                        <input
                          type="text"
                          placeholder="Ej. GOSU Matte Sleeves Standard - Black"
                          value={newProduct.name}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>SKU Comercial *</label>
                        <input
                          type="text"
                          placeholder="Ej. GSL-MAT-BK"
                          value={newProduct.sku}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, sku: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Categoría *</label>
                        <select
                          value={newProduct.category}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          {categoriesList.map(cat => (
                            <option key={cat.id} value={cat.slug}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Campaña / Print Run (Pre-venta)</label>
                        <select
                          value={newProduct.campaign_id || ''}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, campaign_id: e.target.value || null }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="">-- Ninguna (Catálogo Regular) --</option>
                          {campaignsList.map(camp => (
                            <option key={camp.id} value={camp.id}>{camp.name} ({camp.status})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Precio por Caja Master (USD) *</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ej. 250.00"
                          value={newProduct.price_per_case_usd}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, price_per_case_usd: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Unidades por Caja Master *</label>
                        <input
                          type="number"
                          placeholder="Ej. 100"
                          value={newProduct.units_per_case}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, units_per_case: parseInt(e.target.value) || 1 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                          Medida Final Comercial {isSleevesCategory(newProduct.category) && <span style={{ color: 'var(--pink-neon)' }}>* (Requerido para Sleeves)</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 66x91 mm"
                          value={newProduct.finished_measurements}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, finished_measurements: e.target.value }))}
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: isSleevesCategory(newProduct.category) && !newProduct.finished_measurements ? '1px solid var(--pink-neon)' : '1px solid var(--border-color)',
                            color: '#fff',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            width: '100%',
                            boxSizing: 'border-box',
                            boxShadow: isSleevesCategory(newProduct.category) && !newProduct.finished_measurements ? '0 0 5px rgba(255, 9, 187, 0.3)' : 'none'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                          Color {isSleevesCategory(newProduct.category) && <span style={{ color: 'var(--pink-neon)' }}>* (Requerido para Sleeves)</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Clear, Matte Black"
                          value={newProduct.color || ''}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, color: e.target.value }))}
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: isSleevesCategory(newProduct.category) && !newProduct.color ? '1px solid var(--pink-neon)' : '1px solid var(--border-color)',
                            color: '#fff',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            width: '100%',
                            boxSizing: 'border-box',
                            boxShadow: isSleevesCategory(newProduct.category) && !newProduct.color ? '0 0 5px rgba(255, 9, 187, 0.3)' : 'none'
                          }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Imagen Referencial URL</label>
                        <input
                          type="url"
                          placeholder="https://ejemplo.com/imagen.jpg"
                          value={newProduct.image_url}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, image_url: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Descripción Comercial para Clientes B2B</label>
                        <textarea
                          placeholder="Introduce los detalles descriptivos del producto para el catálogo..."
                          value={newProduct.commercial_description}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, commercial_description: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', height: '60px', resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seccion 2: Datos de Fabricacion (Confidenciales) */}
                  <div style={{ background: 'rgba(255, 9, 187, 0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255, 9, 187, 0.1)' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--pink-neon)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      🔒 Datos de Fabricación (Confidenciales Internos)
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Fábrica Proveedora</label>
                        <input
                          type="text"
                          placeholder="Ej. Dongguan Card Supplies Factory"
                          value={newProduct.factory_name}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, factory_name: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>SKU de Fábrica (Código del Proveedor)</label>
                        <input
                          type="text"
                          placeholder="Ej. DG-SLV-M01-BK"
                          value={newProduct.factory_sku}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, factory_sku: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Costo de Fabricación por Unidad / Pack (USD) <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>— el costo por caja se calcula automáticamente × unidades</span></label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ej. 95.00"
                          value={newProduct.factory_cost_per_case_usd}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, factory_cost_per_case_usd: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Códigos de Color Pantone (PMS)</label>
                        <input
                          type="text"
                          placeholder="Ej. Pantone Black 6C, 293C"
                          value={newProduct.pantone_codes}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, pantone_codes: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                          Medida de Corte en Producción {isSleevesCategory(newProduct.category) && <span style={{ color: 'var(--pink-neon)' }}>* (Requerido para Sleeves)</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 68x93 mm"
                          value={newProduct.cut_measurements}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, cut_measurements: e.target.value }))}
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: isSleevesCategory(newProduct.category) && !newProduct.cut_measurements ? '1px solid var(--pink-neon)' : '1px solid var(--border-color)',
                            color: '#fff',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            width: '100%',
                            boxSizing: 'border-box',
                            boxShadow: isSleevesCategory(newProduct.category) && !newProduct.cut_measurements ? '0 0 5px rgba(255, 9, 187, 0.3)' : 'none'
                          }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Notas Internas de Fabricación</label>
                        <textarea
                          placeholder="Ej. Controlar opacidad mediante doble extrusión. Temperatura de sellado: 145C..."
                          value={newProduct.fabrication_notes}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, fabrication_notes: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', height: '60px', resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>📁 Carpeta de Archivos de Producción (Link a Drive/Dropbox con etiquetas y diseños de empaque)</label>
                        <input
                          type="url"
                          placeholder="Ej. https://drive.google.com/drive/folders/..."
                          value={newProduct.production_files_url || ''}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, production_files_url: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seccion 3: Logística e Inventarios */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--cyan-neon)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      📦 Logística de Master Case e Inventarios
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Peso Caja Master (kg) *</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ej. 12.50"
                          value={newProduct.case_weight_kg}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, case_weight_kg: parseFloat(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Largo Caja Master (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ej. 45.0"
                          value={newProduct.case_length_cm}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, case_length_cm: parseFloat(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Ancho Caja Master (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ej. 35.0"
                          value={newProduct.case_width_cm}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, case_width_cm: parseFloat(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Alto Caja Master (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ej. 25.0"
                          value={newProduct.case_height_cm}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, case_height_cm: parseFloat(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Stock Físico (Cajas) *</label>
                        <input
                          type="number"
                          value={newProduct.stock_physical_cases}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, stock_physical_cases: parseInt(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Stock En Producción *</label>
                        <input
                          type="number"
                          value={newProduct.stock_in_production_cases}
                          required
                          onChange={(e) => setNewProduct(prev => ({ ...prev, stock_in_production_cases: parseInt(e.target.value) || 0 }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(null);
                        setCreatingProduct(false);
                        setNewProduct({
                          name: '', sku: '', category: categoriesList[0]?.slug || '',
                          image_url: '', commercial_description: '', price_per_case_usd: '',
                          units_per_case: 100, finished_measurements: '',
                          factory_name: '', factory_sku: '', factory_cost_per_case_usd: '',
                          pantone_codes: '', cut_measurements: '', fabrication_notes: '',
                          case_weight_kg: 10, case_length_cm: 40, case_width_cm: 30, case_height_cm: 20,
                          stock_physical_cases: 0, stock_in_production_cases: 0, production_files_url: ''
                        });
                      }}
                      className="btn-glass"
                      style={{ padding: '12px 24px', fontSize: '14px' }}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn-glass-neon" style={{ padding: '12px 32px', fontSize: '14px' }}>
                      {editingProduct ? '💾 Guardar Cambios' : '🚀 Registrar Producto'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {isAdmin ? (
              <div>
                {/* Panel de Filtros Avanzados para Admin */}
                <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Categoría</label>
                    <select
                      value={adminFilterCategory}
                      onChange={(e) => setAdminFilterCategory(e.target.value)}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '160px' }}
                    >
                      <option value="all">Todas las Categorías</option>
                      {categoriesList.map(cat => (
                        <option key={cat.id} value={cat.slug}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Estado del Inventario</label>
                    <select
                      value={adminFilterStockStatus}
                      onChange={(e) => setAdminFilterStockStatus(e.target.value)}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '180px' }}
                    >
                      <option value="all">Todos los Stocks</option>
                      <option value="out_of_stock">⚠️ Sin Stock Físico</option>
                      <option value="low_stock">⚠️ Stock Bajo (&lt;10 cajas)</option>
                      <option value="in_production">⚙️ En Producción activa</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Fábrica Origen</label>
                    <select
                      value={adminFilterFactory}
                      onChange={(e) => setAdminFilterFactory(e.target.value)}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '180px' }}
                    >
                      <option value="all">Todas las Fábricas</option>
                      {(() => {
                        const factories = allProducts
                          .map(p => p.factory_name)
                          .filter(name => name && name.trim() !== '');
                        const uniqueFactories = Array.from(new Set(factories));
                        return uniqueFactories.map(fac => (
                          <option key={fac} value={fac}>{fac}</option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto', gap: '8px' }}>
                    {selectedProductIds.length > 0 && (
                      <button
                        onClick={handleBulkDeleteProducts}
                        className="btn-glass-pink"
                        style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px', height: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 9, 187, 0.15)', border: '1px solid var(--pink-neon)', color: 'var(--pink-neon)', fontWeight: 'bold' }}
                      >
                        🗑️ Eliminar Seleccionados ({selectedProductIds.length})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setAdminFilterCategory('all');
                        setAdminFilterStockStatus('all');
                        setAdminFilterFactory('all');
                        setSearchQuery('');
                        setSelectedProductIds([]);
                      }}
                      className="btn-glass"
                      style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px', height: '36px' }}
                    >
                      Limpiar Filtros
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '8px' }}>
                      Resultados: <strong>{productList.length}</strong> productos
                    </span>
                  </div>
                </div>

                {/* Tabla de Gestión Avanzada para Admin */}
                {productList.length === 0 ? (
                  <div className="glass-panel" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    No se encontraron productos con los filtros aplicados.
                  </div>
                ) : (
                  <div className="glass-panel" style={{ overflowX: 'auto', padding: '0', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1150px', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', fontWeight: '700' }}>
                          <th style={{ padding: '12px', width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={productList.length > 0 && selectedProductIds.length === productList.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds(productList.map(p => p.id));
                                } else {
                                  setSelectedProductIds([]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                          <th style={{ padding: '12px' }}>Miniatura</th>
                          <th style={{ padding: '12px' }}>Producto / SKU</th>
                          <th style={{ padding: '12px' }}>Categoría</th>
                          <th style={{ padding: '12px' }}>Detalles Técnicos</th>
                          <th style={{ padding: '12px' }}>Fábrica & SKU</th>
                          <th style={{ padding: '12px' }}>Costo Fábrica (USD)</th>
                          <th style={{ padding: '12px' }}>Precio B2B (Caja)</th>
                          <th style={{ padding: '12px' }}>Inventario Físico / Prod</th>
                          <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productList.map(product => {
                          const costPerUnit = parseFloat(product.factory_cost_per_case_usd || 0);
                          const units = parseInt(product.units_per_case) || 1;
                          const calculatedCostPerCase = costPerUnit * units;
                          
                          return (
                            <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s', background: selectedProductIds.includes(product.id) ? 'rgba(0, 232, 255, 0.03)' : 'transparent' }} className="table-row-hover">
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedProductIds.includes(product.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductIds(prev => [...prev, product.id]);
                                    } else {
                                      setSelectedProductIds(prev => prev.filter(id => id !== product.id));
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.name} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain', background: 'rgba(255,255,255,0.02)' }} />
                                ) : (
                                  <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '700', color: '#fff' }}>{product.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontFamily: 'monospace', marginTop: '2px' }}>{product.sku}</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span className="badge badge-pink" style={{ fontSize: '9px', textTransform: 'uppercase' }}>{product.category}</span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {product.finished_measurements && <div>📏 {product.finished_measurements}</div>}
                                {product.color && <div>🎨 {product.color}</div>}
                                <div>📦 {product.units_per_case} uds / caja</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '600', color: '#fff' }}>{product.factory_name || 'N/A'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{product.factory_sku || 'N/A'}</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '700', color: 'var(--pink-neon)' }}>
                                  ${calculatedCostPerCase.toFixed(2)} / caja
                                </div>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                  ${costPerUnit.toFixed(4)} / unidad
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--green-neon)', fontSize: '14px' }}>
                                ${parseFloat(product.price_per_case_usd).toFixed(2)}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '700', color: product.stock_physical_cases === 0 ? 'var(--pink-neon)' : product.stock_physical_cases < 10 ? 'var(--orange-neon)' : 'var(--green-neon)' }}>
                                  {product.stock_physical_cases === 0 ? '⚠️ Agotado' : `${product.stock_physical_cases} cajas`}
                                </div>
                                {product.stock_in_production_cases > 0 && (
                                  <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', marginTop: '2px' }}>
                                    ⚙️ {product.stock_in_production_cases} en producción
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => {
                                      setEditingProduct(product);
                                      setCreatingProduct(false);
                                      setNewProduct({
                                        name: product.name,
                                        sku: product.sku,
                                        category: product.category,
                                        image_url: product.image_url || '',
                                        commercial_description: product.commercial_description || '',
                                        price_per_case_usd: product.price_per_case_usd,
                                        units_per_case: product.units_per_case,
                                        finished_measurements: product.finished_measurements || '',
                                        factory_name: product.factory_name || '',
                                        factory_sku: product.factory_sku || '',
                                        factory_cost_per_case_usd: product.factory_cost_per_case_usd || '',
                                        pantone_codes: product.pantone_codes || '',
                                        cut_measurements: product.cut_measurements || '',
                                        fabrication_notes: product.fabrication_notes || '',
                                        case_weight_kg: product.case_weight_kg,
                                        case_length_cm: product.case_length_cm,
                                        case_width_cm: product.case_width_cm,
                                        case_height_cm: product.case_height_cm,
                                        stock_physical_cases: product.stock_physical_cases || 0,
                                        stock_in_production_cases: product.stock_in_production_cases || 0,
                                        production_files_url: product.production_files_url || ''
                                      });
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="btn-glass-neon"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    title="Editar parámetros del producto"
                                  >
                                    ✏️ Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(product.id)}
                                    className="btn-glass-pink"
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    title="Eliminar del catálogo"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div>
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
                  const isExpanded = expandedFactoryProductId === product.id;
                  const campaign = product.campaign_id ? campaignsList.find(c => c.id === product.campaign_id) : null;
                  const isReservationsClosed = campaign && campaign.status !== 'open';
                  
                  return (
                    <div key={product.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '440px', position: 'relative', border: isExpanded ? '1px solid var(--pink-neon)' : '1px solid rgba(255,255,255,0.08)' }}>
                      {campaign && (
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          background: campaign.status === 'open' ? 'rgba(0, 232, 255, 0.9)' :
                                      campaign.status === 'production' ? 'rgba(255, 152, 0, 0.9)' : 'rgba(76, 175, 80, 0.9)',
                          color: '#000',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: '800',
                          zIndex: 2,
                          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                          textTransform: 'uppercase'
                        }}>
                          {campaign.status === 'open' ? '📅 Preventa' :
                           campaign.status === 'production' ? '🏭 En Prod.' : '✅ Finalizada'}
                        </div>
                      )}
                      <div>
                        {/* Imagen del Producto con Glow Halo Dinámico Adaptable */}
                        <div style={{ 
                          width: '100%', 
                          aspectRatio: '1 / 1', 
                          background: 'linear-gradient(135deg, rgba(10,12,18,0.6) 0%, rgba(20,24,36,0.8) 100%)', 
                          border: product.category === 'sleeves' ? '1px solid rgba(0,232,255,0.25)' :
                                  product.category === 'binders' ? '1px solid rgba(255,9,187,0.25)' :
                                  '1px solid rgba(255,92,0,0.25)', 
                          borderRadius: '12px', 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center', 
                          marginBottom: '16px', 
                          overflow: 'hidden', 
                          position: 'relative',
                          boxShadow: product.category === 'sleeves' ? 'inset 0 0 20px rgba(0,0,0,0.6), 0 0 15px rgba(0,232,255,0.1)' :
                                     product.category === 'binders' ? 'inset 0 0 20px rgba(0,0,0,0.6), 0 0 15px rgba(255,9,187,0.1)' :
                                     'inset 0 0 20px rgba(0,0,0,0.6), 0 0 15px rgba(255,92,0,0.1)'
                        }}>
                          {/* Halo de luz neon difuso detrás de la foto */}
                          <div style={{
                            position: 'absolute',
                            width: '65%',
                            height: '65%',
                            borderRadius: '50%',
                            background: product.category === 'sleeves' ? 'radial-gradient(circle, rgba(0,232,255,0.18) 0%, transparent 70%)' :
                                        product.category === 'binders' ? 'radial-gradient(circle, rgba(255,9,187,0.18) 0%, transparent 70%)' :
                                        'radial-gradient(circle, rgba(255,92,0,0.18) 0%, transparent 70%)',
                            filter: 'blur(30px)',
                            zIndex: 1,
                            pointerEvents: 'none'
                          }} />

                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} style={{ width: '85%', height: '85%', objectFit: 'contain', zIndex: 2, position: 'relative', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))' }} />
                          ) : (
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="rgba(0, 232, 255, 0.3)" strokeWidth="1" style={{ zIndex: 2 }}>
                              <rect x="4" y="2" width="16" height="20" rx="2" />
                              <line x1="8" y1="6" x2="16" y2="6" />
                              <line x1="8" y1="10" x2="16" y2="10" />
                            </svg>
                          )}
                          <span className="badge badge-pink" style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '9px', zIndex: 3 }}>
                            {product.category}
                          </span>
                        </div>

                        <h3 style={{ fontSize: '18px', margin: '0 0 6px', fontWeight: '800', color: '#fff', lineHeight: '1.2' }}>{product.name}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'monospace', marginBottom: '6px' }}>SKU: {product.sku}</p>
                        
                        {/* Descripción Comercial */}
                        {product.commercial_description && (
                          <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', lineHeights: '1.4', marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {product.commercial_description}
                          </p>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px', fontSize: '12px' }}>
                          {product.finished_measurements && (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              📏 Medida: <strong>{product.finished_measurements}</strong>
                            </span>
                          )}
                          {product.color && (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              🎨 Color: <strong>{product.color}</strong>
                            </span>
                          )}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            📦 Contenido: <strong>{product.units_per_case} unidades / caja</strong>
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Disponible: <strong style={{ color: product.stock_physical_cases > 10 ? 'var(--green-neon)' : product.stock_physical_cases > 0 ? 'var(--orange-neon)' : 'var(--pink-neon)' }}>
                              {product.stock_physical_cases > 0 
                                ? `${product.stock_physical_cases} cajas` 
                                : (product.stock_in_production_cases || 0) > 0 
                                  ? `0 físicas (⚙️ ${product.stock_in_production_cases} en producción)` 
                                  : '⚠️ Agotado'}
                            </strong>
                          </span>
                        </div>

                        {/* Ficha de Fabricación Expandible (Solo para Administradores) */}
                        {isAdmin && (
                          <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <button
                              type="button"
                              onClick={() => setExpandedFactoryProductId(isExpanded ? null : product.id)}
                              className="btn-glass"
                              style={{ width: '100%', padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: isExpanded ? 'var(--pink-neon)' : '#fff', border: isExpanded ? '1px solid var(--pink-neon)' : '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              {isExpanded ? '🔒 Ocultar Ficha de Fábrica' : '🔒 Ver Ficha de Fábrica (Confidencial)'}
                            </button>

                            {isExpanded && (
                              <div className="glass-panel" style={{ marginTop: '10px', padding: '14px', background: 'rgba(255,9,187,0.02)', border: '1px solid rgba(255,9,187,0.15)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ color: 'var(--pink-neon)', fontWeight: '700', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Detalles de Producción en China</div>
                                <div>🏭 Fábrica: <strong style={{ color: '#fff' }}>{product.factory_name || 'Sin asignar'}</strong></div>
                                <div>🔖 SKU Proveedor: <strong style={{ color: '#fff' }}>{product.factory_sku || 'N/A'}</strong></div>
                                <div>💰 Costo Fábrica: <strong style={{ color: 'var(--green-neon)' }}>${parseFloat(product.factory_cost_per_case_usd || 0).toFixed(4)} USD / unidad</strong> → <strong style={{ color: 'var(--cyan-neon)' }}>${(parseFloat(product.factory_cost_per_case_usd || 0) * (product.units_per_case || 1)).toFixed(2)} USD / caja</strong></div>
                                <div>🎨 Pantone: <strong style={{ color: '#fff' }}>{product.pantone_codes || 'N/A'}</strong></div>
                                <div>📐 Corte Fábrica: <strong style={{ color: '#fff' }}>{product.cut_measurements || 'N/A'}</strong></div>
                                <div>⚙️ Stock en Producción: <strong style={{ color: 'var(--cyan-neon)' }}>{product.stock_in_production_cases || 0} cajas</strong></div>
                                {product.production_files_url && (
                                  <div>📁 Archivos Diseño/Etiquetas: <a href={product.production_files_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan-neon)', fontWeight: '700', textDecoration: 'underline' }}>📂 Ver carpeta de archivos</a></div>
                                )}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px', color: 'var(--cyan-neon)' }}>Logística de Despacho (CBM)</div>
                                <div>⚖️ Peso Master Case: <strong>{product.case_weight_kg} kg</strong></div>
                                <div>📏 Dimensiones Caja: <strong>{product.case_length_cm}x{product.case_width_cm}x{product.case_height_cm} cm</strong></div>
                                <div>🚢 Volumen Calculado: <strong style={{ color: 'var(--cyan-neon)' }}>{parseFloat(product.case_cbm).toFixed(5)} CBM</strong></div>
                                {product.production_files_url && (
                                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px' }}>
                                    📝 <em style={{ fontStyle: 'normal', color: 'var(--text-muted)' }}>Notas: {product.fabrication_notes}</em>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <span style={{ fontSize: '22px', fontWeight: '900', color: 'var(--cyan-neon)' }}>${priceNum.toFixed(2)}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}> / caja</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(FOB China)</span>
                        </div>

                        {/* Controles de Carrito para Clientes B2B */}
                        {!isAdmin && (
                          isReservationsClosed ? (
                            <button
                              className="btn-glass"
                              style={{ width: '100%', padding: '10px 16px', fontSize: '13px', cursor: 'not-allowed', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)' }}
                              disabled
                            >
                              🔒 Reservas Cerradas
                            </button>
                          ) : inCartQty > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%' }}>
                                <button onClick={() => handleRemoveFromCart(product.id)} className="btn-glass" style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>-</button>
                                <input 
                                  type="number"
                                  min="1"
                                  max={product.stock_physical_cases || product.stock_in_production_cases || 1000}
                                  value={inCartQty}
                                  onChange={(e) => handleSetCartQty(product.id, parseInt(e.target.value))}
                                  style={{
                                    width: '70px',
                                    textAlign: 'center',
                                    background: '#121212',
                                    border: '1px solid var(--border-color)',
                                    color: '#fff',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    fontWeight: '700',
                                    fontSize: '14px'
                                  }}
                                />
                                <button onClick={() => handleAddToCart(product.id)} className="btn-glass" style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>+</button>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--cyan-neon)', fontWeight: '600' }}>
                                Total: {(inCartQty * (product.units_per_case || 1)).toLocaleString('es-ES')} uds.
                              </span>
                            </div>
                          ) : (
                            <button
                              id={`add-to-cart-${product.id}`}
                              className="btn-glass-neon"
                              style={{ width: '100%', padding: '10px 16px', fontSize: '13px' }}
                              onClick={() => handleAddToCart(product.id)}
                              disabled={product.stock_physical_cases === 0 && (product.stock_in_production_cases || 0) === 0 && !campaign}
                            >
                              {campaign 
                                ? '📅 Reservar Preventa'
                                : product.stock_physical_cases > 0 
                                  ? 'Añadir al Pedido B2B' 
                                  : (product.stock_in_production_cases || 0) > 0 
                                    ? 'Pre-comprar (Reserva)' 
                                    : 'Sin Stock'}
                            </button>
                          )
                        )}

                        {/* Botones de Administración (Solo Admin) */}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                            <button 
                              onClick={() => {
                                setEditingProduct(product);
                                setCreatingProduct(false);
                                setNewProduct({
                                  name: product.name,
                                  sku: product.sku,
                                  category: product.category,
                                  image_url: product.image_url || '',
                                  commercial_description: product.commercial_description || '',
                                  price_per_case_usd: product.price_per_case_usd,
                                  units_per_case: product.units_per_case,
                                  finished_measurements: product.finished_measurements || '',
                                  factory_name: product.factory_name || '',
                                  factory_sku: product.factory_sku || '',
                                  factory_cost_per_case_usd: product.factory_cost_per_case_usd || '',
                                  pantone_codes: product.pantone_codes || '',
                                  cut_measurements: product.cut_measurements || '',
                                  fabrication_notes: product.fabrication_notes || '',
                                  case_weight_kg: product.case_weight_kg,
                                  case_length_cm: product.case_length_cm,
                                  case_width_cm: product.case_width_cm,
                                  case_height_cm: product.case_height_cm,
                                  stock_physical_cases: product.stock_physical_cases || 0,
                                  stock_in_production_cases: product.stock_in_production_cases || 0,
                                  production_files_url: product.production_files_url || ''
                                });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="btn-glass-neon"
                              style={{ flexGrow: 1, padding: '8px', fontSize: '12px' }}
                            >
                              ✏️ Editar
                            </button>
                            <button 
                              onClick={() => handleDeleteProduct(product.id)}
                              className="btn-glass-pink"
                              style={{ padding: '8px 14px', fontSize: '12px' }}
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
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1100px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
                      <th style={{ padding: '12px' }}>Miniatura</th>
                      <th style={{ padding: '12px' }}>Producto</th>
                      <th style={{ padding: '12px' }}>SKU Comercial</th>
                      <th style={{ padding: '12px' }}>Categoría</th>
                      <th style={{ padding: '12px' }}>Precio Caja (B2B)</th>
                      
                      {/* Columnas Adicionales solo para Administradores */}
                      {isAdmin && (
                        <>
                          <th style={{ padding: '12px' }}>Fábrica Origen</th>
                          <th style={{ padding: '12px' }}>Costo Fábrica</th>
                          <th style={{ padding: '12px' }}>Logística (CBM)</th>
                          <th style={{ padding: '12px' }}>Inventario Físico / Prod</th>
                        </>
                      )}
                      
                      {!isAdmin && <th style={{ padding: '12px' }}>Stock Disponible</th>}
                      
                      <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
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
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#fff' }}>
                            {product.name}
                            {(product.finished_measurements || product.color) && (
                              <div style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {product.finished_measurements && <span>📏 {product.finished_measurements}</span>}
                                {product.finished_measurements && product.color && <span> | </span>}
                                {product.color && <span>🎨 {product.color}</span>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{product.sku}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span className="badge badge-pink" style={{ fontSize: '9px' }}>{product.category}</span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--cyan-neon)' }}>
                            ${parseFloat(product.price_per_case_usd).toFixed(2)} USD
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>({product.units_per_case} uds/caja)</div>
                          </td>
                          
                          {/* Datos Confidenciales solo para Admin */}
                          {isAdmin && (
                            <>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '600', color: '#fff' }}>{product.factory_name || 'N/A'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SKU Proveedor: {product.factory_sku || 'N/A'}</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '700', color: 'var(--pink-neon)', fontSize: '12px' }}>
                                  ${(parseFloat(product.factory_cost_per_case_usd || 0) * (product.units_per_case || 1)).toFixed(2)} USD / caja
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  ${parseFloat(product.factory_cost_per_case_usd || 0).toFixed(4)} × {product.units_per_case || 1} uds.
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '11.5px' }}>
                                <div>{product.case_weight_kg} kg | {parseFloat(product.case_cbm).toFixed(5)} CBM</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{product.case_length_cm}x{product.case_width_cm}x{product.case_height_cm} cm</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: '600', color: 'var(--green-neon)' }}>{product.stock_physical_cases} cajas (Físico)</div>
                                <div style={{ fontSize: '11px', color: 'var(--cyan-neon)' }}>{product.stock_in_production_cases} cajas (En Prod.)</div>
                              </td>
                            </>
                          )}
                          
                          {/* Stock para Cliente */}
                          {!isAdmin && (
                            <td style={{ padding: '10px 12px' }}>
                              <span className={product.stock_physical_cases > 0 ? 'badge badge-green' : 'badge-pink'} style={{ fontSize: '9px' }}>
                                {product.stock_physical_cases > 0 ? `${product.stock_physical_cases} Cajas` : 'Sin Stock'}
                              </span>
                            </td>
                          )}
                          
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {/* Vista Cliente: Controles de compra */}
                            {!isAdmin && (() => {
                              const campaign = product.campaign_id ? campaignsList.find(c => c.id === product.campaign_id) : null;
                              const isReservationsClosed = campaign && campaign.status !== 'open';
                              
                              if (isReservationsClosed) {
                                return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>🔒 Cerrado</span>;
                              }
                              
                              return (product.stock_physical_cases > 0 || campaign) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                    {inCartQty > 0 ? (
                                      <>
                                        <button onClick={() => handleRemoveFromCart(product.id)} className="btn-pink" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '4px' }}>-</button>
                                        <input 
                                          type="number"
                                          min="1"
                                          max={product.stock_physical_cases || product.stock_in_production_cases || 1000}
                                          value={inCartQty}
                                          onChange={(e) => handleSetCartQty(product.id, parseInt(e.target.value))}
                                          style={{
                                            width: '56px',
                                            textAlign: 'center',
                                            background: '#121212',
                                            border: '1px solid var(--border-color)',
                                            color: '#fff',
                                            padding: '4px',
                                            borderRadius: '4px',
                                            fontWeight: '700',
                                            fontSize: '13px'
                                          }}
                                        />
                                        <button onClick={() => handleAddToCart(product.id)} className="btn-neon" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '4px' }}>+</button>
                                      </>
                                    ) : (
                                      <button onClick={() => handleAddToCart(product.id)} className="btn-neon" style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '6px' }}>
                                        {campaign ? 'Reservar' : 'Añadir'}
                                      </button>
                                    )}
                                  </div>
                                  {inCartQty > 0 && (
                                    <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: '600' }}>
                                      ({(inCartQty * (product.units_per_case || 1)).toLocaleString('es-ES')} uds.)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Agotado</span>
                              );
                            })()}

                            {/* Vista Admin: Controles de edición */}
                            {isAdmin && (
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setCreatingProduct(false);
                                    setNewProduct({
                                      name: product.name,
                                      sku: product.sku,
                                      category: product.category,
                                      image_url: product.image_url || '',
                                      commercial_description: product.commercial_description || '',
                                      price_per_case_usd: product.price_per_case_usd,
                                      units_per_case: product.units_per_case,
                                      finished_measurements: product.finished_measurements || '',
                                      factory_name: product.factory_name || '',
                                      factory_sku: product.factory_sku || '',
                                      factory_cost_per_case_usd: product.factory_cost_per_case_usd || '',
                                      pantone_codes: product.pantone_codes || '',
                                      cut_measurements: product.cut_measurements || '',
                                      fabrication_notes: product.fabrication_notes || '',
                                      case_weight_kg: product.case_weight_kg,
                                      case_length_cm: product.case_length_cm,
                                      case_width_cm: product.case_width_cm,
                                      case_height_cm: product.case_height_cm,
                                      stock_physical_cases: product.stock_physical_cases || 0,
                                      stock_in_production_cases: product.stock_in_production_cases || 0,
                                      production_files_url: product.production_files_url || ''
                                    });
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="btn-glass-neon"
                                  style={{ padding: '6px 10px', fontSize: '12px' }}
                                  title="Editar Producto"
                                >
                                  ✏️ Editar
                                </button>
                                <button 
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="btn-glass-pink"
                                  style={{ padding: '6px 10px', fontSize: '12px' }}
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
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 2: REGISTRO DE VENTAS (ADMIN) / MIS PEDIDOS (CLIENTE) */}
        {/* ===================================================== */}
        {activeTab === 'orders' && !dataLoading && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && activeUploadOrderId) {
                  handleUploadPaymentReceipt(activeUploadOrderId, file);
                }
                e.target.value = '';
              }}
            />
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>
                {isAdmin ? '📊 Registro de Ventas B2B' : 'Bóveda de Documentos B2B'}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                {isAdmin
                  ? 'Monitorea, aprueba y haz tracking logístico de todos los pedidos realizados por tus clientes B2B.'
                  : 'Monitorea el tracking de tus pedidos y descarga tus Invoices y Packing Lists.'}
              </p>
            </div>

            {clientOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                  {isAdmin ? 'No hay registros de ventas en el sistema.' : 'No tienes pedidos aún en el sistema.'}
                </p>
                {!isAdmin && <button className="btn-neon" onClick={() => setActiveTab('catalog')}>Ir al Catálogo Comercial</button>}
              </div>
            ) : (
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="premium-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                        <th style={{ padding: '16px' }}>PO</th>
                        <th style={{ padding: '16px' }}>Fecha Creación</th>
                        {isAdmin && <th style={{ padding: '16px' }}>Cliente B2B</th>}
                        <th style={{ padding: '16px', textAlign: 'right' }}>Volumen/Cajas</th>
                        <th style={{ padding: '16px', textAlign: 'right' }}>Total FOB</th>
                        <th style={{ padding: '16px' }}>Estado de Pago</th>
                        <th style={{ padding: '16px' }}>Estado Logístico</th>
                        <th style={{ padding: '16px', textAlign: 'center' }}>Acciones (Docs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientOrders.map(order => (
                        <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="table-row-hover">
                          <td style={{ padding: '16px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--cyan-neon)', fontSize: '14px' }}>
                            {order.po_number || `PO-????`}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                            {new Date(order.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          {isAdmin && (
                            <td style={{ padding: '16px' }}>
                              <div style={{ fontWeight: '600', color: '#fff' }}>{order.company_name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.client_name}</div>
                            </td>
                          )}
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <div style={{ fontWeight: '600', color: '#fff' }}>{order.total_cases || 0} cajas</div>
                            <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', marginTop: '2px' }}>{parseFloat(order.total_cbm || 0).toFixed(4)} CBM</div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--green-neon)' }}>
                            ${parseFloat(order.total_usd || order.total_amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span className={`badge ${
                              order.payment_status === 'Pagado' ? 'badge-green' :
                              order.payment_status === 'Crédito' ? 'badge-cyan' :
                              order.payment_status === 'En Revisión' ? 'badge-orange' :
                              'badge-red'
                            }`} style={{ fontSize: '11px', padding: '4px 8px' }}>
                              {order.payment_status === 'Pagado' ? '🟢 Pagado' :
                               order.payment_status === 'Crédito' ? '🔵 Crédito' :
                               order.payment_status === 'En Revisión' ? '🟠 En Revisión' :
                               '🔴 Pendiente'}
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            {isAdmin ? (
                              <select
                                value={order.status}
                                onChange={async (e) => {
                                  try {
                                    await ordersApi.updateStatus(order.id, e.target.value);
                                    await loadOrders();
                                  } catch(err) {
                                    alert(`❌ Error al cambiar estado: ${err.message}`);
                                  }
                                }}
                                style={{
                                  background: 'rgba(0,0,0,0.3)',
                                  border: '1px solid var(--border-color)',
                                  color: order.status === 'Entregado' ? 'var(--green-neon)' : order.status === 'Enviado' ? 'var(--orange-neon)' : order.status === 'En Preparación' ? 'var(--cyan-neon)' : 'var(--pink-neon)',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: '700'
                                }}
                              >
                                <option value="En Revisión" style={{ color: '#fff', background: '#121212' }}>En Revisión</option>
                                <option value="En Preparación" style={{ color: '#fff', background: '#121212' }}>En Preparación</option>
                                <option value="Enviado" style={{ color: '#fff', background: '#121212' }}>Enviado</option>
                                <option value="Entregado" style={{ color: '#fff', background: '#121212' }}>Entregado</option>
                              </select>
                            ) : (
                              <span className={`badge ${
                                order.status === 'En Revisión' ? 'badge-pink' :
                                order.status === 'En Preparación' ? 'badge-cyan' :
                                order.status === 'Enviado' ? 'badge-orange' :
                                'badge-green'
                              }`} style={{ fontSize: '11px', padding: '4px 8px' }}>
                                {order.status}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedOrderDetail(order);
                                  setShowOrderDetailModal(true);
                                }}
                                className="btn-glass-cyan"
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                title="Ver Detalle"
                              >
                                👁️
                              </button>
                              {/* Botón de Comprobante / Subida a Cloudinary */}
                              {order.balance_receipt_url ? (
                                <a
                                  href={order.balance_receipt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-glass"
                                  style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(0, 232, 255, 0.15)', border: '1px solid var(--cyan-neon)', color: 'var(--cyan-neon)', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                                  title="Ver Comprobante de Pago (Cloudinary)"
                                >
                                  🧾
                                </a>
                              ) : order.payment_method === 'stripe' ? (
                                <button
                                  onClick={() => handleViewStripeReceipt(order.id)}
                                  className="btn-glass"
                                  style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(0, 232, 255, 0.15)', border: '1px solid var(--cyan-neon)', color: 'var(--cyan-neon)' }}
                                  title="Ver Recibo de Pago Stripe"
                                >
                                  💳
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveUploadOrderId(order.id);
                                    fileInputRef.current.click();
                                  }}
                                  className="btn-glass"
                                  style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(255, 9, 187, 0.15)', border: '1px solid var(--pink-neon)', color: 'var(--pink-neon)' }}
                                  title="Subir Comprobante a Cloudinary"
                                >
                                  📤
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleShareWhatsApp(order)}
                                    className="btn-glass"
                                    style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(37, 211, 102, 0.15)', border: '1px solid #25d366', color: '#25d366' }}
                                    title="Enviar por WhatsApp (json.pe)"
                                  >
                                    💬
                                  </button>
                                  <button
                                    onClick={() => handleShareEmail(order)}
                                    className="btn-glass"
                                    style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(233, 30, 99, 0.15)', border: '1px solid #e91e63', color: '#e91e63' }}
                                    title="Enviar por Email (Resend)"
                                  >
                                    ✉️
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB: COBRANZAS B2B (Solo Admin)                       */}
        {/* ===================================================== */}
        {activeTab === 'billing' && isAdmin && !dataLoading && (() => {
          // Filtrado local de órdenes
          const filteredBillingOrders = clientOrders.filter(order => {
            if (billingFilter === 'pending') return order.payment_status === 'Pendiente';
            if (billingFilter === 'review') return order.payment_status === 'En Revisión';
            if (billingFilter === 'credit') return order.payment_status === 'Crédito';
            if (billingFilter === 'paid') return order.payment_status === 'Pagado';
            return true;
          });

          // Cálculos de KPIs
          const totalPaid = clientOrders
            .filter(o => o.payment_status === 'Pagado')
            .reduce((acc, o) => acc + parseFloat(o.total_usd || 0), 0);

          const totalCredit = clientOrders
            .filter(o => o.payment_status === 'Crédito')
            .reduce((acc, o) => acc + parseFloat(o.total_usd || 0), 0);

          const pendingReviews = clientOrders.filter(o => o.payment_status === 'En Revisión').length;

          // Helper para comprobar si una fecha de crédito está vencida
          const isCreditOverdue = (dueDateStr) => {
            if (!dueDateStr) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(dueDateStr);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
          };

          return (
            <div>
              {/* Tarjetas de Métricas de Cobranza */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--green-neon)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>💰 Total Recaudado / Cobrado</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--green-neon)' }}>
                    ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Pagos liquidados por Stripe y transferencias aprobadas.</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--cyan-neon)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>🔵 Crédito Comercial Vigente</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--cyan-neon)' }}>
                    ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Cuentas B2B por cobrar con vencimiento pactado.</div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--orange-neon)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>🟠 Vouchers en Revisión</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--orange-neon)' }}>
                    {pendingReviews} {pendingReviews === 1 ? 'pedido' : 'pedidos'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Transferencias bancarias pendientes de validación.</div>
                </div>
              </div>

              {/* Título y Controles de Filtros */}
              <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', margin: '0 0 4px', fontWeight: '800', color: '#fff' }}>💳 Control de Cobranzas B2B</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                      Gestiona la conciliación de transferencias, aprueba comprobantes de pago y define vencimientos de créditos comerciales.
                    </p>
                  </div>

                  {/* Filtros rápidos */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setBillingFilter('all')}
                      className={billingFilter === 'all' ? 'btn-neon' : 'btn-glass'}
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setBillingFilter('review')}
                      className={billingFilter === 'review' ? 'btn-neon-orange' : 'btn-glass'}
                      style={{ padding: '8px 16px', fontSize: '12px', borderColor: billingFilter === 'review' ? 'var(--orange-neon)' : '' }}
                    >
                      🟠 Por Revisar ({pendingReviews})
                    </button>
                    <button
                      onClick={() => setBillingFilter('credit')}
                      className={billingFilter === 'credit' ? 'btn-neon-cyan' : 'btn-glass'}
                      style={{ padding: '8px 16px', fontSize: '12px', borderColor: billingFilter === 'credit' ? 'var(--cyan-neon)' : '' }}
                    >
                      🔵 Créditos
                    </button>
                    <button
                      onClick={() => setBillingFilter('paid')}
                      className={billingFilter === 'paid' ? 'btn-neon-green' : 'btn-glass'}
                      style={{ padding: '8px 16px', fontSize: '12px', borderColor: billingFilter === 'paid' ? 'var(--green-neon)' : '' }}
                    >
                      🟢 Cobradas
                    </button>
                  </div>
                </div>

                {/* Tabla de Cobranzas */}
                {filteredBillingOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13.5px' }}>
                    No se encontraron registros de cobros bajo este filtro.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>PO</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cliente B2B</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Total FOB</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Método</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estado de Pago</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vencimiento Crédito</th>
                          <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBillingOrders.map(order => {
                          const isOverdue = order.payment_status === 'Crédito' && isCreditOverdue(order.credit_due_date);
                          return (
                            <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: isOverdue ? 'rgba(255,0,0,0.02)' : 'transparent' }}>
                              <td style={{ padding: '14px 16px' }}>
                                <button
                                  onClick={() => {
                                    setSelectedOrderDetail(order);
                                    setShowOrderDetailModal(true);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', fontWeight: '800', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'monospace' }}
                                >
                                  {order.po_number || 'PO-????'}
                                </button>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ color: '#fff', fontWeight: '600', fontSize: '12.5px' }}>{order.company_name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{order.client_name}</div>
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--green-neon)', fontSize: '13px' }}>
                                ${parseFloat(order.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '12px', color: '#fff' }}>
                                {order.payment_method === 'stripe' ? (
                                  <span style={{ color: 'var(--cyan-neon)', fontWeight: '600' }}>💳 Tarjeta (Stripe)</span>
                                ) : order.payment_method === 'transfer' ? (
                                  <span style={{ color: '#fff' }}>🏦 Transferencia</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <span className={`badge ${
                                  order.payment_status === 'Pagado' ? 'badge-green' :
                                  order.payment_status === 'Crédito' ? 'badge-cyan' :
                                  order.payment_status === 'En Revisión' ? 'badge-orange' :
                                  'badge-red'
                                }`} style={{ fontSize: '11px', padding: '4px 8px' }}>
                                  {order.payment_status === 'Pagado' ? '🟢 Pagado' :
                                   order.payment_status === 'Crédito' ? '🔵 Crédito' :
                                   order.payment_status === 'En Revisión' ? '🟠 En Revisión' :
                                   '🔴 Pendiente'}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                {order.payment_status === 'Crédito' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                      type="date"
                                      value={order.credit_due_date ? order.credit_due_date.substring(0, 10) : ''}
                                      onChange={(e) => handleUpdateCreditDueDate(order.id, e.target.value)}
                                      style={{
                                        background: '#121212',
                                        border: isOverdue ? '1px solid var(--pink-neon)' : '1px solid var(--border-color)',
                                        color: isOverdue ? 'var(--pink-neon)' : '#fff',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        outline: 'none',
                                        fontWeight: isOverdue ? '800' : '400'
                                      }}
                                    />
                                    {isOverdue && (
                                      <span style={{ color: 'var(--pink-neon)', fontSize: '12px', fontWeight: '800', animation: 'pulse 1.5s infinite' }} title="¡Vencido!">
                                        ⚠️
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  {/* Mostrar botón para ver comprobante si existe */}
                                  {order.balance_receipt_url && (
                                    <a
                                      href={order.balance_receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn-glass"
                                      style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--cyan-neon)', borderColor: 'var(--cyan-neon)', background: 'rgba(0, 232, 255, 0.05)', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                                      title={order.payment_method === 'stripe' ? 'Ver Recibo de Stripe' : 'Ver Comprobante de Transferencia'}
                                    >
                                      🧾
                                    </a>
                                  )}

                                  {/* Acciones de Aprobación de Transferencias */}
                                  {order.payment_status === 'En Revisión' && (
                                    <button
                                      onClick={() => handleApprovePayment(order.id)}
                                      className="btn-neon"
                                      style={{ padding: '6px 12px', fontSize: '11.5px', background: 'rgba(0, 232, 80, 0.2)', color: 'var(--green-neon)', borderColor: 'var(--green-neon)', fontWeight: '800' }}
                                      title="Aprobar Pago"
                                    >
                                      ✔️ Aprobar
                                    </button>
                                  )}

                                  {/* Si está pagado por Stripe pero no guardó la URL del recibo localmente */}
                                  {!order.balance_receipt_url && order.payment_method === 'stripe' && (
                                    <button
                                      onClick={() => handleViewStripeReceipt(order.id)}
                                      className="btn-glass"
                                      style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--cyan-neon)', borderColor: 'var(--cyan-neon)', background: 'rgba(0, 232, 255, 0.05)' }}
                                      title="Recuperar Recibo Stripe"
                                    >
                                      💳
                                    </button>
                                  )}

                                  {/* Permite asignar comprobante manual a órdenes Pendientes o Créditos */}
                                  {(order.payment_status === 'Pendiente' || order.payment_status === 'Crédito') && (
                                    <>
                                      {order.payment_status === 'Pendiente' ? (
                                        <button
                                          onClick={async () => {
                                            if (window.confirm('¿Desea otorgar una línea de crédito a este pedido?')) {
                                              try {
                                                await ordersApi.updatePayment(order.id, 'Crédito', null);
                                                alert('🎉 Crédito comercial otorgado con éxito.');
                                                await loadOrders();
                                              } catch (err) {
                                                alert(`Error: ${err.message}`);
                                              }
                                            }
                                          }}
                                          className="btn-glass-neon"
                                          style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--cyan-neon)', borderColor: 'var(--cyan-neon)' }}
                                          title="Otorgar Crédito Comercial"
                                        >
                                          🔵 Otorgar Crédito
                                        </button>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            if (window.confirm('¿Desea quitar el crédito de este pedido y retornarlo a Pendiente?')) {
                                              try {
                                                await ordersApi.updatePayment(order.id, 'Pendiente', null);
                                                alert('🎉 Crédito removido con éxito.');
                                                await loadOrders();
                                              } catch (err) {
                                                alert(`Error: ${err.message}`);
                                              }
                                            }
                                          }}
                                          className="btn-glass"
                                          style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--pink-neon)', borderColor: 'var(--pink-neon)' }}
                                          title="Quitar Crédito Comercial"
                                        >
                                          🔴 Quitar Crédito
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleEditPaymentReceipt(order)}
                                        className="btn-glass-pink"
                                        style={{ padding: '6px 10px', fontSize: '11px' }}
                                        title={order.payment_status === 'Crédito' ? 'Registrar Pago / Liquidar Crédito' : 'Registrar Pago Manual'}
                                      >
                                        ➕ Registrar Pago
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ===================================================== */}
        {/* TAB 3: FÁBRICA & PRODUCCIÓN (Solo Admin)              */}
        {/* ===================================================== */}
        {activeTab === 'admin' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Control Interno de Fabricación</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Supervisa la cadena de suministro en China: cubicaje de embarques, estados de producción y logs de auditoría.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowProdForm(!showProdForm);
                  if (!showProdForm) {
                    setProdForm({
                      factory_name: 'Dongguan Card Supplies Factory',
                      estimated_completion_date: '',
                      tracking_number: '',
                      status: 'Proforma',
                      items: []
                    });
                  }
                }}
                className="btn-pink"
                style={{ padding: '10px 20px', fontSize: '13px' }}
              >
                {showProdForm ? 'Cerrar Formulario' : '➕ Crear Orden de Producción'}
              </button>
            </div>

            {/* KPIs logísticos y financieros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              {(() => {
                const totalCost = productionOrders.reduce((a, o) => a + parseFloat(o.total_cost_usd || 0), 0);
                const totalCbm = productionOrders.reduce((a, o) => a + parseFloat(o.total_cbm || 0), 0);
                const activeOrders = productionOrders.filter(o => o.status !== 'Delivered').length;
                return (
                  <>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--pink-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Inversión Total Lotes</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#fff', marginTop: '8px' }}>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                    </div>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--cyan-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Volumen Acumulado de Carga</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--cyan-neon)', marginTop: '8px' }}>{totalCbm.toFixed(4)} CBM</h2>
                    </div>
                    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--orange-neon)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Órdenes en Tránsito / Prod.</span>
                      <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--orange-neon)', marginTop: '8px' }}>{activeOrders} Activas</h2>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Formulario de Registro de Orden de Producción */}
            {showProdForm && (
              <div className="glass-panel" style={{ padding: '28px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px', color: 'var(--pink-neon)' }}>
                  🚀 Nueva Orden de Producción (FOB China)
                </h2>
                
                <form onSubmit={handleCreateProductionOrder} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Fábrica Proveedora *</label>
                      <input
                        type="text"
                        required
                        value={prodForm.factory_name}
                        onChange={(e) => setProdForm(prev => ({ ...prev, factory_name: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Fecha Estimada de Finalización</label>
                      <input
                        type="date"
                        value={prodForm.estimated_completion_date}
                        onChange={(e) => setProdForm(prev => ({ ...prev, estimated_completion_date: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Código / Tracking de Contenedor</label>
                      <input
                        type="text"
                        placeholder="Ej. MSCU9231223"
                        value={prodForm.tracking_number}
                        onChange={(e) => setProdForm(prev => ({ ...prev, tracking_number: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Estado Inicial *</label>
                      <select
                        value={prodForm.status}
                        onChange={(e) => setProdForm(prev => ({ ...prev, status: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      >
                        <option value="Proforma">Proforma Invoice</option>
                        <option value="Production">Production (En Fabricación)</option>
                      </select>
                    </div>
                  </div>

                  {/* Detalle de Productos a Fabricar */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--cyan-neon)', marginBottom: '14px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📦 Lote de Producción</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setShowQuickSelect(true)}
                          className="btn-glass"
                          style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700', color: 'var(--cyan-neon)', borderColor: 'var(--cyan-neon)' }}
                        >
                          ⚡ Selección Rápida
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (productList.length === 0) return;
                            const defaultProd = productList[0];
                            setProdForm(prev => ({
                              ...prev,
                              items: [...prev.items, {
                                product_id: defaultProd.id,
                                quantity_cases: 10,
                                cost_per_case_usd: defaultProd.factory_cost_per_case_usd || 0
                              }]
                            }));
                          }}
                          className="btn-glass"
                          style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700' }}
                        >
                          ➕ Añadir Item
                        </button>
                      </div>
                    </h3>

                    {prodForm.items.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        No hay productos en el lote. Haz clic en "Añadir Item".
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {prodForm.items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <select
                              value={item.product_id}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const prodObj = productList.find(p => p.id === selectedId);
                                const updatedItems = [...prodForm.items];
                                updatedItems[idx].product_id = selectedId;
                                updatedItems[idx].cost_per_case_usd = prodObj?.factory_cost_per_case_usd || 0;
                                setProdForm(prev => ({ ...prev, items: updatedItems }));
                              }}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '6px', flexGrow: 2 }}
                            >
                              {productList.map(p => (
                                <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku})</option>
                              ))}
                            </select>
                            
                            <input
                              type="number"
                              min="1"
                              placeholder="Cant. Cajas"
                              value={item.quantity_cases}
                              onChange={(e) => {
                                const updatedItems = [...prodForm.items];
                                updatedItems[idx].quantity_cases = parseInt(e.target.value) || 0;
                                setProdForm(prev => ({ ...prev, items: updatedItems }));
                              }}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '6px', width: '110px' }}
                            />
                            
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Costo Caja ($)"
                              value={item.cost_per_case_usd}
                              onChange={(e) => {
                                const updatedItems = [...prodForm.items];
                                updatedItems[idx].cost_per_case_usd = parseFloat(e.target.value) || 0;
                                setProdForm(prev => ({ ...prev, items: updatedItems }));
                              }}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '6px', width: '120px' }}
                            />
                            
                            <button
                              type="button"
                              onClick={() => {
                                const updatedItems = prodForm.items.filter((_, i) => i !== idx);
                                setProdForm(prev => ({ ...prev, items: updatedItems }));
                              }}
                              className="btn-glass-pink"
                              style={{ padding: '8px 12px', borderRadius: '6px' }}
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Resumen del Lote Proyectado en Caliente */}
                  {prodForm.items.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: 'rgba(0, 232, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 232, 255, 0.1)', fontSize: '13px' }}>
                      {(() => {
                        let totalCost = 0;
                        let totalCbm = 0;
                        let totalCases = 0;
                        
                        prodForm.items.forEach(item => {
                          const prodObj = productList.find(p => p.id === item.product_id);
                          const qty = item.quantity_cases || 0;
                          const cost = item.cost_per_case_usd || 0;
                          const cbm = parseFloat(prodObj?.case_cbm) || 0;
                          
                          totalCost += qty * cost;
                          totalCbm += qty * cbm;
                          totalCases += qty;
                        });
                        
                        return (
                          <>
                            <div>📦 Cajas Proyectadas: <strong style={{ color: '#fff' }}>{totalCases} master</strong></div>
                            <div>💰 Presupuesto FOB: <strong style={{ color: 'var(--green-neon)' }}>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong></div>
                            <div>🚢 Volumen Total: <strong style={{ color: 'var(--cyan-neon)' }}>{totalCbm.toFixed(4)} CBM</strong></div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowProdForm(false)}
                      className="btn-glass"
                      style={{ padding: '10px 20px', fontSize: '13px' }}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn-glass-pink" style={{ padding: '10px 30px', fontSize: '13px' }}>
                      🚀 Registrar Lote en Neon
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Listado de Órdenes en Formato Tabla */}
            <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)' }}>
              {productionOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                  No hay órdenes de producción activas.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px' }}>N° Lote (PO)</th>
                      <th style={{ padding: '12px 16px' }}>Fábrica</th>
                      <th style={{ padding: '12px 16px' }}>Fecha Registro</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Presupuesto FOB</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Cubicaje</th>
                      <th style={{ padding: '12px 16px' }}>Estado</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionOrders.map(pOrder => {
                      const stepNames = ['Proforma', 'Production', 'QC Control', 'Shipped', 'Delivered'];
                      
                      return (
                        <tr key={pOrder.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13px', transition: 'background 0.2s' }} className="hover-row">
                          <td style={{ padding: '16px', fontWeight: 'bold', color: '#fff' }}>
                            {pOrder.order_number}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '10.5px' }}>🏭 {pOrder.factory_name}</span>
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                            {new Date(pOrder.created_at).toLocaleDateString('es-ES')}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--green-neon)' }}>
                            ${parseFloat(pOrder.total_cost_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--cyan-neon)' }}>
                            {parseFloat(pOrder.total_cbm || 0).toFixed(4)} CBM
                          </td>
                          <td style={{ padding: '16px' }}>
                            <select
                              value={pOrder.status}
                              onChange={(e) => handleUpdateProductionStatus(pOrder.id, e.target.value)}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}
                            >
                              {stepNames.map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={async () => {
                                  setSelectedProductionOrder(pOrder);
                                  setShowProductionDetailModal(true);
                                  handleLoadProductionAuditLogs(pOrder.id);
                                }}
                                className="btn-glass-cyan"
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                title="Ver Detalle"
                              >
                                👁️
                              </button>
                              <button
                                onClick={() => handleExportPDF(pOrder)}
                                className="btn-glass"
                                style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(0, 232, 255, 0.1)', border: '1px solid var(--cyan-neon)', color: 'var(--cyan-neon)' }}
                                title="Exportar Ficha (PDF)"
                              >
                                📄
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB: CAMPAÑAS (Solo Admin del Tenant)                */}
        {/* ===================================================== */}
        {activeTab === 'campaigns' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Campañas de Fabricación (Print Runs)</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Crea campañas de pre-venta, gestiona fechas clave, reglas de pago y cambia estados para notificar a los clientes B2B.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
              {/* FORMULARIO CREAR/EDITAR CAMPAÑA */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--cyan-neon)' }}>
                  {editingCampaign ? '✏️ Editar Campaña' : '📅 Nueva Campaña'}
                </h2>
                <form onSubmit={handleCreateOrUpdateCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nombre de la Campaña</label>
                    <input
                      type="text"
                      placeholder="Ej. Print Run Q4 - Dongguan"
                      value={newCampaign.name}
                      required
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Inicio Reservas</label>
                      <input
                        type="datetime-local"
                        value={newCampaign.start_date_reservations ? newCampaign.start_date_reservations.slice(0, 16) : ''}
                        required
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, start_date_reservations: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Cierre Reservas</label>
                      <input
                        type="datetime-local"
                        value={newCampaign.end_date_reservations ? newCampaign.end_date_reservations.slice(0, 16) : ''}
                        required
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, end_date_reservations: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Inicio Producción</label>
                      <input
                        type="datetime-local"
                        value={newCampaign.start_date_production ? newCampaign.start_date_production.slice(0, 16) : ''}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, start_date_production: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Fin Prod. Estimado</label>
                      <input
                        type="datetime-local"
                        value={newCampaign.estimated_end_date_production ? newCampaign.estimated_end_date_production.slice(0, 16) : ''}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, estimated_end_date_production: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>% Adelanto Requerido</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newCampaign.advance_payment_pct}
                        required
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, advance_payment_pct: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Estado</label>
                      <select
                        value={newCampaign.status}
                        required
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, status: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      >
                        <option value="open">Open (Reservas Abiertas)</option>
                        <option value="production">Production (En Fabricación)</option>
                        <option value="finished">Finished (Tiraje Finalizado)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button type="submit" className="btn-neon" style={{ flex: 1, padding: '10px 16px', borderRadius: '8px' }}>
                      {editingCampaign ? '💾 Guardar Cambios' : '📅 Crear Campaña'}
                    </button>
                    {editingCampaign && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCampaign(null);
                          setNewCampaign({ name: '', start_date_reservations: '', end_date_reservations: '', start_date_production: '', estimated_end_date_production: '', advance_payment_pct: 30.00, status: 'open' });
                        }}
                        className="btn-glass"
                        style={{ padding: '10px 16px', borderRadius: '8px' }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* LISTADO DE CAMPAÑAS */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--cyan-neon)' }}>
                  Campañas Activas ({campaignsList.length})
                </h2>
                {campaignsList.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No hay campañas configuradas.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {campaignsList.map(camp => (
                      <div
                        key={camp.id}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px',
                          padding: '16px',
                          background: 'rgba(255,255,255,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: '700', fontSize: '15px' }}>{camp.name}</span>
                          <span
                            className={`badge ${
                              camp.status === 'open' ? 'badge-green' :
                              camp.status === 'production' ? 'badge-orange' : 'badge-blue'
                            }`}
                            style={{ textTransform: 'uppercase', fontSize: '10px' }}
                          >
                            {camp.status}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                          <div>📅 <strong>Reservas:</strong> {new Date(camp.start_date_reservations).toLocaleDateString()} al {new Date(camp.end_date_reservations).toLocaleDateString()}</div>
                          {camp.start_date_production && (
                            <div>🏭 <strong>Producción:</strong> {new Date(camp.start_date_production).toLocaleDateString()} {camp.estimated_end_date_production ? `al ${new Date(camp.estimated_end_date_production).toLocaleDateString()}` : ''}</div>
                          )}
                          <div>💳 <strong>Adelanto Requerido:</strong> {camp.advance_payment_pct}%</div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenCampaignProductsModal(camp)}
                            className="btn-glass-cyan"
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', marginRight: 'auto' }}
                          >
                            📦 Asignar SKUs
                          </button>
                          <button
                            onClick={() => {
                              setEditingCampaign(camp);
                              setNewCampaign({
                                name: camp.name,
                                start_date_reservations: camp.start_date_reservations,
                                end_date_reservations: camp.end_date_reservations,
                                start_date_production: camp.start_date_production || '',
                                estimated_end_date_production: camp.estimated_end_date_production || '',
                                advance_payment_pct: camp.advance_payment_pct,
                                status: camp.status
                              });
                            }}
                            className="btn-glass"
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleDeleteCampaign(camp.id)}
                            className="btn-glass"
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', color: 'var(--pink-neon)', borderColor: 'var(--pink-neon)' }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB: PREVENTAS / PRINT RUNS (Clientes B2B)            */}
        {/* ===================================================== */}
        {activeTab === 'campaigns' && !isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>📅 Campañas de Pre-Venta (Print Runs)</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Participa en las campañas de fabricación activas y asegura el stock de tu tienda directo de fábrica con condiciones de pago preferenciales.
              </p>
            </div>

            {campaignsList.length === 0 ? (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No hay campañas de preventa activas en este momento. Vuelve a consultar más tarde.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {campaignsList.map(camp => {
                  const campProducts = allProducts.filter(p => p.campaign_id === camp.id);
                  
                  return (
                    <div key={camp.id} className="glass-panel" style={{ padding: '28px', border: camp.status === 'open' ? '1px solid var(--cyan-neon)' : '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px', marginBottom: '24px' }}>
                        <div>
                          <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 8px 0', color: camp.status === 'open' ? 'var(--cyan-neon)' : '#fff' }}>
                            {camp.name}
                          </h2>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <div>📅 <strong>Cierre de Reservas:</strong> {new Date(camp.end_date_reservations).toLocaleDateString()}</div>
                            {camp.start_date_production && (
                              <div>🏭 <strong>Fabricación:</strong> {new Date(camp.start_date_production).toLocaleDateString()} {camp.estimated_end_date_production ? `al ${new Date(camp.estimated_end_date_production).toLocaleDateString()}` : ''}</div>
                            )}
                            <div>💳 <strong>Regla de Pago:</strong> Requiere {parseFloat(camp.advance_payment_pct).toFixed(0)}% de Adelanto</div>
                          </div>
                        </div>

                        <span
                          className={`badge ${
                            camp.status === 'open' ? 'badge-green' :
                            camp.status === 'production' ? 'badge-orange' : 'badge-blue'
                          }`}
                          style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '6px 12px',
                            borderRadius: '12px',
                            textTransform: 'uppercase',
                            boxShadow: camp.status === 'open' ? '0 0 10px rgba(0, 232, 255, 0.2)' : 'none'
                          }}
                        >
                          {camp.status === 'open' ? '🟢 Abierta para Reservas' :
                           camp.status === 'production' ? '🏭 En Producción' : '📦 Tiraje Finalizado'}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                        Productos en este Tiraje ({campProducts.length})
                      </h3>

                      {campProducts.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay productos asignados a este tiraje.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                          {campProducts.map(product => {
                            const inCartQty = cart[product.id] || 0;
                            const isReservationsClosed = camp.status !== 'open';
                            
                            return (
                              <div key={product.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '380px', background: 'rgba(255,255,255,0.01)' }}>
                                <div>
                                  <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    {product.image_url ? (
                                      <img src={product.image_url} alt={product.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    ) : (
                                      <span style={{ fontSize: '28px' }}>📦</span>
                                    )}
                                  </div>

                                  <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>{product.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{product.sku}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                    {product.units_per_case} unidades por caja
                                  </div>
                                </div>

                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Precio / caja:</span>
                                    <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--cyan-neon)' }}>
                                      ${parseFloat(product.price_per_case_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                                    </span>
                                  </div>

                                  {isReservationsClosed ? (
                                    <button
                                      className="btn-glass"
                                      style={{ width: '100%', padding: '8px 12px', fontSize: '12px', cursor: 'not-allowed', color: 'var(--text-muted)' }}
                                      disabled
                                    >
                                      🔒 Reservas Cerradas
                                    </button>
                                  ) : inCartQty > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                        <button onClick={() => handleRemoveFromCart(product.id)} className="btn-glass" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700' }}>-</button>
                                        <input
                                          type="number"
                                          min="1"
                                          max={product.stock_in_production_cases || 1000}
                                          value={inCartQty}
                                          onChange={(e) => handleSetCartQty(product.id, parseInt(e.target.value))}
                                          style={{ width: '60px', textAlign: 'center', background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '4px', borderRadius: '4px', fontSize: '12px', fontWeight: '700' }}
                                        />
                                        <button onClick={() => handleAddToCart(product.id)} className="btn-glass" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700' }}>+</button>
                                      </div>
                                      <span style={{ fontSize: '10px', color: 'var(--cyan-neon)', fontWeight: '600' }}>
                                        ({(inCartQty * product.units_per_case).toLocaleString()} uds. en reserva)
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleAddToCart(product.id)}
                                      className="btn-glass-neon"
                                      style={{ width: '100%', padding: '8px 12px', fontSize: '12px' }}
                                    >
                                      📅 Reservar Preventa
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 4: CONFIGURACIÓN (Solo Admin del Tenant)          */}
        {/* ===================================================== */}
        {activeTab === 'config' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Configuración de Catálogo</h1>
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

            {/* PANEL DE CARGA Y ACTUALIZACIÓN MASIVA DE CATÁLOGO */}
            <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--cyan-neon)' }}>
                    📥 Carga y Actualización Masiva de Catálogo (CSV)
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>
                    Agrega nuevos productos o actualiza información de dimensiones, precios e inventario usando archivos CSV.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCSVTemplate}
                  className="btn-glass"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  📄 Descargar Plantilla CSV
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Instrucciones de Carga:</h4>
                  <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: '1.6' }}>
                    <li><strong>sku, name, category, price_per_case_usd</strong> son campos obligatorios.</li>
                    <li>Si el <strong>sku</strong> ya existe en tu catálogo, el producto y su stock se actualizarán.</li>
                    <li>Campos numéricos decimales opcionales: dimensions (case_length_cm, case_width_cm, case_height_cm) y peso (case_weight_kg).</li>
                    <li>Campos opcionales de inventario: stock_physical_cases y stock_in_production_cases.</li>
                    <li>La carga se procesa de forma transaccional; si una línea tiene un error grave de validación, no se guarda nada para mantener la base de datos limpia.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', background: 'rgba(0,0,0,0.15)' }}>
                  <label htmlFor="csv-file-selector" style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📂</span>
                    <strong style={{ display: 'block', fontSize: '13px', color: 'var(--cyan-neon)' }}>Selecciona tu archivo CSV</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Haz clic para navegar en tu equipo</span>
                  </label>
                  <input
                    type="file"
                    id="csv-file-selector"
                    accept=".csv"
                    onChange={handleCSVFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* Mensajes de Resultado de Upload */}
              {bulkResult && (
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '16px', 
                    marginBottom: '20px', 
                    borderLeft: `4px solid ${bulkResult.success ? 'var(--green-neon)' : 'var(--pink-neon)'}`, 
                    background: bulkResult.success ? 'rgba(34, 239, 0, 0.03)' : 'rgba(255, 9, 187, 0.03)' 
                  }}
                >
                  {bulkResult.success ? (
                    <div>
                      <strong style={{ color: 'var(--green-neon)', fontSize: '14px', display: 'block' }}>✓ Carga Masiva Completada Exitosamente</strong>
                      <p style={{ fontSize: '12.5px', margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                        Se procesaron <strong>{bulkResult.processed}</strong> productos.
                        (Nuevos creados: <strong>{bulkResult.inserted}</strong>, Existentes actualizados: <strong>{bulkResult.updated}</strong>).
                      </p>
                    </div>
                  ) : (
                    <div>
                      <strong style={{ color: 'var(--pink-neon)', fontSize: '14px', display: 'block' }}>❌ Error al Procesar Carga Masiva</strong>
                      <p style={{ fontSize: '12.5px', margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                        {bulkResult.error}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Vista Previa de Filas CSV */}
              {bulkPreview.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '12px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>👀 Vista Previa de Carga ({bulkPreview.length} filas detectadas)</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPreview([]);
                          const fileInput = document.getElementById('csv-file-selector');
                          if (fileInput) fileInput.value = '';
                        }}
                        className="btn-glass"
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        🗑️ Limpiar
                      </button>
                      <button
                        type="button"
                        disabled={bulkUploading}
                        onClick={handleBulkUploadSubmit}
                        className="btn-pink"
                        style={{ padding: '8px 24px', fontSize: '12.5px' }}
                      >
                        {bulkUploading ? 'Subiendo a Neon...' : '🚀 Subir e Importar a Neon'}
                      </button>
                    </div>
                  </h3>

                  <div style={{ overflowX: 'auto', maxHeight: '300px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '10px 12px' }}>Fila / Estado</th>
                          <th style={{ padding: '10px 12px' }}>Detalle Error</th>
                          <th style={{ padding: '10px 12px' }}>SKU</th>
                          <th style={{ padding: '10px 12px' }}>Nombre</th>
                          <th style={{ padding: '10px 12px' }}>Categoría</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right' }}>Precio Caja</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>Uds/Caja</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>Stock Físico</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>Stock En Prod.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkPreview.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: item.error ? 'rgba(255,9,187,0.05)' : 'transparent' }}>
                            <td style={{ padding: '10px 12px' }}>
                              {item.error ? (
                                <span className="badge badge-red" style={{ fontSize: '9px' }}>⚠️ Error</span>
                              ) : (
                                <span className="badge badge-green" style={{ fontSize: '9px' }}>✓ Listo</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', color: item.error ? 'var(--pink-neon)' : 'var(--text-muted)' }}>
                              {item.error || 'Ninguno'}
                            </td>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{item.sku}</td>
                            <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '600' }}>
                              {item.name}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{item.category}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--cyan-neon)' }}>
                              ${parseFloat(item.price_per_case_usd).toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.units_per_case || 1}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.stock_physical_cases || 0}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.stock_in_production_cases || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* PANEL DE CONFIGURACIÓN DEL NEGOCIO & DATOS BANCARIOS */}
            <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px', color: 'var(--cyan-neon)' }}>
                ⚙️ Configuración del Negocio & Métodos de Pago
              </h2>
              <form onSubmit={handleUpdateTenantSettings} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Sección 1: Integraciones Externas */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '24px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔑 Integraciones Externas</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* A. NOTIFICACIONES (WhatsApp & Email) */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '20px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--cyan-neon)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        💬 Notificaciones Automatizadas B2B (WhatsApp & Email)
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Token de json.pe (Conector de WhatsApp)
                          </label>
                          <input
                            type="text"
                            placeholder="Escribe tu API Key de json.pe..."
                            value={tenantSettings.whatsapp_api_key}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, whatsapp_api_key: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Requerido para el envío automático de notificaciones de estados de pedido y proformas directamente a WhatsApp.
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            API Key de Resend (Servicio de Correo)
                          </label>
                          <input
                            type="password"
                            placeholder="Escribe tu API Key de Resend (re_...)"
                            value={tenantSettings.resend_api_key}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, resend_api_key: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Clave de autorización de Resend para el envío automático de facturas, packing lists y correos de bienvenida B2B.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* B. IMÁGENES & DOCUMENTOS (Cloudinary) */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '20px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--pink-neon)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ☁️ Almacenamiento en la Nube de Comprobantes & Logos (Cloudinary)
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Cloudinary Cloud Name
                          </label>
                          <input
                            type="text"
                            placeholder="Escribe tu Cloud Name..."
                            value={tenantSettings.cloudinary_cloud_name || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, cloudinary_cloud_name: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Identificador único de tu cuenta de Cloudinary.
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Cloudinary Unsigned Upload Preset
                          </label>
                          <input
                            type="text"
                            placeholder="Escribe tu Upload Preset..."
                            value={tenantSettings.cloudinary_upload_preset || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, cloudinary_upload_preset: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Preset de subida no firmado (unsigned) configurado en Cloudinary.
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Cloudinary API Key
                          </label>
                          <input
                            type="text"
                            placeholder="Escribe tu Cloudinary API Key..."
                            value={tenantSettings.cloudinary_api_key || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, cloudinary_api_key: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Cloudinary API Secret
                          </label>
                          <input
                            type="password"
                            placeholder="Escribe tu Cloudinary API Secret..."
                            value={tenantSettings.cloudinary_api_secret || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, cloudinary_api_secret: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* C. PROCESADOR DE PAGOS (Stripe) */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '20px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--green-neon)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        💳 Procesamiento de Pagos con Tarjeta (Stripe)
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Stripe Publishable Key
                          </label>
                          <input
                            type="text"
                            placeholder="Escribe tu Stripe Publishable Key (pk_...)..."
                            value={tenantSettings.stripe_publishable_key || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, stripe_publishable_key: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Clave pública de Stripe para inicializar el SDK en el frontend.
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                            Stripe Secret Key
                          </label>
                          <input
                            type="password"
                            placeholder="Escribe tu Stripe Secret Key (sk_...)..."
                            value={tenantSettings.stripe_secret_key || ''}
                            onChange={(e) => setTenantSettings(prev => ({ ...prev, stripe_secret_key: e.target.value }))}
                            style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Clave secreta privada de Stripe para realizar cobros desde el servidor.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* D. LOGÍSTICA COMERCIAL */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '20px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--orange-neon)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        🚢 Configuración Logística Comercial
                      </h4>
                      <div style={{ maxWidth: '400px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                          Incoterm por Defecto (Logística B2B)
                        </label>
                        <select
                          value={tenantSettings.default_incoterm || 'FOB China'}
                          onChange={(e) => setTenantSettings(prev => ({ ...prev, default_incoterm: e.target.value }))}
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontWeight: '700' }}
                        >
                          <option value="FOB China">FOB China</option>
                          <option value="FOB Peru">FOB Peru</option>
                          <option value="CIF">CIF (Cost, Insurance & Freight)</option>
                          <option value="EXW">EXW (Ex Works)</option>
                          <option value="EXW Peru">EXW Peru</option>
                        </select>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          Incoterm predeterminado que se asignará automáticamente a todos los nuevos pedidos B2B creados por los clientes.
                        </span>
                      </div>

                      <div style={{ maxWidth: '400px', marginTop: '20px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                          Política de Descuento Comercial B2B
                        </label>
                        <select
                          value={tenantSettings.discount_policy || 'tier'}
                          onChange={(e) => setTenantSettings(prev => ({ ...prev, discount_policy: e.target.value }))}
                          style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontWeight: '700', marginBottom: '12px' }}
                        >
                          <option value="tier">Nivel de Cliente / Tier Comercial</option>
                          <option value="volume">Volumen por SKU (Escalonado por Item)</option>
                        </select>

                        {tenantSettings.discount_policy === 'volume' ? (
                          <button
                            type="button"
                            onClick={() => setShowSkuVolumeRulesModal(true)}
                            className="btn-glass-cyan"
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                          >
                            ⚙️ Configurar Descuentos de Volumen SKU
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowPricingTiersModal(true)}
                            className="btn-glass-cyan"
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                          >
                            ⚙️ Configurar Pricing Tiers (Niveles)
                          </button>
                        )}

                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          Define si el descuento se calcula de acuerdo al Tier del distribuidor, o mediante reglas decrecientes de volumen por cada SKU comprado.
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Sección 2: Datos Bancarios */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#fff', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏦 Cuenta Bancaria para Cobros por Transferencia B2B</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Nombre del Banco</label>
                      <input
                        type="text"
                        placeholder="Ej: Chase Bank, HSBC, Citibank"
                        value={tenantSettings.bank_name}
                        onChange={(e) => setTenantSettings(prev => ({ ...prev, bank_name: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Titular de la Cuenta (Beneficiario)</label>
                      <input
                        type="text"
                        placeholder="Ej: Gosu Accessories Ltd"
                        value={tenantSettings.bank_account_name}
                        onChange={(e) => setTenantSettings(prev => ({ ...prev, bank_account_name: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Número de Cuenta / IBAN</label>
                      <input
                        type="text"
                        placeholder="Ej: US1234567890"
                        value={tenantSettings.bank_account_number}
                        onChange={(e) => setTenantSettings(prev => ({ ...prev, bank_account_number: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Código SWIFT / ABA / Ruta</label>
                      <input
                        type="text"
                        placeholder="Ej: CHASEUS33XXX"
                        value={tenantSettings.bank_routing_number}
                        onChange={(e) => setTenantSettings(prev => ({ ...prev, bank_routing_number: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Estos datos se le presentarán a tus clientes B2B al momento de elegir el método de pago por transferencia.
                  </span>
                </div>

                {/* Sección 3: Marca Blanca (Whitelabel) */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#fff', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎨 Identidad de Marca Blanca (Whitelabel)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>URL del Logo de la Empresa (PNG/SVG recomendado)</label>
                      <input
                        type="url"
                        placeholder="Ej: https://miempresa.com/assets/logo.png"
                        value={tenantSettings.logo_url}
                        onChange={(e) => setTenantSettings(prev => ({ ...prev, logo_url: e.target.value }))}
                        style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                      />
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Este logo reemplazará el nombre de la empresa en la barra lateral del sistema B2B y se incluirá en los documentos PDF generados (Invoice y Packing List).
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="btn-pink"
                    style={{ padding: '12px 32px', fontSize: '13px', fontWeight: '700' }}
                  >
                    {savingSettings ? 'Guardando configuraciones...' : '💾 Guardar Configuración de Empresa'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB: DASHBOARD / CONTROL DE MANDO                     */}
        {/* ===================================================== */}
        {activeTab === 'dashboard' && isAdmin && !dataLoading && (
          <div>
            {/* Header del Dashboard */}
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>📈 Control de Mando Comercial</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Monitorea el rendimiento financiero de tu empresa: ingresos, costos de fábrica, utilidad neta y productos líderes.
                </p>
              </div>

              {/* Selector de Periodo */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                <div className="btn-group" style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {[
                    { id: '7days', label: '7 Días' },
                    { id: '30days', label: '30 Días' },
                    { id: 'thismonth', label: 'Este Mes' },
                    { id: 'thisyear', label: 'Este Año' },
                    { id: 'custom', label: 'Personalizado' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setDashboardFilter(filter.id)}
                      className={dashboardFilter === filter.id ? 'btn-pink' : 'btn-glass'}
                      style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', border: 'none', borderRadius: '6px' }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {dashboardFilter === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <input
                      type="date"
                      value={dashboardStartDate}
                      onChange={(e) => setDashboardStartDate(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '11px' }}
                    />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>a</span>
                    <input
                      type="date"
                      value={dashboardEndDate}
                      onChange={(e) => setDashboardEndDate(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '11px' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Tarjetas de Resumen Financiero */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              
              {/* Tarjeta 1: Ventas Totales */}
              <div className="glass-panel" style={{ padding: '20px', position: 'relative', borderLeft: '4px solid var(--cyan-neon)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>💰 Ventas Netas</span>
                <strong style={{ display: 'block', fontSize: '24px', margin: '8px 0 2px 0', color: 'var(--cyan-neon)' }}>
                  ${(dashboardData.summary?.total_sales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ingresos facturados a clientes B2B</span>
              </div>

              {/* Tarjeta 2: Costo de Ventas */}
              <div className="glass-panel" style={{ padding: '20px', position: 'relative', borderLeft: '4px solid var(--orange-neon)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>🏭 Costo de Producción</span>
                <strong style={{ display: 'block', fontSize: '24px', margin: '8px 0 2px 0', color: 'var(--orange-neon)' }}>
                  ${(dashboardData.summary?.total_costs || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Costo FOB del fabricante de sleeves</span>
              </div>

              {/* Tarjeta 3: Utilidad */}
              <div className="glass-panel" style={{ padding: '20px', position: 'relative', borderLeft: '4px solid var(--green-neon)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>📈 Utilidad Neta</span>
                <strong style={{ display: 'block', fontSize: '24px', margin: '8px 0 2px 0', color: 'var(--green-neon)' }}>
                  ${(dashboardData.summary?.total_profit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ganancia neta (Ventas - Costos)</span>
              </div>

              {/* Tarjeta 4: Margen */}
              <div className="glass-panel" style={{ padding: '20px', position: 'relative', borderLeft: '4px solid var(--pink-neon)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>📊 Margen de Ganancia</span>
                <strong style={{ display: 'block', fontSize: '24px', margin: '8px 0 2px 0', color: 'var(--pink-neon)' }}>
                  {(dashboardData.summary?.margin_percent || 0).toFixed(1)}%
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Retorno sobre ingresos totales</span>
              </div>

            </div>

            {/* Sección de Gráficos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              
              {/* Gráfico 1: Histórico de Ventas vs Costos (SVG Line/Area) */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', color: '#fff' }}>📉 Tendencia de Ingresos & Costos</h3>
                {dashboardData.sales_by_day?.length === 0 ? (
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Sin datos en este rango de tiempo para graficar.
                  </div>
                ) : (
                  <div>
                    {(() => {
                      const sales_by_day = dashboardData.sales_by_day || [];
                      const maxVal = Math.max(...sales_by_day.map(d => Math.max(d.sales, d.cost)), 100) * 1.15;
                      const width = 500;
                      const height = 180;
                      
                      const buildPoints = (key) => {
                        return sales_by_day.map((d, i) => {
                          const x = (i / (sales_by_day.length - 1 || 1)) * width;
                          const y = height - (d[key] / maxVal) * height;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        }).join(' ');
                      };

                      const salesPoints = buildPoints('sales');
                      const costPoints = buildPoints('cost');

                      const salesAreaPoints = salesPoints ? `0,${height} ${salesPoints} ${width},${height}` : '';
                      const costAreaPoints = costPoints ? `0,${height} ${costPoints} ${width},${height}` : '';

                      return (
                        <div style={{ position: 'relative' }}>
                          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '200px', overflow: 'visible' }}>
                            <defs>
                              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--cyan-neon)" stopOpacity="0.3"/>
                                <stop offset="100%" stopColor="var(--cyan-neon)" stopOpacity="0.0"/>
                              </linearGradient>
                              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--orange-neon)" stopOpacity="0.2"/>
                                <stop offset="100%" stopColor="var(--orange-neon)" stopOpacity="0.0"/>
                              </linearGradient>
                            </defs>

                            <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                            <line x1="0" y1={height} x2={width} y2={height} stroke="rgba(255,255,255,0.1)" />

                            {costAreaPoints && <polygon points={costAreaPoints} fill="url(#costGrad)" />}
                            {salesAreaPoints && <polygon points={salesAreaPoints} fill="url(#salesGrad)" />}

                            {costPoints && <polyline points={costPoints} fill="none" stroke="var(--orange-neon)" strokeWidth="3" />}
                            {salesPoints && <polyline points={salesPoints} fill="none" stroke="var(--cyan-neon)" strokeWidth="3" />}

                            <text x="-10" y="15" fill="var(--text-secondary)" fontSize="10" textAnchor="end">${maxVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                            <text x="-10" y={height/2 + 4} fill="var(--text-secondary)" fontSize="10" textAnchor="end">${(maxVal/2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                            <text x="-10" y={height} fill="var(--text-secondary)" fontSize="10" textAnchor="end">$0</text>
                          </svg>

                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                            <span>{sales_by_day[0]?.date}</span>
                            <span>{sales_by_day[Math.floor(sales_by_day.length / 2)]?.date}</span>
                            <span>{sales_by_day[sales_by_day.length - 1]?.date}</span>
                          </div>

                          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '16px', fontSize: '12px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--cyan-neon)', borderRadius: '3px' }}></span>
                              Ventas ($)
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--orange-neon)', borderRadius: '3px' }}></span>
                              Costo ($)
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Gráfico 2: Ventas por Categoría (Barras Horizontales con Porcentajes) */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', color: '#fff' }}>📁 Ventas por Categoría de Producto</h3>
                {dashboardData.sales_by_category?.length === 0 ? (
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Sin datos de categorías en este rango de tiempo.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {(() => {
                      const categories = dashboardData.sales_by_category || [];
                      const totalSalesVal = categories.reduce((sum, c) => sum + c.sales, 0) || 1;
                      
                      return categories.map((cat, idx) => {
                        const pct = (cat.sales / totalSalesVal) * 100;
                        const colors = ['var(--cyan-neon)', 'var(--pink-neon)', 'var(--green-neon)', 'var(--orange-neon)'];
                        const color = colors[idx % colors.length];

                        return (
                          <div key={cat.category}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                              <strong style={{ color: '#fff' }}>{cat.category}</strong>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                ${cat.sales.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: '10px', boxShadow: `0 0 8px ${color}` }}></div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Mapa de Ventas por País */}
            <div style={{ marginBottom: '24px' }}>
              <SalesMapWidget salesByCountry={dashboardData.sales_by_country} />
            </div>

            {/* Tabla / Ranking de Rentabilidad de Productos */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', color: '#fff' }}>🏆 Productos Líderes en Rentabilidad (Top 5)</h3>
              
              {dashboardData.top_products?.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Sin productos comercializados en el rango seleccionado.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                        <th style={{ padding: '12px' }}>Producto</th>
                        <th style={{ padding: '12px' }}>SKU</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Cajas Vendidas</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Ventas Totales</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Costo Fábrica</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Utilidad</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Margen (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.top_products.map((p, idx) => {
                        const margin = p.sales > 0 ? (p.profit / p.sales) * 100 : 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}>
                            <td style={{ padding: '12px', fontWeight: '700', color: '#fff' }}>{p.name}</td>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>{p.sku}</td>
                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>{p.qty_cases} master</td>
                            <td style={{ padding: '12px', textAlign: 'right', color: 'var(--cyan-neon)' }}>
                              ${p.sales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', color: 'var(--orange-neon)' }}>
                              ${p.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', color: 'var(--green-neon)', fontWeight: '700' }}>
                              ${p.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <span className="badge badge-green" style={{ fontSize: '11px', fontWeight: '800' }}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ===================================================== */}
        {/* TAB: INVENTARIO GLOBAL (KARDEX HUB)                   */}
        {/* ===================================================== */}
        {activeTab === 'inventory' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>📦 Control Global de Inventario</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Supervisa el stock físico para venta B2B, inventario en producción de fábrica y gestiona las bitácoras de movimientos (Kardex).
                </p>
              </div>
              <div>
                <button
                  onClick={loadProducts}
                  className="btn-glass"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  🔄 Sincronizar Existencias
                </button>
              </div>
            </div>

            {/* Indicadores de Valuación de Inventario */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--orange-neon)', boxShadow: '0 0 10px rgba(255, 165, 0, 0.05)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Valuación de Costo (Fábrica)</span>
                <h2 style={{ fontSize: '24px', margin: '8px 0 2px', fontWeight: '800', color: 'var(--orange-neon)' }}>
                  ${invTotals.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Costo base de producción</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--cyan-neon)', boxShadow: '0 0 10px rgba(0, 232, 255, 0.05)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Valor Tienda (desc: {pctTienda}%)</span>
                <h2 style={{ fontSize: '24px', margin: '8px 0 2px', fontWeight: '800', color: 'var(--cyan-neon)' }}>
                  ${invTotals.tienda.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Venta a minoristas / Tiendas</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--pink-neon)', boxShadow: '0 0 10px rgba(255, 0, 127, 0.05)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Valor Distribuidor (desc: {pctDist}%)</span>
                <h2 style={{ fontSize: '24px', margin: '8px 0 2px', fontWeight: '800', color: 'var(--pink-neon)' }}>
                  ${invTotals.distributor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Venta a distribuidores B2B</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--green-neon)', boxShadow: '0 0 10px rgba(0, 230, 118, 0.05)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Valor Partner (desc: {pctPartner}%)</span>
                <h2 style={{ fontSize: '24px', margin: '8px 0 2px', fontWeight: '800', color: 'var(--green-neon)' }}>
                  ${invTotals.partner.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Venta preferencial a Partners</span>
              </div>
            </div>

            {/* Panel de Filtros para Inventario */}
            <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Buscar Producto</label>
                <input
                  type="text"
                  placeholder="SKU, Nombre o Fábrica..."
                  value={invSearchQuery}
                  onChange={(e) => setInvSearchQuery(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', width: '220px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Categoría</label>
                <select
                  value={invFilterCategory}
                  onChange={(e) => setInvFilterCategory(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '160px' }}
                >
                  <option value="all">Todas las Categorías</option>
                  {categoriesList.map(cat => (
                    <option key={cat.id} value={cat.slug}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Estado del Inventario</label>
                <select
                  value={invFilterStockStatus}
                  onChange={(e) => setInvFilterStockStatus(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '180px' }}
                >
                  <option value="all">Todos los Stocks</option>
                  <option value="in_stock">✅ Con Stock Físico</option>
                  <option value="low_stock">⚠️ Stock Bajo (&lt; 50 cajas)</option>
                  <option value="out_of_stock">❌ Sin Stock Físico</option>
                  <option value="in_production">⚙️ En Producción Activa</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Fábrica Origen</label>
                <select
                  value={invFilterFactory}
                  onChange={(e) => setInvFilterFactory(e.target.value)}
                  style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', minWidth: '180px' }}
                >
                  <option value="all">Todas las Fábricas</option>
                  {(() => {
                    const factories = allProducts
                      .map(p => p.factory_name)
                      .filter(name => name && name.trim() !== '');
                    const uniqueFactories = Array.from(new Set(factories));
                    return uniqueFactories.map(fac => (
                      <option key={fac} value={fac}>{fac}</option>
                    ));
                  })()}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto', gap: '8px', alignSelf: 'stretch', paddingTop: '18px' }}>
                {(invSearchQuery || invFilterCategory !== 'all' || invFilterStockStatus !== 'all' || invFilterFactory !== 'all') && (
                  <button
                    onClick={() => {
                      setInvSearchQuery('');
                      setInvFilterCategory('all');
                      setInvFilterStockStatus('all');
                      setInvFilterFactory('all');
                    }}
                    className="btn-glass-pink"
                    style={{ padding: '8px 16px', fontSize: '12.5px' }}
                  >
                    🧹 Limpiar Filtros
                  </button>
                )}
              </div>
            </div>

            {/* Tabla Global de Inventario */}
            <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
              {filteredInventoryList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No se encontraron productos que coincidan con los filtros de inventario.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '12px 16px', width: '70px' }}>Miniatura</th>
                      <th style={{ padding: '12px 16px' }}>Producto</th>
                      <th style={{ padding: '12px 16px' }}>SKU</th>
                      <th style={{ padding: '12px 16px' }}>Categoría</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Stock Físico (Ventas)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Stock en Producción</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', width: '220px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryList.map(product => {
                      const hasPhysical = (product.stock_physical_cases || 0) > 0;
                      const hasProduction = (product.stock_in_production_cases || 0) > 0;

                      return (
                        <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}>
                          <td style={{ padding: '12px 16px' }}>
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} style={{ width: '46px', height: '46px', borderRadius: '8px', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '46px', height: '46px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📦</div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleTriggerEditProduct(product);
                              }}
                              className="product-nav-link"
                            >
                              {product.name}
                            </a>
                            {product.color && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Color: {product.color}</span>}
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{product.sku}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ textTransform: 'capitalize' }}>{product.category?.replace('_', ' ')}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span className={hasPhysical ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: '12px', fontWeight: '800', padding: '6px 12px' }}>
                              {product.stock_physical_cases || 0} master cases
                            </span>
                            <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                              {((product.stock_physical_cases || 0) * (product.units_per_case || 1)).toLocaleString('en-US')} uds
                            </span>
                            <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                              ({product.units_per_case || 1} p/caja)
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span className={hasProduction ? 'badge badge-orange' : 'badge'} style={{ fontSize: '12px', padding: '6px 12px', background: hasProduction ? 'rgba(255,165,0,0.1)' : 'rgba(255,255,255,0.03)', border: hasProduction ? '1px solid orange' : '1px solid rgba(255,255,255,0.08)' }}>
                              {product.stock_in_production_cases || 0} master cases
                            </span>
                            {hasProduction && (
                              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                                {((product.stock_in_production_cases || 0) * (product.units_per_case || 1)).toLocaleString('en-US')} uds
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleOpenKardex(product)}
                              className="btn-glass-cyan"
                              style={{ padding: '8px 16px', fontSize: '12px', width: '100%', fontWeight: '700' }}
                            >
                              🗃️ Ver Movimientos & Ajustes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB PROFILE: CONFIGURACIÓN DE PERFIL & PASSWORD      */}
        {/* ===================================================== */}
        {activeTab === 'profile' && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>Configuración de Perfil</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Actualiza tu contraseña de acceso y revisa los detalles comerciales de tu cuenta.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
              {/* Información General */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px', color: 'var(--cyan-neon)' }}>
                  👤 Información de Cuenta
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Nombre Completo</span>
                    <strong style={{ color: '#fff', fontSize: '16px' }}>{currentUser.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Correo Electrónico</span>
                    <strong style={{ color: '#fff', fontSize: '16px' }}>{currentUser.email}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Rol de Acceso</span>
                    <strong style={{ color: '#fff', fontSize: '16px' }}>
                      {currentUser.role === 'tenant_admin' ? 'Administrador' : currentUser.role === 'super_admin' ? 'Super Admin' : 'Distribuidor Cliente B2B'}
                    </strong>
                  </div>
                  {!isSuperAdmin && currentUser.tenant_name && (
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Inquilino / Marca</span>
                      <strong style={{ color: '#fff', fontSize: '16px' }}>{currentUser.tenant_name}</strong>
                    </div>
                  )}
                  {currentUser.role === 'b2b_client' && currentUser.tier_name && (
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Nivel Tarifario B2B</span>
                      <strong style={{ color: 'var(--pink-neon)', fontSize: '16px' }}>{currentUser.tier_name} ({currentUser.discount_percentage}% desc.)</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Cambiar Contraseña */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px', color: 'var(--pink-neon)' }}>
                  🔒 Cambiar Contraseña
                </h2>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const currentPassword = e.target.currentPass.value;
                  const newPassword = e.target.newPass.value;
                  const confirmPassword = e.target.confirmPass.value;

                  if (newPassword.length < 6) {
                    alert('⚠️ La nueva contraseña debe tener al menos 6 caracteres.');
                    return;
                  }
                  if (newPassword !== confirmPassword) {
                    alert('⚠️ Las contraseñas no coinciden.');
                    return;
                  }

                  try {
                    await auth.changePassword(currentPassword, newPassword);
                    alert('🎉 Contraseña cambiada con éxito.');
                    e.target.reset();
                  } catch (err) {
                    alert(`❌ Error: ${err.message}`);
                  }
                }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Contraseña Actual</label>
                    <input
                      type="password"
                      name="currentPass"
                      required
                      placeholder="Ingresa tu contraseña actual"
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Nueva Contraseña</label>
                    <input
                      type="password"
                      name="newPass"
                      required
                      placeholder="Mínimo 6 caracteres"
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Confirmar Nueva Contraseña</label>
                    <input
                      type="password"
                      name="confirmPass"
                      required
                      placeholder="Repite la nueva contraseña"
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="glow-btn glow-btn-cyan"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', fontWeight: 'bold', marginTop: '10px' }}
                  >
                    Actualizar Contraseña
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* TAB 5: CLIENTES & LEADS B2B (Solo Admin del Tenant)  */}
        {/* ===================================================== */}
        {activeTab === 'clients' && isAdmin && !dataLoading && (
          <div>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 4px', fontWeight: '800' }}>
                Directorio y CRM de Clientes B2B
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                Administra las cuentas de tus distribuidores activos y realiza el seguimiento a tus leads comerciales.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <button
                      onClick={() => setClientFilter('all')}
                      className={clientFilter === 'all' ? 'btn-pink' : 'btn-glass'}
                      style={{ padding: '6px 12px', fontSize: '11.5px' }}
                    >
                      Todos ({clientsList.length})
                    </button>
                    <button
                      onClick={() => setClientFilter('clients')}
                      className={clientFilter === 'clients' ? 'btn-pink' : 'btn-glass'}
                      style={{ padding: '6px 12px', fontSize: '11.5px' }}
                    >
                      👥 Clientes Activos ({clientsList.filter(c => c.account_status === 'client').length})
                    </button>
                    <button
                      onClick={() => setClientFilter('leads')}
                      className={clientFilter === 'leads' ? 'btn-pink' : 'btn-glass'}
                      style={{ padding: '6px 12px', fontSize: '11.5px' }}
                    >
                      ⚡ Leads / Prospectos ({clientsList.filter(c => c.account_status !== 'client').length})
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setCreatingClient(!creatingClient);
                    setEditingClient(null);
                    setNewClientForm({
                      name: '',
                      email: '',
                      password: '',
                      company_name: '',
                      tax_id: '',
                      billing_address: '',
                      forwarder_address: '',
                      pricing_tier_id: '',
                      destination_country: 'USA',
                      account_status: 'lead_new',
                      followup_notes: '',
                      last_contact_date: new Date().toISOString().split('T')[0]
                    });
                  }}
                  className="btn-pink"
                  style={{ padding: '10px 20px', fontSize: '12.5px' }}
                >
                  {creatingClient ? 'Cancelar Registro' : '➕ Registrar Cliente / Lead'}
                </button>
              </div>

              {/* Formulario de creación/edición de cliente */}
              {(creatingClient || editingClient) && (
                <div className="glass-panel" style={{ padding: '24px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px', color: 'var(--pink-neon)' }}>
                    {editingClient ? `✏️ Editar Cuenta: ${editingClient.company_name || editingClient.name}` : '🚀 Registrar Nuevo Cliente o Lead B2B'}
                  </h2>
                  
                  <form onSubmit={handleCreateOrUpdateClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Nombre del Contacto *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ej. Yugi Muto"
                          value={newClientForm.name}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, name: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Correo Electrónico *</label>
                        <input
                          type="email"
                          required
                          placeholder="ejemplo@tienda.com"
                          value={newClientForm.email}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, email: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      
                      {!editingClient && (
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Contraseña de Acceso *</label>
                          <input
                            type="password"
                            required
                            placeholder="Min. 6 caracteres"
                            value={newClientForm.password}
                            onChange={(e) => setNewClientForm(prev => ({ ...prev, password: e.target.value }))}
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
                          Estado de la Cuenta *
                        </label>
                        <select
                          value={newClientForm.account_status}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, account_status: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="client">🟢 Cliente Activo (Validado comercialmente)</option>
                          <option value="lead_new">🟡 Lead: Nuevo Prospecto</option>
                          <option value="lead_negotiation">🟠 Lead: En Negociación</option>
                          <option value="lead_pending_moa">🔵 Lead: Pendiente de MOA / Propuesta</option>
                          <option value="lead_rejected">🔴 Lead: Descalificado</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
                          Razón Social / Empresa {newClientForm.account_status === 'client' && '*'}
                        </label>
                        <input
                          type="text"
                          required={newClientForm.account_status === 'client'}
                          placeholder="Ej. Kame Game Shop Inc"
                          value={newClientForm.company_name}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, company_name: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
                          ID Fiscal / Tax ID {newClientForm.account_status === 'client' && '*'}
                        </label>
                        <input
                          type="text"
                          required={newClientForm.account_status === 'client'}
                          placeholder="Ej. JP-9876543"
                          value={newClientForm.tax_id}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, tax_id: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>País de Destino (Aduana) *</label>
                        <select
                          required
                          value={newClientForm.destination_country}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, destination_country: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="" disabled style={{ background: '#1c1c24' }}>Selecciona un país...</option>
                          {COUNTRY_OPTIONS.map(c => (
                            <option key={c.code} value={c.code} style={{ background: '#1c1c24' }}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Nivel de Precios B2B (Pricing Tier) *</label>
                        <select
                          value={newClientForm.pricing_tier_id || ''}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, pricing_tier_id: e.target.value || null }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="">-- Sin Nivel / Precio Base Comercial --</option>
                          {pricingTiersList.map(tier => (
                            <option key={tier.id} value={tier.id}>
                              {tier.tier_name} (-{tier.discount_percentage}% desc, MOV: ${tier.min_order_amount}) {tier.only_master_cases ? ' [Solo Cajas]' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Fecha de Último Contacto *</label>
                        <input
                          type="date"
                          required
                          value={newClientForm.last_contact_date}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, last_contact_date: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
                          Dirección Fiscal / Facturación {newClientForm.account_status === 'client' && '*'}
                        </label>
                        <textarea
                          required={newClientForm.account_status === 'client'}
                          rows="2"
                          placeholder="Dirección fiscal registrada (Opcional para Leads)"
                          value={newClientForm.billing_address}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, billing_address: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', resize: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>
                          Dirección de Forwarder (Bodega en China) {newClientForm.account_status === 'client' && '*'}
                        </label>
                        <textarea
                          required={newClientForm.account_status === 'client'}
                          rows="2"
                          placeholder="Instrucciones de entrega para aduana de exportación china (Opcional para Leads)"
                          value={newClientForm.forwarder_address}
                          onChange={(e) => setNewClientForm(prev => ({ ...prev, forwarder_address: e.target.value }))}
                          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', resize: 'none' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Notas de Seguimiento Comercial (CRM)</label>
                      <textarea
                        rows="3"
                        placeholder="Registra aquí los detalles del seguimiento comercial: acuerdos, cotizaciones enviadas, solicitudes del prospecto, etc."
                        value={newClientForm.followup_notes}
                        onChange={(e) => setNewClientForm(prev => ({ ...prev, followup_notes: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', resize: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => { setCreatingClient(false); setEditingClient(null); }}
                        className="btn-glass"
                        style={{ padding: '8px 20px', fontSize: '12.5px' }}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn-pink" style={{ padding: '8px 30px', fontSize: '12.5px' }}>
                        {editingClient ? 'Guardar Cambios' : 'Registrar en Neon'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Listado de distribuidores en tabla */}
              <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--cyan-neon)' }}>
                  Directorio y Pipeline CRM de Cuentas B2B
                </h2>

                {clientsList.filter(client => {
                  if (clientFilter === 'clients') return client.account_status === 'client';
                  if (clientFilter === 'leads') return client.account_status !== 'client';
                  return true;
                }).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No hay cuentas que coincidan con el filtro seleccionado.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600' }}>Empresa / Lead</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600' }}>Destino</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600' }}>Estado CRM</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600' }}>Nivel de Precios B2B / MOV</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600' }}>Último Contacto & Notas de CRM</th>
                        <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsList
                        .filter(client => {
                          if (clientFilter === 'clients') return client.account_status === 'client';
                          if (clientFilter === 'leads') return client.account_status !== 'client';
                          return true;
                        })
                        .map(client => {
                          const isLead = client.account_status !== 'client';
                          
                          // Determinar badges e indicadores según el estado
                          let statusBadgeClass = 'badge-cyan';
                          let statusLabel = 'Lead';
                          if (client.account_status === 'client') {
                            statusBadgeClass = 'badge-green';
                            statusLabel = '🟢 Cliente Activo';
                          } else if (client.account_status === 'lead_new') {
                            statusBadgeClass = 'badge-yellow';
                            statusLabel = '🟡 Lead: Nuevo';
                          } else if (client.account_status === 'lead_negotiation') {
                            statusBadgeClass = 'badge-orange';
                            statusLabel = '🟠 Lead: Negociación';
                          } else if (client.account_status === 'lead_pending_moa') {
                            statusBadgeClass = 'badge-purple';
                            statusLabel = '🔵 Lead: Pendiente MOA';
                          } else if (client.account_status === 'lead_rejected') {
                            statusBadgeClass = 'badge-red';
                            statusLabel = '🔴 Lead: Descalificado';
                          }

                          return (
                            <tr key={client.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.3s' }}>
                              <td style={{ padding: '14px 8px' }}>
                                <strong style={{ color: '#fff', fontSize: '14px' }}>
                                  {client.company_name || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Sin Razón Social</span>}
                                </strong>
                                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  Contacto: {client.name} ({client.email})
                                </span>
                                {client.tax_id && (
                                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                                    ID Fiscal: {client.tax_id}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 8px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--cyan-neon)' }}>📍 {getCountryName(client.destination_country)}</span>
                              </td>
                              <td style={{ padding: '14px 8px' }}>
                                <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '10.5px', whiteSpace: 'nowrap' }}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td style={{ padding: '14px 8px' }}>
                                {client.tier_name ? (
                                  <>
                                    <span className="badge badge-green" style={{ fontSize: '10px', display: 'inline-block', marginBottom: '4px' }}>
                                      {client.tier_name.split(' (')[0]}
                                    </span>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                      Descuento: <strong>{parseFloat(client.discount_percentage)}%</strong>
                                    </div>
                                    <div style={{ fontWeight: '700', color: '#fff', fontSize: '12px' }}>
                                      MOV: ${parseFloat(client.min_order_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Precio Base Comercial</span>
                                )}
                              </td>
                              <td style={{ padding: '14px 8px', maxWidth: '350px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--cyan-neon)', marginBottom: '4px', fontWeight: '600' }}>
                                  📅 Último contacto: {client.last_contact_date ? new Date(client.last_contact_date).toLocaleDateString('es-ES') : 'Sin fecha'}
                                </div>
                                <p style={{ margin: '0', fontSize: '12px', color: '#ccc', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical' }}>
                                  {client.followup_notes || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Sin notas de seguimiento registradas.</span>}
                                </p>
                              </td>
                              <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => {
                                      setEditingClient(client);
                                      setCreatingClient(false);
                                      setNewClientForm({
                                        name: client.name,
                                        email: client.email,
                                        company_name: client.company_name || '',
                                        tax_id: client.tax_id || '',
                                        billing_address: client.billing_address || '',
                                        forwarder_address: client.forwarder_address || '',
                                        pricing_tier_id: client.pricing_tier_id || '',
                                        destination_country: client.destination_country,
                                        account_status: client.account_status,
                                        followup_notes: client.followup_notes || '',
                                        last_contact_date: client.last_contact_date ? new Date(client.last_contact_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                                      });
                                    }}
                                    className="btn-glass"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleTenantImpersonate(client.id)}
                                    className="btn-glass-cyan"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    title="Ingresar como este cliente"
                                  >
                                    👁️
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const pass = prompt(`Establece la nueva contraseña temporal para ${client.name} (${client.email}):`);
                                      if (!pass) return;
                                      if (pass.length < 6) {
                                        alert('La contraseña debe tener al menos 6 caracteres.');
                                        return;
                                      }
                                      try {
                                        await usersApi.resetClientPassword(client.id, pass);
                                        alert('🎉 Contraseña restablecida con éxito. Se le solicitará cambiarla al iniciar sesión.');
                                      } catch (err) {
                                        alert(`❌ Error: ${err.message}`);
                                      }
                                    }}
                                    className="btn-glass"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    title="Restablecer contraseña"
                                  >
                                    🔑
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClient(client.id)}
                                    className="btn-glass-pink"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
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
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: '600', marginTop: '2px' }}>
                          ({(item.qty * (item.units_per_case || 1)).toLocaleString('es-ES')} uds. totales)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => handleRemoveFromCart(item.id)} style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#333', border: 'none', color: '#fff', cursor: 'pointer' }}>-</button>
                        <input 
                          type="number"
                          min="1"
                          max={item.stock_physical_cases || 1000}
                          value={item.qty}
                          onChange={(e) => handleSetCartQty(item.id, parseInt(e.target.value))}
                          style={{
                            width: '46px',
                            textAlign: 'center',
                            background: '#121212',
                            border: '1px solid var(--border-color)',
                            color: '#fff',
                            padding: '4px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            fontSize: '13px'
                          }}
                        />
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
                  <span>${cartTotals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                </div>
                {cartTotals.discountPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px', color: 'var(--pink-neon)' }}>
                    <span>Descuento ({cartTotals.discountPercent}%)</span>
                    <span>-${cartTotals.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800', marginBottom: '16px', borderTop: '1px dotted #333', paddingTop: '12px' }}>
                  <span>Total de la Orden</span>
                  <span style={{ color: 'var(--cyan-neon)' }}>${cartTotals.finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                </div>

                {cartTotals.finalTotal < MOA_LIMIT ? (
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--orange-neon)', marginBottom: '16px', background: 'rgba(255, 92, 0, 0.05)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--orange-neon)', fontWeight: '700' }}>MOA no alcanzado</span>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Mínimo: <strong>${MOA_LIMIT.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>. Faltan ${(MOA_LIMIT - cartTotals.finalTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD.
                    </p>
                  </div>
                ) : (
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--green-neon)', marginBottom: '16px', background: 'rgba(34, 239, 0, 0.05)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--green-neon)', fontWeight: '700' }}>✓ Pedido Listo — MOA cumplido</span>
                  </div>
                )}

                {cartTotals.finalTotal >= MOA_LIMIT && (
                  <form onSubmit={handleCheckoutSubmit}>

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

      {/* ===================================================== */}
      {/* MODAL: SELECCIÓN RÁPIDA DE PRODUCTOS (FABRICACIÓN)    */}
      {/* ===================================================== */}
      {showQuickSelect && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => { setShowQuickSelect(false); setQuickSelectSearch(''); setQuickSelectChecked({}); setQuickSelectQuantities({}); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 6px 0' }}>
                ⚡ Selección Rápida de Productos
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Filtra productos, marca los checks de los que deseas producir y define la cantidad de cajas.
              </p>
            </div>

            {/* Buscador */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="🔍 Escribe nombre o SKU del producto para filtrar..."
                value={quickSelectSearch}
                onChange={(e) => setQuickSelectSearch(e.target.value)}
                style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '12px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Listado de Productos */}
            <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
              {productList.filter(p => {
                const query = quickSelectSearch.toLowerCase();
                return p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
              }).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ningún producto coincide con el filtro.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '12px 16px', width: '40px' }}></th>
                      <th style={{ padding: '12px 8px', width: '60px' }}>Foto</th>
                      <th style={{ padding: '12px 8px' }}>Producto / SKU</th>
                      <th style={{ padding: '12px 8px', width: '140px' }}>Cant. Cajas</th>
                      <th style={{ padding: '12px 16px', width: '110px', textAlign: 'right' }}>Costo Fábrica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productList
                      .filter(p => {
                        const query = quickSelectSearch.toLowerCase();
                        return p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
                      })
                      .map(p => {
                        const isChecked = !!quickSelectChecked[p.id];
                        const qty = quickSelectQuantities[p.id] !== undefined ? quickSelectQuantities[p.id] : 10;
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s', background: isChecked ? 'rgba(0, 232, 255, 0.03)' : 'transparent' }}>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setQuickSelectChecked(prev => ({ ...prev, [p.id]: e.target.checked }));
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                              )}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <strong style={{ color: '#fff', display: 'block' }}>{p.name}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SKU: {p.sku}</span>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                min="1"
                                value={qty}
                                disabled={!isChecked}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setQuickSelectQuantities(prev => ({ ...prev, [p.id]: val }));
                                }}
                                style={{
                                  background: isChecked ? '#121212' : 'rgba(0,0,0,0.1)',
                                  border: '1px solid var(--border-color)',
                                  color: isChecked ? '#fff' : '#888',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  width: '90px'
                                }}
                              />
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--pink-neon)' }}>
                              ${parseFloat(p.factory_cost_per_case_usd || 0).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Controles de Selección */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Seleccionados: <strong style={{ color: 'var(--cyan-neon)' }}>{Object.values(quickSelectChecked).filter(Boolean).length} productos</strong>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickSelect(false);
                    setQuickSelectSearch('');
                    setQuickSelectChecked({});
                    setQuickSelectQuantities({});
                  }}
                  className="btn-glass"
                  style={{ padding: '10px 24px' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleLoadQuickSelection}
                  className="btn-pink"
                  style={{ padding: '10px 32px' }}
                >
                  Cargar Selección a la Orden
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: CONFIGURACIÓN DE PRICING TIERS                 */}
      {/* ===================================================== */}
      {showPricingTiersModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '950px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => { setShowPricingTiersModal(false); setEditingPricingTier(null); setNewPricingTier({ tier_name: '', discount_percentage: 0, min_order_amount: 1000, only_master_cases: false }); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 4px 0' }}>
                🏷️ Configuración de Pricing Tiers (Niveles de Cliente)
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Crea y edita los niveles comerciales aplicables a tus distribuidores B2B.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {/* Formulario */}
              <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', height: 'fit-content' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
                  {editingPricingTier ? '✏️ Editar Nivel' : '➕ Crear Nuevo Nivel'}
                </h3>
                <form onSubmit={handleCreateOrUpdatePricingTier} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Nombre del Nivel *</label>
                    <input
                      type="text"
                      placeholder="Ej. Partner VIP"
                      required
                      value={newPricingTier.tier_name}
                      onChange={(e) => setNewPricingTier(prev => ({ ...prev, tier_name: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Porcentaje de Descuento (%) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 15.00"
                      required
                      value={newPricingTier.discount_percentage}
                      onChange={(e) => setNewPricingTier(prev => ({ ...prev, discount_percentage: parseFloat(e.target.value) || 0 }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Monto Mínimo de Orden (MOV USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 5000.00"
                      required
                      value={newPricingTier.min_order_amount}
                      onChange={(e) => setNewPricingTier(prev => ({ ...prev, min_order_amount: parseFloat(e.target.value) || 0 }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                    <input
                      type="checkbox"
                      id="modal_only_master_cases"
                      checked={newPricingTier.only_master_cases}
                      onChange={(e) => setNewPricingTier(prev => ({ ...prev, only_master_cases: e.target.checked }))}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="modal_only_master_cases" style={{ fontSize: '12px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>
                      Forzar compra en Master Cases
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button type="submit" className="btn-pink" style={{ flexGrow: 1, padding: '8px 16px', fontSize: '12px' }}>
                      {editingPricingTier ? 'Guardar' : 'Crear'}
                    </button>
                    {editingPricingTier && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPricingTier(null);
                          setNewPricingTier({ tier_name: '', discount_percentage: 0, min_order_amount: 1000, only_master_cases: false });
                        }}
                        className="btn-glass"
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Listado */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Niveles Configurados ({pricingTiersList.length})
                </h3>

                {pricingTiersList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                    No has creado ningún nivel de precios aún.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
                    {pricingTiersList.map(tier => (
                      <div key={tier.id} style={{ border: '1px solid rgba(255,255,255,0.06)', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#fff' }}>{tier.tier_name}</strong>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            <span className="badge badge-green" style={{ fontSize: '9px' }}>
                              -{parseFloat(tier.discount_percentage)}% Desc.
                            </span>
                            <span className="badge badge-cyan" style={{ fontSize: '9px' }}>
                              MOV: ${parseFloat(tier.min_order_amount).toLocaleString('en-US')}
                            </span>
                            {tier.only_master_cases && (
                              <span className="badge badge-yellow" style={{ fontSize: '9px' }}>
                                📦 Master Cases
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => {
                              setEditingPricingTier(tier);
                              setNewPricingTier({
                                tier_name: tier.tier_name,
                                discount_percentage: parseFloat(tier.discount_percentage),
                                min_order_amount: parseFloat(tier.min_order_amount),
                                only_master_cases: tier.only_master_cases === true
                              });
                            }}
                            className="btn-glass"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeletePricingTier(tier.id)}
                            className="btn-glass-pink"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #333', paddingTop: '16px', marginTop: '20px' }}>
              <button
                onClick={() => { setShowPricingTiersModal(false); setEditingPricingTier(null); setNewPricingTier({ tier_name: '', discount_percentage: 0, min_order_amount: 1000, only_master_cases: false }); }}
                className="btn-glass"
                style={{ padding: '10px 20px', borderRadius: '8px' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: CONFIGURACIÓN DE REGLAS DE VOLUMEN SKU          */}
      {/* ===================================================== */}
      {showSkuVolumeRulesModal && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => { setShowSkuVolumeRulesModal(false); setEditingSkuVolumeRule(null); setNewSkuVolumeRule({ min_units: '', discount_pct: '' }); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 4px 0' }}>
                📉 Configuración de Descuentos por Volumen por SKU
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Crea reglas de descuento basadas en las unidades totales compradas por cada producto de manera individual.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {/* Formulario */}
              <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', height: 'fit-content' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
                  {editingSkuVolumeRule ? '✏️ Editar Escala' : '➕ Crear Nueva Escala'}
                </h3>
                <form onSubmit={handleCreateOrUpdateSkuVolumeRule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Cantidad Mínima (Unidades Físicas) *</label>
                    <input
                      type="number"
                      placeholder="Ej. 100"
                      required
                      value={newSkuVolumeRule.min_units}
                      onChange={(e) => setNewSkuVolumeRule(prev => ({ ...prev, min_units: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600' }}>Porcentaje de Descuento (%) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej. 5.00"
                      required
                      value={newSkuVolumeRule.discount_pct}
                      onChange={(e) => setNewSkuVolumeRule(prev => ({ ...prev, discount_pct: e.target.value }))}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button type="submit" className="btn-pink" style={{ flexGrow: 1, padding: '8px 16px', fontSize: '12px' }}>
                      {editingSkuVolumeRule ? 'Guardar' : 'Crear'}
                    </button>
                    {editingSkuVolumeRule && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSkuVolumeRule(null);
                          setNewSkuVolumeRule({ min_units: '', discount_pct: '' });
                        }}
                        className="btn-glass"
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Listado */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Reglas de Volumen Configuradas ({skuVolumeRulesList.length})
                </h3>

                {skuVolumeRulesList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                    No has configurado ninguna escala por volumen unitario aún.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
                    {skuVolumeRulesList.map(rule => (
                      <div key={rule.id} style={{ border: '1px solid rgba(255,255,255,0.06)', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#fff' }}>A partir de {rule.min_units} unidades</strong>
                          <div style={{ marginTop: '4px' }}>
                            <span className="badge badge-green" style={{ fontSize: '10px' }}>
                              -{parseFloat(rule.discount_pct)}% Descuento
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => {
                              setEditingSkuVolumeRule(rule);
                              setNewSkuVolumeRule({
                                min_units: rule.min_units,
                                discount_pct: parseFloat(rule.discount_pct)
                              });
                            }}
                            className="btn-glass"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteSkuVolumeRule(rule.id)}
                            className="btn-glass-pink"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #333', paddingTop: '16px', marginTop: '20px' }}>
              <button
                onClick={() => { setShowSkuVolumeRulesModal(false); setEditingSkuVolumeRule(null); setNewSkuVolumeRule({ min_units: '', discount_pct: '' }); }}
                className="btn-glass"
                style={{ padding: '10px 20px', borderRadius: '8px' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: ASIGNACIÓN MASIVA DE PRODUCTOS A CAMPAÑA        */}
      {/* ===================================================== */}
      {showCampaignProductsModal && selectedCampaignForProducts && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '850px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => setShowCampaignProductsModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 4px 0' }}>
                📦 Asignación Masiva de SKUs
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Selecciona los productos que pertenecen al tiraje <strong>"{selectedCampaignForProducts.name}"</strong> y asigna la cuota de pre-venta en cajas.
              </p>
            </div>

            {/* BUSCADOR */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Buscar producto por nombre o SKU..."
                value={campaignProductsFilter}
                onChange={(e) => setCampaignProductsFilter(e.target.value)}
                style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* TABLA DE PRODUCTOS CON SCROLL */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,232,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '12px', width: '40px', textAlign: 'center' }}>Ref</th>
                    <th style={{ padding: '12px' }}>Producto</th>
                    <th style={{ padding: '12px' }}>Categoría</th>
                    <th style={{ padding: '12px', width: '180px' }}>Cantidad Asignada (Cajas)</th>
                  </tr>
                </thead>
                <tbody>
                  {allProducts
                    .filter(p => {
                      if (!campaignProductsFilter) return true;
                      const term = campaignProductsFilter.toLowerCase();
                      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
                    })
                    .map(p => {
                      const selection = campaignProductSelections[p.id] || { selected: false, qty_cases: 0 };
                      
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: selection.selected ? 'rgba(0, 232, 255, 0.02)' : 'transparent',
                            transition: 'all 0.2s'
                          }}
                        >
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selection.selected}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setCampaignProductSelections(prev => ({
                                  ...prev,
                                  [p.id]: {
                                    selected: isChecked,
                                    qty_cases: isChecked ? (prev[p.id]?.qty_cases || p.stock_in_production_cases || 100) : 0
                                  }
                                }));
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: '600' }}>{p.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.sku}</div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className="badge badge-blue" style={{ fontSize: '10px' }}>{p.category}</span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <input
                              type="number"
                              min="0"
                              value={selection.qty_cases}
                              disabled={!selection.selected}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setCampaignProductSelections(prev => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    qty_cases: val
                                  }
                                }));
                              }}
                              style={{
                                width: '100px',
                                background: selection.selected ? '#121212' : 'rgba(255,255,255,0.02)',
                                border: selection.selected ? '1px solid var(--cyan-neon)' : '1px solid rgba(255,255,255,0.05)',
                                color: selection.selected ? '#fff' : 'var(--text-muted)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                textAlign: 'center',
                                transition: 'all 0.2s'
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* ACCIONES FOOTER */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #333', paddingTop: '16px' }}>
              <button
                onClick={() => setShowCampaignProductsModal(false)}
                className="btn-glass"
                style={{ padding: '10px 20px', borderRadius: '8px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCampaignProducts}
                className="btn-neon"
                style={{ padding: '10px 24px', borderRadius: '8px' }}
              >
                💾 Guardar Asociación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: KARDEX DE INVENTARIO Y AJUSTES                 */}
      {/* ===================================================== */}
      {kardexModalOpen && kardexProduct && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => { setKardexModalOpen(false); setKardexProduct(null); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>

            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 4px 0' }}>
                    🗃️ Kardex de Inventario & Ajustes Manuales
                  </h2>
                  <p style={{ color: '#fff', fontSize: '14px', fontWeight: '700', margin: 0 }}>
                    {kardexProduct.name} <span style={{ color: 'var(--text-secondary)', fontWeight: '400' }}>(SKU: {kardexProduct.sku})</span>
                  </p>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '8px', textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Stock Físico Disponible</span>
                  <strong style={{ fontSize: '18px', color: 'var(--green-neon)' }}>{kardexProduct.stock_physical_cases || 0} master cases</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', flexGrow: 1, overflowY: 'auto', marginBottom: '20px' }}>
              
              {/* PANEL IZQUIERDO: Historial del Kardex */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>📜 Historial de Transacciones (Kardex)</h3>
                
                {loadingKardex ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--cyan-neon)' }}>⏳ Cargando historial...</div>
                ) : kardexHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
                    No hay movimientos registrados para este producto. Realiza el **Inventario Inicial** en el panel lateral.
                  </div>
                ) : (
                  <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '400px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                          <th style={{ padding: '10px 12px' }}>Fecha</th>
                          <th style={{ padding: '10px 12px' }}>Tipo</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>Cantidad</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>Saldo (Ant/Nvo)</th>
                          <th style={{ padding: '10px 12px' }}>Detalles / Glosa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kardexHistory.map((k, idx) => {
                          const isPositive = k.quantity_cases > 0;
                          return (
                            <tr key={k.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                {new Date(k.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span className={`badge ${
                                  k.movement_type === 'INITIAL' ? 'badge-cyan' :
                                  k.movement_type === 'PRODUCTION' ? 'badge-green' :
                                  k.movement_type === 'SALE' ? 'badge-pink' :
                                  'badge-orange'
                                }`} style={{ fontSize: '9px' }}>
                                  {k.movement_type}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: isPositive ? 'var(--green-neon)' : 'var(--pink-neon)' }}>
                                {isPositive ? `+${k.quantity_cases}` : k.quantity_cases}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                {k.previous_stock} → {k.new_stock}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#fff', fontSize: '11px' }}>
                                {k.notes}
                                {k.user_name && <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Por: {k.user_name}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PANEL DERECHO: Formulario de Ajustes */}
              <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>⚙️ Registrar Operación / Ajuste Manual</h3>
                
                <form onSubmit={handleSaveAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>Tipo de Operación</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="adjustType"
                          checked={adjustType === 'INITIAL'}
                          onChange={() => setAdjustType('INITIAL')}
                          style={{ cursor: 'pointer' }}
                        />
                        Inventario Inicial
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="adjustType"
                          checked={adjustType === 'ADJUSTMENT'}
                          onChange={() => setAdjustType('ADJUSTMENT')}
                          style={{ cursor: 'pointer' }}
                        />
                        Ajuste Manual (+/-)
                      </label>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                      {adjustType === 'INITIAL' ? 'Cantidad de Inicio (Stock Absoluto)' : 'Cantidad del Ajuste'}
                    </label>
                    <input
                      type="number"
                      placeholder={adjustType === 'INITIAL' ? 'Ej: 150 (Establece el stock en 150)' : 'Ej: 20 (suma 20) o -15 (resta 15)'}
                      value={adjustQty}
                      required
                      onChange={(e) => setAdjustQty(e.target.value)}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {adjustType === 'INITIAL' 
                        ? 'Sobrescribe el stock físico comercial con la cantidad exacta indicada (cajas master).' 
                        : 'Suma o resta cantidades al saldo actual del inventario comercial disponible.'}
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Notas / Glosa de Auditoría</label>
                    <textarea
                      rows="3"
                      placeholder="Ej: Carga inicial de arranque de operaciones, ajuste por descarte en bodega, etc."
                      value={adjustNotes}
                      required
                      onChange={(e) => setAdjustNotes(e.target.value)}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 14px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', resize: 'none', fontSize: '12.5px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '10px' }}>
                    <button
                      type="submit"
                      disabled={submittingAdjustment}
                      className="btn-pink"
                      style={{ padding: '10px 24px', fontSize: '12.5px', fontWeight: '700', width: '100%' }}
                    >
                      {submittingAdjustment ? 'Procesando ajuste...' : '💾 Registrar en Kardex'}
                    </button>
                  </div>
                </form>
              </div>

            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => { setKardexModalOpen(false); setKardexProduct(null); }}
                className="btn-glass"
                style={{ padding: '10px 24px' }}
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: SELECCIÓN DE PAGO (POST-CHECKOUT B2B)          */}
      {/* ===================================================== */}
      {showPaymentModal && createdOrder && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '250', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            
            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px', textAlign: 'center' }}>
              <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 6px 0' }}>
                💳 Método de Pago del Pedido
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Pedido: <strong style={{ color: '#fff' }}>#{createdOrder.id.split('-')[0].toUpperCase()}</strong> | Total: <strong style={{ color: 'var(--green-neon)' }}>${parseFloat(createdOrder.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
              </p>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {!selectedPaymentMethod ? (
                <>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 8px 0' }}>
                    Selecciona tu método de pago preferido para procesar tu orden:
                  </p>
                  
                  <button
                    onClick={() => setSelectedPaymentMethod('bank')}
                    className="btn-glass-cyan"
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}
                  >
                    <span>🏦 Transferencia Bancaria Directa</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '400' }}>Paga offline a nuestras cuentas en el banco corporativo.</span>
                  </button>

                  <button
                    onClick={() => setSelectedPaymentMethod('stripe')}
                    className="btn-glass-neon"
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}
                  >
                    <span>💳 Tarjeta de Crédito / Débito (Stripe)</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '400' }}>Procesa tu pago de forma instantánea y segura.</span>
                  </button>
                </>
              ) : selectedPaymentMethod === 'bank' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#fff', margin: 0 }}>🏦 Cuentas de Transferencia Gosu</h3>
                    <button onClick={() => setSelectedPaymentMethod('')} style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                      Cambiar método
                    </button>
                  </div>

                  {loadingBankDetails ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--cyan-neon)' }}>⏳ Cargando datos bancarios del vendedor...</div>
                  ) : bankDetails && bankDetails.bank_name ? (
                    <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Banco Destinatario</span>
                          <strong style={{ color: '#fff' }}>{bankDetails.bank_name}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Titular de la Cuenta</span>
                          <strong style={{ color: '#fff' }}>{bankDetails.bank_account_name}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Número de Cuenta / IBAN</span>
                          <strong style={{ color: 'var(--cyan-neon)', fontFamily: 'monospace', fontSize: '14px' }}>{bankDetails.bank_account_number}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Código SWIFT / ABA / Ruta</span>
                          <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{bankDetails.bank_routing_number}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '16px', background: 'rgba(255, 92, 0, 0.05)', border: '1px solid rgba(255, 92, 0, 0.15)', borderRadius: '8px', fontSize: '12.5px', color: 'var(--orange-neon)' }}>
                      ⚠️ No se han registrado datos de cuentas bancarias en la configuración del tenant actual. Por favor, comunícate con tu ejecutivo comercial para coordinar el pago.
                    </div>
                  )}

                  <div style={{ padding: '12px', background: 'rgba(0, 232, 255, 0.03)', border: '1px solid rgba(0, 232, 255, 0.1)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ℹ️ Realiza la transferencia por el total indicado y comparte la constancia con tu agente comercial. Tu pedido permanecerá en estado <strong>Proforma</strong> hasta ser confirmado.
                  </div>

                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setCreatedOrder(null);
                      setActiveTab('orders');
                    }}
                    className="btn-pink"
                    style={{ width: '100%', padding: '12px', fontWeight: '800' }}
                  >
                    ✓ Entendido, Ir a Mis Compras
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#fff', margin: 0 }}>💳 Pago con Tarjeta (Stripe Checkout)</h3>
                    <button onClick={() => setSelectedPaymentMethod('')} style={{ background: 'transparent', border: 'none', color: 'var(--cyan-neon)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                      Cambiar método
                    </button>
                  </div>

                  {stripePaidSuccess ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px 0', textAlign: 'center' }}>
                      <span style={{ fontSize: '48px' }}>🎉</span>
                      <div>
                        <h4 style={{ color: 'var(--green-neon)', fontSize: '16px', fontWeight: '800', margin: '0 0 4px' }}>¡Pago Completado con Éxito!</h4>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                          La pasarela de Stripe procesó el cobro de forma exitosa y el estado de tu pedido se actualizó a <strong>Paid (Pagado)</strong> en tu panel de compras.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowPaymentModal(false);
                          setCreatedOrder(null);
                          setActiveTab('orders');
                        }}
                        className="btn-pink"
                        style={{ padding: '10px 24px', width: '100%', fontWeight: '800' }}
                      >
                        Ir a Mis Compras B2B
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ padding: '20px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px', textAlign: 'center' }}>🔒</span>
                        <p style={{ fontSize: '13px', color: '#fff', fontWeight: '600', margin: '0 0 8px 0', textAlign: 'center' }}>Pasarela de Pago Segura</p>
                        
                        {/* Advertencia y Desglose de Recargo */}
                        <div style={{ padding: '10px 12px', background: 'rgba(255, 0, 127, 0.08)', borderLeft: '4px solid var(--pink-neon)', borderRadius: '4px', marginBottom: '14px', fontSize: '11.5px', color: '#fff', lineHeight: '1.5' }}>
                          ⚠️ Se aplicará un recargo por transacción electrónica del 3.5% + $0.30 USD sobre el total de tu orden.
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Monto FOB Pedido:</span>
                            <span style={{ fontWeight: '600', color: '#fff' }}>${parseFloat(createdOrder.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Comisión de Pasarela (3.5% + $0.30):</span>
                            <span style={{ fontWeight: '600', color: 'var(--pink-neon)' }}>${((parseFloat(createdOrder.total_usd) * 0.035) + 0.30).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800' }}>
                          <span style={{ color: 'var(--green-neon)' }}>Total a Pagar en Stripe:</span>
                          <span style={{ color: 'var(--green-neon)' }}>${((parseFloat(createdOrder.total_usd) * 1.035) + 0.30).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                        </div>
                      </div>

                      <button
                        onClick={handleRealStripePayment}
                        disabled={simulatingStripePayment}
                        className="btn-neon"
                        style={{ width: '100%', padding: '14px', fontWeight: '800', fontSize: '13.5px' }}
                      >
                        {simulatingStripePayment ? '⏳ Redirigiendo a Stripe...' : `Pagar con Tarjeta (Total: $${((parseFloat(createdOrder.total_usd) * 1.035) + 0.30).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD)`}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>

            <div style={{ textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setCreatedOrder(null);
                  setActiveTab('orders');
                }}
                className="btn-glass"
                style={{ padding: '8px 24px', fontSize: '12px' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================== */}
      {/* MODAL: DETALLE DE PEDIDO (POPUP DETALLE B2B)          */}
      {/* ===================================================== */}
      {showOrderDetailModal && selectedOrderDetail && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--cyan-neon)' }}>
            <button onClick={() => { setShowOrderDetailModal(false); setSelectedOrderDetail(null); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>
            
            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--cyan-neon)', margin: '0 0 4px 0' }}>
                    📋 {selectedOrderDetail.po_number || 'Purchase Order'} — Detalle del Pedido
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Fecha de Registro: {new Date(selectedOrderDetail.created_at).toLocaleString('es-ES')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`badge ${
                    selectedOrderDetail.status === 'En Revisión' ? 'badge-pink' :
                    selectedOrderDetail.status === 'En Preparación' ? 'badge-cyan' :
                    selectedOrderDetail.status === 'Enviado' ? 'badge-orange' :
                    'badge-green'
                  }`} style={{ fontSize: '12px', padding: '6px 12px', height: 'fit-content' }}>
                    {selectedOrderDetail.status}
                  </span>

                  {/* Admin: cambiar estado directamente */}
                  {isAdmin && (
                    <select
                      value={selectedOrderDetail.status}
                      onChange={async (e) => {
                        try {
                          await ordersApi.updateStatus(selectedOrderDetail.id, e.target.value);
                          setSelectedOrderDetail(prev => ({ ...prev, status: e.target.value }));
                          await loadOrders();
                        } catch(err) {
                          alert(`❌ Error al cambiar estado: ${err.message}`);
                        }
                      }}
                      style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}
                    >
                      <option value="En Revisión">En Revisión</option>
                      <option value="En Preparación">En Preparación</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Entregado">Entregado</option>
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Incoterm de Compra</span>
                  <strong style={{ color: '#fff', fontSize: '13px' }}>{selectedOrderDetail.incoterm || 'FOB China'}</strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Volumen Cubierto</span>
                  <strong style={{ color: 'var(--cyan-neon)', fontSize: '13px' }}>{parseFloat(selectedOrderDetail.total_cbm || 0).toFixed(4)} CBM</strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Cajas Totales</span>
                  <strong style={{ color: '#fff', fontSize: '13px' }}>{selectedOrderDetail.total_cases || 0} master cases</strong>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                <h4 style={{ fontSize: '12px', color: 'var(--cyan-neon)', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏢 Información B2B & Fiscal</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '12.5px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Razón Social:</span>
                    <strong>{selectedOrderDetail.company_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Identificación Fiscal:</span>
                    <strong>{selectedOrderDetail.tax_id}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Facturación:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{selectedOrderDetail.billing_address}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Forwarder en China:</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>{selectedOrderDetail.forwarder_address}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Productos del Lote Comercial:</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>SKU</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Cajas Master</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Packs Totales</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Precio Caja</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal Item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDetail.items?.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--cyan-neon)' }}>{item.sku}</td>
                          <td style={{ padding: '8px', color: '#fff' }}>{item.name}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{item.qty_cases}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {item.qty_cases * (item.units_per_case || 1)} uds.
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${parseFloat(item.price_case_usd).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--green-neon)' }}>
                            ${parseFloat(item.total_item_usd).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <div style={{ width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span>
                    <strong style={{ color: '#fff' }}>${parseFloat(selectedOrderDetail.subtotal_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
                  </div>
                  {parseFloat(selectedOrderDetail.discount_usd) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--pink-neon)' }}>
                      <span>Descuentos:</span>
                      <strong>-${parseFloat(selectedOrderDetail.discount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '15px' }}>
                    <span style={{ color: 'var(--green-neon)', fontWeight: 'bold' }}>Total FOB:</span>
                    <strong style={{ color: 'var(--green-neon)' }}>${parseFloat(selectedOrderDetail.total_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Descarga de Documentación Oficial:</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn-glass" 
                    onClick={() => {
                      const token = localStorage.getItem('gosu_token');
                      window.open(`${API_URL}/api/orders/${selectedOrderDetail.id}/invoice?token=${token}`, '_blank');
                    }}
                    style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700' }}
                  >
                    📄 Commercial Invoice / Proforma (PDF)
                  </button>
                  <button 
                    className="btn-glass-pink" 
                    onClick={() => {
                      const token = localStorage.getItem('gosu_token');
                      window.open(`${API_URL}/api/orders/${selectedOrderDetail.id}/packing-list?token=${token}`, '_blank');
                    }}
                    style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700' }}
                  >
                    📦 Packing List Oficial (PDF)
                  </button>
                </div>
              </div>

            </div>

            <div style={{ textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setShowOrderDetailModal(false); setSelectedOrderDetail(null); }}
                className="btn-glass"
                style={{ padding: '10px 24px' }}
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===================================================== */}
      {/* MODAL: DETALLE DE ORDEN DE FABRICACIÓN (ADMIN POPUP)   */}
      {/* ===================================================== */}
      {showProdOrderDetailModal && selectedProdOrder && (
        <div style={{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: '200', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '28px', position: 'relative', border: '1px solid var(--pink-neon)' }}>
            <button onClick={() => { setShowProdOrderDetailModal(false); setSelectedProdOrder(null); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>
            
            <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '18px', color: 'var(--pink-neon)', margin: '0 0 4px 0' }}>
                    🏭 {selectedProdOrder.order_number} — Detalle de Fabricación
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Registrado el: {new Date(selectedProdOrder.created_at).toLocaleString('es-ES')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`badge ${
                    selectedProdOrder.status === 'Proforma' ? 'badge-pink' :
                    selectedProdOrder.status === 'Production' ? 'badge-orange' :
                    selectedProdOrder.status === 'QC Control' ? 'badge-cyan' :
                    selectedProdOrder.status === 'Shipped' ? 'badge-orange' :
                    'badge-green'
                  }`} style={{ fontSize: '12px', padding: '6px 12px', height: 'fit-content' }}>
                    {selectedProdOrder.status}
                  </span>

                  <select
                    value={selectedProdOrder.status}
                    onChange={async (e) => {
                      try {
                        await handleUpdateProductionStatus(selectedProdOrder.id, e.target.value);
                        setSelectedProdOrder(prev => ({ ...prev, status: e.target.value }));
                      } catch(err) {
                        alert(`❌ Error al cambiar estado: ${err.message}`);
                      }
                    }}
                    style={{ background: '#121212', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}
                  >
                    <option value="Proforma">Proforma</option>
                    <option value="Production">Production (Fabricación)</option>
                    <option value="QC Control">QC Control</option>
                    <option value="Shipped">Shipped (Enviado)</option>
                    <option value="Delivered">Delivered (Entregado)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Timeline Gráfico de Estados */}
              {(() => {
                const stepNames = ['Proforma', 'Production', 'QC Control', 'Shipped', 'Delivered'];
                const currentStepIdx = stepNames.indexOf(selectedProdOrder.status);
                return (
                  <div style={{ padding: '10px 0 20px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', width: '100%' }}>
                      <div style={{ position: 'absolute', top: '15px', left: '6%', right: '6%', height: '3px', background: 'rgba(255,255,255,0.06)', zIndex: 1 }} />
                      <div style={{ position: 'absolute', top: '15px', left: '6%', width: `${(currentStepIdx / (stepNames.length - 1)) * 88}%`, height: '3px', background: 'var(--cyan-neon)', zIndex: 2, transition: 'all 0.4s ease' }} />

                      {stepNames.map((step, idx) => {
                        const isActive = idx <= currentStepIdx;
                        const isCurrent = idx === currentStepIdx;
                        return (
                          <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative', width: '22%' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: isCurrent ? 'var(--pink-neon)' : isActive ? 'var(--cyan-neon)' : 'rgba(20, 20, 20, 0.9)',
                              border: isActive ? '2px solid transparent' : '2px solid rgba(255,255,255,0.1)',
                              boxShadow: isCurrent ? '0 0 10px var(--pink-neon)' : isActive ? '0 0 8px var(--cyan-neon)' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              color: isActive ? '#000' : 'rgba(255,255,255,0.4)',
                              fontWeight: '900',
                              transition: 'all 0.3s'
                            }}>
                              {idx + 1}
                            </div>
                            <span style={{ fontSize: '10px', marginTop: '6px', textAlign: 'center', fontWeight: isCurrent ? '700' : '500', color: isCurrent ? 'var(--pink-neon)' : isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fábrica Origen</div>
                  <strong style={{ fontSize: '14px', color: '#fff', marginTop: '2px', display: 'block' }}>{selectedProdOrder.factory_name}</strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Almacén de Llegada</div>
                  <strong style={{ fontSize: '14px', color: 'var(--cyan-neon)', marginTop: '2px', display: 'block' }}>
                    {warehouses.find(w => w.id === selectedProdOrder.warehouse_id)?.name || 'Sin asignar'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Costo Total Lote</div>
                  <strong style={{ fontSize: '14px', color: 'var(--green-neon)', marginTop: '2px', display: 'block' }}>
                    ${parseFloat(selectedProdOrder.total_cost_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Volumen de Carga</div>
                  <strong style={{ fontSize: '14px', color: 'var(--cyan-neon)', marginTop: '2px', display: 'block' }}>{parseFloat(selectedProdOrder.total_cbm).toFixed(4)} CBM</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Código / Tracking Contenedor</div>
                  <strong style={{ fontSize: '13px', color: '#fff', marginTop: '2px', display: 'block', textTransform: 'uppercase' }}>
                    {selectedProdOrder.tracking_number || 'N/A'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Entrega Estimada / Real</div>
                  <strong style={{ fontSize: '13px', color: '#fff', marginTop: '2px', display: 'block' }}>
                    {selectedProdOrder.status === 'Delivered' 
                      ? `Entregado: ${selectedProdOrder.actual_completion_date ? new Date(selectedProdOrder.actual_completion_date).toLocaleDateString('es-ES') : 'N/A'}` 
                      : selectedProdOrder.estimated_completion_date 
                        ? new Date(selectedProdOrder.estimated_completion_date).toLocaleDateString('es-ES') 
                        : 'Sin estimar'}
                  </strong>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Productos a Producir:</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>SKU</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Cajas Master</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>CBM Unitario</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Total CBM</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Costo Caja</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Total Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProdOrder.items?.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--cyan-neon)' }}>{item.sku}</td>
                          <td style={{ padding: '8px', color: '#fff' }}>{item.name}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{item.quantity_cases}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{parseFloat(item.item_cbm / item.quantity_cases).toFixed(4)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--cyan-neon)' }}>{parseFloat(item.item_cbm).toFixed(4)} CBM</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${parseFloat(item.cost_per_case_usd).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--green-neon)' }}>
                            ${parseFloat(item.total_item_cost_usd).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bitácora de Auditoría */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,232,255,0.01)', border: '1px solid rgba(0,232,255,0.15)', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '12.5px', color: 'var(--cyan-neon)', margin: '0 0 12px', fontWeight: '700', textTransform: 'uppercase' }}>
                  📜 Registro de Auditoría de Estados de Fabricación
                </h4>
                {productionAuditLogs.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cargando logs o sin cambios de estado aún...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {productionAuditLogs.map((log) => (
                      <div key={log.id} style={{ fontSize: '11.5px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '6px' }}>
                        <span style={{ color: 'var(--cyan-neon)' }}>{new Date(log.created_at).toLocaleString('es-ES')}</span>
                        <span style={{ color: '#fff' }}> — <strong>{log.user_name}</strong> {log.action === 'CREATE_PRODUCTION_ORDER' ? 'creó la orden' : 'cambió el estado'}</span>
                        {log.old_value && (
                          <>
                            <span> de <strong style={{ color: 'var(--orange-neon)' }}>{log.old_value}</strong></span>
                          </>
                        )}
                        <span> a <strong style={{ color: 'var(--green-neon)' }}>{log.new_value}</strong></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={() => handleExportPDF(selectedProdOrder)}
                className="btn-glass-neon"
                style={{ padding: '10px 20px', fontSize: '12.5px' }}
              >
                📄 Exportar Ficha (PDF)
              </button>
              <button
                type="button"
                onClick={() => { setShowProdOrderDetailModal(false); setSelectedProdOrder(null); }}
                className="btn-glass"
                style={{ padding: '10px 24px' }}
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
