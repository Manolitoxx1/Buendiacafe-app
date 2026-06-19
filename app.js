// --- POLYFILLS PARA TABLETS ANTIGUAS ---
if (!Array.prototype.find) {
    Array.prototype.find = function (fn, thisArg) {
        for (var i = 0; i < this.length; i++) {
            if (fn.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
    };
}
if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (fn, thisArg) {
        for (var i = 0; i < this.length; i++) {
            if (fn.call(thisArg, this[i], i, this)) return i;
        }
        return -1;
    };
}
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}
if (!Element.prototype.closest) {
    Element.prototype.closest = function (s) {
        var el = this;
        while (el && el.nodeType === 1) {
            if (el.matches && el.matches(s)) return el;
            el = el.parentElement || el.parentNode;
        }
        return null;
    };
}
// ---------------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyBYaaBUK-Y4q60d7xALpv9Oo1iB-LjdDzI",
    authDomain: "buen-dia-cafe.firebaseapp.com",
    databaseURL: "https://buen-dia-cafe-default-rtdb.firebaseio.com",
    projectId: "buen-dia-cafe",
    storageBucket: "buen-dia-cafe.firebasestorage.app",
    messagingSenderId: "1030229835388",
    appId: "1:1030229835388:web:d4d190818804f3ca8353f9",
    measurementId: "G-X2J17RETEE"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

var STATE = {
    tables: [],
    menu: [],
    history: [],
    ingredients: [],
    currentTableId: null,
    editingProductId: null,
    editingTableId: null,
    editingIngredientId: null,
    isSaving: false,
    isConnected: false
};

var CURRENT_ROLE = localStorage.getItem('fudo_role') || null;
var BARISTA_CATS = ['Cafetería', 'Bebidas', 'Cafetería fría', 'Té'];
var activeZone = 'salon';



function saveAllTables() {
    var tablesObj = {};
    STATE.tables.forEach(function (t) { tablesObj[t.id] = t; });
    db.ref('tables').set(tablesObj).catch(function (e) { console.error(e); alert('Error al guardar mesas: ' + e.message); });
}
function saveTable(table) {
    if (!table || !table.id) return;
    db.ref('tables/' + table.id).set(table).catch(function (e) { console.error(e); alert('Error al guardar mesa: ' + e.message); });
}
function deleteTable(tableId) {
    db.ref('tables/' + tableId).remove().catch(function (e) { console.error(e); alert('Error al eliminar mesa: ' + e.message); });
}
function saveMenu() {
    db.ref('menu').set(STATE.menu || []).catch(function (e) { console.error(e); alert('Error al guardar menú: ' + e.message); });
}
function genId() { return Math.random().toString(36).substr(2, 9); }
function fmt(n) { return '$' + Math.round(n); }

function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

var confirmCb = null;

function init() {
    // Roles
    if (!CURRENT_ROLE) {
        var overlay = $('role-selection-overlay');
        if (overlay) overlay.classList.remove('hidden');
    } else {
        var overlay = $('role-selection-overlay');
        if (overlay) overlay.classList.add('hidden');
        applyRole();
    }
    var btnMesero = $('btn-role-mesero'); if (btnMesero) btnMesero.addEventListener('click', function () {
        CURRENT_ROLE = 'mesero'; localStorage.setItem('fudo_role', 'mesero');
        $('role-selection-overlay').classList.add('hidden'); applyRole();
    });
    var btnBarista = $('btn-role-barista'); if (btnBarista) btnBarista.addEventListener('click', function () {
        CURRENT_ROLE = 'barista'; localStorage.setItem('fudo_role', 'barista');
        $('role-selection-overlay').classList.add('hidden'); applyRole();
    });
    var btnCr1 = $('btn-change-role'); if (btnCr1) btnCr1.addEventListener('click', function () { $('role-selection-overlay').classList.remove('hidden'); });
    var btnCr2 = $('btn-change-role-mesero'); if (btnCr2) btnCr2.addEventListener('click', function () { $('role-selection-overlay').classList.remove('hidden'); });
    var btnCr3 = $('btn-change-role-barista'); if (btnCr3) btnCr3.addEventListener('click', function () { $('role-selection-overlay').classList.remove('hidden'); });

    setInterval(function () { if (CURRENT_ROLE === 'barista') renderKDS(); }, 30000);

    // Navigation
    qsa('.nav-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            qsa('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            qsa('.view').forEach(function (v) { v.classList.remove('active'); });
            var viewName = btn.getAttribute('data-view');
            $('view-' + viewName).classList.add('active');
            if (viewName === 'balance') {
                renderBalance();
            }
        });
    });

    // Zone Selection Tabs for Mesas
    qsa('.zone-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            qsa('.zone-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            activeZone = tab.getAttribute('data-zone');
            
            // Show/hide sections
            ['salon', 'terraza', 'pendientes'].forEach(function (z) {
                var sec = $('zone-section-' + z);
                if (sec) sec.style.display = (z === activeZone) ? 'block' : 'none';
            });
            renderTables();
        });
    });

    // Auto-update size inputs based on type selector
    var typeSelector = $('input-table-type');
    if (typeSelector) {
        typeSelector.addEventListener('change', function (e) {
            var val = e.target.value;
            if (val === 'table') {
                $('input-table-w').value = 12;
                $('input-table-h').value = 18;
                $('input-table-tip-container').style.display = 'block';
            } else if (val === 'bar') {
                $('input-table-w').value = 20;
                $('input-table-h').value = 14;
                $('input-table-tip-container').style.display = 'block';
            } else if (val === 'sofa') {
                $('input-table-w').value = 18;
                $('input-table-h').value = 14;
                $('input-table-tip-container').style.display = 'none';
            }
        });
    }

    // Drag & Drop zones setup
    ['Salón', 'Terraza', 'Pendientes'].forEach(function (zoneName) {
        var zoneKey = zoneName.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        var grid = $('grid-' + zoneKey);
        if (!grid) return;

        grid.addEventListener('dragover', function (e) {
            e.preventDefault();
            grid.classList.add('drag-over');
        });

        grid.addEventListener('dragleave', function () {
            grid.classList.remove('drag-over');
        });

        grid.addEventListener('drop', function (e) {
            e.preventDefault();
            grid.classList.remove('drag-over');
            var tableId = e.dataTransfer.getData('text/plain');
            var table = STATE.tables.find(function (t) { return t.id === tableId; });
            if (!table) return;

            // Check if dropped on another card
            var targetCard = e.target.closest('.table-card');
            if (targetCard) {
                var targetEditBtn = targetCard.querySelector('.btn-table-edit');
                var targetId = targetEditBtn ? targetEditBtn.getAttribute('data-id') : null;
                if (targetId && targetId !== tableId) {
                    var dragIdx = STATE.tables.findIndex(function (t) { return t.id === tableId; });
                    table.zone = zoneName;
                    STATE.tables.splice(dragIdx, 1);
                    var targetIdx = STATE.tables.findIndex(function (t) { return t.id === targetId; });
                    STATE.tables.splice(targetIdx, 0, table);
                    saveAllTables();
                    renderTables();
                    return;
                }
            }

            // If dropped on the grid background or zone changes
            if (table.zone !== zoneName) {
                table.zone = zoneName;
                var dragIdx = STATE.tables.findIndex(function (t) { return t.id === tableId; });
                STATE.tables.splice(dragIdx, 1);
                STATE.tables.push(table);
                saveAllTables();
                renderTables();
            }
        });
    });

    // Balance view sub-tabs switching
    var balanceTabs = qsa('.balance-tab');
    balanceTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            balanceTabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var tabName = tab.getAttribute('data-tab');
            qsa('.balance-sub-view').forEach(function (sv) {
                sv.style.display = 'none';
            });
            $('balance-tab-' + tabName + '-content').style.display = 'block';
            if (tabName === 'ingredients') {
                renderIngredients();
            } else {
                renderRecipes();
            }
        });
    });

    // Add Raw Ingredient to Registry
    var btnRegAddIng = $('btn-reg-add-ingredient');
    if (btnRegAddIng) {
        btnRegAddIng.addEventListener('click', function () {
            var name = $('reg-ing-name').value.trim();
            var unit = $('reg-ing-unit').value;
            var cost = parseFloat($('reg-ing-cost').value);
            if (name && !isNaN(cost) && cost >= 0) {
                var ingId = genId();
                db.ref('ingredients_registry/' + ingId).set({
                    id: ingId,
                    name: name,
                    unit: unit,
                    cost: cost
                }).then(function () {
                    $('reg-ing-name').value = '';
                    $('reg-ing-cost').value = '';
                    alert('Ingrediente registrado con éxito.');
                }).catch(function (err) {
                    alert('Error: ' + err.message);
                });
            } else {
                alert('Por favor, ingresa un nombre y costo válido.');
            }
        });
    }

    // Search ingredients
    var regIngSearch = $('reg-ing-search');
    if (regIngSearch) {
        regIngSearch.addEventListener('input', renderIngredients);
    }

    // Modal Ingredient Handlers
    var btnModalIngCancel = $('btn-modal-ingredient-cancel');
    if (btnModalIngCancel) {
        btnModalIngCancel.addEventListener('click', function () {
            $('modal-ingredient').classList.add('hidden');
            STATE.editingIngredientId = null;
        });
    }

    var btnModalIngSave = $('btn-modal-ingredient-save');
    if (btnModalIngSave) {
        btnModalIngSave.addEventListener('click', function () {
            var name = $('input-ingredient-name').value.trim();
            var unit = $('input-ingredient-unit').value;
            var cost = parseFloat($('input-ingredient-cost').value);
            if (name && !isNaN(cost) && cost >= 0 && STATE.editingIngredientId) {
                db.ref('ingredients_registry/' + STATE.editingIngredientId).set({
                    id: STATE.editingIngredientId,
                    name: name,
                    unit: unit,
                    cost: cost
                }).then(function () {
                    $('modal-ingredient').classList.add('hidden');
                    STATE.editingIngredientId = null;
                    alert('Ingrediente actualizado.');
                }).catch(function (err) {
                    alert('Error: ' + err.message);
                });
            } else {
                alert('Ingresa datos válidos.');
            }
        });
    }

    // Recipe Selectors
    var recipeCatSelect = $('recipe-cat-select');
    if (recipeCatSelect) {
        recipeCatSelect.addEventListener('change', function (e) {
            var cat = e.target.value;
            var pSelect = $('recipe-prod-select');
            pSelect.innerHTML = '<option value="">-- Elige Producto --</option>';
            
            $('recipe-ingredient-add-form').style.display = 'none';
            $('recipe-summary-cards').style.display = 'none';
            $('recipe-list-card').style.display = 'none';
            $('recipe-empty-state').style.display = 'block';

            if (cat) {
                STATE.menu.filter(function (p) { return p.category === cat; }).forEach(function (p) {
                    var opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    pSelect.appendChild(opt);
                });
            }
        });
    }

    var recipeProdSelect = $('recipe-prod-select');
    if (recipeProdSelect) {
        recipeProdSelect.addEventListener('change', function (e) {
            var pid = e.target.value;
            if (pid) {
                showRecipeDetails(pid);
            } else {
                $('recipe-ingredient-add-form').style.display = 'none';
                $('recipe-summary-cards').style.display = 'none';
                $('recipe-list-card').style.display = 'none';
                $('recipe-empty-state').style.display = 'block';
            }
        });
    }

    var recipeIngSelect = $('recipe-ing-select');
    if (recipeIngSelect) {
        recipeIngSelect.addEventListener('change', function (e) {
            var ingId = e.target.value;
            var display = $('recipe-ing-unit-display');
            if (ingId) {
                var ing = STATE.ingredients.find(function (i) { return i.id === ingId; });
                display.value = ing ? ing.unit : '';
            } else {
                display.value = '';
            }
        });
    }

    // Add ingredient to recipe
    var btnRecipeAddIng = $('btn-recipe-add-ingredient');
    if (btnRecipeAddIng) {
        btnRecipeAddIng.addEventListener('click', function () {
            var pid = $('recipe-prod-select').value;
            var ingId = $('recipe-ing-select').value;
            var qty = parseFloat($('recipe-ing-qty').value);
            if (pid && ingId && !isNaN(qty) && qty > 0) {
                var p = STATE.menu.find(function (x) { return x.id === pid; });
                if (p) {
                    if (!p.recipe) p.recipe = [];
                    var existing = p.recipe.find(function (r) { return r.ingredientId === ingId; });
                    if (existing) {
                        existing.qty = qty;
                    } else {
                        p.recipe.push({ ingredientId: ingId, qty: qty });
                    }
                    
                    // Recalculate cost
                    var totalCost = 0;
                    p.recipe.forEach(function (rItem) {
                        var ing = STATE.ingredients.find(function (i) { return i.id === rItem.ingredientId; });
                        if (ing) totalCost += rItem.qty * (ing.cost || 0);
                    });
                    p.preparationCost = totalCost;

                    saveMenu();
                    showRecipeDetails(pid);
                    $('recipe-ing-qty').value = '';
                    $('recipe-ing-select').value = '';
                    $('recipe-ing-unit-display').value = '';
                }
            } else {
                alert('Por favor, selecciona un ingrediente y cantidad válida.');
            }
        });
    }

    // Add Table
    $('btn-add-table').addEventListener('click', function () {
        STATE.editingTableId = null;
        $('modal-table-title').textContent = 'Nuevo Elemento';
        $('input-table-name').value = '';
        $('input-table-zone').value = 'Salón';
        $('input-table-type').value = 'table';
        $('input-table-w').value = 12;
        $('input-table-h').value = 18;
        $('input-table-tip').checked = false;
        $('input-table-tip-container').style.display = 'block';
        $('modal-table').classList.remove('hidden');
    });
    $('btn-modal-table-cancel').addEventListener('click', function () {
        $('modal-table').classList.add('hidden');
        STATE.editingTableId = null;
    });
    $('btn-modal-table-save').addEventListener('click', function () {
        var name = $('input-table-name').value.trim();
        var zone = $('input-table-zone').value;
        var tip = $('input-table-tip').checked;
        var type = $('input-table-type').value || 'table';
        var w = parseInt($('input-table-w').value) || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 12);
        var h = parseInt($('input-table-h').value) || (type === 'bar' ? 14 : type === 'sofa' ? 14 : 18);
        
        if (name) {
            if (STATE.editingTableId) {
                var t = STATE.tables.find(function (x) { return x.id === STATE.editingTableId; });
                if (t) {
                    t.name = name;
                    t.zone = zone;
                    t.tip = tip;
                    t.type = type;
                    t.w = w;
                    t.h = h;
                    saveTable(t);
                }
            } else {
                var rx = Math.round(10 + Math.random() * 30);
                var ry = Math.round(10 + Math.random() * 30);
                STATE.tables.push({ 
                    id: genId(), 
                    name: name, 
                    zone: zone, 
                    tip: tip, 
                    type: type,
                    w: w,
                    h: h,
                    x: rx,
                    y: ry,
                    status: 'free', 
                    order: [] 
                });
                saveAllTables();
            }
            renderTables();
            $('modal-table').classList.add('hidden');
            STATE.editingTableId = null;
        }
    });

    // Add Product
    $('btn-add-product').addEventListener('click', function () {
        STATE.editingProductId = null;
        $('modal-product-title').textContent = 'Nuevo Producto';
        $('input-product-name').value = '';
        $('input-product-price').value = '';
        $('input-product-category').value = '';
        $('modal-product').classList.remove('hidden');
    });
    $('btn-modal-product-cancel').addEventListener('click', function () {
        $('modal-product').classList.add('hidden');
    });
    $('btn-modal-product-save').addEventListener('click', function () {
        var name = $('input-product-name').value.trim();
        var price = parseFloat($('input-product-price').value);
        var cat = $('input-product-category').value.trim() || 'General';
        if (name && !isNaN(price) && price >= 0) {
            if (STATE.editingProductId) {
                var p = STATE.menu.find(function (x) { return x.id === STATE.editingProductId; });
                if (p) { p.name = name; p.price = price; p.category = cat; }
            } else {
                STATE.menu.push({ id: genId(), name: name, price: price, category: cat });
            }
            saveMenu();
            renderMenu();
            $('modal-product').classList.add('hidden');
        }
    });

    // Order Panel
    var btnOk = $('btn-ok-order');
    if (btnOk) btnOk.addEventListener('click', closeOrder);
    $('order-panel-overlay').addEventListener('click', closeOrder);
    $('order-tip-checkbox').addEventListener('change', function (e) {
        var t = getTable();
        if (t) { t.tip = e.target.checked; saveTable(t); renderOrderItems(); }
    });

    $('order-search').addEventListener('input', function () {
        renderOrderMenu();
    });

    $('btn-print-receipt').addEventListener('click', function () {
        var t = getTable();
        if (t && t.order.length > 0) {
            var subtotal = calcTotal(t.order);
            var tipAmt = t.tip ? subtotal * 0.1 : 0;
            var total = subtotal + tipAmt;
            var payment = $('order-payment-method').value;
            var recItems = t.order.map(function (it) {
                var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                return {
                    productId: it.productId,
                    name: p ? p.name : '?',
                    price: p ? p.price : 0,
                    qty: it.qty,
                    subtotal: (p ? p.price : 0) * it.qty,
                    category: p ? p.category : 'General'
                };
            });
            if (t.tip) {
                recItems.push({ name: 'Propina Sugerida (10%)', price: tipAmt, qty: 1, subtotal: tipAmt });
            }
            var rec = {
                id: genId(), date: new Date().toISOString(),
                tableId: t.id, tableName: t.name, total: total,
                paymentMethod: payment,
                items: recItems
            };
            printTicket(rec);
        }
    });

    $('btn-charge-order').addEventListener('click', function () {
        if (STATE.isSaving) return;
        var t = getTable();
        if (t && t.order.length > 0) {
            STATE.isSaving = true;
            var btnCharge = $('btn-charge-order');
            if (btnCharge) { btnCharge.disabled = true; btnCharge.textContent = 'Procesando...'; }
            var subtotal = calcTotal(t.order);
            var tipAmt = t.tip ? subtotal * 0.1 : 0;
            var total = subtotal + tipAmt;
            var payment = $('order-payment-method').value;
            var recItems = t.order.map(function (it) {
                var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                return {
                    productId: it.productId,
                    name: p ? p.name : '?',
                    price: p ? p.price : 0,
                    qty: it.qty,
                    subtotal: (p ? p.price : 0) * it.qty,
                    category: p ? p.category : 'General'
                };
            });
            if (t.tip) {
                recItems.push({ name: 'Propina Sugerida (10%)', price: tipAmt, qty: 1, subtotal: tipAmt });
            }
            var preparationCost = 0;
            t.order.forEach(function (it) {
                var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                if (p) {
                    var costVal = 0;
                    if (typeof p.preparationCost === 'number') {
                        costVal = p.preparationCost;
                    } else if (p.ingredients) {
                        p.ingredients.forEach(function (ing) { costVal += (ing.cost || 0); });
                    }
                    preparationCost += costVal * it.qty;
                }
            });

            var rec = {
                id: genId(), date: new Date().toISOString(),
                tableId: t.id, tableName: t.name, total: total,
                paymentMethod: payment,
                items: recItems,
                preparationCost: preparationCost
            };
            db.ref('history').push(rec).catch(function (e) { console.error(e); alert('Error al guardar cobro: ' + e.message); });
            t.order = []; t.tickets = []; t.status = 'free';
            saveTable(t);
            renderTables(); renderHistory(); updateDaily();
            closeOrder();
            setTimeout(function () {
                STATE.isSaving = false;
                if (btnCharge) { btnCharge.disabled = false; btnCharge.textContent = 'Pagado'; }
            }, 2000);
        }
    });

    var btnSendKds = $('btn-send-kds');
    if (btnSendKds) {
        btnSendKds.addEventListener('click', function () {
            if (STATE.isSaving) return;
            var t = getTable();
            if (!t || !t.order) return;
            STATE.isSaving = true;
            btnSendKds.disabled = true;
            var sentAny = false;
            var now = Date.now();
            if (!t.tickets) t.tickets = [];
            var ticketItems = [];
            t.order.forEach(function (it) {
                var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                if (!p) return;
                var previouslySent = 0;
                t.tickets.forEach(function (tk) {
                    var tItem = tk.items.find(function (x) { return x.productId === it.productId; });
                    if (tItem) previouslySent += tItem.qty;
                });
                var diff = it.qty - previouslySent;
                if (diff > 0) {
                    ticketItems.push({ productId: it.productId, name: p.name, qty: diff, done: false });
                }
            });
            if (ticketItems.length > 0) {
                t.tickets.push({ id: genId(), timestamp: now, items: ticketItems, status: 'pending', printed: false });
                saveTable(t);
                sentAny = true;
                if (CURRENT_ROLE !== 'barista') renderTables();
            }
            closeOrder();
            setTimeout(function () { STATE.isSaving = false; btnSendKds.disabled = false; }, 2000);
            if (sentAny) {
                if (PrinterManager.isServer) alert('Comanda enviada a cocina e impresión encolada.');
                else alert('Comanda enviada. La Caja principal la imprimirá.');
            } else {
                alert('No hay productos nuevos para enviar.');
            }
        });
    }

    // Confirm modal
    $('btn-confirm-cancel').addEventListener('click', function () { $('modal-confirm').classList.add('hidden'); confirmCb = null; });
    $('btn-confirm-ok').addEventListener('click', function () { $('modal-confirm').classList.add('hidden'); if (confirmCb) confirmCb(); });

    // History filter
    $('history-date-filter').addEventListener('change', function () { $('history-month-filter').value = ''; renderHistory(); });
    $('history-month-filter').addEventListener('change', function () { $('history-date-filter').value = ''; renderHistory(); });
    $('btn-clear-filter').addEventListener('click', function () { $('history-date-filter').value = ''; $('history-month-filter').value = ''; renderHistory(); });

    // Settings UI
    var selPrintMode = $('setting-print-mode');
    var panelBt = $('bluetooth-settings-panel');
    var descMode = $('print-mode-desc');

    function updatePrintModeUI(mode) {
        if (selPrintMode) selPrintMode.value = mode;
        if (panelBt) panelBt.style.display = mode === 'bluetooth' ? 'block' : 'none';
        if (descMode) {
            if (mode === 'bluetooth') {
                descMode.textContent = "El modo directo enviará la impresión por Bluetooth sin abrir cuadros de diálogo.";
            } else {
                descMode.textContent = "El modo clásico abre la ventana de impresión normal de tu dispositivo para enviar boletas y comandas a tu impresora USB o en red.";
            }
        }
    }

    var savedMode = localStorage.getItem('fudo_print_mode') || 'classic';
    PrinterManager.mode = savedMode;
    updatePrintModeUI(savedMode);

    if (selPrintMode) {
        selPrintMode.addEventListener('change', function (e) {
            PrinterManager.mode = e.target.value;
            localStorage.setItem('fudo_print_mode', e.target.value);
            updatePrintModeUI(e.target.value);
        });
    }

    var chkIsServer = $('setting-is-server');
    if (chkIsServer) {
        var savedIsServer = localStorage.getItem('fudo_is_server') === 'true';
        PrinterManager.isServer = savedIsServer;
        chkIsServer.checked = savedIsServer;
        chkIsServer.addEventListener('change', function (e) {
            PrinterManager.isServer = e.target.checked;
            localStorage.setItem('fudo_is_server', e.target.checked);
        });
    }

    var btnPairCaja = $('btn-pair-caja'); if (btnPairCaja) btnPairCaja.addEventListener('click', function () { PrinterManager.connect('caja'); });
    var btnPairCocina = $('btn-pair-cocina'); if (btnPairCocina) btnPairCocina.addEventListener('click', function () { PrinterManager.connect('cocina'); });
    var chkSamePrinter = $('setting-same-printer');
    if (chkSamePrinter) {
        chkSamePrinter.addEventListener('change', function (e) {
            PrinterManager.samePrinter = e.target.checked;
            $('container-printer-cocina').style.opacity = e.target.checked ? '0.5' : '1';
            $('btn-pair-cocina').disabled = e.target.checked;
        });
    }

    // Firebase connection status
    db.ref('.info/connected').on('value', function (snap) {
        STATE.isConnected = snap.val() === true;
        var indicator = $('connection-status');
        if (indicator) {
            indicator.textContent = STATE.isConnected ? '● En línea' : '● Sin conexión';
            indicator.style.color = STATE.isConnected ? 'var(--success)' : 'var(--danger)';
        }
    });

    // Firebase Listeners
    db.ref('tables').on('value', function (snapshot) {
        var rawVal = snapshot.val() || {};
        var rawTables = Object.values(rawVal);
        STATE.tables = rawTables.map(function (t) {
            if (t.order && !Array.isArray(t.order)) t.order = Object.values(t.order);
            if (!t.order) t.order = [];
            if (t.tickets && !Array.isArray(t.tickets)) t.tickets = Object.values(t.tickets);
            if (!t.tickets) t.tickets = [];
            t.tickets.forEach(function (tk) {
                if (tk.items && !Array.isArray(tk.items)) tk.items = Object.values(tk.items);
                if (!tk.items) tk.items = [];
            });
            return t;
        });
        if (CURRENT_ROLE === 'barista') renderKDS();
        else renderTables();

        // Print Server Logic
        if (PrinterManager.isServer) {
            STATE.tables.forEach(function (t) {
                var tableChanged = false;
                if (t.tickets) {
                    t.tickets.forEach(function (tk) {
                        if (tk.status === 'pending' && tk.printed === false) {
                            PrinterManager.enqueueJob(t.name, tk.items, t.id, tk.id);
                            tk.printed = true;
                            tableChanged = true;
                        }
                    });
                }
                if (tableChanged) saveTable(t);
            });
        }
        if (STATE.currentTableId) {
            renderOrderItems();
            var t = getTable();
            if (t) {
                $('order-panel-title').textContent = t.name;
                var st = $('order-panel-status');
                st.className = 'order-panel-status ' + (t.status === 'free' ? 'status-badge-free' : 'status-badge-occupied');
                st.textContent = t.status === 'free' ? 'Libre' : 'Ocupada';
            } else {
                closeOrder();
            }
        }
    }, function (error) {
        alert('Error de conexión a Mesas: ' + error.message);
    });

    db.ref('menu').on('value', function (snapshot) {
        STATE.menu = Object.values(snapshot.val() || {});
        renderMenu();
        if (STATE.currentTableId) renderOrderMenu();
        if ($('view-balance') && $('view-balance').classList.contains('active')) {
            renderBalance();
        }
    }, function (error) {
        alert('Error de conexión a Menú: ' + error.message);
    });

    db.ref('history').on('value', function (snapshot) {
        var rawVal = snapshot.val() || {};
        STATE.history = Object.keys(rawVal).map(function (key) {
            var h = rawVal[key];
            h.firebaseKey = key;
            if (h.items && !Array.isArray(h.items)) h.items = Object.values(h.items);
            return h;
        });
        renderHistory();
        updateDaily();
        renderBestSellersChart();
    }, function (error) {
        alert('Error de conexión a Historial: ' + error.message);
    });

    db.ref('ingredients_registry').on('value', function (snapshot) {
        var rawVal = snapshot.val() || {};
        STATE.ingredients = Object.keys(rawVal).map(function (key) {
            return rawVal[key];
        });
        recalculateAllRecipeCosts();
        if ($('view-balance') && $('view-balance').classList.contains('active')) {
            var activeSubTab = qs('.balance-tab.active');
            if (activeSubTab) {
                var tabName = activeSubTab.getAttribute('data-tab');
                if (tabName === 'ingredients') {
                    renderIngredients();
                } else {
                    renderRecipes();
                }
            }
        }
    }, function (error) {
        alert('Error de conexión a Registro de Ingredientes: ' + error.message);
    });
}

function getTable() { return STATE.tables.find(function (t) { return t.id === STATE.currentTableId; }); }
function calcTotal(order) {
    if (!order) return 0;
    return order.reduce(function (s, it) {
        var p = STATE.menu.find(function (x) { return x.id === it.productId; });
        return s + (p ? p.price * it.qty : 0);
    }, 0);
}
function getCats() {
    var s = {};
    STATE.menu.forEach(function (p) { s[p.category] = true; });
    return ['Todos', 'Más vendidos'].concat(Object.keys(s));
}
function showConfirm(msg, cb) {
    $('modal-confirm-message').textContent = msg;
    confirmCb = cb;
    $('modal-confirm').classList.remove('hidden');
}

function applyRole() {
    var sidebar = $('sidebar');
    if (CURRENT_ROLE === 'barista') {
        if (sidebar) sidebar.style.display = 'none';
        qsa('.view').forEach(function (v) { v.classList.remove('active'); });
        var viewKds = $('view-kds');
        if (viewKds) viewKds.classList.add('active');
        renderKDS();
    } else {
        if (sidebar) sidebar.style.display = 'flex';
        qsa('.view').forEach(function (v) { v.classList.remove('active'); });
        var viewTables = $('view-tables');
        if (viewTables) viewTables.classList.add('active');
        renderTables();
    }
}

// =================== Tables ===================
function renderTables() {
    var canvasSalon = $('canvas-salon');
    var canvasTerraza = $('canvas-terraza');
    var gridPendientes = $('grid-pendientes');
    
    if (canvasSalon) canvasSalon.innerHTML = '';
    if (canvasTerraza) canvasTerraza.innerHTML = '';
    if (gridPendientes) gridPendientes.innerHTML = '';
    
    var salonCount = 0;
    var terrazaCount = 0;
    var pendientesCount = 0;

    STATE.tables.forEach(function (table) {
        var zoneKey = (table.zone || 'salon').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        if (zoneKey === 'salon') salonCount++;
        else if (zoneKey === 'terraza') terrazaCount++;
        else if (zoneKey === 'pendientes') pendientesCount++;
    });

    if (activeZone === 'salon' && salonCount === 0 && canvasSalon) {
        canvasSalon.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--text-muted);width:100%;">Toca "Nueva Mesa" para empezar en el Salón</div>';
    }
    if (activeZone === 'terraza' && terrazaCount === 0 && canvasTerraza) {
        canvasTerraza.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--text-muted);width:100%;">Toca "Nueva Mesa" para empezar en la Terraza</div>';
    }
    if (activeZone === 'pendientes' && pendientesCount === 0 && gridPendientes) {
        gridPendientes.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">No hay elementos pendientes</div>';
    }

    STATE.tables.forEach(function (table) {
        var zoneKey = (table.zone || 'salon').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        
        if (zoneKey !== activeZone) return;

        var subtotal = calcTotal(table.order);
        var total = subtotal + (table.tip ? subtotal * 0.1 : 0);

        var bandejaLista = table.tickets && table.tickets.some(function (tk) {
            return tk.status === 'pending' && tk.items.every(function (it) { return it.done; });
        });

        var d = document.createElement('div');
        d.className = 'table-card' + (bandejaLista ? ' bandeja-lista' : '');
        d.setAttribute('data-status', table.status || 'free');
        var type = table.type || 'table';
        d.setAttribute('data-type', type);

        var iconSvg = '';
        if (type === 'sofa') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8"/><path d="M2 14v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4"/><path d="M6 14h12"/></svg>';
        } else if (type === 'bar') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 18v2"/><path d="M16 18v2"/></svg>';
        } else {
            if (zoneKey === 'terraza') {
                iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 17.5L19 19"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M5 19l1.5-1.5"/><path d="M17.5 6.5L19 5"/><circle cx="12" cy="12" r="3"/></svg>';
            } else {
                iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="4" rx="1"/><path d="M5 11v6"/><path d="M19 11v6"/></svg>';
            }
        }

        var amountStr = '';
        if (type === 'sofa') {
            amountStr = 'Sillón Decorativo';
        } else {
            amountStr = table.status !== 'free' ? fmt(total) : 'Libre';
        }

        d.innerHTML = '<div class="table-status-indicator"></div>' +
            '<div class="drag-handle">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="9" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" />' +
            '<circle cx="15" cy="5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="19" r="1.5" />' +
            '</svg>' +
            '</div>' +
            '<div class="table-icon">' + iconSvg + '</div>' +
            '<div class="table-info"><div class="table-name">' + table.name + '</div>' +
            '<div class="table-amount">' + amountStr + '</div></div>' +
            (bandejaLista ? '<div style="background:#10b981;color:#fff;font-size:0.7rem;padding:0.15rem 0.35rem;border-radius:4px;margin-top:0.25rem;text-align:center;">Bandeja Lista</div>' : '') +
            '<div class="table-actions"><button class="btn-table-edit" data-id="' + table.id + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-table-delete" data-id="' + table.id + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';

        if (zoneKey === 'salon' || zoneKey === 'terraza') {
            var w = table.w || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 12);
            var h = table.h || (type === 'bar' ? 14 : type === 'sofa' ? 14 : 18);
            var tx = (typeof table.x === 'number') ? table.x : 10;
            var ty = (typeof table.y === 'number') ? table.y : 10;
            
            d.style.left = tx + '%';
            d.style.top = ty + '%';
            d.style.width = w + '%';
            d.style.height = h + '%';

            var handle = d.querySelector('.drag-handle');
            if (handle) {
                handle.addEventListener('pointerdown', function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    var canvas = d.parentElement;
                    var rect = canvas.getBoundingClientRect();
                    var startX = e.clientX;
                    var startY = e.clientY;
                    var initX = (typeof table.x === 'number') ? table.x : 10;
                    var initY = (typeof table.y === 'number') ? table.y : 10;
                    
                    d.style.zIndex = 1000;

                    function onPointerMove(moveEvent) {
                        var dx = moveEvent.clientX - startX;
                        var dy = moveEvent.clientY - startY;
                        
                        var pctDx = (dx / rect.width) * 100;
                        var pctDy = (dy / rect.height) * 100;
                        
                        var newX = Math.round(Math.max(0, Math.min(100 - w, initX + pctDx)));
                        var newY = Math.round(Math.max(0, Math.min(100 - h, initY + pctDy)));
                        
                        d.style.left = newX + '%';
                        d.style.top = newY + '%';
                        
                        table.x = newX;
                        table.y = newY;
                    }

                    function onPointerUp() {
                        document.removeEventListener('pointermove', onPointerMove);
                        document.removeEventListener('pointerup', onPointerUp);
                        d.style.zIndex = '';
                        saveTable(table);
                    }

                    document.addEventListener('pointermove', onPointerMove);
                    document.addEventListener('pointerup', onPointerUp);
                });
            }
        }

        d.addEventListener('click', function (e) {
            if (!e.target.closest('.btn-table-delete') &&
                !e.target.closest('.btn-table-edit') &&
                !e.target.closest('.drag-handle')) {
                if (type !== 'sofa') {
                    openOrder(table.id);
                }
            }
        });

        var edit = d.querySelector('.btn-table-edit');
        edit.addEventListener('click', function (e) {
            e.stopPropagation();
            STATE.editingTableId = table.id;
            $('modal-table-title').textContent = 'Editar Elemento';
            $('input-table-name').value = table.name;
            $('input-table-zone').value = table.zone || 'Salón';
            $('input-table-type').value = type;
            $('input-table-w').value = table.w || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 12);
            $('input-table-h').value = table.h || (type === 'bar' ? 14 : type === 'sofa' ? 14 : 18);
            $('input-table-tip').checked = !!table.tip;
            $('input-table-tip-container').style.display = (type === 'sofa') ? 'none' : 'block';
            $('modal-table').classList.remove('hidden');
        });

        var del = d.querySelector('.btn-table-delete');
        del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (type !== 'sofa' && table.status !== 'free') { 
                alert('Mesa ocupada, no se puede eliminar.'); 
                return; 
            }
            showConfirm('¿Eliminar este elemento?', function () {
                STATE.tables = STATE.tables.filter(function (x) { return x.id !== table.id; });
                deleteTable(table.id); 
                renderTables();
            });
        });

        if (zoneKey === 'salon') {
            if (canvasSalon) canvasSalon.appendChild(d);
        } else if (zoneKey === 'terraza') {
            if (canvasTerraza) canvasTerraza.appendChild(d);
        } else if (zoneKey === 'pendientes') {
            if (gridPendientes) gridPendientes.appendChild(d);
        }
    });
}

// =================== Order Panel ===================
var orderCatFilter = 'Todos';
function openOrder(id) {
    STATE.currentTableId = id;
    var t = getTable();
    if (!t) return;
    $('order-panel-title').textContent = t.name;
    var st = $('order-panel-status');
    st.className = 'order-panel-status ' + (t.status === 'free' ? 'status-badge-free' : 'status-badge-occupied');
    st.textContent = t.status === 'free' ? 'Libre' : 'Ocupada';
    $('order-search').value = '';
    $('order-tip-checkbox').checked = !!t.tip;
    orderCatFilter = 'Todos';
    renderOrderCats();
    renderOrderMenu();
    renderOrderItems();
    $('order-panel-overlay').classList.remove('hidden');
    $('order-panel').classList.remove('hidden');
}
function closeOrder() {
    $('order-panel-overlay').classList.add('hidden');
    $('order-panel').classList.add('hidden');
    STATE.currentTableId = null;
}
function renderOrderCats() {
    var c = $('order-categories');
    c.innerHTML = '';
    getCats().forEach(function (cat) {
        var p = document.createElement('div');
        p.className = 'category-pill' + (cat === orderCatFilter ? ' active' : '');
        p.textContent = cat;
        p.addEventListener('click', function () { orderCatFilter = cat; renderOrderCats(); renderOrderMenu(); });
        c.appendChild(p);
    });
}
function renderOrderMenu() {
    var c = $('order-menu-items');
    c.innerHTML = '';
    var q = ($('order-search').value || '').toLowerCase();
    var items = [];
    if (orderCatFilter === 'Más vendidos') {
        var sales = {};
        STATE.history.forEach(function (h) { h.items.forEach(function (i) { sales[i.name] = (sales[i.name] || 0) + i.qty; }); });
        items = STATE.menu.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; }).map(function (p) {
            return { p: p, qty: sales[p.name] || 0 };
        }).sort(function (a, b) { return b.qty - a.qty; }).map(function (x) { return x.p; }).slice(0, 10);
    } else {
        items = STATE.menu.filter(function (p) {
            return p.name.toLowerCase().indexOf(q) >= 0 && (orderCatFilter === 'Todos' || p.category === orderCatFilter);
        });
    }
    if (items.length === 0) { c.innerHTML = '<div style="color:var(--text-muted);padding:.5rem;">Sin resultados</div>'; return; }
    items.forEach(function (p) {
        var r = document.createElement('div');
        r.className = 'menu-item-row';
        r.innerHTML = '<span class="item-row-name">' + p.name + '</span><span class="item-row-price">' + fmt(p.price) + '</span>';
        r.addEventListener('click', function () { addToOrder(p.id); });
        c.appendChild(r);
    });
}
function addToOrder(pid) {
    var t = getTable();
    if (!t) return;
    var ex = t.order.find(function (x) { return x.productId === pid; });
    if (ex) { ex.qty++; } else { t.order.push({ productId: pid, qty: 1 }); }
    t.status = 'occupied';
    saveTable(t); renderTables(); renderOrderItems();
    var st = $('order-panel-status');
    st.className = 'order-panel-status status-badge-occupied';
    st.textContent = 'Ocupada';
}
function changeQty(pid, delta) {
    var t = getTable();
    if (!t) return;
    var idx = -1;
    for (var i = 0; i < t.order.length; i++) { if (t.order[i].productId === pid) { idx = i; break; } }
    if (idx >= 0) {
        t.order[idx].qty += delta;
        if (t.order[idx].qty <= 0) t.order.splice(idx, 1);
        if (t.order.length === 0) t.status = 'free';
        saveTable(t); renderTables(); renderOrderItems();
        var st = $('order-panel-status');
        st.className = 'order-panel-status ' + (t.status === 'free' ? 'status-badge-free' : 'status-badge-occupied');
        st.textContent = t.status === 'free' ? 'Libre' : 'Ocupada';
    }
}
function renderOrderItems() {
    var t = getTable();
    if (!t) return;
    var c = $('order-items-list');
    c.innerHTML = '';
    if (t.order.length === 0) {
        c.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">Pedido vacio</div>';
        $('order-total').textContent = fmt(0);
        return;
    }
    var subtotal = 0;
    t.order.forEach(function (it) {
        var p = STATE.menu.find(function (x) { return x.id === it.productId; });
        if (!p) return;
        var sub = p.price * it.qty;
        subtotal += sub;
        var el = document.createElement('div');
        el.className = 'order-item';
        el.innerHTML = '<div class="order-item-info"><div class="order-item-name">' + p.name + '</div><div class="order-item-price">' + fmt(p.price) + ' c/u</div></div>' +
            '<div class="order-item-controls"><button class="qty-btn btn-m">-</button><span class="item-qty">' + it.qty + '</span><button class="qty-btn btn-p">+</button><span class="item-total">' + fmt(sub) + '</span></div>';
        el.querySelector('.btn-m').addEventListener('click', function () { changeQty(it.productId, -1); });
        el.querySelector('.btn-p').addEventListener('click', function () { changeQty(it.productId, 1); });
        c.appendChild(el);
    });
    var tipAmt = t.tip ? subtotal * 0.1 : 0;
    var total = subtotal + tipAmt;
    if (t.tip) {
        var el = document.createElement('div');
        el.className = 'order-item';
        el.innerHTML = '<div class="order-item-info"><div class="order-item-name" style="font-weight:600;color:var(--primary);">Propina Sugerida (10%)</div></div><div class="order-item-controls"><span class="item-total" style="color:var(--primary);">' + fmt(tipAmt) + '</span></div>';
        c.appendChild(el);
    }
    $('order-total').textContent = fmt(total);

    var readyTks = t.tickets ? t.tickets.filter(function (tk) {
        return tk.status === 'pending' && tk.items.every(function (it) { return it.done; });
    }) : [];

    if (readyTks.length > 0) {
        var btnDespachar = document.createElement('button');
        btnDespachar.className = 'btn btn-primary';
        btnDespachar.style.width = '100%';
        btnDespachar.style.marginTop = '1.5rem';
        btnDespachar.style.background = '#10b981';
        btnDespachar.style.borderColor = '#10b981';
        btnDespachar.style.padding = '1rem';
        btnDespachar.style.fontSize = '1.1rem';
        btnDespachar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.5rem;vertical-align:middle;"><path d="M5 12l5 5L20 7"/></svg> Despachar Bandeja (' + readyTks.length + ')';
        btnDespachar.addEventListener('click', function () {
            t.tickets.forEach(function (tk) {
                if (tk.status === 'pending' && tk.items.every(function (it) { return it.done; })) {
                    tk.status = 'delivered';
                }
            });
            saveTable(t);
            renderTables();
            renderOrderItems();
        });
        c.appendChild(btnDespachar);
    }
}

// =================== Menu ===================
var menuCatFilter = 'Todos';
function renderMenu() {
    renderBestSellersChart();
    var bar = $('menu-categories-bar');
    bar.innerHTML = '';
    getCats().forEach(function (cat) {
        var b = document.createElement('button');
        b.className = 'btn btn-outline';
        if (cat === menuCatFilter) { b.style.background = 'var(--primary)'; b.style.color = '#fff'; b.style.borderColor = 'var(--primary)'; }
        b.textContent = cat;
        b.addEventListener('click', function () { menuCatFilter = cat; renderMenu(); });
        bar.appendChild(b);
    });
    var list = $('menu-products-list');
    list.innerHTML = '';
    STATE.menu.filter(function (p) { return menuCatFilter === 'Todos' || p.category === menuCatFilter; }).forEach(function (p) {
        var c = document.createElement('div');
        c.className = 'product-card';
        c.innerHTML = '<span class="product-category-tag">' + p.category + '</span><div class="product-name">' + p.name + '</div><div class="product-price">' + fmt(p.price) + '</div>' +
            '<div class="product-actions"><button class="btn btn-outline btn-ep" style="flex:1;padding:.25rem;">Editar</button><button class="btn btn-danger btn-dp" style="padding:.25rem .5rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
        c.querySelector('.btn-ep').addEventListener('click', function () {
            STATE.editingProductId = p.id;
            $('modal-product-title').textContent = 'Editar Producto';
            $('input-product-name').value = p.name;
            $('input-product-price').value = p.price;
            $('input-product-category').value = p.category;
            $('modal-product').classList.remove('hidden');
        });
        c.querySelector('.btn-dp').addEventListener('click', function () {
            showConfirm('Eliminar ' + p.name + '?', function () {
                STATE.menu = STATE.menu.filter(function (x) { return x.id !== p.id; });
                saveMenu(); renderMenu();
            });
        });
        list.appendChild(c);
    });
}

// =================== History ===================
function updateDaily() {
    var today = new Date().toISOString().split('T')[0];
    var total = STATE.history.filter(function (h) { return h.date.indexOf(today) === 0; }).reduce(function (s, h) { return s + h.total; }, 0);
    $('daily-total').textContent = fmt(total);
}
function renderHistory() {
    var fd = $('history-date-filter').value;
    var fm = $('history-month-filter').value;
    var list = STATE.history.slice().reverse();
    if (fd) list = list.filter(function (h) { return h.date.indexOf(fd) === 0; });
    if (fm) list = list.filter(function (h) { return h.date.indexOf(fm) === 0; });
    
    var tr = list.reduce(function (s, h) { return s + h.total; }, 0);
    var te = list.filter(function (h) { return h.paymentMethod === 'Efectivo'; }).reduce(function (s, h) { return s + h.total; }, 0);
    var td = list.filter(function (h) { return h.paymentMethod === 'Débito'; }).reduce(function (s, h) { return s + h.total; }, 0);
    var tc = list.filter(function (h) { return h.paymentMethod === 'Crédito'; }).reduce(function (s, h) { return s + h.total; }, 0);

    var totalNetRevenue = 0;
    var totalInferredPeople = 0;
    var totalRealUtility = 0;
    var countWithPrepCost = 0;
    
    list.forEach(function (h) {
        var saleNet = h.total;
        var inferredPeopleInSale = 0;
        
        if (typeof h.preparationCost === 'number') {
            totalRealUtility += (h.total - h.preparationCost);
            countWithPrepCost++;
        }

        if (h.items) {
            h.items.forEach(function (it) {
                if (it.name === 'Propina Sugerida (10%)') {
                    saleNet -= it.subtotal;
                } else {
                    var isBeverage = false;
                    if (it.category && BARISTA_CATS.indexOf(it.category) >= 0) {
                        isBeverage = true;
                    } else {
                        var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                        if (p && BARISTA_CATS.indexOf(p.category) >= 0) {
                            isBeverage = true;
                        } else if (!p) {
                            var nameLower = (it.name || '').toLowerCase();
                            var keywords = ['cafe', 'té', 'te', 'bebida', 'jugo', 'soda', 'agua', 'latte', 'cappuccino', 'espresso', 'moka', 'limonada', 'licuado'];
                            keywords.forEach(function (kw) { if (nameLower.indexOf(kw) >= 0) isBeverage = true; });
                        }
                    }
                    if (isBeverage) inferredPeopleInSale += it.qty;
                }
            });
        }
        if (inferredPeopleInSale === 0) inferredPeopleInSale = 1;
        totalNetRevenue += saleNet;
        totalInferredPeople += inferredPeopleInSale;
    });

    var ticketPromedioNeto = list.length > 0 ? Math.round(totalNetRevenue / list.length) : 0;
    var ticketPromedioPersona = totalInferredPeople > 0 ? Math.round(totalNetRevenue / totalInferredPeople) : 0;
    var realUtilityStr = countWithPrepCost > 0 ? fmt(totalRealUtility) : '-';

    var zoneTotals = { 'Salón': 0, 'Terraza': 0, 'Otros': 0 };
    list.forEach(function (h) {
        var t = STATE.tables.find(function (x) { return x.id === h.tableId; });
        var zone = t ? t.zone : null;
        if (!zone) {
            var name = (h.tableName || '').toLowerCase();
            if (name.indexOf('terraza') >= 0) zone = 'Terraza';
            else if (name.indexOf('pendientes') >= 0) zone = 'Pendientes';
            else zone = 'Salón';
        }
        zoneTotals[zone] = (zoneTotals[zone] || 0) + h.total;
    });

    var hourCounts = {};
    list.forEach(function (h) {
        var d = new Date(h.date);
        var hr = d.getHours();
        hourCounts[hr] = (hourCounts[hr] || 0) + h.total;
    });
    var peakHour = null;
    var peakAmount = 0;
    Object.keys(hourCounts).forEach(function (hr) {
        if (hourCounts[hr] > peakAmount) {
            peakAmount = hourCounts[hr];
            peakHour = hr;
        }
    });
    var peakHourStr = peakHour !== null ? peakHour + ':00 - ' + (parseInt(peakHour) + 1) + ':00' : 'N/A';

    $('history-summary').innerHTML = '<div class="summary-card"><div class="summary-title">Total Recaudado</div><div class="summary-value">' + fmt(tr) + '</div></div>' +
        '<div class="summary-card"><div class="summary-title">Utilidad Real</div><div class="summary-value" style="color:var(--success);">' + realUtilityStr + '</div></div>' +
        '<div class="summary-card"><div class="summary-title">Ventas / Comensales</div><div class="summary-value" style="font-size:1.4rem;">' + list.length + ' / ' + totalInferredPeople + ' <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(inf)</span></div></div>' +
        '<div class="summary-card"><div class="summary-title">Tkt Prom. (Neto / Persona)</div><div class="summary-value" style="font-size:1.35rem;">' + fmt(ticketPromedioNeto) + ' / ' + fmt(ticketPromedioPersona) + '</div></div>' +
        '<div class="summary-card"><div class="summary-title">Hora Pico de Ventas</div><div class="summary-value" style="font-size:1.15rem; margin-top:0.35rem;">' + peakHourStr + '</div></div>' +
        '<div class="summary-card" style="grid-column:1/-1; display:flex; justify-content:space-between; flex-wrap:wrap; gap:1rem; padding:1.25rem;">' +
        '<div><small style="color:var(--text-muted); text-transform:uppercase; font-size:0.75rem;">Métodos de Pago:</small>' +
        ' <span style="margin-left:0.5rem;">Efectivo: <b>' + fmt(te) + '</b></span>' +
        ' <span style="margin-left:0.75rem;">Débito: <b>' + fmt(td) + '</b></span>' +
        ' <span style="margin-left:0.75rem;">Crédito: <b>' + fmt(tc) + '</b></span></div>' +
        '<div><small style="color:var(--text-muted); text-transform:uppercase; font-size:0.75rem;">Ingresos por Zona:</small>' +
        ' <span style="margin-left:0.5rem;">Salón: <b>' + fmt(zoneTotals['Salón'] || 0) + '</b></span>' +
        ' <span style="margin-left:0.75rem;">Terraza: <b>' + fmt(zoneTotals['Terraza'] || 0) + '</b></span>' +
        ' <span style="margin-left:0.75rem;">Otros/Pend: <b>' + fmt((zoneTotals['Pendientes'] || 0) + (zoneTotals['Otros'] || 0)) + '</b></span></div>' +
        '</div>';

    var hl = $('history-list');
    hl.innerHTML = '';
    if (list.length === 0) { hl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Sin ventas</div>'; return; }
    list.forEach(function (r) {
        var d = new Date(r.date);
        var ic = r.items.reduce(function (s, i) { return s + i.qty; }, 0);
        var el = document.createElement('div');
        el.className = 'history-item';
        
        var utilityVal = (typeof r.preparationCost === 'number') ? fmt(r.total - r.preparationCost) : '-';
        
        el.innerHTML = '<div class="history-item-info"><h4>' + r.tableName + '</h4>' +
            '<div class="history-item-date">' + d.toLocaleDateString() + ' - ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '<div class="history-item-details">' + ic + ' items &bull; ' + (r.paymentMethod || 'Efectivo') + ' &bull; Utilidad Real: <b>' + utilityVal + '</b></div></div>' +
            '<div style="display:flex; align-items:center; gap:0.75rem;">' +
            '<div class="history-item-total">' + fmt(r.total) + '</div>' +
            (r.firebaseKey ? '<button class="btn-history-delete" title="Eliminar Venta"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') +
            '</div>';

        var delBtn = el.querySelector('.btn-history-delete');
        if (delBtn) {
            delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                showConfirm('¿Eliminar esta venta del historial? Se restará de los totales diarios, mensuales y anuales.', function () {
                    db.ref('history/' + r.firebaseKey).remove().catch(function (error) {
                        alert('Error al eliminar venta: ' + error.message);
                    });
                });
            });
        }
        hl.appendChild(el);
    });
}

// =================== Bluetooth Printing (ESC/POS) ===================
var PrinterManager = {
    mode: 'classic',
    isServer: false,
    cajaDevice: null,
    cajaChar: null,
    cocinaDevice: null,
    cocinaChar: null,
    samePrinter: false,

    printQueue: [],
    isPrinting: false,

    enqueueJob(tableName, items, tableId, ticketId) {
        this.printQueue.push({ tableName: tableName, items: items, tableId: tableId, ticketId: ticketId });
        this.processQueue();
    },

    processQueue() {
        if (this.isPrinting || this.printQueue.length === 0) return;
        this.isPrinting = true;

        var job = this.printQueue.shift();

        // Ejecutar impresion usando setTimeout para asegurar que el navegador se recupere entre dialogos
        setTimeout(() => {
            printComanda(job.tableName, job.items);

            // Pausa de 1.5s antes de liberar la cola para el siguiente ticket
            setTimeout(() => {
                this.isPrinting = false;
                this.processQueue();
            }, 1500);
        }, 100);
    },

    async connect(role) {
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '00001101-0000-1000-8000-00805f9b34fb'
                ]
            });
            await this.setupDevice(device, role);
            alert('Impresora vinculada exitosamente a ' + role);
            this.updateUI();
        } catch (e) {
            console.error(e);
            alert('Error al vincular: ' + e.message);
        }
    },

    async setupDevice(device, role) {
        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();
        let targetChar = null;
        for (let service of services) {
            const chars = await service.getCharacteristics();
            for (let char of chars) {
                if (char.properties.writeWithoutResponse || char.properties.write) {
                    targetChar = char;
                    break;
                }
            }
            if (targetChar) break;
        }
        if (!targetChar) throw new Error("No se encontró canal de escritura.");

        if (role === 'caja') {
            this.cajaDevice = device;
            this.cajaChar = targetChar;
        } else {
            this.cocinaDevice = device;
            this.cocinaChar = targetChar;
        }

        device.addEventListener('gattserverdisconnected', () => {
            if (role === 'caja') { this.cajaDevice = null; this.cajaChar = null; }
            if (role === 'cocina') { this.cocinaDevice = null; this.cocinaChar = null; }
            this.updateUI();
        });
    },

    async write(char, data) {
        if (!char) throw new Error("Impresora desconectada.");
        const CHUNK_SIZE = 200;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await char.writeValue(chunk);
        }
    },

    async printCaja(data) {
        if (!this.cajaChar) throw new Error("Impresora de caja no vinculada.");
        await this.write(this.cajaChar, data);
    },

    async printCocina(data) {
        if (this.samePrinter && this.cajaChar) {
            await this.write(this.cajaChar, data);
        } else if (this.cocinaChar) {
            await this.write(this.cocinaChar, data);
        } else {
            throw new Error("Impresora de cocina no vinculada.");
        }
    },

    updateUI() {
        var elCaja = $('status-printer-caja');
        if (elCaja) elCaja.textContent = 'Estado: ' + (this.cajaDevice ? ('Conectada (' + this.cajaDevice.name + ')') : 'Desconectada');
        var elCocina = $('status-printer-cocina');
        if (elCocina) elCocina.textContent = 'Estado: ' + (this.cocinaDevice ? ('Conectada (' + this.cocinaDevice.name + ')') : 'Desconectada');
    }
};

const escpos = {
    init: [0x1B, 0x40],
    alignCenter: [0x1B, 0x61, 1],
    alignLeft: [0x1B, 0x61, 0],
    alignRight: [0x1B, 0x61, 2],
    boldOn: [0x1B, 0x45, 1],
    boldOff: [0x1B, 0x45, 0],
    doubleSize: [0x1D, 0x21, 0x11],
    normalSize: [0x1D, 0x21, 0x00],
    cut: [0x1D, 0x56, 0x41, 0x10],

    encodeText: function (str) {
        var s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var bytes = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            bytes[i] = c < 128 ? c : 63;
        }
        return bytes;
    },

    createTicket: function (rec) {
        var bytes = [];
        var push = function (arr) { for (var i = 0; i < arr.length; i++) bytes.push(arr[i]); };
        var text = function (str) { push(escpos.encodeText(str)); };

        push(escpos.init);
        push(escpos.alignCenter);
        push(escpos.boldOn);
        push(escpos.doubleSize);
        text("Buen Dia Cafe\n");
        push(escpos.normalSize);
        push(escpos.boldOff);

        var d = new Date(rec.date);
        text(d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + "\n");
        text(rec.tableName + "\n");
        text("--------------------------------\n");
        push(escpos.alignLeft);

        rec.items.forEach(function (it) {
            text(it.qty + "x " + it.name + "\n");
            push(escpos.alignRight);
            text(fmt(it.subtotal) + "\n");
            push(escpos.alignLeft);
        });

        text("--------------------------------\n");
        push(escpos.alignRight);
        push(escpos.boldOn);
        text("TOTAL: " + fmt(rec.total) + "\n");
        push(escpos.boldOff);
        push(escpos.alignCenter);
        text("--------------------------------\n");
        text("Gracias por su visita!\n");
        text("\n\n\n\n\n");
        push(escpos.cut);

        return new Uint8Array(bytes);
    },

    createComanda: function (tableName, items) {
        var bytes = [];
        var push = function (arr) { for (var i = 0; i < arr.length; i++) bytes.push(arr[i]); };
        var text = function (str) { push(escpos.encodeText(str)); };

        push(escpos.init);
        push(escpos.alignCenter);
        push(escpos.boldOn);
        push(escpos.doubleSize);
        text("COMANDA\n");
        text(tableName + "\n");
        push(escpos.normalSize);
        push(escpos.boldOff);
        var d = new Date();
        text(d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + "\n");
        text("--------------------------------\n");
        push(escpos.alignLeft);

        push(escpos.boldOn);
        push(escpos.doubleSize);
        items.forEach(function (it) {
            text(it.qty + "x " + it.name + "\n");
        });
        push(escpos.normalSize);
        push(escpos.boldOff);

        text("--------------------------------\n");
        push(escpos.alignCenter);
        text("A preparar!\n");
        text("\n\n\n\n\n");
        push(escpos.cut);

        return new Uint8Array(bytes);
    }
};

// =================== Printing ===================
function printTicket(rec) {
    if (PrinterManager.mode === 'bluetooth' && navigator.bluetooth && PrinterManager.cajaChar) {
        var data = escpos.createTicket(rec);
        PrinterManager.printCaja(data).catch(function (e) {
            console.warn('Fallo impresion bluetooth', e);
            fallbackPrintTicket(rec);
        });
    } else {
        fallbackPrintTicket(rec);
    }
}

function fallbackPrintTicket(rec) {
    var d = new Date(rec.date);
    $('ticket-date').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('ticket-table').textContent = rec.tableName;
    var tb = $('ticket-items-body');
    tb.innerHTML = '';
    rec.items.forEach(function (it) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="ticket-td-center">' + it.qty + '</td><td class="ticket-td-left">' + it.name + '</td><td class="ticket-td-right">' + fmt(it.subtotal) + '</td>';
        tb.appendChild(tr);
    });
    $('ticket-total-amount').textContent = fmt(rec.total);

    document.body.className = 'printing-ticket';
    window.print();
    document.body.className = '';
}

function printComanda(tableName, items) {
    var isLinked = PrinterManager.samePrinter ? PrinterManager.cajaChar : PrinterManager.cocinaChar;
    if (PrinterManager.mode === 'bluetooth' && navigator.bluetooth && isLinked) {
        var data = escpos.createComanda(tableName, items);
        PrinterManager.printCocina(data).catch(function (e) {
            console.warn('Fallo impresion comanda bluetooth', e);
            fallbackPrintComanda(tableName, items);
        });
    } else {
        fallbackPrintComanda(tableName, items);
    }
}

function fallbackPrintComanda(tableName, items) {
    var d = new Date();
    $('comanda-date').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('comanda-table').textContent = tableName;
    var tb = $('comanda-items-body');
    tb.innerHTML = '';
    items.forEach(function (it) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="ticket-td-center" style="font-size:22px; font-weight:bold; padding:4px 0;">' + it.qty + '</td><td class="ticket-td-left" style="font-size:22px; font-weight:bold; padding:4px 0;">' + it.name + '</td>';
        tb.appendChild(tr);
    });

    document.body.className = 'printing-comanda';
    window.print();
    document.body.className = '';
}

// Start
init();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
            console.log('SW registration failed: ', err);
        });
    });
}

// =================== KDS (Barra) ===================
function renderKDS() {
    var grid = $('kds-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var pendingTables = [];
    STATE.tables.forEach(function (t) {
        if (!t.tickets) return;
        var pendingTks = t.tickets.filter(function (tk) { return tk.status === 'pending'; });
        if (pendingTks.length > 0) {
            pendingTables.push({ table: t, tickets: pendingTks });
        }
    });

    if (pendingTables.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">No hay comandas pendientes</div>';
        return;
    }

    pendingTables.sort(function (a, b) {
        var aMin = Math.min.apply(null, a.tickets.map(function (tk) { return tk.timestamp; }));
        var bMin = Math.min.apply(null, b.tickets.map(function (tk) { return tk.timestamp; }));
        return aMin - bMin;
    });

    var now = Date.now();
    pendingTables.forEach(function (pt) {
        var t = pt.table;
        var oldestTime = Math.min.apply(null, pt.tickets.map(function (tk) { return tk.timestamp; }));
        var mins = Math.floor((now - oldestTime) / 60000);

        var urgencyClass = 'urgent-low';
        if (mins >= 10) urgencyClass = 'urgent-high';
        else if (mins >= 5) urgencyClass = 'urgent-med';

        var card = document.createElement('div');
        card.className = 'kds-card ' + urgencyClass;

        var itemsHtml = '';
        pt.tickets.forEach(function (tk) {
            tk.items.forEach(function (it) {
                var checked = it.done ? 'checked' : '';
                var lineClass = it.done ? 'completed' : '';
                itemsHtml += '<label class="kds-item ' + lineClass + '" style="cursor:pointer; display:flex; align-items:center; gap:1rem;">' +
                    '<input type="checkbox" data-tid="' + t.id + '" data-tk="' + tk.id + '" data-pid="' + it.productId + '" style="transform:scale(1.5);" ' + checked + '>' +
                    '<span class="kds-item-qty">' + it.qty + 'x</span><span class="kds-item-name">' + it.name + '</span>' +
                    '</label>';
            });
        });

        var allDone = pt.tickets.every(function (tk) { return tk.items.every(function (i) { return i.done; }); });

        if (allDone) {
            urgencyClass = 'urgent-low';
            card.className = 'kds-card ' + urgencyClass;
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + t.name + '</span></div>' +
                '<div style="text-align:center; padding:1.5rem 0; color:#10b981; font-weight:700; font-size:1.2rem;">¡Bandeja Lista!<br><small style="color:var(--text-muted);font-weight:normal;font-size:0.9rem;">Esperando que el mesero despache</small></div>';
        } else {
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + t.name + '</span><span class="kds-card-time">' + (mins > 0 ? mins + ' min' : 'Ahora') + '</span></div>' +
                '<div class="kds-items" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">' + itemsHtml + '</div>';

            card.querySelectorAll('input[type="checkbox"]').forEach(function (chk) {
                chk.addEventListener('change', function (e) {
                    var isChecked = e.target.checked;
                    var tid = e.target.getAttribute('data-tid');
                    var tkid = e.target.getAttribute('data-tk');
                    var pid = e.target.getAttribute('data-pid');

                    var actualTable = STATE.tables.find(function (x) { return x.id === tid; });
                    if (actualTable && actualTable.tickets) {
                        var actualTk = actualTable.tickets.find(function (x) { return x.id === tkid; });
                        if (actualTk) {
                            var actualIt = actualTk.items.find(function (x) { return x.productId === pid; });
                            if (actualIt) {
                                actualIt.done = isChecked;
                                saveTable(actualTable);
                                renderKDS();
                            }
                        }
                    }
                });
            });
        }

        grid.appendChild(card);
    });
}

// =================== New Features (Charts & Balance) ===================
function renderBestSellersChart() {
    var chartContainer = $('sales-chart-section');
    var chartList = $('sales-chart-list');
    if (!chartContainer || !chartList) return;

    var salesCounts = {};
    STATE.history.forEach(function (h) {
        if (h.items) {
            h.items.forEach(function (it) {
                if (it.name && it.name !== 'Propina Sugerida (10%)') {
                    salesCounts[it.name] = (salesCounts[it.name] || 0) + it.qty;
                }
            });
        }
    });

    var sortedProducts = Object.keys(salesCounts).map(function (name) {
        return { name: name, qty: salesCounts[name] };
    }).sort(function (a, b) {
        return b.qty - a.qty;
    });

    var topProducts = sortedProducts.slice(0, 5);

    if (topProducts.length === 0) {
        chartContainer.style.display = 'none';
        return;
    }

    chartContainer.style.display = 'block';
    chartList.innerHTML = '';

    var maxQty = topProducts[0].qty;

    topProducts.forEach(function (item) {
        var pct = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;

        var row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = '<div class="chart-bar-label" title="' + item.name + '">' + item.name + '</div>' +
            '<div class="chart-bar-track">' +
            '<div class="chart-bar-fill" style="width: 0%;"></div>' +
            '</div>' +
            '<div class="chart-bar-value">' + item.qty + '</div>';

        chartList.appendChild(row);

        setTimeout(function () {
            var fill = row.querySelector('.chart-bar-fill');
            if (fill) fill.style.width = pct + '%';
        }, 50);
    });
}

function renderBalance() {
    var activeSubTab = qs('.balance-tab.active');
    if (!activeSubTab) {
        var defaultTab = $('tab-balance-ingredients');
        if (defaultTab) defaultTab.classList.add('active');
        activeSubTab = defaultTab;
    }
    var tabName = activeSubTab ? activeSubTab.getAttribute('data-tab') : 'ingredients';
    qsa('.balance-sub-view').forEach(function (sv) {
        sv.style.display = 'none';
    });
    var contentEl = $('balance-tab-' + tabName + '-content');
    if (contentEl) contentEl.style.display = 'block';
    
    if (tabName === 'ingredients') {
        renderIngredients();
    } else {
        renderRecipes();
    }
}

function renderIngredients() {
    var tbody = $('reg-ingredients-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    var q = ($('reg-ing-search').value || '').toLowerCase();
    var filtered = STATE.ingredients.filter(function (ing) {
        return ing.name.toLowerCase().indexOf(q) >= 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No se encontraron ingredientes</td></tr>';
        return;
    }

    filtered.forEach(function (ing) {
        var tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        tr.innerHTML = '<td style="padding:0.75rem 0.5rem; font-weight:500;">' + ing.name + '</td>' +
            '<td style="padding:0.75rem 0.5rem; color:var(--text-muted);">' + (ing.unit === 'unidades' ? 'Unidades' : ing.unit) + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:right; font-weight:600;">' + fmt(ing.cost) + ' / ' + ing.unit + '</td>' +
            '<td style="padding:0.75rem 0.5rem; text-align:center; display:flex; gap:0.5rem; justify-content:center;">' +
            '<button class="btn btn-outline btn-edit-ing" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Editar</button>' +
            '<button class="btn btn-danger btn-del-ing" style="padding:0.25rem 0.5rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
            '</td>';
        
        tr.querySelector('.btn-edit-ing').addEventListener('click', function () {
            STATE.editingIngredientId = ing.id;
            $('modal-ingredient-title').textContent = 'Editar Ingrediente';
            $('input-ingredient-name').value = ing.name;
            $('input-ingredient-unit').value = ing.unit;
            $('input-ingredient-cost').value = ing.cost;
            $('modal-ingredient').classList.remove('hidden');
        });

        tr.querySelector('.btn-del-ing').addEventListener('click', function () {
            showConfirm('¿Eliminar ' + ing.name + ' del registro? Se quitará de todas las recetas de productos.', function () {
                db.ref('ingredients_registry/' + ing.id).remove();
                
                var menuChanged = false;
                STATE.menu.forEach(function (p) {
                    if (p.recipe) {
                        var oldLen = p.recipe.length;
                        p.recipe = p.recipe.filter(function (r) { return r.ingredientId !== ing.id; });
                        if (p.recipe.length !== oldLen) {
                            menuChanged = true;
                            var total = 0;
                            p.recipe.forEach(function (rItem) {
                                var ig = STATE.ingredients.find(function (x) { return x.id === rItem.ingredientId; });
                                if (ig) total += rItem.qty * (ig.cost || 0);
                            });
                            p.preparationCost = total;
                        }
                    }
                });
                if (menuChanged) {
                    saveMenu();
                }
            });
        });

        tbody.appendChild(tr);
    });
}

function renderRecipes() {
    var catSelect = $('recipe-cat-select');
    if (!catSelect) return;
    
    var selectedCat = catSelect.value;
    catSelect.innerHTML = '<option value="">-- Categoria --</option>';
    
    var cats = {};
    STATE.menu.forEach(function (p) { cats[p.category || 'General'] = true; });
    Object.keys(cats).forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
    });

    if (selectedCat) {
        catSelect.value = selectedCat;
        var pSelect = $('recipe-prod-select');
        var selectedProd = pSelect.value;
        pSelect.innerHTML = '<option value="">-- Elige Producto --</option>';
        STATE.menu.filter(function (p) { return p.category === selectedCat; }).forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            pSelect.appendChild(opt);
        });
        if (selectedProd && STATE.menu.some(function (p) { return p.id === selectedProd; })) {
            pSelect.value = selectedProd;
            showRecipeDetails(selectedProd);
        }
    }
}

function showRecipeDetails(pid) {
    var p = STATE.menu.find(function (x) { return x.id === pid; });
    if (!p) return;

    $('recipe-ingredient-add-form').style.display = 'flex';
    $('recipe-summary-cards').style.display = 'grid';
    $('recipe-list-card').style.display = 'block';
    $('recipe-empty-state').style.display = 'none';

    $('recipe-prod-price').textContent = fmt(p.price);

    var ingSelect = $('recipe-ing-select');
    var selectedIng = ingSelect.value;
    ingSelect.innerHTML = '<option value="">-- Elige Ingrediente --</option>';
    STATE.ingredients.forEach(function (ing) {
        var opt = document.createElement('option');
        opt.value = ing.id;
        opt.textContent = ing.name + ' (' + ing.unit + ')';
        ingSelect.appendChild(opt);
    });
    if (selectedIng && STATE.ingredients.some(function (i) { return i.id === selectedIng; })) {
        ingSelect.value = selectedIng;
    }

    var tbody = $('recipe-ingredients-list-body');
    tbody.innerHTML = '';
    
    var recipe = p.recipe || [];
    var totalCost = 0;

    if (recipe.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No hay ingredientes en esta receta.</td></tr>';
    } else {
        recipe.forEach(function (rItem) {
            var ing = STATE.ingredients.find(function (i) { return i.id === rItem.ingredientId; });
            if (!ing) return;
            
            var costSub = rItem.qty * (ing.cost || 0);
            totalCost += costSub;

            var tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = '<td style="padding:0.75rem 0.5rem; font-weight:500;">' + ing.name + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:right;">' + rItem.qty + ' ' + ing.unit + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:right; color:var(--text-muted);">' + fmt(ing.cost) + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:right; font-weight:600;">' + fmt(costSub) + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:center;">' +
                '<button class="btn btn-danger btn-del-recipe-ing" style="padding:0.25rem 0.5rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</td>';

            tr.querySelector('.btn-del-recipe-ing').addEventListener('click', function () {
                p.recipe = p.recipe.filter(function (x) { return x.ingredientId !== rItem.ingredientId; });
                
                var newTotal = 0;
                p.recipe.forEach(function (x) {
                    var ig = STATE.ingredients.find(function (i) { return i.id === x.ingredientId; });
                    if (ig) newTotal += x.qty * (ig.cost || 0);
                });
                p.preparationCost = newTotal;

                saveMenu();
                showRecipeDetails(pid);
            });

            tbody.appendChild(tr);
        });
    }

    var totalCostEl = $('recipe-total-cost');
    totalCostEl.textContent = fmt(totalCost);

    if (totalCost > p.price) {
        totalCostEl.style.color = 'var(--danger)';
    } else {
        totalCostEl.style.color = 'var(--success)';
    }

    var margin = p.price - totalCost;
    var marginPct = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;
    var marginEl = $('recipe-margin');
    marginEl.textContent = fmt(margin) + ' (' + marginPct + '%)';
    if (margin >= 0) {
        marginEl.style.color = 'var(--success)';
    } else {
        marginEl.style.color = 'var(--danger)';
    }
}

function recalculateAllRecipeCosts() {
    if (!STATE.menu || !STATE.ingredients) return;
    var menuChanged = false;
    STATE.menu.forEach(function (p) {
        var recipe = p.recipe || [];
        var totalCost = 0;
        var hasRecipe = (recipe.length > 0);
        recipe.forEach(function (rItem) {
            var ing = STATE.ingredients.find(function (i) { return i.id === rItem.ingredientId; });
            if (ing) {
                totalCost += rItem.qty * (ing.cost || 0);
            }
        });
        if (hasRecipe) {
            if (p.preparationCost !== totalCost) {
                p.preparationCost = totalCost;
                menuChanged = true;
            }
        } else {
            if (p.preparationCost > 0) {
                p.preparationCost = 0;
                menuChanged = true;
            }
        }
    });
    if (menuChanged) {
        saveMenu();
    }
}
