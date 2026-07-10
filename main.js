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
  { id: "purchases", label: "Achats produits", subtitle: "Produits Brasimba achetés par site ou par axe." },
  { id: "returns", label: "Retour emballages", subtitle: "Déconsignations envoyées à Brasimba par type de Bremer." },
  { id: "audit", label: "Audit", subtitle: "Résultat mensuel par site selon caisse, produits, dépenses et banque." },
  { id: "reports", label: "Reporting", subtitle: "Rapports hebdomadaires, mensuels, Excel et PDF." },
  { id: "accounts", label: "Gestion comptes", subtitle: "Rôles, affectations et sécurité." }
];

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
  settings: [],
  initialStocks: [],
  globalFactoryInitial: [],
  objectives: [],
  purchases: [],
  returns: [],
  audits: [],
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

function product(id) {
  return app.products.find((row) => row.id === id);
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
  return n(row.value || n(row.quantity) * n(bremer(bremerId)?.price));
}

function globalFactoryQty(bremerId) {
  return n(app.globalFactoryInitial.find((row) => row.bremer_id === bremerId)?.quantity);
}

function globalFactoryValue(bremerId) {
  const row = app.globalFactoryInitial.find((item) => item.bremer_id === bremerId);
  if (!row) return 0;
  return n(row.value || n(row.quantity) * n(bremer(bremerId)?.price));
}

function bremerValue(bremerId, qty) {
  return n(qty) * n(bremer(bremerId)?.price);
}

function purchaseBremerId(row) {
  return product(row.product_id)?.bremer_id || "";
}

function purchaseValue(row) {
  return n(row.quantity) * n(row.unit_price ?? product(row.product_id)?.price);
}

function returnValue(row) {
  return bremerValue(row.bremer_id, row.quantity);
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
  return app.returns.reduce((sum, row) => {
    if (row.bremer_id !== bremerId) return sum;
    if (locationId && row.location_id !== locationId) return sum;
    return sum + n(row.quantity);
  }, 0);
}

function sumReturnValueByBremer(bremerId, locationId = null) {
  return app.returns.reduce((sum, row) => {
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
    - sumPurchasesByBremer(bremerId, locationId);
}

function factoryLocationCurrentValue(locationId, bremerId) {
  return stockValue("factory", locationId, bremerId)
    + sumReturnValueByBremer(bremerId, locationId)
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
  return app.bremers.reduce((acc, b) => {
    const qty = source === "factory" ? factoryLocationCurrent(locationId, b.id) : depositCurrent(locationId, b.id);
    const value = source === "factory" ? factoryLocationCurrentValue(locationId, b.id) : depositCurrentValue(locationId, b.id);
    acc.qty += qty;
    acc.value += value;
    return acc;
  }, { qty: 0, value: 0 });
}

function initialTotalForLocation(locationId, scope = "depot") {
  return app.bremers.reduce((acc, b) => {
    acc.qty += stockQty(scope, locationId, b.id);
    acc.value += stockValue(scope, locationId, b.id);
    return acc;
  }, { qty: 0, value: 0 });
}

function selectionFactoryTotal(ids = selectedLocationIds()) {
  if (isAdmin() && app.locationFilter === "all") {
    return app.bremers.reduce((acc, b) => {
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
  return app.returns
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

function objective(locationId) {
  return app.objectives.find((row) => row.location_id === locationId && row.month === app.month) || { qty: 0, value: 0 };
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
  const profile = await requireOk(await supabase.from("profiles").select("*").eq("id", app.session.user.id).single());
  if (!profile.active) throw new Error("Ce compte est désactivé.");
  app.profile = profile;

  const [
    locations,
    bremers,
    products,
    settings,
    initialStocks,
    globalFactoryInitial,
    objectives,
    purchases,
    returnsRows,
    audits,
    profiles
  ] = await Promise.all([
    requireOk(await supabase.from("locations").select("*").order("sort_order")),
    requireOk(await supabase.from("bremers").select("*").order("sort_order")),
    requireOk(await supabase.from("products").select("*").order("name")),
    isAdmin() ? requireOk(await supabase.from("app_settings").select("*")) : [],
    requireOk(await supabase.from("initial_stocks").select("*")),
    isAdmin() ? requireOk(await supabase.from("global_factory_initial").select("*")) : [],
    requireOk(await supabase.from("objectives").select("*")),
    requireOk(await supabase.from("purchases").select("*").order("date", { ascending: false })),
    requireOk(await supabase.from("packaging_returns").select("*").order("date", { ascending: false })),
    requireOk(await supabase.from("audits").select("*")),
    isAdmin() ? requireOk(await supabase.from("profiles").select("*").order("created_at", { ascending: false })) : []
  ]);

  Object.assign(app, { locations, bremers, products, settings, initialStocks, globalFactoryInitial, objectives, purchases, returns: returnsRows, audits, profiles });
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
    purchases: renderPurchases,
    returns: renderReturns,
    audit: renderAudit,
    reports: renderReports,
    accounts: renderAccounts
  };
  $("#content").innerHTML = (renderers[app.view] || renderDashboard)();
}

function renderLocationFilter() {
  const options = [
    ...(isAdmin() ? [{ id: "all", name: "Tous les sites et axes" }] : []),
    ...app.locations.filter((row) => allowedLocationIds().includes(row.id))
  ];
  $("#locationFilter").innerHTML = options.map((row) => `<option value="${row.id}" ${app.locationFilter === row.id ? "selected" : ""}>${h(row.name)}</option>`).join("");
  $("#locationFilter").disabled = !isAdmin();
}

function card(label, value, detail) {
  return `<article class="card"><span>${h(label)}</span><strong>${h(value)}</strong><small>${h(detail)}</small></article>`;
}

function renderDashboard() {
  const ids = selectedLocationIds();
  const factory = selectionFactoryTotal(ids);
  const depot = selectionDepositTotal(ids);
  const purchases = purchaseSummary(ids);
  const returns = returnSummary(ids);
  return `
    <div class="cards">
      ${card("Solde Brasimba", fmtQty(factory.qty), fmtMoney(factory.value))}
      ${card("Stock dépôts", fmtQty(depot.qty), fmtMoney(depot.value))}
      ${card("Achats du mois", fmtQty(purchases.qty), fmtMoney(purchases.value))}
      ${card("Retours du mois", fmtQty(returns.qty), fmtMoney(returns.value))}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Analyse des flux de stocks d'emballages</h2>
          <p>Référence métier : Stock Initial constant, achats, retours, puis comparaison avec le stock calculé.</p>
        </div>
      </div>
      <div class="panel-body">
        <img class="flow-image" src="/flux-donnees.jpeg" alt="Analyse des flux de stocks d'emballages">
      </div>
    </section>
    <div class="split">
      <section class="panel">
        <div class="panel-header"><div><h2>Stock par site et axe</h2><p>Dépôt = initial + achats produits - retours emballages.</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Site / axe</th><th>Type</th>${app.bremers.map((b) => `<th class="num">${h(b.code)}</th>`).join("")}<th class="num">Total</th><th class="num">Valeur</th></tr></thead>
            <tbody>
              ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
                const total = totalForLocation(row.id, "depot");
                return `<tr><td>${h(row.name)}</td><td><span class="pill neutral">${h(row.kind)}</span></td>
                  ${app.bremers.map((b) => `<td class="num ${depositCurrent(row.id, b.id) < 0 ? "status-bad" : ""}">${fmtQty(depositCurrent(row.id, b.id))}</td>`).join("")}
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
              ${app.bremers.map((b) => {
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
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Contrôle Stock Initial vs Stock Calculé</h2>
          <p>Stock calculé = Stock Initial + Achats emballages - Retours emballages. L'écart signale pertes, casses ou erreurs de saisie.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Site / axe</th>
              <th class="num">Initial Q</th>
              <th class="num">Initial V</th>
              <th class="num">Calculé Q</th>
              <th class="num">Calculé V</th>
              <th class="num">Écart Q</th>
              <th class="num">Écart V</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
              const initial = initialTotalForLocation(row.id, "depot");
              const current = totalForLocation(row.id, "depot");
              const gapQ = current.qty - initial.qty;
              const gapV = current.value - initial.value;
              const conform = gapQ === 0 && gapV === 0;
              return `<tr>
                <td>${h(row.name)}</td>
                <td class="num">${fmtQty(initial.qty)}</td>
                <td class="num">${fmtMoney(initial.value)}</td>
                <td class="num">${fmtQty(current.qty)}</td>
                <td class="num">${fmtMoney(current.value)}</td>
                <td class="num ${gapQ < 0 ? "status-bad" : gapQ > 0 ? "status-ok" : ""}">${fmtQty(gapQ)}</td>
                <td class="num ${gapV < 0 ? "status-bad" : gapV > 0 ? "status-ok" : ""}">${fmtMoney(gapV)}</td>
                <td><span class="pill ${conform ? "" : "warn"}">${conform ? "État conforme" : "Anomalie à contrôler"}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
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
    ${stockPanel("factory", "Stock initial à l'usine Brasimba", "Répartition du parc Brasimba par site ou axe.", locations)}
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

function stockPanel(scope, title, subtitle, locations) {
  const editable = canEditInitialStock();
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div></div>
      ${scope === "factory" && isAdmin() ? `<div class="panel-body"><div class="form-grid">
        ${app.bremers.map((b) => `<label>${h(b.code)} global Q<input class="global-factory-input" data-field="quantity" data-bremer="${b.id}" value="${h(globalFactoryQty(b.id))}" ${editable ? "" : "disabled"}></label><label>${h(b.code)} global V<input class="global-factory-input" data-field="value" data-bremer="${b.id}" value="${h(globalFactoryValue(b.id))}" ${editable ? "" : "disabled"}></label>`).join("")}
      </div></div>` : ""}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Site / axe</th>${app.bremers.map((b) => `<th class="num">${h(b.code)} Q</th><th class="num">${h(b.code)} V</th>`).join("")}<th class="num">Total calculé</th></tr></thead>
          <tbody>
            ${locations.map((row) => {
              const total = totalForLocation(row.id, scope === "factory" ? "factory" : "depot");
              return `<tr><td>${h(row.name)}</td>${app.bremers.map((b) => `<td><input data-stock-scope="${scope}" data-stock-field="quantity" data-location="${row.id}" data-bremer="${b.id}" value="${h(stockQty(scope, row.id, b.id))}" ${editable ? "" : "disabled"}></td><td><input data-stock-scope="${scope}" data-stock-field="value" data-location="${row.id}" data-bremer="${b.id}" value="${h(stockValue(scope, row.id, b.id))}" ${editable ? "" : "disabled"}></td>`).join("")}<td class="num"><strong>${fmtQty(total.qty)}</strong><br><span class="notice">${fmtMoney(total.value)}</span></td></tr>`;
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
    ${isAdmin() ? purchaseForm() : `<div class="readonly">Lecture seule: vous consultez uniquement les achats de votre site affecté.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Achats produits</h2><p>Les achats diminuent le solde Brasimba et augmentent le stock dépôt.</p></div></div>
      <div class="table-wrap">${purchaseTable(rows)}</div>
    </section>
  `;
}

function purchaseForm() {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Nouvel achat</h2><p>Commande produit Brasimba.</p></div></div>
      <div class="panel-body">
        <form id="purchaseForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>N° commande<input name="order_no" placeholder="ex: BENI02"></label>
          <label>Site / axe<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <label>Produit<select name="product_id" required>${app.products.map((row) => `<option value="${row.id}">${h(row.name)} / ${h(bremer(row.bremer_id)?.code)}</option>`).join("")}</select></label>
          <label>Quantité<input name="quantity" inputmode="numeric" required></label>
          <label>Prix unitaire<input name="unit_price" inputmode="numeric" placeholder="Prix produit"></label>
          <label class="span-2">Note<input name="note" placeholder="Facture, bon, observation"></label>
          <button type="submit">Enregistrer</button>
        </form>
      </div>
    </section>
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
    ${isAdmin() ? returnForm() : `<div class="readonly">Lecture seule: vous consultez uniquement les retours de votre site affecté.</div>`}
    <section class="panel">
      <div class="panel-header"><div><h2>Retours emballages</h2><p>Les retours augmentent le solde Brasimba et diminuent le stock dépôt.</p></div></div>
      <div class="table-wrap">${returnTable(rows)}</div>
    </section>
  `;
}

function returnForm() {
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Nouveau retour</h2><p>Déconsignation envoyée à Brasimba.</p></div></div>
      <div class="panel-body">
        <form id="returnForm" class="form-grid">
          <label>Date<input type="date" name="date" required value="${today()}"></label>
          <label>Référence<input name="ref" placeholder="Bon de déconsignation"></label>
          <label>Site / axe<select name="location_id" required>${app.locations.map((row) => `<option value="${row.id}">${h(row.name)}</option>`).join("")}</select></label>
          <label>Bremer<select name="bremer_id" required>${app.bremers.map((row) => `<option value="${row.id}">${h(row.code)} - ${h(row.label)}</option>`).join("")}</select></label>
          <label>Qté déconsignée<input name="quantity" inputmode="numeric" required></label>
          <label>Qté bordereau<input name="shipped_qty" inputmode="numeric"></label>
          <label class="span-2">Note<input name="note" placeholder="Observation"></label>
          <button type="submit">Enregistrer</button>
        </form>
      </div>
    </section>
  `;
}

function returnTable(rows) {
  return `
    <table>
      <thead><tr><th>Date</th><th>Référence</th><th>Site / axe</th><th>Bremer</th><th class="num">Déconsigné</th><th class="num">Bordereau</th><th class="num">Écart</th><th class="num">Valeur</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${h(row.date)}</td><td>${h(row.ref || "-")}</td><td>${h(loc(row.location_id)?.name)}</td><td>${h(bremer(row.bremer_id)?.code)}</td><td class="num">${fmtQty(row.quantity)}</td><td class="num">${fmtQty(row.shipped_qty)}</td><td class="num ${returnGap(row) ? "status-warn" : ""}">${fmtQty(returnGap(row))}</td><td class="num">${fmtMoney(returnValue(row))}</td><td>${isAdmin() ? `<button class="danger" data-delete="packaging_returns:${row.id}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="9">Aucun retour pour la sélection.</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderAudit() {
  const ids = selectedLocationIds();
  const locationId = ids.includes(sessionStorage.getItem("auditLocationId")) ? sessionStorage.getItem("auditLocationId") : ids[0];
  const purchases = purchaseSummary([locationId]);
  const record = app.audits.find((row) => row.location_id === locationId && row.month === app.month) || {
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
    ${isAdmin() ? "" : `<div class="readonly">Lecture seule: vous consultez uniquement l'audit de votre site.</div>`}
    <section class="panel">
      <div class="panel-header">
        <div><h2>Audit mensuel</h2><p>Entrées, sorties, dépenses et versements bancaires.</p></div>
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
          <div class="span-4"><button ${isAdmin() ? "" : "disabled"}>Enregistrer audit</button></div>
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
  `;
}

function auditInput(label, name, value) {
  return `<label>${h(label)}<input name="${h(name)}" inputmode="numeric" value="${h(value)}" ${isAdmin() ? "" : "disabled"}></label>`;
}

function renderReports() {
  const ids = selectedLocationIds();
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
      <thead><tr><th>Site / axe</th><th class="num">Achats qté</th><th class="num">Achats valeur</th><th class="num">Retours qté</th><th class="num">Retours valeur</th><th class="num">Stock dépôt</th><th class="num">Solde usine</th></tr></thead>
      <tbody>
        ${app.locations.filter((row) => ids.includes(row.id)).map((row) => {
          const p = purchaseSummary([row.id], app.month, range);
          const r = returnSummary([row.id], app.month, range);
          const d = totalForLocation(row.id, "depot");
          const f = totalForLocation(row.id, "factory");
          return `<tr><td>${h(row.name)}</td><td class="num">${fmtQty(p.qty)}</td><td class="num">${fmtMoney(p.value)}</td><td class="num">${fmtQty(r.qty)}</td><td class="num">${fmtMoney(r.value)}</td><td class="num">${fmtQty(d.qty)}</td><td class="num">${fmtQty(f.qty)}</td></tr>`;
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
          <button id="resetAppBtn" class="danger" type="button">Réinitialiser données d'exploitation</button>
          <span class="notice">Supprime achats, retours, audits et objectifs, puis remet les stocks initiaux de référence.</span>
        </div>
      </section>
    ` : ""}
  `;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function refresh() {
  await loadData();
  render();
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

  if (event.target.id === "resetAppBtn" && isPrincipalAdmin()) {
    const ok = confirm("Réinitialiser les données d'exploitation Rivinter ? Cette action est réservée à l'administrateur principal.");
    if (!ok) return;
    await requireOk(await supabase.rpc("reset_company_data", { p_restore_seed: true }));
    await refresh();
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
    const field = stock.dataset.stockField || "quantity";
    if (existing) existing[field] = n(stock.value);
    else app.initialStocks.push({ scope: stock.dataset.stockScope, location_id: stock.dataset.location, bremer_id: stock.dataset.bremer, quantity: field === "quantity" ? n(stock.value) : 0, value: field === "value" ? n(stock.value) : 0 });
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
    const field = globalFactory.dataset.field || "quantity";
    if (existing) existing[field] = n(globalFactory.value);
    else app.globalFactoryInitial.push({ bremer_id: globalFactory.dataset.bremer, quantity: field === "quantity" ? n(globalFactory.value) : 0, value: field === "value" ? n(globalFactory.value) : 0 });
    const current = app.globalFactoryInitial.find((row) => row.bremer_id === globalFactory.dataset.bremer);
    await supabase.from("global_factory_initial").upsert({
      bremer_id: globalFactory.dataset.bremer,
      quantity: n(current?.quantity),
      value: n(current?.value)
    }, { onConflict: "bremer_id" });
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
      const p = product(data.product_id);
      await requireOk(await supabase.from("purchases").insert({
        date: data.date,
        order_no: data.order_no,
        location_id: data.location_id,
        product_id: data.product_id,
        quantity: n(data.quantity),
        unit_price: n(data.unit_price || p?.price),
        note: data.note
      }));
      await refresh();
      return;
    }

    if (event.target.id === "returnForm" && isAdmin()) {
      const data = formObject(event.target);
      const qty = n(data.quantity);
      await requireOk(await supabase.from("packaging_returns").insert({
        date: data.date,
        ref: data.ref,
        location_id: data.location_id,
        bremer_id: data.bremer_id,
        quantity: qty,
        shipped_qty: data.shipped_qty === "" ? qty : n(data.shipped_qty),
        note: data.note
      }));
      await refresh();
      return;
    }

    if (event.target.id === "auditForm" && isAdmin()) {
      const data = formObject(event.target);
      const ids = selectedLocationIds();
      const locationId = ids.includes(sessionStorage.getItem("auditLocationId")) ? sessionStorage.getItem("auditLocationId") : ids[0];
      const record = { month: app.month, location_id: locationId };
      Object.keys(data).forEach((key) => record[key] = n(data[key]));
      await requireOk(await supabase.from("audits").upsert(record, { onConflict: "month,location_id" }));
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
  const rows = [["Site / axe", "Achats qté", "Achats valeur", "Retours qté", "Retours valeur", "Stock dépôt qté", "Solde usine qté"]];
  app.locations.filter((row) => ids.includes(row.id)).forEach((row) => {
    const p = purchaseSummary([row.id], app.month, range);
    const r = returnSummary([row.id], app.month, range);
    const d = totalForLocation(row.id, "depot");
    const f = totalForLocation(row.id, "factory");
    rows.push([row.name, p.qty, p.value, r.qty, r.value, d.qty, f.qty]);
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

init();
