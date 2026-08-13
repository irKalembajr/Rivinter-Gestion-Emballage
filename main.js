import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dashboardProject = raw.match(/supabase\.com\/dashboard\/project\/([^/?#]+)/i);
  if (dashboardProject?.[1]) return `https://${dashboardProject[1]}.supabase.co`;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".supabase.co")) return url.origin;
  } catch (_error) {
    return raw;
  }
  return raw;
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", subtitle: "Vue globale des stocks, achats, retours et audits." },
  { id: "sites", label: "Gestion de sites", subtitle: "Stocks initiaux au dépôt, à l'usine et objectifs d'achat." },
  { id: "daily", label: "Gestion journalière", subtitle: "Situation quotidienne des emballages par site et axe." },
  { id: "purchases", label: "Achats produits", subtitle: "Produits Brasimba achetés par site ou par axe." },
  { id: "returns", label: "Retour emballages", subtitle: "Déconsignations envoyées à Brasimba par type de Bremer." },
  { id: "audit", label: "Audit", subtitle: "Résultat mensuel par site selon caisse, produits, dépenses et banque." },
  { id: "finance", label: "Suivi finance", subtitle: "Versements bancaires, consignations, dettes et paiements entre sites." },
  { id: "capital", label: "Suivi capital", subtitle: "Valeur produits, caisse, dettes, plafond de crédit et valeur nette Rivinter." },
  { id: "reports", label: "Reporting", subtitle: "Rapports hebdomadaires, mensuels, Excel et PDF." },
  { id: "accounts", label: "Gestion comptes", subtitle: "Rôles, affectations et sécurité." }
];

const BANK_ACCOUNTS = [
  { id: "rawbank-rivinter", bank: "Rawbank", account: "Compte1 Rivinter", locations: ["oicha", "eringeti", "mabalako1", "mabalako2", "mununze", "kyanzaba", "usine", "mungamba", "mambingi", "mabuku", "cantine", "goma"], brasimba: false },
  { id: "rawbank-riviera", bank: "Rawbank", account: "Compte2 Riviera", locations: ["kasindi"], brasimba: false },
  { id: "rawbank-brasimba", bank: "Rawbank", account: "Compte3 Brasimba", locations: ["oicha", "eringeti", "kasindi", "mabalako1", "mabalako2", "mununze", "kyanzaba", "usine", "mungamba", "mambingi", "mabuku", "cantine", "goma"], brasimba: true },
  { id: "tmb-rivinter", bank: "TMB", account: "Compte1 Rivinter", locations: ["beni", "pasisi", "komanda", "mambasa", "mungamba"], brasimba: false },
  { id: "tmb-brasimba", bank: "TMB", account: "Compte2 Brasimba", locations: ["beni", "pasisi", "komanda", "mambasa", "mungamba"], brasimba: true }
];

const PAYMENT_TYPES = {
  payer: "Payer",
  ordre_virement: "Ordre de virement"
};

const ROLE_LABELS = {
  principal_admin: "Administrateur principal",
  admin: "Administrateur secondaire",
  user: "Utilisateur"
};

const nf = new Intl.NumberFormat("fr-FR");
const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const $ = (selector) => document.querySelector(selector);

let app = {
  session: null,
  profile: null,
  view: "dashboard",
  month: new Date().toISOString().slice(0, 7),
  locationFilter: "all",
  locations: [],
  bremers: [],
  products: [],
  productPrices: [],
  settings: [],
  initialStocks: [],
  globalFactoryInitial: [],
  objectives: [],
  productObjectives: [],
  purchases: [],
  returns: [],
  audits: [],
  financeDeposits: [],
  financeLoans: [],
  financePayments: [],
  capitalEntries: [],
  capitalSettings: [],
  depotPackaging: [],
  depotProducts: [],
  dailyStocks: [],
  profiles: []
};

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function n(value) {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtQty(value) {
  return nf.format(Math.round(n(value)));
}

function fmtMoney(value) {
  return `${money.format(Math.round(n(value)))} Fc`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isAdmin() {
  return ["principal_admin", "admin"].includes(app.profile?.role);
}

function isPrincipalAdmin() {
  return app.profile?.role === "principal_admin";
}

function initialStockLocked() {
  const setting = app.settings.find((row) => row.key === "initial_stock");
  return Boolean(setting?.value?.locked);
}

function canEditInitialStock() {
  return isAdmin() && !initialStockLocked();
}

function allowedLocationIds() {
  if (isAdmin()) return app.locations.map((loc) => loc.id);
  return app.profile?.location_id ? [app.profile.location_id] : [];
}

function selectedLocationIds() {
  const allowed = allowedLocationIds();
  if (!isAdmin()) return allowed;
  if (app.locationFilter === "all") return allowed;
  return allowed.includes(app.locationFilter) ? [app.locationFilter] : allowed;
}

function loc(id) {
  return app.locations.find((row) => row.id === id);
}

function bremer(id) {
  return app.bremers.find((row) => row.id === id);
}

function isBac(bremerOrId) {
  return String(typeof bremerOrId === "object" ? bremerOrId?.id : bremerOrId).toUpperCase() === "BAC";
}

function packagingBremers() {
  return app.bremers.filter((row) => !isBac(row));
}

function bacBremers() {
  return app.bremers.filter((row) => isBac(row));
}

function product(id) {
  return app.products.find((row) => row.id === id);
}

function productPrice(productId, locationId) {
  const override = app.productPrices.find((row) => row.product_id === productId && row.location_id === locationId);
  return n(override?.price || product(productId)?.price);
}

function purchaseUnitPrice(row) {
  return n(row.unit_price) || productPrice(row.product_id, row.location_id);
}

function isConsignment(row) {
  return row.movement_type === "consignment";
}

function returnRowsOnly() {
  return app.returns.filter((row) => !isConsignment(row));
}

function consignmentRowsOnly() {
  return app.returns.filter((row) => isConsignment(row));
}

function bankAccount(id) {
  return BANK_ACCOUNTS.find((row) => row.id === id);
}

function bankAccountId(bankName, accountName) {
  return BANK_ACCOUNTS.find((row) => row.bank === bankName && row.account === accountName)?.id || "";
}

function allowedBankAccounts(locationId, purpose = "versement") {
  if (purpose === "consignation" || purpose === "payment") return BANK_ACCOUNTS;
  return BANK_ACCOUNTS.filter((row) => row.locations.includes(locationId) && (purpose === "consignation" ? row.brasimba : true));
}

function bankAccountAllowed(locationId, accountId, purpose = "versement") {
  return allowedBankAccounts(locationId, purpose).some((row) => row.id === accountId);
}

function financeAccountOptions(locationId, purpose = "versement", selected = "") {
  const rows = allowedBankAccounts(locationId, purpose);
  return rows.map((row) => `<option value="${row.id}" ${selected === row.id ? "selected" : ""}>${h(row.bank)} - ${h(row.account)}</option>`).join("") || `<option value="">Aucun compte autorisé</option>`;
}

function inMonth(date, month = app.month) {
  return String(date || "").slice(0, 7) === month;
}

function dateBetween(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function stockQty(scope, locationId, bremerId) {
  return n(app.initialStocks.find((row) => row.scope === scope && row.location_id === locationId && row.bremer_id === bremerId)?.quantity);
}

function stockValue(scope, locationId, bremerId) {
  const row = app.initialStocks.find((item) => item.scope === scope && item.location_id === locationId && item.bremer_id === bremerId);
  if (!row) return 0;
  return n(row.value);
}

function globalFactoryQty(bremerId) {
  return n(app.globalFactoryInitial.find((row) => row.bremer_id === bremerId)?.quantity);
}

function globalFactoryValue(bremerId) {
  const row = app.globalFactoryInitial.find((item) => item.bremer_id === bremerId);
  if (!row) return 0;
  return n(row.value);
}

function bremerValue(bremerId, qty) {
  return n(qty) * n(bremer(bremerId)?.price);
}

function purchaseBremerId(row) {
  return product(row.product_id)?.bremer_id || "";
}

function purchaseValue(row) {
  return n(row.quantity) * purchaseUnitPrice(row);
}

function returnValue(row) {
  return bremerValue(row.bremer_id, row.quantity);
}

function movementValue(row) {
  return n(row.amount) || returnValue(row);
}

function returnGap(row) {
  return n(row.shipped_qty) - n(row.quantity);
}

function sumPurchasesByBremer(bremerId, locationId = null) {
  return app.purchases.reduce((sum, row) => {
    if (purchaseBremerId(row) !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function sumPurchasePackagingValueByBremer(bremerId, locationId = null) {
  return app.purchases.reduce((sum, row) => {
    if (purchaseBremerId(row) !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + bremerValue(bremerId, row.quantity);
  }, 0);
}

function sumReturnsByBremer(bremerId, locationId = null) {
  return returnRowsOnly().reduce((sum, row) => {
    if (row.bremer_id !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function sumReturnValueByBremer(bremerId, locationId = null) {
  return returnRowsOnly().reduce((sum, row) => {
    if (row.bremer_id !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + returnValue(row);
  }, 0);
}

function sumConsignmentsByBremer(bremerId, locationId = null) {
  return consignmentRowsOnly().reduce((sum, row) => {
    if (row.bremer_id !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function sumConsignmentValueByBremer(bremerId, locationId = null) {
  return consignmentRowsOnly().reduce((sum, row) => {
    if (row.bremer_id !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + returnValue(row);
  }, 0);
}

function depositCurrent(locationId, bremerId) {
  return stockQty("depot", locationId, bremerId)
    + sumPurchasesByBremer(bremerId, locationId)
    - sumReturnsByBremer(bremerId, locationId);
}

function depositCurrentValue(locationId, bremerId) {
  return stockValue("depot", locationId, bremerId)
    + sumPurchasePackagingValueByBremer(bremerId, locationId)
    - sumReturnValueByBremer(bremerId, locationId);
}

function factoryLocationCurrent(locationId, bremerId) {
  return stockQty("factory", locationId, bremerId)
    + sumReturnsByBremer(bremerId, locationId)
    + sumConsignmentsByBremer(bremerId, locationId)
    - sumPurchasesByBremer(bremerId, locationId);
}

function factoryLocationCurrentValue(locationId, bremerId) {
  return stockValue("factory", locationId, bremerId)
    + sumReturnValueByBremer(bremerId, locationId)
    + sumConsignmentValueByBremer(bremerId, locationId)
    - sumPurchasePackagingValueByBremer(bremerId, locationId);
}

function factoryUnassigned(bremerId) {
  const allocated = app.locations.reduce((sum, row) => sum + stockQty("factory", row.id, bremerId), 0);
  return globalFactoryQty(bremerId) - allocated;
}

function factoryUnassignedValue(bremerId) {
  const allocated = app.locations.reduce((sum, row) => sum + stockValue("factory", row.id, bremerId), 0);
  return globalFactoryValue(bremerId) - allocated;
}

function factoryGlobalCurrent(bremerId) {
  return factoryUnassigned(bremerId)
    + app.locations.reduce((sum, row) => sum + factoryLocationCurrent(row.id, bremerId), 0);
}

function factoryGlobalCurrentValue(bremerId) {
  return factoryUnassignedValue(bremerId)
    + app.locations.reduce((sum, row) => sum + factoryLocationCurrentValue(row.id, bremerId), 0);
}

function totalForLocation(locationId, source) {
  return packagingBremers().reduce((acc, b) => {
    const qty = source === "factory" ? factoryLocationCurrent(locationId, b.id) : depositCurrent(locationId, b.id);
    const value = source === "factory" ? factoryLocationCurrentValue(locationId, b.id) : depositCurrentValue(locationId, b.id);
    acc.qty += qty;
    acc.value += value;
    return acc;
  }, { qty: 0, value: 0 });
}

function initialTotalForLocation(locationId, scope = "depot") {
  return packagingBremers().reduce((acc, b) => {
    acc.qty += stockQty(scope, locationId, b.id);
    acc.value += bremerValue(b.id, stockQty(scope, locationId, b.id));
    return acc;
  }, { qty: 0, value: 0 });
}

function initialBacTotalForLocation(locationId, scope = "depot") {
  return bacBremers().reduce((acc, b) => {
    const qty = stockQty(scope, locationId, b.id);
    acc.qty += qty;
    acc.value += bremerValue(b.id, qty);
    return acc;
  }, { qty: 0, value: 0 });
}

function dailyEntry(date, locationId, bremerId) {
  return app.dailyStocks.find((row) => row.date === date && row.location_id === locationId && row.bremer_id === bremerId) || { quantity: 0 };
}

function dailyQty(date, locationId, bremerId) {
  return n(dailyEntry(date, locationId, bremerId).quantity);
}

function dailyTotal(date, locationId, bacOnly = false) {
  return (bacOnly ? bacBremers() : packagingBremers()).reduce((acc, b) => {
    const qty = dailyQty(date, locationId, b.id);
    acc.qty += qty;
    acc.value += bremerValue(b.id, qty);
    return acc;
  }, { qty: 0, value: 0 });
}

function selectionFactoryTotal(ids = selectedLocationIds()) {
  if (isAdmin() && app.locationFilter === "all") {
    return packagingBremers().reduce((acc, b) => {
      const qty = factoryGlobalCurrent(b.id);
      acc.qty += qty;
      acc.value += factoryGlobalCurrentValue(b.id);
      return acc;
    }, { qty: 0, value: 0 });
  }
  return ids.reduce((acc, id) => {
    const total = totalForLocation(id, "factory");
    acc.qty += total.qty;
    acc.value += total.value;
    return acc;
  }, { qty: 0, value: 0 });
}

function selectionDepositTotal(ids = selectedLocationIds()) {
  return ids.reduce((acc, id) => {
    const total = totalForLocation(id, "depot");
    acc.qty += total.qty;
    acc.value += total.value;
    return acc;
  }, { qty: 0, value: 0 });
}

function bacCurrentTotal(ids = selectedLocationIds(), source = "depot") {
  return ids.reduce((acc, id) => bacBremers().reduce((inner, b) => {
    const qty = source === "factory" ? factoryLocationCurrent(id, b.id) : depositCurrent(id, b.id);
    inner.qty += qty;
    inner.value += bremerValue(b.id, qty);
    return inner;
  }, acc), { qty: 0, value: 0 });
}

function purchaseSummary(ids = selectedLocationIds(), month = app.month, range = null) {
  return app.purchases
    .filter((row) => ids.includes(row.location_id))
    .filter((row) => range ? dateBetween(row.date, range.start, range.end) : inMonth(row.date, month))
    .reduce((acc, row) => {
      acc.qty += n(row.quantity);
      acc.value += purchaseValue(row);
      acc.packagingValue += bremerValue(purchaseBremerId(row), row.quantity);
      return acc;
    }, { qty: 0, value: 0, packagingValue: 0 });
}

function returnSummary(ids = selectedLocationIds(), month = app.month, range = null) {
  return returnRowsOnly()
    .filter((row) => !isBac(row.bremer_id))
    .filter((row) => ids.includes(row.location_id))
    .filter((row) => range ? dateBetween(row.date, range.start, range.end) : inMonth(row.date, month))
    .reduce((acc, row) => {
      acc.qty += n(row.quantity);
      acc.value += returnValue(row);
      acc.gap += returnGap(row);
      acc.gapValue += returnGap(row) * n(bremer(row.bremer_id)?.price);
      return acc;
    }, { qty: 0, value: 0, gap: 0, gapValue: 0 });
}

function bacReturnSummary(ids = selectedLocationIds(), month = app.month, range = null) {
  return returnRowsOnly().filter((row) => isBac(row.bremer_id) && ids.includes(row.location_id)).filter((row) => range ? dateBetween(row.date, range.start, range.end) : inMonth(row.date, month)).reduce((acc, row) => {
    acc.qty += n(row.quantity);
    acc.value += returnValue(row);
    return acc;
  }, { qty: 0, value: 0 });
}

function consignmentSummary(ids = selectedLocationIds(), month = app.month) {
  return consignmentRowsOnly()
    .filter((row) => ids.includes(row.location_id) && inMonth(row.date, month))
    .reduce((acc, row) => {
      acc.qty += n(row.quantity);
      acc.value += returnValue(row);
      return acc;
    }, { qty: 0, value: 0 });
}

function objective(locationId) {
  return app.objectives.find((row) => row.location_id === locationId && row.month === app.month) || { qty: 0, value: 0 };
}

function productObjective(locationId, productId) {
  return app.productObjectives.find((row) => row.location_id === locationId && row.product_id === productId && row.month === app.month) || { qty: 0 };
}

function productObjectiveQty(locationId, productId) {
  return n(productObjective(locationId, productId).qty);
}

function purchaseQtyByProduct(locationId, productId, month = app.month) {
  return app.purchases.reduce((sum, row) => {
    if (row.location_id !== locationId || row.product_id !== productId || !inMonth(row.date, month)) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function productObjectiveTotal(ids, productId) {
  return ids.reduce((sum, id) => sum + productObjectiveQty(id, productId), 0);
}

function productPurchaseTotal(ids, productId) {
  return ids.reduce((sum, id) => sum + purchaseQtyByProduct(id, productId), 0);
}

function globalObjectiveTotals(ids = selectedLocationIds()) {
  return ids.reduce((acc, id) => {
    const obj = objective(id);
    acc.qty += n(obj.qty);
    acc.value += n(obj.value);
    return acc;
  }, { qty: 0, value: 0 });
}

function currentDepotLocationId(ids = selectedLocationIds()) {
  const stored = sessionStorage.getItem("depotLocationId");
  if (ids.includes(stored)) return stored;
  return ids[0] || app.locations[0]?.id || "";
}

function depotPackagingEntry(locationId, bremerId) {
  return app.depotPackaging.find((row) => row.month === app.month && row.location_id === locationId && row.bremer_id === bremerId) || { quantity: 0, value: 0 };
}

function depotProductEntry(locationId, productId) {
  return app.depotProducts.find((row) => row.month === app.month && row.location_id === locationId && row.product_id === productId) || { quantity: 0, value: 0 };
}

function depotPackagingQty(locationId, bremerId) {
  return n(depotPackagingEntry(locationId, bremerId).quantity);
}

function depotPackagingValue(locationId, bremerId) {
  const row = depotPackagingEntry(locationId, bremerId);
  return n(row.value || bremerValue(bremerId, row.quantity));
}

function depotProductsBremerQty(locationId, bremerId) {
  return app.depotProducts.reduce((sum, row) => {
    if (row.month !== app.month || row.location_id !== locationId) return sum;
    if (product(row.product_id)?.bremer_id !== bremerId) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function depotProductsBremerValue(locationId, bremerId) {
  return bremerValue(bremerId, depotProductsBremerQty(locationId, bremerId));
}

function depotRepereQty(locationId, bremerId) {
  return depotPackagingQty(locationId, bremerId) + depotProductsBremerQty(locationId, bremerId);
}

function depotRepereValue(locationId, bremerId) {
  return depotPackagingValue(locationId, bremerId) + depotProductsBremerValue(locationId, bremerId);
}

function depotMonthlySummary(ids = selectedLocationIds()) {
  return ids.reduce((acc, id) => {
    app.bremers.forEach((b) => {
      acc.packagingQty += depotPackagingQty(id, b.id);
      acc.packagingValue += depotPackagingValue(id, b.id);
      acc.productsQty += depotProductsBremerQty(id, b.id);
      acc.productsValue += depotProductsBremerValue(id, b.id);
      acc.totalQty += depotRepereQty(id, b.id);
      acc.totalValue += depotRepereValue(id, b.id);
      acc.currentQty += depositCurrent(id, b.id);
      acc.currentValue += depositCurrentValue(id, b.id);
    });
    return acc;
  }, { packagingQty: 0, packagingValue: 0, productsQty: 0, productsValue: 0, totalQty: 0, totalValue: 0, currentQty: 0, currentValue: 0 });
}

function financePaymentSummary(month = app.month) {
  return app.financePayments
    .filter((row) => row.month === month)
    .reduce((acc, row) => {
      acc.count += 1;
      acc.value += n(row.amount);
      return acc;
    }, { count: 0, value: 0 });
}

function auditResult(record) {
  const fundsExpected = n(record.cash_initial) + n(record.sales_value) - n(record.rebates_value);
  const fundsControlled = n(record.cash_final) + n(record.bank_deposit) + n(record.salary) + n(record.expenses);
  const cashGap = fundsControlled - fundsExpected;
  const expectedFinalQty = n(record.stock_initial_qty) + n(record.purchases_qty) - n(record.sales_qty) - n(record.rebates_qty) - n(record.losses_qty) - n(record.free_qty);
  const productGap = n(record.stock_final_qty) - expectedFinalQty;
  const expectedFinalValue = n(record.stock_initial_value) + n(record.purchases_value) - n(record.sales_value) - n(record.rebates_value) - n(record.losses_value) - n(record.free_value);
  const productValueGap = n(record.stock_final_value) - expectedFinalValue;
  return { fundsExpected, fundsControlled, cashGap, expectedFinalQty, productGap, productValueGap };
}

async function requireOk(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function optionalRows(result, tableName) {
  if (!result.error) return result.data || [];
  const message = String(result.error.message || "");
  const missing = result.error.code === "42P01" || result.error.code === "PGRST205" || message.toLowerCase().includes(tableName.toLowerCase());
  if (missing) return [];
  throw result.error;
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) {
    return {
      error: response.ok
        ? "Réponse vide du serveur."
        : `Réponse vide du serveur Vercel (${response.status}). Vérifiez que la fonction /api/invite-user est déployée.`
    };
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      error: `Réponse serveur non JSON (${response.status}). Vérifiez le déploiement de /api/invite-user dans Vercel.`
    };
  }
}

async function init() {
  if (!supabase) {
    $("#authMessage").textContent = "Configuration Supabase manquante. Vérifiez les variables Vercel.";
    return;
  }
  const { data } = await supabase.auth.getSession();
  app.session = data.session;
  if (app.session) await loadApp();
  else showAuth();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    app.session = session;
    if (session) await loadApp();
    else showAuth();
  });
}

function showAuth() {
  $("#authScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
}

async function loadApp() {
  try {
    await loadData();
    $("#authScreen").classList.add("hidden");
    $("#appShell").classList.remove("hidden");
    render();
  } catch (error) {
    console.error(error);
    $("#authMessage").textContent = error.message || "Chargement impossible.";
    showAuth();
  }
}

async function loadData() {
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", app.session.user.id)
    .limit(2);
  if (profileError) throw profileError;
  if (!profileRows?.length) {
    throw new Error("Profil introuvable dans Supabase. Vérifiez que votre compte Auth existe aussi dans public.profiles avec le rôle principal_admin.");
  }
  if (profileRows.length > 1) {
    throw new Error("Plusieurs profils existent pour ce compte. Vérifiez la table public.profiles.");
  }
  const profile = profileRows[0];
  if (!profile.active) throw new Error("Ce compte est désactivé.");
  app.profile = profile;

  const [
    locations,
    bremers,
    products,
    productPrices,
    settings,
    initialStocks,
    globalFactoryInitial,
    objectives,
    productObjectives,
    purchases,
    returnsRows,
    audits,
    financeDeposits,
    financeLoans,
    financePayments,
    capitalEntries,
    capitalSettings,
    depotPackaging,
    depotProducts,
    dailyStocks,
    profiles
  ] = await Promise.all([
    requireOk(await supabase.from("locations").select("*").order("sort_order")),
    requireOk(await supabase.from("bremers").select("*").order("sort_order")),
    requireOk(await supabase.from("products").select("*").order("name")),
    requireOk(await supabase.from("product_prices").select("*")),
    isAdmin() ? requireOk(await supabase.from("app_settings").select("*")) : [],
    requireOk(await supabase.from("initial_stocks").select("*")),
    isAdmin() ? requireOk(await supabase.from("global_factory_initial").select("*")) : [],
    requireOk(await supabase.from("objectives").select("*")),
    requireOk(await supabase.from("product_objectives").select("*")),
    requireOk(await supabase.from("purchases").select("*").order("date", { ascending: false })),
    requireOk(await supabase.from("packaging_returns").select("*").order("date", { ascending: false })),
    requireOk(await supabase.from("audits").select("*")),
    requireOk(await supabase.from("finance_deposits").select("*").order("date", { ascending: false })),
    requireOk(await supabase.from("finance_loans").select("*").order("date", { ascending: false })),
    optionalRows(await supabase.from("finance_payments").select("*").order("date", { ascending: false }), "finance_payments"),
    requireOk(await supabase.from("capital_entries").select("*")),
    requireOk(await supabase.from("capital_settings").select("*")),
    optionalRows(await supabase.from("depot_monthly_packaging").select("*"), "depot_monthly_packaging"),
    optionalRows(await supabase.from("depot_monthly_products").select("*"), "depot_monthly_products"),
    optionalRows(await supabase.from("daily_stocks").select("*").order("date", { ascending: false }), "daily_stocks"),
    isAdmin() ? requireOk(await supabase.from("profiles").select("*").order("created_at", { ascending: false })) : []
  ]);

  Object.assign(app, { locations, bremers, products, productPrices, settings, initialStocks, globalFactoryInitial, objectives, productObjectives, purchases, returns: returnsRows, audits, financeDeposits, financeLoans, financePayments, capitalEntries, capitalSettings, depotPackaging, depotProducts, dailyStocks, profiles });
  if (!isAdmin()) app.locationFilter = app.profile.location_id || "";
  if (isAdmin() && app.locationFilter !== "all" && !allowedLocationIds().includes(app.locationFilter)) app.locationFilter = "all";
}

function render() {
  if (!isAdmin() && app.view === "accounts") app.view = "dashboard";
  const navItems = NAV_ITEMS.filter((item) => isAdmin() || item.id !== "accounts");
  $("#nav").innerHTML = navItems.map((item) => `<button class="${app.view === item.id ? "active" : ""}" data-view="${item.id}">${h(item.label)}</button>`).join("");
  $("#mobileView").innerHTML = navItems.map((item) => `<option value="${item.id}" ${app.view === item.id ? "selected" : ""}>${h(item.label)}</option>`).join("");
  const view = NAV_ITEMS.find((item) => item.id === app.view) || NAV_ITEMS[0];
  $("#viewTitle").textContent = view.label;
  $("#viewSubtitle").textContent = view.subtitle;
  $("#profileName").textContent = app.profile.full_name || app.profile.email;
  $("#profileRole").textContent = ROLE_LABELS[app.profile.role] || app.profile.role;
  $("#monthFilter").value = app.month;
  renderLocationFilter();

  const renderers = {
    dashboard: renderDashboard,
    sites: renderSites,
    daily: renderDailyManagement,
    purchases: renderPurchases,
    returns: renderReturns,
    audit: renderAudit,
    finance: renderFinance,
    capital: renderCapital,
    reports: renderReports,
    accounts: renderAccounts
  };
  $("#content").innerHTML = (renderers[app.view] || renderDashboard)();
  syncDynamicForms();
}

function renderLocationFilter() {
  const options = [
    ...(isAdmin() ? [{ id: "all", name: "Tous les sites et axes" }] : []),
    ...app.locations.filter((row) => allowedLocationIds().includes(row.id))
  ];
  $("#locationFilter").innerHTML = options.map((row) => `<option value="${row.id}" ${app.locationFilter === row.id ? "selected" : ""}>${h(row.name)}</option>`).join("");
  $("#locationFilter").disabled = !isAdmin();
}

function card(label, value, detail, className = "") {
  return `<article class="card ${h(className)}"><span>${h(label)}</span><strong>${h(value)}</strong><small>${h(detail)}</small></article>`;
}

function renderDashboard() {
  const ids = selectedLocationIds();
  const factory = selectionFactoryTotal(ids);
  const depot = selectionDepositTotal(ids);
  const purchases = purchaseSummary(ids);
  const returns = returnSummary(ids);
  const consignments = consignmentSummary(ids);
  const depotBacs = bacCurrentTotal(ids);
  const factoryBacs = bacCurrentTotal(ids, "factory");
  const factoryClass = factory.value < 0 ? "metric-negative" : factory.value > 0 ? "metric-positive" : "metric-neutral";
  return `
    <div class="cards">
      ${card("Solde Brasimba global", fmtMoney(factory.value), `${fmtQty(factory.qty)} emballages`, factoryClass)}
      ${card("Stock dépôts", fmtQty(depot.qty), fmtMoney(depot.value))}
      ${card("Achats du mois", fmtQty(purchases.qty), fmtMoney(purchases.value))}
      ${card("Retours du mois", fmtQty(returns.qty), fmtMoney(returns.value))}
      ${card("Consignations", fmtQty(consignments.qty), fmtMoney(consignments.value))}
    </div>
    <section class="panel bac-panel"><div class="panel-header"><div><h2>Gestion des bacs — séparée</h2><p>Ces quantités et valeurs ne sont pas incluses dans les totaux emballages/produits.</p></div></div><div class="cards compact-cards">${card("Bacs aux dépôts", fmtQty(depotBacs.qty), fmtMoney(depotBacs.value))}${card("Bacs usine Brasimba", fmtQty(factoryBacs.qty), fmtMoney(factoryBacs.value))}${card("Retours de bacs du mois", fmtQty(bacReturnSummary(ids).qty), fmtMoney(bacReturnSummary(ids).value))}</div></section>
    <div class="split">
      <section class="panel">
        <div class="panel-header"><div><h2>Stock par site et axe</h2><p>Dépôt = initial + achats produits - retours emballages.</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Site / axe</th><th>Type</th>${packagingBremers().map((b) => `<th class="num">${h(b.code)}</th>`).join("")}<th class="num">Total</th><th class="num">Valeur</th></tr></thead>
            <tbody>
              ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
                const total = totalForLocation(row.id, "depot");
                return `<tr><td>${h(row.name)}</td><td><span class="pill neutral">${h(row.kind)}</span></td>
                  ${packagingBremers().map((b) => `<td class="num ${depositCurrent(row.id, b.id) < 0 ? "status-bad" : ""}">${fmtQty(depositCurrent(row.id, b.id))}</td>`).join("")}
                  <td class="num"><strong>${fmtQty(total.qty)}</strong></td><td class="num">${fmtMoney(total.value)}</td></tr>`;
              }).join("") || `<tr><td colspan="9">Aucune donnée visible.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2>Solde Brasimba</h2><p>Initial usine + retours - achats produits.</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bremer</th><th class="num">Quantité</th><th class="num">Valeur</th></tr></thead>
            <tbody>
              ${packagingBremers().map((b) => {
                const qty = isAdmin() && app.locationFilter === "all"
                  ? factoryGlobalCurrent(b.id)
                  : ids.reduce((sum, id) => sum + factoryLocationCurrent(id, b.id), 0);
                const value = isAdmin() && app.locationFilter === "all"
                  ? factoryGlobalCurrentValue(b.id)
                  : ids.reduce((sum, id) => sum + factoryLocationCurrentValue(id, b.id), 0);
                return `<tr><td>${h(b.code)} - ${h(b.label)}</td><td class="num ${qty < 0 ? "status-bad" : ""}">${fmtQty(qty)}</td><td class="num">${fmtMoney(value)}</td></tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    ${renderStockComparison(ids)}
    ${renderObjectives(ids)}
  `;
}

function renderStockComparison(ids = selectedLocationIds()) {
  const date = sessionStorage.getItem("dailyDate") || today();
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Contrôle Stock Initial vs Stock Calculé</h2>
          <p>Solde contrôlé = Stock initial − situation journalière du ${h(date)}. Les bacs sont exclus de ce contrôle.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Site / axe</th>
              <th class="num">Initial Q</th>
              <th class="num">Initial V</th>
              <th class="num">Journalier Q</th>
              <th class="num">Journalier V</th>
              <th class="num">Solde Q</th>
              <th class="num">Solde V</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
              const initial = initialTotalForLocation(row.id, "depot");
              const current = dailyTotal(date, row.id);
              const gapQ = initial.qty - current.qty;
              const gapV = initial.value - current.value;
              const status = gapQ === 0 ? { label: "Correct", pill: "", cls: "status-ok" } : gapQ > 0 ? { label: "Dette", pill: "bad", cls: "status-bad" } : { label: "Excédent", pill: "warn", cls: "status-warn" };
              return `<tr>
                <td>${h(row.name)}</td>
                <td class="num">${fmtQty(initial.qty)}</td>
                <td class="num">${fmtMoney(initial.value)}</td>
                <td class="num">${fmtQty(current.qty)}</td>
                <td class="num">${fmtMoney(current.value)}</td>
                <td class="num ${status.cls}">${fmtQty(gapQ)}</td>
                <td class="num ${status.cls}">${fmtMoney(gapV)}</td>
                <td><span class="pill ${status.pill}">${status.label}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDailyManagement() {
  const locations = app.locations.filter((row) => selectedLocationIds().includes(row.id));
  const date = sessionStorage.getItem("dailyDate") || today();
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Gestion journalière</h2><p>Encodez les quantités physiques en fin de journée. Les valeurs sont automatiques.</p></div><label>Date de situation<input id="dailyDate" type="date" value="${h(date)}"></label></div>
      ${locations.map((location) => dailyLocationPanel(date, location)).join("")}
    </section>
    ${renderStockComparison(locations.map((row) => row.id))}
  `;
}

function dailyLocationPanel(date, location) {
  const packaging = dailyTotal(date, location.id);
  const bac = dailyTotal(date, location.id, true);
  return `<section class="mini-panel daily-site"><div class="panel-header"><div><h2>${h(location.name)}</h2><p>${h(location.kind)}</p></div></div><div class="table-wrap"><table>
    <thead><tr><th>Bremer</th><th class="num">Quantité</th><th class="num">Constante</th><th class="num">Valeur calculée</th></tr></thead>
    <tbody>${app.bremers.map((b) => `<tr class="${isBac(b) ? "bac-row" : ""}"><td>${h(b.code)} - ${h(b.label)}${isBac(b) ? " (séparé)" : ""}</td><td><input class="daily-stock-input" data-date="${date}" data-location="${location.id}" data-bremer="${b.id}" value="${h(dailyQty(date, location.id, b.id))}" ${isAdmin() ? "" : "disabled"}></td><td class="num">${fmtMoney(b.price)}</td><td class="num">${fmtMoney(bremerValue(b.id, dailyQty(date, location.id, b.id)))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th>Emballages (hors bacs)</th><th class="num">${fmtQty(packaging.qty)}</th><th></th><th class="num">${fmtMoney(packaging.value)}</th></tr><tr class="bac-row"><th>Bacs uniquement</th><th class="num">${fmtQty(bac.qty)}</th><th></th><th class="num">${fmtMoney(bac.value)}</th></tr></tfoot>
  </table></div></section>`;
}

function renderObjectives(ids = selectedLocationIds()) {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Objectifs d'achats</h2><p>Progression du mois ${h(app.month)}.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Site / axe</th><th class="num">Objectif qté</th><th class="num">Réalisé qté</th><th>Progression</th><th class="num">Objectif valeur</th><th class="num">Réalisé valeur</th></tr></thead>
          <tbody>
            ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
              const obj = objective(row.id);
              const done = purchaseSummary([row.id]);
              const pct = obj.qty ? Math.min(100, done.qty / obj.qty * 100) : 0;
              return `<tr><td>${h(row.name)}</td><td class="num">${fmtQty(obj.qty)}</td><td class="num">${fmtQty(done.qty)}</td><td><div class="progress"><span style="width:${pct}%"></span></div></td><td class="num">${fmtMoney(obj.value)}</td><td class="num">${fmtMoney(done.value)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSites() {
  const locations = isAdmin() ? app.locations : app.locations.filter((row) => allowedLocationIds().includes(row.id));
  const locked = initialStockLocked();
  return `
    ${isAdmin() ? "" : `<div class="readonly">Lecture seule: seul un administrateur peut modifier les stocks initiaux et objectifs.</div>`}
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Constante Stock Initial</h2>
          <p>Le stock initial est le point de référence immuable de l'audit. Il possède une quantité Q et une valeur V.</p>
        </div>
        <span class="pill ${locked ? "" : "warn"}">${locked ? "Verrouillé" : "Configuration ouverte"}</span>
      </div>
      ${isPrincipalAdmin() && !locked ? `<div class="panel-body toolbar"><button id="lockInitialStockBtn" type="button">Verrouiller le stock initial</button><span class="notice">Après verrouillage, les valeurs Q/V ne seront plus modifiables dans l'application.</span></div>` : ""}
    </section>
    ${stockPanel("depot", "Stock initial au dépôt", "Données de départ reprises du classeur Excel.", locations)}
    ${stockPanel("factory", "Stock initial à l'usine Brasimba", "Stock global Brasimba; valeurs calculées automatiquement.", locations)}
    ${renderStockComparison(locations.map((row) => row.id))}
    <section class="panel">
      <div class="panel-header"><div><h2>Objectifs mensuels</h2><p>Mois sélectionné: ${h(app.month)}.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Site / axe</th><th class="num">Objectif quantité</th><th class="num">Objectif valeur</th></tr></thead>
          <tbody>
            ${locations.map((row) => {
              const obj = objective(row.id);
              return `<tr><td>${h(row.name)}</td><td><input class="objective-input" data-location="${row.id}" data-field="qty" value="${h(obj.qty)}" ${isAdmin() ? "" : "disabled"}></td><td><input class="objective-input" data-location="${row.id}" data-field="value" value="${h(obj.value)}" ${isAdmin() ? "" : "disabled"}></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDepotMonthlyManagement(locations) {
  const ids = locations.map((row) => row.id);
  const locationId = currentDepotLocationId(ids);
  const focus = loc(locationId);
  const allSummary = depotMonthlySummary(ids);
  const siteSummary = depotMonthlySummary(locationId ? [locationId] : []);
  const siteGap = siteSummary.currentQty - siteSummary.totalQty;
  return `
    <section class="panel accent-panel">
      <div class="panel-header">
        <div>
          <h2>Gestion emballages dÃ©pÃ´t</h2>
          <p>RepÃ¨re mensuel: emballages physiques + emballages correspondant aux produits en stock.</p>
        </div>
        <label>Site / axe suivi
          <select id="depotLocationFocus">
            ${locations.map((row) => `<option value="${row.id}" ${row.id === locationId ? "selected" : ""}>${h(row.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="cards compact-cards">
        ${card("RepÃ¨re global dÃ©pÃ´t", fmtQty(allSummary.totalQty), fmtMoney(allSummary.totalValue), "metric-blue")}
        ${card(`RepÃ¨re ${focus?.name || "site"}`, fmtQty(siteSummary.totalQty), fmtMoney(siteSummary.totalValue), siteGap < 0 ? "metric-negative" : "metric-positive")}
        ${card("Emballages saisis", fmtQty(siteSummary.packagingQty), fmtMoney(siteSummary.packagingValue))}
        ${card("Produits convertis", fmtQty(siteSummary.productsQty), fmtMoney(siteSummary.productsValue))}
      </div>
      <div class="split">
        <section class="mini-panel">
          <div class="panel-header"><div><h2>Dashboard dÃ©pÃ´t</h2><p>Emballages + produits convertis en Bremers.</p></div></div>
          <div class="table-wrap">${depotBremerDashboard(locationId)}</div>
        </section>
        <section class="mini-panel">
          <div class="panel-header"><div><h2>Lecture du repÃ¨re</h2><p>Un Ã©cart positif indique une hausse, un Ã©cart nÃ©gatif une baisse Ã  analyser.</p></div></div>
          <div class="panel-body">
            <div class="signal ${siteGap < 0 ? "bad" : siteGap > 0 ? "good" : ""}">
              <strong>${fmtQty(siteGap)}</strong>
              <span>Ã‰cart entre stock calculÃ© actuel et repÃ¨re mensuel du dÃ©pÃ´t.</span>
            </div>
          </div>
        </section>
      </div>
      ${isAdmin() ? `
        <div class="split">
          <section class="mini-panel">
            <div class="panel-header"><div><h2>Emballages du mois</h2><p>Saisie par Bremer pour ${h(focus?.name || "")}.</p></div></div>
            <div class="table-wrap">${depotPackagingEditTable(locationId)}</div>
          </section>
          <section class="mini-panel">
            <div class="panel-header"><div><h2>Produits du mois</h2><p>Les quantitÃ©s produits sont converties automatiquement en Bremers.</p></div></div>
            <div class="table-wrap">${depotProductEditTable(locationId)}</div>
          </section>
        </div>
      ` : `<div class="readonly">Lecture seule: seuls les administrateurs peuvent saisir le repÃ¨re mensuel du dÃ©pÃ´t.</div>`}
    </section>
  `;
}

function depotBremerDashboard(locationId) {
  return `
    <table>
      <thead><tr><th>Bremer</th><th class="num">Emballages Q</th><th class="num">Produits Q</th><th class="num">Total Q</th><th class="num">Total V</th><th class="num">Stock actuel</th><th class="num">Ã‰cart</th></tr></thead>
      <tbody>
        ${app.bremers.map((b) => {
          const packagingQty = depotPackagingQty(locationId, b.id);
          const productsQty = depotProductsBremerQty(locationId, b.id);
          const totalQty = depotRepereQty(locationId, b.id);
          const totalValue = depotRepereValue(locationId, b.id);
          const current = depositCurrent(locationId, b.id);
          const gap = current - totalQty;
          return `<tr>
            <td>${h(b.code)} - ${h(b.label)}</td>
            <td class="num">${fmtQty(packagingQty)}</td>
            <td class="num">${fmtQty(productsQty)}</td>
            <td class="num"><strong>${fmtQty(totalQty)}</strong></td>
            <td class="num">${fmtMoney(totalValue)}</td>
            <td class="num">${fmtQty(current)}</td>
            <td class="num ${gap < 0 ? "status-bad" : gap > 0 ? "status-ok" : ""}">${fmtQty(gap)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function depotPackagingEditTable(locationId) {
  return `
    <table>
      <thead><tr><th>Bremer</th><th class="num">QuantitÃ©</th><th class="num">Valeur</th></tr></thead>
      <tbody>
        ${app.bremers.map((b) => {
          const row = depotPackagingEntry(locationId, b.id);
          return `<tr><td>${h(b.code)} - ${h(b.label)}</td><td><input class="depot-packaging-input" data-location="${locationId}" data-bremer="${b.id}" data-field="quantity" value="${h(row.quantity)}"></td><td><input class="depot-packaging-input" data-location="${locationId}" data-bremer="${b.id}" data-field="value" value="${h(row.value || bremerValue(b.id, row.quantity))}"></td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function depotProductEditTable(locationId) {
  return `
    <table>
      <thead><tr><th>Produit</th><th>Bremer</th><th class="num">QuantitÃ©</th><th class="num">Valeur produit</th></tr></thead>
      <tbody>
        ${app.products.map((p) => {
          const row = depotProductEntry(locationId, p.id);
          const value = n(row.value || n(row.quantity) * productPrice(p.id, locationId));
          return `<tr><td>${h(p.name)}</td><td>${h(bremer(p.bremer_id)?.code)}</td><td><input class="depot-product-input" data-location="${locationId}" data-product="${p.id}" value="${h(row.quantity)}"></td><td class="num">${fmtMoney(value)}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function stockPanel(scope, title, subtitle, locations) {
  const editable = canEditInitialStock();
  if (scope === "factory") return `
    <section class="panel">
      <div class="panel-header"><div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th class="num">Quantité globale</th><th class="num">Constante</th><th class="num">Valeur automatique</th></tr></thead>
        <tbody>${app.bremers.map((b) => `<tr class="${isBac(b) ? "bac-row" : ""}"><td>${h(b.code)} - ${h(b.label)}${isBac(b) ? " (gestion séparée)" : ""}</td><td><input class="global-factory-input" data-field="quantity" data-bremer="${b.id}" value="${h(globalFactoryQty(b.id))}" ${editable ? "" : "disabled"}></td><td class="num">${fmtMoney(b.price)}</td><td class="num">${fmtMoney(bremerValue(b.id, globalFactoryQty(b.id)))}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th>Emballages (hors bacs)</th><th class="num">${fmtQty(packagingBremers().reduce((sum, b) => sum + globalFactoryQty(b.id), 0))}</th><th></th><th class="num">${fmtMoney(packagingBremers().reduce((sum, b) => sum + bremerValue(b.id, globalFactoryQty(b.id)), 0))}</th></tr><tr class="bac-row"><th>Bacs uniquement</th><th class="num">${fmtQty(bacBremers().reduce((sum, b) => sum + globalFactoryQty(b.id), 0))}</th><th></th><th class="num">${fmtMoney(bacBremers().reduce((sum, b) => sum + bremerValue(b.id, globalFactoryQty(b.id)), 0))}</th></tr></tfoot>
      </table></div>
    </section>`;
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Site / axe</th>${app.bremers.map((b) => `<th class="num">${h(b.code)} Q</th><th class="num">${h(b.code)} V auto</th>`).join("")}<th class="num">Emballages</th><th class="num">Bacs séparés</th></tr></thead>
          <tbody>
            ${locations.map((row) => {
              const total = initialTotalForLocation(row.id, scope);
              const bac = initialBacTotalForLocation(row.id, scope);
              return `<tr><td>${h(row.name)}</td>${app.bremers.map((b) => `<td><input data-stock-scope="${scope}" data-stock-field="quantity" data-location="${row.id}" data-bremer="${b.id}" value="${h(stockQty(scope, row.id, b.id))}" ${editable ? "" : "disabled"}></td><td class="num ${isBac(b) ? "bac-row" : ""}">${fmtMoney(bremerValue(b.id, stockQty(scope, row.id, b.id)))}</td>`).join("")}<td class="num"><strong>${fmtQty(total.qty)}</strong><br><span class="notice">${fmtMoney(total.value)}</span></td><td class="num bac-row"><strong>${fmtQty(bac.qty)}</strong><br><span class="notice">${fmtMoney(bac.value)}</span></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPurchases() {
  const ids = selectedLocationIds();
  const rows = app.purchases.filter((row) => ids.includes(row.location_id) && inMonth(row.date));
  return `
    ${renderPurchaseObjectives(ids)}
    ${isAdmin() ? purchaseForm() : `<div class="readonly">Lecture seule: vous consultez uniquement les achats de votre site affecté.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Achats produits</h2><p>Les achats diminuent le solde Brasimba et augmentent le stock dépôt.</p></div></div>
      <div class="table-wrap">${purchaseTable(rows)}</div>
    </section>
  `;
}

function currentObjectiveProductId() {
  const stored = sessionStorage.getItem("objectiveProductId");
  return app.products.some((row) => row.id === stored) ? stored : app.products[0]?.id;
}

function renderPurchaseObjectives(ids) {
  const globalTarget = globalObjectiveTotals(ids);
  const globalDone = purchaseSummary(ids);
  const selectedProductId = currentObjectiveProductId();
  const selectedProduct = product(selectedProductId);
  const selectedProductTarget = productObjectiveTotal(ids, selectedProductId);
  const selectedProductDone = productPurchaseTotal(ids, selectedProductId);
  const globalPct = globalTarget.qty ? Math.min(100, globalDone.qty / globalTarget.qty * 100) : 0;
  const productPct = selectedProductTarget ? Math.min(100, selectedProductDone / selectedProductTarget * 100) : 0;
  const globalLabel = isAdmin() && app.locationFilter === "all" ? "Objectif global Rivinter" : "Objectif sélection";
  const globalDetail = isAdmin() && app.locationFilter === "all" ? "Somme des objectifs quantités par site" : "Selon le site ou filtre choisi";
  return `
    <div class="cards">
      ${card(globalLabel, fmtQty(globalTarget.qty), globalDetail)}
      ${card("Réalisé global", fmtQty(globalDone.qty), `${globalPct.toFixed(1)}% de l'objectif global`)}
      ${card(`Objectif ${selectedProduct?.name || "produit"}`, fmtQty(selectedProductTarget), "Somme des objectifs du produit")}
      ${card("Réalisé produit", fmtQty(selectedProductDone), `${productPct.toFixed(1)}% du produit sélectionné`)}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div><h2>Objectifs achats</h2><p>Quantité globale par site et qualité par produit. Le total Rivinter est calculé automatiquement par somme des sites.</p></div>
        <label>Produit suivi
          <select id="objectiveProductId">
            ${app.products.map((row) => `<option value="${row.id}" ${row.id === selectedProductId ? "selected" : ""}>${h(row.name)} / ${h(bremer(row.bremer_id)?.code)}</option>`).join("")}
          </select>
        </label>
      </div>
      ${isAdmin() ? `<div class="readonly">Saisie administrateur: renseignez les objectifs par site. Les utilisateurs voient seulement la progression.</div>` : ""}
      <div class="split">
        <div class="table-wrap">${globalObjectiveEditTable(ids)}</div>
        <div class="table-wrap">${productObjectiveEditTable(ids, selectedProductId)}</div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Résumé objectifs par produit</h2><p>Objectifs qualité et réalisations du mois ${h(app.month)}.</p></div></div>
      <div class="table-wrap">${productObjectiveSummaryTable(ids)}</div>
    </section>
  `;
}

function globalObjectiveEditTable(ids) {
  return `
    <table>
      <thead><tr><th>Site / axe</th><th class="num">Objectif global Qté</th><th class="num">Réalisé Qté</th><th>Progression</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
          const obj = objective(row.id);
          const done = purchaseSummary([row.id]);
          const pct = n(obj.qty) ? Math.min(100, done.qty / n(obj.qty) * 100) : 0;
          return `<tr>
            <td>${h(row.name)}</td>
            <td><input class="objective-input" data-location="${row.id}" data-field="qty" value="${h(obj.qty)}" ${isAdmin() ? "" : "disabled"}></td>
            <td class="num">${fmtQty(done.qty)}</td>
            <td><div class="progress"><span style="width:${pct}%"></span></div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function productObjectiveEditTable(ids, productId) {
  return `
    <table>
      <thead><tr><th>Site / axe</th><th class="num">Objectif produit</th><th class="num">Réalisé produit</th><th>Progression</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
          const target = productObjectiveQty(row.id, productId);
          const done = purchaseQtyByProduct(row.id, productId);
          const pct = target ? Math.min(100, done / target * 100) : 0;
          return `<tr>
            <td>${h(row.name)}</td>
            <td><input class="product-objective-input" data-location="${row.id}" data-product="${h(productId)}" value="${h(target)}" ${isAdmin() ? "" : "disabled"}></td>
            <td class="num">${fmtQty(done)}</td>
            <td><div class="progress"><span style="width:${pct}%"></span></div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function productObjectiveSummaryTable(ids) {
  return `
    <table>
      <thead><tr><th>Produit</th><th>Bremer</th><th class="num">Objectif Rivinter</th><th class="num">Réalisé</th><th>Progression</th></tr></thead>
      <tbody>
        ${app.products.map((row) => {
          const target = productObjectiveTotal(ids, row.id);
          const done = productPurchaseTotal(ids, row.id);
          const pct = target ? Math.min(100, done / target * 100) : 0;
          return `<tr><td>${h(row.name)}</td><td>${h(bremer(row.bremer_id)?.code)}</td><td class="num">${fmtQty(target)}</td><td class="num">${fmtQty(done)}</td><td><div class="progress"><span style="width:${pct}%"></span></div></td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function purchaseForm() {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Nouvel achat</h2><p>Une commande peut contenir plusieurs produits. Les prix sont automatiques selon le site.</p></div></div>
      <div class="panel-body">
        <form id="purchaseForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>N° commande<input name="order_no" placeholder="ex: BENI02"></label>
          <label>Site / axe<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <label class="span-2">Note<input name="note" placeholder="Facture, bon, observation"></label>
          <div class="span-4 line-editor">
            <div class="line-editor-head"><strong>Produits de la commande</strong><button type="button" class="secondary" data-add-purchase-line>Ajouter produit</button></div>
            <div id="purchaseLines" class="line-list">
              ${purchaseLineHtml(0)}
            </div>
            <div class="line-total">Total commande: <strong id="purchaseTotal">0 Fc</strong></div>
          </div>
          <button type="submit">Enregistrer</button>
        </form>
      </div>
    </section>
  `;
}

function purchaseLineHtml(index) {
  return `
    <div class="line-row purchase-line">
      <label>Produit<select name="product_id" required>
        ${app.products.map((row) => `<option value="${row.id}">${h(row.name)} / ${h(bremer(row.bremer_id)?.code)}</option>`).join("")}
      </select></label>
      <label>Quantité<input name="quantity" inputmode="numeric" required></label>
      <label>Prix unitaire<input name="unit_price" inputmode="numeric" readonly></label>
      <label>Valeur<input name="line_value" readonly></label>
      <button type="button" class="danger" data-remove-line ${index === 0 ? "disabled" : ""}>Retirer</button>
    </div>
  `;
}

function purchaseTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Commande</th><th>Site / axe</th><th>Produit</th><th>Bremer</th><th class="num">Qté</th><th class="num">Valeur produit</th><th class="num">Valeur emballage</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => {
          const p = product(row.product_id);
          return `<tr><td>${h(row.date)}</td><td>${h(row.order_no || "-")}</td><td>${h(loc(row.location_id)?.name)}</td><td>${h(p?.name)}</td><td>${h(bremer(p?.bremer_id)?.code)}</td><td class="num">${fmtQty(row.quantity)}</td><td class="num">${fmtMoney(purchaseValue(row))}</td><td class="num">${fmtMoney(bremerValue(p?.bremer_id, row.quantity))}</td><td>${isAdmin() ? `<button class="danger" data-delete="purchases:${row.id}">Supprimer</button>` : ""}</td></tr>`;
        }).join("") || `<tr><td colspan="9">Aucun achat pour la sélection.</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderReturns() {
  const ids = selectedLocationIds();
  const rows = app.returns.filter((row) => ids.includes(row.location_id) && inMonth(row.date));
  return `
    ${isAdmin() ? returnForms() : `<div class="readonly">Lecture seule: vous consultez uniquement les retours et consignations de votre site affecté.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Retours et consignations</h2><p>Les retours diminuent le dépôt. Les consignations augmentent seulement le solde Brasimba du site acheteur.</p></div></div>
      <div class="table-wrap">${returnTable(rows)}</div>
    </section>
  `;
}

function returnForms() {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Nouveau retour</h2><p>Un bordereau peut contenir plusieurs types de Bremers.</p></div></div>
      <div class="panel-body">
        <form id="returnForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>Référence<input name="ref" placeholder="Bon de déconsignation"></label>
          <label>Site / axe<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <label class="span-2">Note<input name="note" placeholder="Observation"></label>
          <div class="span-4 line-editor">
            <div class="line-editor-head"><strong>Bremers retournés</strong><button type="button" class="secondary" data-add-return-line>Ajouter Bremer</button></div>
            <div id="returnLines" class="line-list">
              ${bremerLineHtml(0, "return")}
            </div>
          </div>
          <button type="submit">Enregistrer</button>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Consignation</h2><p>Achat d'emballages payé directement sur compte Brasimba. Le montant des Bremers doit correspondre au bordereau finance.</p></div></div>
      <div class="panel-body">
        <form id="consignmentForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>Site acheteur<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <label>Bordereau finance<select name="bank_deposit_id" required>${consignmentDepositOptions()}</select></label>
          <label>Référence<input name="ref" placeholder="N° bordereau Brasimba"></label>
          <div class="span-4 line-editor">
            <div class="line-editor-head"><strong>Bremers consignés</strong><button type="button" class="secondary" data-add-consignment-line>Ajouter Bremer</button></div>
            <div id="consignmentLines" class="line-list">
              ${bremerLineHtml(0, "consignment")}
            </div>
            <div class="line-total">Total consignation: <strong id="consignmentTotal">0 Fc</strong></div>
          </div>
          <label class="span-2">Note<input name="note" placeholder="Observation"></label>
          <button type="submit">Enregistrer consignation</button>
        </form>
      </div>
    </section>
  `;
}

function bremerLineHtml(index, mode) {
  return `
    <div class="line-row ${mode}-line">
      <label>Bremer<select name="bremer_id" required>${app.bremers.map((row) => `<option value="${row.id}">${h(row.code)} - ${h(row.label)}</option>`).join("")}</select></label>
      <label>Quantité<input name="quantity" inputmode="numeric" required></label>
      ${mode === "return" ? `<label>Qté bordereau<input name="shipped_qty" inputmode="numeric"></label>` : `<label>Valeur<input name="line_value" readonly></label>`}
      <button type="button" class="danger" data-remove-line ${index === 0 ? "disabled" : ""}>Retirer</button>
    </div>
  `;
}

function consignmentDepositOptions() {
  const rows = app.financeDeposits.filter((row) => row.purpose === "consignation" && inMonth(row.date));
  return rows.map((row) => `<option value="${row.id}">${h(row.bordereau_no)} - ${h(loc(row.location_id)?.name)} - ${h(row.bank_name)} ${h(row.account_name)} - ${fmtMoney(row.amount)}</option>`).join("") || `<option value="">Aucun bordereau consignation dans Suivi finance</option>`;
}

function returnTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Référence</th><th>Site / axe</th><th>Bremer</th><th class="num">Quantité</th><th class="num">Bordereau</th><th class="num">Écart</th><th class="num">Valeur</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${h(row.date)}</td><td><span class="pill ${isConsignment(row) ? "warn" : "neutral"}">${isConsignment(row) ? "Consignation" : "Retour"}</span></td><td>${h(row.ref || "-")}</td><td>${h(loc(row.location_id)?.name)}</td><td>${h(bremer(row.bremer_id)?.code)}</td><td class="num">${fmtQty(row.quantity)}</td><td class="num">${isConsignment(row) ? "-" : fmtQty(row.shipped_qty)}</td><td class="num ${!isConsignment(row) && returnGap(row) ? "status-warn" : ""}">${isConsignment(row) ? "-" : fmtQty(returnGap(row))}</td><td class="num">${fmtMoney(returnValue(row))}</td><td>${isAdmin() ? `<button class="danger" data-delete="packaging_returns:${row.id}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="10">Aucun retour pour la sélection.</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderAudit() {
  const ids = selectedLocationIds();
  const locationId = ids.includes(sessionStorage.getItem("auditLocationId")) ? sessionStorage.getItem("auditLocationId") : ids[0];
  const purchases = purchaseSummary([locationId]);
  const ownRecord = app.audits.find((row) => row.location_id === locationId && row.month === app.month && row.created_by === app.session.user.id);
  const record = ownRecord || {
    location_id: locationId,
    month: app.month,
    cash_initial: 0,
    cash_final: 0,
    stock_initial_qty: 0,
    stock_initial_value: 0,
    stock_final_qty: 0,
    stock_final_value: 0,
    purchases_qty: purchases.qty,
    purchases_value: purchases.value,
    sales_qty: 0,
    sales_value: 0,
    rebates_qty: 0,
    rebates_value: 0,
    losses_qty: 0,
    losses_value: 0,
    free_qty: 0,
    free_value: 0,
    salary: 0,
    expenses: 0,
    bank_deposit: 0
  };
  const result = auditResult(record);
  return `
    ${isAdmin() ? renderAuditDashboard() : `<div class="readonly">Vous pouvez encoder l'audit du site qui vous est affecté. Vous ne voyez que vos propres audits.</div>`}
    <section class="panel">
      <div class="panel-header">
        <div><h2>Audit mensuel</h2><p>Entrées, sorties, dépenses et versements bancaires. Le formulaire ci-dessous enregistre votre audit personnel.</p></div>
        <label>Site audité<select id="auditLocation">${ids.map((id) => `<option value="${id}" ${id === locationId ? "selected" : ""}>${h(loc(id)?.name)}</option>`).join("")}</select></label>
      </div>
      <div class="panel-body">
        <form id="auditForm" class="form-grid">
          ${auditInput("Caisse initiale", "cash_initial", record.cash_initial)}
          ${auditInput("Caisse finale", "cash_final", record.cash_final)}
          ${auditInput("Stock initial qté", "stock_initial_qty", record.stock_initial_qty)}
          ${auditInput("Stock initial valeur", "stock_initial_value", record.stock_initial_value)}
          ${auditInput("Stock final qté", "stock_final_qty", record.stock_final_qty)}
          ${auditInput("Stock final valeur", "stock_final_value", record.stock_final_value)}
          ${auditInput("Achats qté", "purchases_qty", record.purchases_qty)}
          ${auditInput("Achats valeur", "purchases_value", record.purchases_value)}
          ${auditInput("Ventes qté", "sales_qty", record.sales_qty)}
          ${auditInput("Ventes valeur", "sales_value", record.sales_value)}
          ${auditInput("Ristournes qté", "rebates_qty", record.rebates_qty)}
          ${auditInput("Ristournes valeur", "rebates_value", record.rebates_value)}
          ${auditInput("Pertes qté", "losses_qty", record.losses_qty)}
          ${auditInput("Pertes valeur", "losses_value", record.losses_value)}
          ${auditInput("Gratuit qté", "free_qty", record.free_qty)}
          ${auditInput("Gratuit valeur", "free_value", record.free_value)}
          ${auditInput("Salaire", "salary", record.salary)}
          ${auditInput("Dépenses", "expenses", record.expenses)}
          ${auditInput("Versements bancaires", "bank_deposit", record.bank_deposit)}
          <div class="span-4"><button>Enregistrer audit</button></div>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Résultats d'audit</h2><p>Positif = excédent, négatif = manquant.</p></div></div>
      <div class="table-wrap">
        <table><tbody>
          <tr><td>Fonds attendus</td><td class="num">${fmtMoney(result.fundsExpected)}</td></tr>
          <tr><td>Fonds contrôlés</td><td class="num">${fmtMoney(result.fundsControlled)}</td></tr>
          <tr><td>Manquant / excédent caisse</td><td class="num ${result.cashGap < 0 ? "status-bad" : result.cashGap > 0 ? "status-ok" : ""}">${fmtMoney(result.cashGap)}</td></tr>
          <tr><td>Stock final attendu</td><td class="num">${fmtQty(result.expectedFinalQty)}</td></tr>
          <tr><td>Écart produits quantité</td><td class="num ${result.productGap < 0 ? "status-bad" : result.productGap > 0 ? "status-ok" : ""}">${fmtQty(result.productGap)}</td></tr>
          <tr><td>Écart produits valeur</td><td class="num ${result.productValueGap < 0 ? "status-bad" : result.productValueGap > 0 ? "status-ok" : ""}">${fmtMoney(result.productValueGap)}</td></tr>
        </tbody></table>
      </div>
    </section>
    ${renderAuditHistory(locationId)}
  `;
}

function auditInput(label, name, value) {
  return `<label>${h(label)}<input name="${h(name)}" inputmode="numeric" value="${h(value)}"></label>`;
}

function renderAuditDashboard() {
  const rows = app.audits.filter((row) => inMonth(`${row.month}-01`));
  const totalCashGap = rows.reduce((sum, row) => sum + auditResult(row).cashGap, 0);
  const totalProductGap = rows.reduce((sum, row) => sum + auditResult(row).productValueGap, 0);
  return `
    <div class="cards">
      ${card("Audits encodés", fmtQty(rows.length), `Mois ${app.month}`)}
      ${card("Écart caisse global", fmtMoney(totalCashGap), totalCashGap < 0 ? "Manquant global" : "Excédent ou conforme")}
      ${card("Écart produits global", fmtMoney(totalProductGap), totalProductGap < 0 ? "Manquant produits" : "Excédent ou conforme")}
      ${card("Sites audités", fmtQty(new Set(rows.map((row) => row.location_id)).size), "Sites / axes distincts")}
    </div>
  `;
}

function renderAuditHistory(locationId) {
  const rows = app.audits
    .filter((row) => isAdmin() ? row.month === app.month : row.created_by === app.session.user.id)
    .filter((row) => isAdmin() || row.location_id === locationId);
  return `
    <section class="panel">
      <div class="panel-header">
        <div><h2>Audits enregistrés</h2><p>${isAdmin() ? "Vue administrateur de tous les audits du mois." : "Vos audits encodés."}</p></div>
        <div class="toolbar"><button type="button" class="secondary" id="auditCsvBtn">Export audit CSV</button><button type="button" class="secondary" id="printBtn">PDF / Imprimer</button></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Mois</th><th>Site</th><th>Utilisateur</th><th class="num">Écart caisse</th><th class="num">Écart produits</th><th class="num">Banque</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const result = auditResult(row);
              const profile = app.profiles.find((item) => item.id === row.created_by);
              return `<tr><td>${h(row.month)}</td><td>${h(loc(row.location_id)?.name)}</td><td>${h(profile?.full_name || profile?.email || "Moi")}</td><td class="num ${result.cashGap < 0 ? "status-bad" : result.cashGap > 0 ? "status-ok" : ""}">${fmtMoney(result.cashGap)}</td><td class="num ${result.productValueGap < 0 ? "status-bad" : result.productValueGap > 0 ? "status-ok" : ""}">${fmtMoney(result.productValueGap)}</td><td class="num">${fmtMoney(row.bank_deposit)}</td></tr>`;
            }).join("") || `<tr><td colspan="6">Aucun audit enregistré.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function financeMetrics(locationId) {
  const deposits = app.financeDeposits.filter((row) => row.location_id === locationId && inMonth(row.date));
  const loansIn = app.financeLoans.filter((row) => row.borrower_location_id === locationId && row.month === app.month);
  const loansOut = app.financeLoans.filter((row) => row.lender_location_id === locationId && row.month === app.month);
  const bankIn = deposits.filter((row) => row.purpose === "versement").reduce((sum, row) => sum + n(row.amount), 0);
  const brasimbaPayments = deposits.filter((row) => row.purpose === "achat_direct" || row.purpose === "consignation").reduce((sum, row) => sum + n(row.amount), 0);
  const purchases = purchaseSummary([locationId]).value;
  const borrowed = loansIn.reduce((sum, row) => sum + n(row.amount), 0);
  const lent = loansOut.reduce((sum, row) => sum + n(row.amount), 0);
  const debtDue = loansIn.reduce((sum, row) => sum + Math.max(0, n(row.amount) - n(row.paid_amount)), 0);
  const receivable = loansOut.reduce((sum, row) => sum + Math.max(0, n(row.amount) - n(row.paid_amount)), 0);
  return {
    bankIn,
    brasimbaPayments,
    purchases,
    borrowed,
    lent,
    debtDue,
    receivable,
    balance: bankIn + borrowed - lent - purchases - brasimbaPayments
  };
}

function renderFinance() {
  const ids = selectedLocationIds();
  const deposits = app.financeDeposits.filter((row) => ids.includes(row.location_id) && inMonth(row.date));
  const loans = app.financeLoans.filter((row) => ids.includes(row.lender_location_id) || ids.includes(row.borrower_location_id)).filter((row) => row.month === app.month);
  const payments = app.financePayments.filter((row) => row.month === app.month);
  const paymentTotal = financePaymentSummary();
  const netRivinterDebt = Math.max(0, n(capitalSetting().rivinter_debt) - paymentTotal.value);
  const totalDeposits = deposits.reduce((sum, row) => sum + n(row.amount), 0);
  const totalDebt = loans.reduce((sum, row) => sum + Math.max(0, n(row.amount) - n(row.paid_amount)), 0);
  const totalBalance = ids.reduce((sum, id) => sum + financeMetrics(id).balance, 0);
  return `
    <div class="cards">
      ${card("Versements banque", fmtMoney(totalDeposits), `Mois ${app.month}`)}
      ${card("Solde finance estimé", fmtMoney(totalBalance), "Versements + prêts - achats - Brasimba")}
      ${card("Dettes restantes", fmtMoney(totalDebt), "Dette et paiement")}
      ${card("Paiements Brasimba", fmtMoney(paymentTotal.value), `${fmtQty(paymentTotal.count)} opération(s)`, paymentTotal.value > 0 ? "metric-positive" : "")}
      ${card("Dette Rivinter nette", fmtMoney(netRivinterDebt), "Dette globale - paiements produits", netRivinterDebt > 0 ? "metric-negative" : "metric-positive")}
      ${card("Alertes prêt", fmtQty(ids.filter((id) => financeMetrics(id).balance < 0).length), "Sites sous besoin de financement")}
    </div>
    ${isAdmin() ? renderFinanceForms() : `<div class="readonly">Lecture seule: seuls les administrateurs peuvent modifier le suivi finance.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Situation par site</h2><p>Solde estimé après versements, achats produits, consignations et prêts.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Site / axe</th><th class="num">Versements</th><th class="num">Achats produits</th><th class="num">Brasimba</th><th class="num">Prêts reçus</th><th class="num">Prêts donnés</th><th class="num">Solde</th><th class="num">Dette restante</th></tr></thead>
          <tbody>
            ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
              const m = financeMetrics(row.id);
              return `<tr><td>${h(row.name)}</td><td class="num">${fmtMoney(m.bankIn)}</td><td class="num">${fmtMoney(m.purchases)}</td><td class="num">${fmtMoney(m.brasimbaPayments)}</td><td class="num">${fmtMoney(m.borrowed)}</td><td class="num">${fmtMoney(m.lent)}</td><td class="num ${m.balance < 0 ? "status-bad" : "status-ok"}">${fmtMoney(m.balance)}</td><td class="num">${fmtMoney(m.debtDue)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
    <div class="split">
      <section class="panel">
        <div class="panel-header"><div><h2>Versements bancaires</h2><p>Rawbank, TMB, comptes Rivinter/Riviera/Brasimba.</p></div></div>
        <div class="table-wrap">${financeDepositTable(deposits)}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2>Dette et paiement</h2><p>Qui a prêté, qui doit, et pour quelle commande.</p></div></div>
        <div class="table-wrap">${financeLoanTable(loans)}</div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-header"><div><h2>Paiements produits Brasimba</h2><p>Payer ou ordre de virement pour les produits déjà sortis de l'usine.</p></div></div>
      <div class="table-wrap">${financePaymentTable(payments)}</div>
    </section>
  `;
}

function renderFinanceForms() {
  return `
    <div class="split">
      <section class="panel">
        <div class="panel-header"><div><h2>Nouveau versement</h2><p>Utilisez le motif Consignation pour alimenter les bordereaux d'achat emballages.</p></div></div>
        <div class="panel-body">
          <form id="financeDepositForm" class="form-grid two">
            <label>Date<input type="date" name="date" required value="${today()}"></label>
            <label>Site / axe<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
            <label>Motif<select name="purpose"><option value="versement">Versement normal</option><option value="achat_direct">Achat direct / commande</option><option value="consignation">Consignation emballages</option><option value="autre">Autre</option></select></label>
            <label>Compte bancaire<select name="account_id" required>${financeAccountOptions(app.locations[0]?.id, "versement")}</select></label>
            <label>Montant Fc<input name="amount" inputmode="numeric" required></label>
            <label>N° bordereau<input name="bordereau_no" required></label>
            <label class="span-2">Note<input name="note"></label>
            <button>Enregistrer versement</button>
          </form>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2>Nouveau prêt inter-site</h2><p>Permet de couvrir une commande quand le solde du site acheteur est insuffisant.</p></div></div>
        <div class="panel-body">
          <form id="financeLoanForm" class="form-grid two">
            <label>Date<input type="date" name="date" required value="${today()}"></label>
            <label>Commande liée<input name="order_no" placeholder="N° commande"></label>
            <label>Site prêteur<select name="lender_location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
            <label>Site débiteur<select name="borrower_location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
            <label>Montant prêté<input name="amount" inputmode="numeric" required></label>
            <label>Montant payé<input name="paid_amount" inputmode="numeric" value="0"></label>
            <label class="span-2">Note<input name="note"></label>
            <button>Enregistrer dette</button>
          </form>
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-header"><div><h2>Paiement produits Brasimba</h2><p>Le montant payé diminue la dette globale Rivinter envers Brasimba.</p></div></div>
      <div class="panel-body">
        <form id="financePaymentForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>Action<select name="payment_type"><option value="payer">Payer</option><option value="ordre_virement">Ordre de virement</option></select></label>
          <label>Compte bancaire<select name="account_id" required>${financeAccountOptions("", "payment")}</select></label>
          <label>Montant Fc<input name="amount" inputmode="numeric" required></label>
          <label>Référence<input name="ref" placeholder="Bordereau, OV, note"></label>
          <label class="span-2">Note<input name="note"></label>
          <button>Enregistrer paiement</button>
        </form>
      </div>
    </section>
  `;
}

function financeDepositTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Site</th><th>Motif</th><th>Banque</th><th>Compte</th><th>Bordereau</th><th class="num">Montant</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${h(row.date)}</td><td>${h(loc(row.location_id)?.name)}</td><td>${h(row.purpose)}</td><td>${h(row.bank_name)}</td><td>${h(row.account_name)}</td><td>${h(row.bordereau_no)}</td><td class="num">${fmtMoney(row.amount)}</td><td>${isAdmin() ? `<button class="danger" data-delete="finance_deposits:${row.id}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8">Aucun versement pour la sélection.</td></tr>`}
      </tbody>
    </table>
  `;
}

function financeLoanTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Commande</th><th>Prêteur</th><th>Débiteur</th><th class="num">Montant</th><th class="num">Payé</th><th class="num">Reste</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${h(row.date)}</td><td>${h(row.order_no || "-")}</td><td>${h(loc(row.lender_location_id)?.name)}</td><td>${h(loc(row.borrower_location_id)?.name)}</td><td class="num">${fmtMoney(row.amount)}</td><td>${isAdmin() ? `<input class="loan-paid-input" data-id="${row.id}" value="${h(row.paid_amount)}">` : `<span class="num">${fmtMoney(row.paid_amount)}</span>`}</td><td class="num ${n(row.amount) - n(row.paid_amount) > 0 ? "status-warn" : "status-ok"}">${fmtMoney(n(row.amount) - n(row.paid_amount))}</td><td>${isAdmin() ? `<button class="danger" data-delete="finance_loans:${row.id}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8">Aucune dette pour la sélection.</td></tr>`}
      </tbody>
    </table>
  `;
}

function financePaymentTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Action</th><th>Banque</th><th>Compte</th><th>Référence</th><th class="num">Montant</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${h(row.date)}</td><td>${h(PAYMENT_TYPES[row.payment_type] || row.payment_type)}</td><td>${h(row.bank_name)}</td><td>${h(row.account_name)}</td><td>${h(row.ref || "-")}</td><td class="num">${fmtMoney(row.amount)}</td><td>${isAdmin() ? `<button class="danger" data-delete="finance_payments:${row.id}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7">Aucun paiement Brasimba pour le mois.</td></tr>`}
      </tbody>
    </table>
  `;
}

function capitalSetting() {
  return app.capitalSettings.find((row) => row.month === app.month) || {
    month: app.month,
    credit_limit: 0,
    current_credit_level: 0,
    credit_reduction: 0,
    rivinter_debt: 0,
    rebates_value: 0,
    free_value: 0
  };
}

function capitalMetrics() {
  const entries = app.capitalEntries.filter((row) => row.month === app.month);
  const setting = capitalSetting();
  const productValue = entries.reduce((sum, row) => sum + n(row.product_value), 0);
  const cashValue = entries.reduce((sum, row) => sum + n(row.cash_value), 0);
  const siteDebt = entries.reduce((sum, row) => sum + n(row.debt_value), 0);
  const otherValue = entries.reduce((sum, row) => sum + n(row.other_value), 0);
  const payments = financePaymentSummary().value;
  const grossDebt = n(setting.rivinter_debt) || siteDebt;
  const debt = Math.max(0, grossDebt - payments);
  const overrun = Math.max(0, n(setting.current_credit_level) - n(setting.credit_limit));
  const margin = Math.max(0, n(setting.credit_limit) - n(setting.current_credit_level));
  const productsCashNet = productValue + cashValue - n(setting.rebates_value);
  const realNet = productsCashNet + n(setting.free_value) + otherValue - debt - overrun;
  const usageRate = n(setting.credit_limit) ? n(setting.current_credit_level) / n(setting.credit_limit) * 100 : 0;
  return { entries, setting, productValue, cashValue, siteDebt, otherValue, payments, grossDebt, debt, overrun, margin, productsCashNet, realNet, usageRate };
}

function renderCapital() {
  const metrics = capitalMetrics();
  const status = metrics.overrun > 0 ? "SUPÉRIEUR AU PLAFOND" : "CONFORME";
  return `
    <div class="cards">
      ${card("Plafond autorisé", fmtMoney(metrics.setting.credit_limit), `Mois ${app.month}`)}
      ${card("Niveau actuel", fmtMoney(metrics.setting.current_credit_level), `${metrics.usageRate.toFixed(1)}% utilisé`)}
      ${card("Dépassement", fmtMoney(metrics.overrun), status)}
      ${card("Valeur réelle nette", fmtMoney(metrics.realNet), "Produits + caisse - ristournes - dettes - dépassement")}
    </div>
    ${isAdmin() ? renderCapitalForms(metrics) : `<div class="readonly">Lecture seule: seuls les administrateurs peuvent modifier le suivi capital.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Dashboard capital</h2><p>Logique reprise du fichier Valeur_RivinterSarlu.xlsx.</p></div><div class="toolbar"><button type="button" class="secondary" id="capitalCsvBtn">Export capital CSV</button><button type="button" class="secondary" id="printBtn">PDF / Imprimer</button></div></div>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><td>Valeur Produit</td><td class="num">${fmtMoney(metrics.productValue)}</td></tr>
            <tr><td>Valeur Espèce</td><td class="num">${fmtMoney(metrics.cashValue)}</td></tr>
            <tr><td>Ristourne client globale</td><td class="num">${fmtMoney(metrics.setting.rebates_value)}</td></tr>
            <tr><td>Produits + Caisse - Ristournes clients</td><td class="num">${fmtMoney(metrics.productsCashNet)}</td></tr>
            <tr><td>Dette Rivinter avant paiements</td><td class="num">${fmtMoney(metrics.grossDebt)}</td></tr>
            <tr><td>Paiements produits Brasimba</td><td class="num">${fmtMoney(metrics.payments)}</td></tr>
            <tr><td>Dette totale Rivinter nette</td><td class="num">${fmtMoney(metrics.debt)}</td></tr>
            <tr><td>Gratuits reçus</td><td class="num">${fmtMoney(metrics.setting.free_value)}</td></tr>
            <tr><td>Dépassement ligne de crédit</td><td class="num">${fmtMoney(metrics.overrun)}</td></tr>
            <tr><td>Marge disponible</td><td class="num">${fmtMoney(metrics.margin)}</td></tr>
            <tr><td>Statut</td><td><span class="pill ${metrics.overrun > 0 ? "bad" : ""}">${status}</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Capital par site</h2><p>Valeur produits, argent en caisse et dettes à encoder par mois.</p></div></div>
      <div class="table-wrap">${capitalTable(metrics.entries)}</div>
    </section>
  `;
}

function renderCapitalForms(metrics) {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Paramètres capital</h2><p>Plafond, niveau actuel, dettes globales, ristournes et gratuits.</p></div></div>
      <div class="panel-body">
        <form id="capitalSettingsForm" class="form-grid">
          <label>Plafond autorisé<input name="credit_limit" value="${h(metrics.setting.credit_limit)}"></label>
          <label>Niveau actuel<input name="current_credit_level" value="${h(metrics.setting.current_credit_level)}"></label>
          <label>Réduction plafond<input name="credit_reduction" value="${h(metrics.setting.credit_reduction)}"></label>
          <label>Dette Rivinter<input name="rivinter_debt" value="${h(metrics.setting.rivinter_debt)}"></label>
          <label>Ristournes clients<input name="rebates_value" value="${h(metrics.setting.rebates_value)}"></label>
          <label>Gratuits reçus<input name="free_value" value="${h(metrics.setting.free_value)}"></label>
          <button>Enregistrer paramètres</button>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Saisie capital par site</h2><p>Mois ${h(app.month)}.</p></div></div>
      <div class="panel-body">
        <form id="capitalEntriesForm">
          <div class="table-wrap">${capitalEditTable(metrics.entries)}</div>
          <div class="toolbar form-actions"><button>Enregistrer capital sites</button></div>
        </form>
      </div>
    </section>
  `;
}

function capitalEntry(locationId, rows = app.capitalEntries.filter((row) => row.month === app.month)) {
  return rows.find((row) => row.location_id === locationId) || { product_value: 0, cash_value: 0, debt_value: 0, other_value: 0 };
}

function capitalEditTable(rows) {
  return `
    <table>
      <thead><tr><th>Site</th><th class="num">Valeur produits</th><th class="num">Valeur espèce</th><th class="num">Dettes</th><th class="num">Autres</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => row.kind === "Site").map((row) => {
          const entry = capitalEntry(row.id, rows);
          return `<tr><td>${h(row.name)}</td><td><input name="product_value:${row.id}" value="${h(entry.product_value)}"></td><td><input name="cash_value:${row.id}" value="${h(entry.cash_value)}"></td><td><input name="debt_value:${row.id}" value="${h(entry.debt_value)}"></td><td><input name="other_value:${row.id}" value="${h(entry.other_value)}"></td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function capitalTable(rows) {
  return `
    <table>
      <thead><tr><th>Site</th><th class="num">Produits</th><th class="num">Espèces</th><th class="num">Dettes</th><th class="num">Autres</th><th class="num">Total brut</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => row.kind === "Site").map((row) => {
          const entry = capitalEntry(row.id, rows);
          const total = n(entry.product_value) + n(entry.cash_value) + n(entry.other_value) - n(entry.debt_value);
          return `<tr><td>${h(row.name)}</td><td class="num">${fmtMoney(entry.product_value)}</td><td class="num">${fmtMoney(entry.cash_value)}</td><td class="num">${fmtMoney(entry.debt_value)}</td><td class="num">${fmtMoney(entry.other_value)}</td><td class="num ${total < 0 ? "status-bad" : ""}">${fmtMoney(total)}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderReports() {
  const ids = selectedLocationIds();
  const goals = globalObjectiveTotals(ids);
  const done = purchaseSummary(ids);
  const returned = returnSummary(ids);
  const returnedBacs = bacReturnSummary(ids);
  const pct = goals.qty ? done.qty / goals.qty * 100 : 0;
  const remaining = Math.max(0, goals.qty - done.qty);
  const monthEnd = new Date(`${app.month}-01T00:00:00`); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
  const daysLeft = Math.max(1, Math.ceil((monthEnd - new Date()) / 86400000) + 1);
  const perDay = Math.ceil(remaining / daysLeft);
  const perWeek = perDay * 7;
  return `
    <section class="panel no-print">
      <div class="panel-header"><div><h2>Générer un rapport</h2><p>Export CSV et PDF par impression.</p></div></div>
      <div class="panel-body">
        <form id="reportForm" class="form-grid">
          <label>Type<select name="type"><option value="monthly">Mensuel</option><option value="weekly">Hebdomadaire</option></select></label>
          <label>Début semaine<input type="date" name="start"></label>
          <label>Fin semaine<input type="date" name="end"></label>
          <div class="toolbar"><button type="button" id="csvBtn">Excel CSV</button><button type="button" class="secondary" id="printBtn">PDF / Imprimer</button></div>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Mini résumé global</h2><p>Performance et rythme conseillé pour ${h(app.month)}.</p></div></div>
      <div class="cards compact-cards">
        ${card("Objectif global réalisé", `${fmtQty(done.qty)} / ${fmtQty(goals.qty)}`, `${pct.toFixed(1)} %`)}
        ${card("Fréquence suggérée", remaining ? `${fmtQty(perDay)} / jour` : "Objectif atteint", remaining ? `${fmtQty(perWeek)} par semaine pour couvrir ${fmtQty(remaining)} restants` : "Aucun rattrapage nécessaire")}
        ${card("Retours emballages", fmtQty(returned.qty), fmtMoney(returned.value))}
        ${card("Retours de bacs", fmtQty(returnedBacs.qty), `${fmtMoney(returnedBacs.value)} · séparés`)}
      </div>
    </section>
    ${renderObjectives(ids)}
    <section class="panel">
      <div class="panel-header"><div><h2>Résumé ${h(app.month)}</h2><p>Selon le filtre actuel.</p></div></div>
      <div class="table-wrap">${reportTable(ids)}</div>
    </section>
  `;
}

function reportTable(ids, range = null) {
  return `
    <table>
      <thead><tr><th>Site / axe</th><th class="num">Stock initial Q</th><th class="num">Stock initial V</th><th class="num">Bacs initiaux</th><th class="num">Achats qté</th><th class="num">Achats valeur</th><th class="num">Retours qté</th><th class="num">Retours valeur</th><th class="num">Bacs retournés</th><th class="num">Stock dépôt</th><th class="num">Solde usine</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
          const p = purchaseSummary([row.id], app.month, range);
          const r = returnSummary([row.id], app.month, range);
          const d = totalForLocation(row.id, "depot");
          const f = totalForLocation(row.id, "factory");
          const initial = initialTotalForLocation(row.id, "depot");
          const initialBac = initialBacTotalForLocation(row.id, "depot");
          const returnedBac = bacReturnSummary([row.id], app.month, range);
          return `<tr><td>${h(row.name)}</td><td class="num">${fmtQty(initial.qty)}</td><td class="num">${fmtMoney(initial.value)}</td><td class="num bac-row">${fmtQty(initialBac.qty)}</td><td class="num">${fmtQty(p.qty)}</td><td class="num">${fmtMoney(p.value)}</td><td class="num">${fmtQty(r.qty)}</td><td class="num">${fmtMoney(r.value)}</td><td class="num bac-row">${fmtQty(returnedBac.qty)}</td><td class="num">${fmtQty(d.qty)}</td><td class="num">${fmtQty(f.qty)}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderAccounts() {
  if (!isAdmin()) return `<div class="empty">Module réservé aux administrateurs.</div>`;
  const canCreatePrincipal = isPrincipalAdmin();
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Créer un accès</h2><p>La création Auth passe par une fonction serveur Vercel sécurisée.</p></div></div>
      <div class="panel-body">
        <form id="inviteForm" class="form-grid">
          <label>Nom complet<input name="full_name" required></label>
          <label>Email<input name="email" type="email" required></label>
          <label>Mot de passe provisoire<input name="password" type="password" minlength="8" required></label>
          <label>Rôle<select name="role"><option value="user">Utilisateur</option><option value="admin">Administrateur secondaire</option>${canCreatePrincipal ? `<option value="principal_admin">Administrateur principal</option>` : ""}</select></label>
          <label>Site / axe<select name="location_id"><option value="">Tous / non affecté</option>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <button>Créer le compte</button>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>Comptes</h2><p>Administrateur principal, administrateurs secondaires et utilisateurs simples.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Affectation</th><th>Actif</th></tr></thead>
          <tbody>
            ${app.profiles.map((row) => `<tr>
              <td>${h(row.full_name || "-")}</td>
              <td>${h(row.email)}</td>
              <td><select class="profile-field" data-id="${row.id}" data-field="role" ${row.role === "principal_admin" && !isPrincipalAdmin() ? "disabled" : ""}>
                <option value="user" ${row.role === "user" ? "selected" : ""}>Utilisateur</option>
                <option value="admin" ${row.role === "admin" ? "selected" : ""}>Administrateur secondaire</option>
                ${isPrincipalAdmin() ? `<option value="principal_admin" ${row.role === "principal_admin" ? "selected" : ""}>Administrateur principal</option>` : ""}
              </select></td>
              <td><select class="profile-field" data-id="${row.id}" data-field="location_id"><option value="">Tous / non affecté</option>${app.locations.map((locRow) => `<option value="${locRow.id}" ${row.location_id === locRow.id ? "selected" : ""}>${h(locRow.name)}</option>`).join("")}</select></td>
              <td><select class="profile-field" data-id="${row.id}" data-field="active"><option value="true" ${row.active ? "selected" : ""}>Oui</option><option value="false" ${!row.active ? "selected" : ""}>Non</option></select></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
    ${isPrincipalAdmin() ? `
      <section class="panel danger-zone">
        <div class="panel-header"><div><h2>Réinitialisation principale</h2><p>Réservée uniquement à l'administrateur principal. Les administrateurs secondaires ne voient pas cette action.</p></div></div>
        <div class="panel-body toolbar">
          <button id="resetAppBtn" class="danger" type="button">Réinitialiser toutes les saisies</button>
          <span class="notice">Supprime achats, retours, consignations, audits, objectifs, finances, capital, stocks initiaux et historique. Les comptes, sites, produits et prix restent conservés.</span>
        </div>
      </section>
    ` : ""}
  `;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function syncDynamicForms() {
  const purchaseForm = $("#purchaseForm");
  if (purchaseForm) refreshPurchaseLines(purchaseForm);
  const consignmentForm = $("#consignmentForm");
  if (consignmentForm) refreshConsignmentLines(consignmentForm);
  const financeDepositForm = $("#financeDepositForm");
  if (financeDepositForm) refreshFinanceAccounts(financeDepositForm);
}

function refreshPurchaseLines(form) {
  const locationId = form.elements.location_id?.value;
  let total = 0;
  form.querySelectorAll(".purchase-line").forEach((line) => {
    const productId = line.querySelector('[name="product_id"]')?.value;
    const qty = n(line.querySelector('[name="quantity"]')?.value);
    const price = productPrice(productId, locationId);
    const value = qty * price;
    line.querySelector('[name="unit_price"]').value = price ? fmtMoney(price) : "";
    line.querySelector('[name="line_value"]').value = value ? fmtMoney(value) : "";
    total += value;
  });
  const totalNode = $("#purchaseTotal");
  if (totalNode) totalNode.textContent = fmtMoney(total);
}

function refreshConsignmentLines(form) {
  let total = 0;
  form.querySelectorAll(".consignment-line").forEach((line) => {
    const bremerId = line.querySelector('[name="bremer_id"]')?.value;
    const qty = n(line.querySelector('[name="quantity"]')?.value);
    const value = bremerValue(bremerId, qty);
    const input = line.querySelector('[name="line_value"]');
    if (input) input.value = value ? fmtMoney(value) : "";
    total += value;
  });
  const totalNode = $("#consignmentTotal");
  if (totalNode) totalNode.textContent = fmtMoney(total);
}

function addLine(containerId, html) {
  const container = $(`#${containerId}`);
  if (!container) return;
  container.insertAdjacentHTML("beforeend", html);
  syncDynamicForms();
}

function refreshFinanceAccounts(form) {
  const select = form.elements.account_id;
  if (!select) return;
  const current = select.value;
  const locationId = form.elements.location_id?.value;
  const purpose = form.elements.purpose?.value || "versement";
  const allowed = allowedBankAccounts(locationId, purpose);
  select.innerHTML = financeAccountOptions(locationId, purpose, allowed.some((row) => row.id === current) ? current : allowed[0]?.id);
}

function lineData(form, selector, includeShipped = false) {
  return [...form.querySelectorAll(selector)].map((line) => {
    const bremerId = line.querySelector('[name="bremer_id"]')?.value;
    const productId = line.querySelector('[name="product_id"]')?.value;
    const qty = n(line.querySelector('[name="quantity"]')?.value);
    const shipped = includeShipped ? line.querySelector('[name="shipped_qty"]')?.value : "";
    return { bremerId, productId, qty, shipped };
  }).filter((row) => row.qty > 0 && (row.bremerId || row.productId));
}

async function refresh() {
  await loadData();
  render();
}

function resetRemainingRows() {
  return [
    ["achats", app.purchases.length],
    ["retours/consignations", app.returns.length],
    ["audits", app.audits.length],
    ["objectifs globaux", app.objectives.length],
    ["objectifs produits", app.productObjectives.length],
    ["versements", app.financeDeposits.length],
    ["dettes", app.financeLoans.length],
    ["paiements Brasimba", app.financePayments.length],
    ["repères dépôt emballages", app.depotPackaging.length],
    ["repères dépôt produits", app.depotProducts.length],
    ["capital", app.capitalEntries.length],
    ["paramètres capital", app.capitalSettings.length],
    ["stocks initiaux", app.initialStocks.length + app.globalFactoryInitial.length]
  ].filter((row) => row[1] > 0);
}

async function refreshAfterReset() {
  await loadData();
  render();
  const remaining = resetRemainingRows();
  if (remaining.length) {
    alert(`Réinitialisation incomplète. Exécutez dans Supabase SQL Editor le fichier supabase/reset_fonction_et_nettoyage.sql. Données restantes: ${remaining.map((row) => `${row[0]}=${row[1]}`).join(", ")}`);
  } else {
    alert("Réinitialisation terminée. Toutes les saisies ont été effacées.");
  }
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    app.view = viewButton.dataset.view;
    render();
    return;
  }

  const del = event.target.closest("[data-delete]");
  if (del && isAdmin()) {
    const [table, id] = del.dataset.delete.split(":");
    if (!confirm("Supprimer cette ligne ?")) return;
    await requireOk(await supabase.from(table).delete().eq("id", id));
    await refresh();
    return;
  }

  if (event.target.id === "logoutBtn") {
    await supabase.auth.signOut();
    return;
  }

  if (event.target.id === "toggleSignup") {
    $("#signupForm").classList.toggle("hidden");
    $("#loginForm").classList.toggle("hidden");
    event.target.textContent = $("#signupForm").classList.contains("hidden") ? "Créer un compte initial" : "Retour connexion";
    return;
  }

  if (event.target.id === "csvBtn") {
    downloadCsv();
    return;
  }

  if (event.target.id === "printBtn") {
    window.print();
    return;
  }

  if (event.target.id === "auditCsvBtn") {
    downloadAuditCsv();
    return;
  }

  if (event.target.id === "capitalCsvBtn") {
    downloadCapitalCsv();
    return;
  }

  if (event.target.closest("[data-add-purchase-line]")) {
    addLine("purchaseLines", purchaseLineHtml(document.querySelectorAll(".purchase-line").length));
    return;
  }

  if (event.target.closest("[data-add-return-line]")) {
    addLine("returnLines", bremerLineHtml(document.querySelectorAll(".return-line").length, "return"));
    return;
  }

  if (event.target.closest("[data-add-consignment-line]")) {
    addLine("consignmentLines", bremerLineHtml(document.querySelectorAll(".consignment-line").length, "consignment"));
    return;
  }

  const removeLine = event.target.closest("[data-remove-line]");
  if (removeLine && !removeLine.disabled) {
    removeLine.closest(".line-row")?.remove();
    syncDynamicForms();
    return;
  }

  if (event.target.id === "resetAppBtn" && isPrincipalAdmin()) {
    const ok = confirm("Réinitialiser toutes les données saisies dans Rivinter ? Achats, retours, consignations, audits, objectifs, finances, capital, stocks initiaux et historique seront effacés. Les comptes, sites, produits et prix seront conservés.");
    if (!ok) return;
    await requireOk(await supabase.rpc("reset_company_data", { p_restore_seed: false }));
    await refreshAfterReset();
    return;
  }

  if (event.target.id === "lockInitialStockBtn" && isPrincipalAdmin()) {
    const ok = confirm("Verrouiller définitivement le stock initial Q/V comme constante de référence ?");
    if (!ok) return;
    await requireOk(await supabase.rpc("lock_initial_stock"));
    await refresh();
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "locationFilter") {
    app.locationFilter = event.target.value;
    render();
  }
  if (event.target.id === "monthFilter") {
    app.month = event.target.value || app.month;
    render();
  }
  if (event.target.id === "mobileView") {
    app.view = event.target.value;
    render();
  }
  if (event.target.id === "auditLocation") {
    sessionStorage.setItem("auditLocationId", event.target.value);
    render();
  }
  if (event.target.id === "objectiveProductId") {
    sessionStorage.setItem("objectiveProductId", event.target.value);
    render();
  }
  if (event.target.id === "depotLocationFocus") {
    sessionStorage.setItem("depotLocationId", event.target.value);
    render();
  }
  if (event.target.id === "dailyDate") {
    sessionStorage.setItem("dailyDate", event.target.value || today());
    render();
  }
  if (event.target.closest("#purchaseForm") || event.target.closest("#consignmentForm") || event.target.closest("#financeDepositForm")) {
    syncDynamicForms();
  }
  const profileField = event.target.closest(".profile-field");
  if (profileField && isAdmin()) {
    const value = profileField.dataset.field === "active" ? profileField.value === "true" : profileField.value || null;
    await requireOk(await supabase.from("profiles").update({ [profileField.dataset.field]: value }).eq("id", profileField.dataset.id));
    await refresh();
  }
});

document.addEventListener("input", async (event) => {
  const stock = event.target.closest("[data-stock-scope]");
  if (stock && canEditInitialStock()) {
    const existing = app.initialStocks.find((row) => row.scope === stock.dataset.stockScope && row.location_id === stock.dataset.location && row.bremer_id === stock.dataset.bremer);
    if (existing) {
      existing.quantity = n(stock.value);
      existing.value = bremerValue(stock.dataset.bremer, existing.quantity);
    } else app.initialStocks.push({ scope: stock.dataset.stockScope, location_id: stock.dataset.location, bremer_id: stock.dataset.bremer, quantity: n(stock.value), value: bremerValue(stock.dataset.bremer, stock.value) });
    const current = app.initialStocks.find((row) => row.scope === stock.dataset.stockScope && row.location_id === stock.dataset.location && row.bremer_id === stock.dataset.bremer);
    await supabase.from("initial_stocks").upsert({
      scope: stock.dataset.stockScope,
      location_id: stock.dataset.location,
      bremer_id: stock.dataset.bremer,
      quantity: n(current?.quantity),
      value: n(current?.value)
    }, { onConflict: "scope,location_id,bremer_id" });
  }

  const globalFactory = event.target.closest(".global-factory-input");
  if (globalFactory && canEditInitialStock()) {
    const existing = app.globalFactoryInitial.find((row) => row.bremer_id === globalFactory.dataset.bremer);
    if (existing) {
      existing.quantity = n(globalFactory.value);
      existing.value = bremerValue(globalFactory.dataset.bremer, existing.quantity);
    } else app.globalFactoryInitial.push({ bremer_id: globalFactory.dataset.bremer, quantity: n(globalFactory.value), value: bremerValue(globalFactory.dataset.bremer, globalFactory.value) });
    const current = app.globalFactoryInitial.find((row) => row.bremer_id === globalFactory.dataset.bremer);
    await supabase.from("global_factory_initial").upsert({
      bremer_id: globalFactory.dataset.bremer,
      quantity: n(current?.quantity),
      value: n(current?.value)
    }, { onConflict: "bremer_id" });
  }

  const dailyInput = event.target.closest(".daily-stock-input");
  if (dailyInput && isAdmin()) {
    let current = app.dailyStocks.find((row) => row.date === dailyInput.dataset.date && row.location_id === dailyInput.dataset.location && row.bremer_id === dailyInput.dataset.bremer);
    if (!current) {
      current = { date: dailyInput.dataset.date, location_id: dailyInput.dataset.location, bremer_id: dailyInput.dataset.bremer, quantity: 0 };
      app.dailyStocks.push(current);
    }
    current.quantity = n(dailyInput.value);
    await requireOk(await supabase.from("daily_stocks").upsert({ date: current.date, location_id: current.location_id, bremer_id: current.bremer_id, quantity: current.quantity }, { onConflict: "date,location_id,bremer_id" }));
  }

  const objectiveInput = event.target.closest(".objective-input");
  if (objectiveInput && isAdmin()) {
    let current = app.objectives.find((row) => row.location_id === objectiveInput.dataset.location && row.month === app.month);
    if (!current) {
      current = { month: app.month, location_id: objectiveInput.dataset.location, qty: 0, value: 0 };
      app.objectives.push(current);
    }
    current[objectiveInput.dataset.field] = n(objectiveInput.value);
    await supabase.from("objectives").upsert({
      month: app.month,
      location_id: objectiveInput.dataset.location,
      qty: n(current.qty),
      value: n(current.value)
    }, { onConflict: "month,location_id" });
  }

  const productObjectiveInput = event.target.closest(".product-objective-input");
  if (productObjectiveInput && isAdmin()) {
    let current = app.productObjectives.find((row) =>
      row.location_id === productObjectiveInput.dataset.location
      && row.product_id === productObjectiveInput.dataset.product
      && row.month === app.month
    );
    if (!current) {
      current = { month: app.month, location_id: productObjectiveInput.dataset.location, product_id: productObjectiveInput.dataset.product, qty: 0 };
      app.productObjectives.push(current);
    }
    current.qty = n(productObjectiveInput.value);
    await supabase.from("product_objectives").upsert({
      month: app.month,
      location_id: productObjectiveInput.dataset.location,
      product_id: productObjectiveInput.dataset.product,
      qty: n(current.qty)
    }, { onConflict: "month,location_id,product_id" });
  }

  const depotPackagingInput = event.target.closest(".depot-packaging-input");
  if (depotPackagingInput && isAdmin()) {
    let current = app.depotPackaging.find((row) =>
      row.month === app.month
      && row.location_id === depotPackagingInput.dataset.location
      && row.bremer_id === depotPackagingInput.dataset.bremer
    );
    if (!current) {
      current = { month: app.month, location_id: depotPackagingInput.dataset.location, bremer_id: depotPackagingInput.dataset.bremer, quantity: 0, value: 0 };
      app.depotPackaging.push(current);
    }
    current[depotPackagingInput.dataset.field] = n(depotPackagingInput.value);
    await supabase.from("depot_monthly_packaging").upsert({
      month: app.month,
      location_id: current.location_id,
      bremer_id: current.bremer_id,
      quantity: n(current.quantity),
      value: n(current.value)
    }, { onConflict: "month,location_id,bremer_id" });
  }

  const depotProductInput = event.target.closest(".depot-product-input");
  if (depotProductInput && isAdmin()) {
    let current = app.depotProducts.find((row) =>
      row.month === app.month
      && row.location_id === depotProductInput.dataset.location
      && row.product_id === depotProductInput.dataset.product
    );
    if (!current) {
      current = { month: app.month, location_id: depotProductInput.dataset.location, product_id: depotProductInput.dataset.product, quantity: 0, value: 0 };
      app.depotProducts.push(current);
    }
    current.quantity = n(depotProductInput.value);
    current.value = current.quantity * productPrice(current.product_id, current.location_id);
    await supabase.from("depot_monthly_products").upsert({
      month: app.month,
      location_id: current.location_id,
      product_id: current.product_id,
      quantity: n(current.quantity),
      value: n(current.value)
    }, { onConflict: "month,location_id,product_id" });
  }

  if (event.target.closest("#purchaseForm") || event.target.closest("#consignmentForm")) {
    syncDynamicForms();
  }

  const loanPaid = event.target.closest(".loan-paid-input");
  if (loanPaid && isAdmin()) {
    await supabase.from("finance_loans").update({ paid_amount: n(loanPaid.value) }).eq("id", loanPaid.dataset.id);
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "loginForm") {
      const data = formObject(event.target);
      const result = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      await requireOk(result);
      return;
    }

    if (event.target.id === "signupForm") {
      const data = formObject(event.target);
      const result = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: data.fullName } }
      });
      await requireOk(result);
      $("#authMessage").textContent = "Compte créé. Donnez-lui le rôle principal_admin dans Supabase pour le premier administrateur.";
      return;
    }

    if (event.target.id === "purchaseForm" && isAdmin()) {
      const data = formObject(event.target);
      const lines = lineData(event.target, ".purchase-line");
      if (!lines.length) throw new Error("Ajoutez au moins un produit à la commande.");
      const rows = lines.map((line) => ({
        date: data.date,
        order_no: data.order_no,
        location_id: data.location_id,
        product_id: line.productId,
        quantity: line.qty,
        unit_price: productPrice(line.productId, data.location_id),
        note: data.note
      }));
      await requireOk(await supabase.from("purchases").insert(rows));
      await refresh();
      return;
    }

    if (event.target.id === "returnForm" && isAdmin()) {
      const data = formObject(event.target);
      const lines = lineData(event.target, ".return-line", true);
      if (!lines.length) throw new Error("Ajoutez au moins un Bremer au retour.");
      const rows = lines.map((line) => ({
        date: data.date,
        ref: data.ref,
        location_id: data.location_id,
        bremer_id: line.bremerId,
        quantity: line.qty,
        shipped_qty: line.shipped === "" || line.shipped == null ? line.qty : n(line.shipped),
        movement_type: "return",
        amount: returnValue({ bremer_id: line.bremerId, quantity: line.qty }),
        note: data.note
      }));
      await requireOk(await supabase.from("packaging_returns").insert(rows));
      await refresh();
      return;
    }

    if (event.target.id === "consignmentForm" && isAdmin()) {
      const data = formObject(event.target);
      const deposit = app.financeDeposits.find((row) => row.id === data.bank_deposit_id);
      if (!deposit) throw new Error("Bordereau de consignation introuvable dans Suivi finance.");
      if (deposit.location_id !== data.location_id) throw new Error("Le site sélectionné ne correspond pas au site du bordereau finance.");
      if (deposit.purpose !== "consignation") throw new Error("Le bordereau finance doit avoir le motif Consignation.");
      const account = bankAccountId(deposit.bank_name, deposit.account_name);
      if (!bankAccountAllowed(data.location_id, account, "consignation")) throw new Error("Le compte bancaire du bordereau n'est pas un compte Brasimba autorisé pour ce site.");
      const lines = lineData(event.target, ".consignment-line");
      if (!lines.length) throw new Error("Ajoutez au moins un Bremer à la consignation.");
      const total = lines.reduce((sum, line) => sum + bremerValue(line.bremerId, line.qty), 0);
      if (Math.round(total) !== Math.round(n(deposit.amount))) {
        throw new Error(`Vérifiez les quantités: total emballages ${fmtMoney(total)} différent du bordereau ${fmtMoney(deposit.amount)}.`);
      }
      const rows = lines.map((line) => ({
        date: data.date,
        ref: data.ref || deposit.bordereau_no,
        location_id: data.location_id,
        bremer_id: line.bremerId,
        quantity: line.qty,
        shipped_qty: 0,
        movement_type: "consignment",
        bank_deposit_id: deposit.id,
        amount: bremerValue(line.bremerId, line.qty),
        note: data.note
      }));
      await requireOk(await supabase.from("packaging_returns").insert(rows));
      await refresh();
      return;
    }

    if (event.target.id === "auditForm") {
      const data = formObject(event.target);
      const ids = selectedLocationIds();
      const locationId = ids.includes(sessionStorage.getItem("auditLocationId")) ? sessionStorage.getItem("auditLocationId") : ids[0];
      if (!locationId) throw new Error("Aucun site n'est affecté à ce compte.");
      const record = { month: app.month, location_id: locationId, created_by: app.session.user.id };
      Object.keys(data).forEach((key) => record[key] = n(data[key]));
      await requireOk(await supabase.from("audits").upsert(record, { onConflict: "month,location_id,created_by" }));
      await refresh();
      return;
    }

    if (event.target.id === "financeDepositForm" && isAdmin()) {
      const data = formObject(event.target);
      const account = bankAccount(data.account_id);
      if (!account) throw new Error("Compte bancaire invalide.");
      if (!bankAccountAllowed(data.location_id, data.account_id, data.purpose)) {
        throw new Error("Ce compte bancaire n'est pas autorisé pour le site et le motif sélectionnés.");
      }
      await requireOk(await supabase.from("finance_deposits").insert({
        date: data.date,
        month: String(data.date).slice(0, 7),
        location_id: data.location_id,
        bank_name: account.bank,
        account_name: account.account,
        purpose: data.purpose,
        amount: n(data.amount),
        bordereau_no: data.bordereau_no,
        note: data.note
      }));
      await refresh();
      return;
    }

    if (event.target.id === "financePaymentForm" && isAdmin()) {
      const data = formObject(event.target);
      const account = bankAccount(data.account_id);
      if (!account) throw new Error("Compte bancaire invalide.");
      await requireOk(await supabase.from("finance_payments").insert({
        date: data.date,
        month: String(data.date).slice(0, 7),
        payment_type: data.payment_type,
        bank_name: account.bank,
        account_name: account.account,
        amount: n(data.amount),
        ref: data.ref,
        note: data.note
      }));
      await refresh();
      return;
    }

    if (event.target.id === "financeLoanForm" && isAdmin()) {
      const data = formObject(event.target);
      if (data.lender_location_id === data.borrower_location_id) throw new Error("Le site prêteur doit être différent du site débiteur.");
      await requireOk(await supabase.from("finance_loans").insert({
        date: data.date,
        month: String(data.date).slice(0, 7),
        lender_location_id: data.lender_location_id,
        borrower_location_id: data.borrower_location_id,
        order_no: data.order_no,
        reason: "achat_produit",
        amount: n(data.amount),
        paid_amount: n(data.paid_amount),
        note: data.note
      }));
      await refresh();
      return;
    }

    if (event.target.id === "capitalSettingsForm" && isAdmin()) {
      const data = formObject(event.target);
      await requireOk(await supabase.from("capital_settings").upsert({
        month: app.month,
        credit_limit: n(data.credit_limit),
        current_credit_level: n(data.current_credit_level),
        credit_reduction: n(data.credit_reduction),
        rivinter_debt: n(data.rivinter_debt),
        rebates_value: n(data.rebates_value),
        free_value: n(data.free_value)
      }, { onConflict: "month" }));
      await refresh();
      return;
    }

    if (event.target.id === "capitalEntriesForm" && isAdmin()) {
      const data = formObject(event.target);
      const rows = app.locations.filter((row) => row.kind === "Site").map((row) => ({
        month: app.month,
        location_id: row.id,
        product_value: n(data[`product_value:${row.id}`]),
        cash_value: n(data[`cash_value:${row.id}`]),
        debt_value: n(data[`debt_value:${row.id}`]),
        other_value: n(data[`other_value:${row.id}`])
      }));
      await requireOk(await supabase.from("capital_entries").upsert(rows, { onConflict: "month,location_id" }));
      await refresh();
      return;
    }

    if (event.target.id === "inviteForm" && isAdmin()) {
      const data = formObject(event.target);
      const response = await fetch("/api/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${app.session.access_token}`
        },
        body: JSON.stringify(data)
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || "Création impossible.");
      await refresh();
    }
  } catch (error) {
    alert(error.message || "Action impossible.");
  }
});

function downloadCsv() {
  const form = $("#reportForm");
  const data = form ? formObject(form) : {};
  const range = data.type === "weekly" ? { start: data.start, end: data.end } : null;
  const ids = selectedLocationIds();
  const rows = [["Site / axe", "Stock initial qté", "Stock initial valeur", "Bacs initiaux", "Achats qté", "Achats valeur", "Retours emballages qté", "Retours emballages valeur", "Retours bacs qté", "Stock dépôt qté", "Solde usine qté"]];
  app.locations.filter((row) => ids.includes(row.id)).forEach((row) => {
    const p = purchaseSummary([row.id], app.month, range);
    const r = returnSummary([row.id], app.month, range);
    const d = totalForLocation(row.id, "depot");
    const f = totalForLocation(row.id, "factory");
    const initial = initialTotalForLocation(row.id, "depot");
    const initialBac = initialBacTotalForLocation(row.id, "depot");
    const returnedBac = bacReturnSummary([row.id], app.month, range);
    rows.push([row.name, initial.qty, initial.value, initialBac.qty, p.qty, p.value, r.qty, r.value, returnedBac.qty, d.qty, f.qty]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rapport-rivinter-${app.month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadRows(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadAuditCsv() {
  const rows = [["Mois", "Site", "Utilisateur", "Ecart caisse", "Ecart produits", "Versement banque"]];
  app.audits
    .filter((row) => isAdmin() ? row.month === app.month : row.created_by === app.session.user.id)
    .forEach((row) => {
      const result = auditResult(row);
      const profile = app.profiles.find((item) => item.id === row.created_by);
      rows.push([row.month, loc(row.location_id)?.name, profile?.full_name || profile?.email || "Moi", result.cashGap, result.productValueGap, row.bank_deposit]);
    });
  downloadRows(`audit-rivinter-${app.month}.csv`, rows);
}

function downloadCapitalCsv() {
  const metrics = capitalMetrics();
  const rows = [["Indicateur", "Valeur"]];
  rows.push(["Plafond autorise", metrics.setting.credit_limit]);
  rows.push(["Niveau actuel", metrics.setting.current_credit_level]);
  rows.push(["Depassement", metrics.overrun]);
  rows.push(["Valeur reelle nette", metrics.realNet]);
  rows.push([]);
  rows.push(["Site", "Valeur produits", "Valeur espece", "Dettes", "Autres", "Total brut"]);
  app.locations.filter((row) => row.kind === "Site").forEach((row) => {
    const entry = capitalEntry(row.id, metrics.entries);
    rows.push([row.name, entry.product_value, entry.cash_value, entry.debt_value, entry.other_value, n(entry.product_value) + n(entry.cash_value) + n(entry.other_value) - n(entry.debt_value)]);
  });
  downloadRows(`capital-rivinter-${app.month}.csv`, rows);
}

init();
