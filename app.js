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
    currentTableId: null,
    editingProductId: null,
    editingTableId: null,
    isSaving: false,
    isConnected: false
};

var CURRENT_ROLE = localStorage.getItem('fudo_role') || null;
var BARISTA_CATS = ['Cafetería', 'Bebidas', 'Cafetería fría', 'Té'];



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

    // Balance view handlers
    var balanceSelect = $('balance-product-select');
    if (balanceSelect) {
        balanceSelect.addEventListener('change', function (e) {
            var pid = e.target.value;
            if (pid) {
                showProductBalance(pid);
            } else {
                $('balance-ingredients-form').style.display = 'none';
                $('balance-summary-cards').style.display = 'none';
                $('balance-list-card').style.display = 'none';
                $('balance-empty-state').style.display = 'block';
            }
        });
    }

    var btnAddIngredient = $('btn-add-ingredient');
    if (btnAddIngredient) {
        btnAddIngredient.addEventListener('click', function () {
            var pid = $('balance-product-select').value;
            var name = $('balance-ing-name').value.trim();
            var qty = parseFloat($('balance-ing-qty').value);
            var unit = $('balance-ing-unit').value;
            var cost = parseFloat($('balance-ing-cost').value);

            if (pid && name && !isNaN(qty) && qty > 0 && !isNaN(cost) && cost >= 0) {
                var p = STATE.menu.find(function (x) { return x.id === pid; });
                if (p) {
                    if (!p.ingredients) p.ingredients = [];
                    p.ingredients.push({
                        id: genId(),
                        name: name,
                        qty: qty,
                        unit: unit,
                        cost: cost
                    });
                    saveMenu();

                    // Reset fields
                    $('balance-ing-name').value = '';
                    $('balance-ing-qty').value = '';
                    $('balance-ing-cost').value = '';
                }
            } else {
                alert('Por favor, rellene todos los campos con valores válidos.');
            }
        });
    }

    // Add Table
    $('btn-add-table').addEventListener('click', function () {
        STATE.editingTableId = null;
        $('modal-table-title').textContent = 'Nueva Mesa';
        $('input-table-name').value = '';
        $('input-table-zone').value = 'Salón';
        $('input-table-tip').checked = false;
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
        if (name) {
            if (STATE.editingTableId) {
                var t = STATE.tables.find(function (x) { return x.id === STATE.editingTableId; });
                if (t) {
                    t.name = name;
                    t.zone = zone;
                    t.tip = tip;
                    saveTable(t);
                }
            } else {
                STATE.tables.push({ id: genId(), name: name, zone: zone, tip: tip, status: 'free', order: [] });
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
            var rec = {
                id: genId(), date: new Date().toISOString(),
                tableId: t.id, tableName: t.name, total: total,
                paymentMethod: payment,
                items: recItems
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
    ['salon', 'terraza', 'pendientes'].forEach(function (z) {
        var el = $('grid-' + z);
        if (el) el.innerHTML = '';
    });
    if (STATE.tables.length === 0) {
        var g = $('grid-salon');
        if (g) g.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">Toca "Nueva Mesa" para empezar</div>';
        return;
    }
    STATE.tables.forEach(function (table) {
        var subtotal = calcTotal(table.order);
        var total = subtotal + (table.tip ? subtotal * 0.1 : 0);

        var bandejaLista = table.tickets && table.tickets.some(function (tk) {
            return tk.status === 'pending' && tk.items.every(function (it) { return it.done; });
        });

        var d = document.createElement('div');
        d.className = 'table-card' + (bandejaLista ? ' bandeja-lista' : '');
        d.setAttribute('data-status', table.status);
        d.setAttribute('draggable', 'true');

        var z = (table.zone || 'salon').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        var iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="4" rx="1"/><path d="M5 11v6"/><path d="M19 11v6"/></svg>';
        if (z === 'terraza') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 17.5L19 19"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M5 19l1.5-1.5"/><path d="M17.5 6.5L19 5"/><circle cx="12" cy="12" r="3"/></svg>';
        } else if (z === 'pendientes') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
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
            '<div class="table-amount">' + (table.status !== 'free' ? fmt(total) : 'Libre') + '</div></div>' +
            (bandejaLista ? '<div style="background:#10b981;color:#fff;font-size:0.75rem;padding:0.2rem 0.5rem;border-radius:4px;margin-top:0.5rem;text-align:center;">Bandeja Lista</div>' : '') +
            '<div class="table-actions"><button class="btn-table-edit" data-id="' + table.id + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-table-delete" data-id="' + table.id + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';

        d.addEventListener('dragstart', function (e) {
            if (!e.target.closest('.drag-handle') && !d.classList.contains('long-pressed')) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', table.id);
            d.classList.add('dragging');
        });

        d.addEventListener('dragend', function () {
            d.classList.remove('dragging');
            d.classList.remove('long-pressed');
        });

        var pressTimer;
        var startPress = function (e) {
            if (e.target.closest('.table-actions') || e.target.closest('.drag-handle')) return;
            pressTimer = setTimeout(function () {
                d.classList.add('long-pressed');
                if (navigator.vibrate) navigator.vibrate(50);
            }, 600);
        };
        var cancelPress = function () {
            clearTimeout(pressTimer);
        };
        d.addEventListener('mousedown', startPress);
        d.addEventListener('touchstart', startPress, { passive: true });
        d.addEventListener('mouseup', cancelPress);
        d.addEventListener('touchend', cancelPress);
        d.addEventListener('touchmove', cancelPress, { passive: true });
        d.addEventListener('mouseleave', cancelPress);

        d.addEventListener('click', function (e) {
            if (!e.target.closest('.btn-table-delete') &&
                !e.target.closest('.btn-table-edit') &&
                !e.target.closest('.drag-handle')) {
                openOrder(table.id);
            }
        });

        var edit = d.querySelector('.btn-table-edit');
        edit.addEventListener('click', function (e) {
            e.stopPropagation();
            STATE.editingTableId = table.id;
            $('modal-table-title').textContent = 'Editar Mesa';
            $('input-table-name').value = table.name;
            $('input-table-zone').value = table.zone || 'Salón';
            $('input-table-tip').checked = !!table.tip;
            $('modal-table').classList.remove('hidden');
        });
        var del = d.querySelector('.btn-table-delete');
        del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (table.status !== 'free') { alert('Mesa ocupada, no se puede eliminar.'); return; }
            showConfirm('Eliminar esta mesa?', function () {
                STATE.tables = STATE.tables.filter(function (x) { return x.id !== table.id; });
                deleteTable(table.id); renderTables();
            });
        });
        var zoneKey = table.zone ? table.zone.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u') : 'salon';
        var container = $('grid-' + zoneKey);
        if (container) container.appendChild(d);
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
    
    list.forEach(function (h) {
        var saleNet = h.total;
        var inferredPeopleInSale = 0;
        
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
        el.innerHTML = '<div class="history-item-info"><h4>' + r.tableName + '</h4>' +
            '<div class="history-item-date">' + d.toLocaleDateString() + ' - ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '<div class="history-item-details">' + ic + ' items &bull; ' + (r.paymentMethod || 'Efectivo') + '</div></div>' +
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
    var select = $('balance-product-select');
    if (!select) return;

    var selectedValue = select.value;

    select.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    STATE.menu.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + ' (' + fmt(p.price) + ')';
        select.appendChild(opt);
    });

    if (selectedValue && STATE.menu.some(function (p) { return p.id === selectedValue; })) {
        select.value = selectedValue;
        showProductBalance(selectedValue);
    } else {
        $('balance-ingredients-form').style.display = 'none';
        $('balance-summary-cards').style.display = 'none';
        $('balance-list-card').style.display = 'none';
        $('balance-empty-state').style.display = 'block';
    }
}

function showProductBalance(pid) {
    var p = STATE.menu.find(function (x) { return x.id === pid; });
    if (!p) return;

    $('balance-ingredients-form').style.display = 'flex';
    $('balance-summary-cards').style.display = 'grid';
    $('balance-list-card').style.display = 'block';
    $('balance-empty-state').style.display = 'none';

    $('balance-prod-price').textContent = fmt(p.price);

    var ingredients = p.ingredients || [];
    var tbody = $('balance-ingredients-list-body');
    tbody.innerHTML = '';

    var totalCost = 0;

    if (ingredients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No hay ingredientes añadidos</td></tr>';
    } else {
        ingredients.forEach(function (ing) {
            totalCost += ing.cost;
            var tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = '<td style="padding:0.75rem 0.5rem; font-weight:500;">' + ing.name + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:right;">' + ing.qty + ' ' + ing.unit + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:right; font-weight:600;">' + fmt(ing.cost) + '</td>' +
                '<td style="padding:0.75rem 0.5rem; text-align:center;">' +
                '<button class="btn-ing-delete" data-id="' + ing.id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</td>';

            tr.querySelector('.btn-ing-delete').addEventListener('click', function () {
                p.ingredients = p.ingredients.filter(function (x) { return x.id !== ing.id; });
                saveMenu();
            });
            tbody.appendChild(tr);
        });
    }

    var totalCostEl = $('balance-total-cost');
    totalCostEl.textContent = fmt(totalCost);

    if (totalCost > p.price) {
        totalCostEl.style.color = 'var(--danger)';
    } else {
        totalCostEl.style.color = 'var(--success)';
    }

    var margin = p.price - totalCost;
    var marginPct = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;
    var marginEl = $('balance-margin');
    marginEl.textContent = fmt(margin) + ' (' + marginPct + '%)';
    if (margin >= 0) {
        marginEl.style.color = 'var(--success)';
    } else {
        marginEl.style.color = 'var(--danger)';
    }
}
