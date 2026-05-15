// --- POLYFILLS PARA TABLETS ANTIGUAS ---
if (!Array.prototype.find) {
    Array.prototype.find = function(fn) {
        for (var i = 0; i < this.length; i++) {
            if (fn(this[i])) return this[i];
        }
        return undefined;
    };
}
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
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
    editingProductId: null
};

var CURRENT_ROLE = localStorage.getItem('fudo_role') || null;
var BARISTA_CATS = ['Cafetería', 'Bebidas', 'Cafetería fría', 'Té'];

db.ref('initialized').once('value').then(function(snap) {
    if (!snap.val()) {
        var localTables = JSON.parse(localStorage.getItem('fudo_tables') || '[]');
        var localMenu = JSON.parse(localStorage.getItem('fudo_menu') || 'null');
        var localHistory = JSON.parse(localStorage.getItem('fudo_history') || '[]');
        db.ref('tables').set(localTables);
        db.ref('menu').set(localMenu || [
            { id: 'p1', name: 'Cafe Expreso', price: 1500, category: 'Cafetería' },
            { id: 'p2', name: 'Cortado', price: 1600, category: 'Cafetería' },
            { id: 'p3', name: 'Latte', price: 1900, category: 'Cafetería' },
            { id: 'p4', name: 'Medialuna de Manteca', price: 600, category: 'Dulce' },
            { id: 'p5', name: 'Tostado de Miga', price: 2500, category: 'Salado' },
            { id: 'p6', name: 'Jugo de Naranja', price: 1800, category: 'Bebidas' }
        ]);
        db.ref('history').set(localHistory);
        db.ref('initialized').set(true);
    }
});

function saveState() {
    db.ref('tables').set(STATE.tables || []).catch(function(e){ console.error(e); alert('Error al guardar: ' + e.message); });
    db.ref('menu').set(STATE.menu || []).catch(function(e){ console.error(e); alert('Error al guardar: ' + e.message); });
    db.ref('history').set(STATE.history || []).catch(function(e){ console.error(e); alert('Error al guardar: ' + e.message); });
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
    var btnMesero = $('btn-role-mesero'); if (btnMesero) btnMesero.addEventListener('click', function() {
        CURRENT_ROLE = 'mesero'; localStorage.setItem('fudo_role', 'mesero');
        $('role-selection-overlay').classList.add('hidden'); applyRole();
    });
    var btnBarista = $('btn-role-barista'); if (btnBarista) btnBarista.addEventListener('click', function() {
        CURRENT_ROLE = 'barista'; localStorage.setItem('fudo_role', 'barista');
        $('role-selection-overlay').classList.add('hidden'); applyRole();
    });
    var btnCr1 = $('btn-change-role'); if (btnCr1) btnCr1.addEventListener('click', function() { $('role-selection-overlay').classList.remove('hidden'); });
    var btnCr2 = $('btn-change-role-mesero'); if (btnCr2) btnCr2.addEventListener('click', function() { $('role-selection-overlay').classList.remove('hidden'); });
    var btnCr3 = $('btn-change-role-barista'); if (btnCr3) btnCr3.addEventListener('click', function() { $('role-selection-overlay').classList.remove('hidden'); });

    setInterval(function() { if (CURRENT_ROLE === 'barista') renderKDS(); }, 30000);

    // Navigation
    qsa('.nav-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            qsa('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            qsa('.view').forEach(function(v) { v.classList.remove('active'); });
            $('view-' + btn.getAttribute('data-view')).classList.add('active');
        });
    });

    // Add Table
    $('btn-add-table').addEventListener('click', function() {
        $('input-table-name').value = '';
        $('modal-table').classList.remove('hidden');
    });
    $('btn-modal-table-cancel').addEventListener('click', function() {
        $('modal-table').classList.add('hidden');
    });
    $('btn-modal-table-save').addEventListener('click', function() {
        var name = $('input-table-name').value.trim();
        var zone = $('input-table-zone').value;
        var tip = $('input-table-tip').checked;
        if (name) {
            STATE.tables.push({ id: genId(), name: name, zone: zone, tip: tip, status: 'free', order: [] });
            saveState();
            renderTables();
            $('modal-table').classList.add('hidden');
        }
    });

    // Add Product
    $('btn-add-product').addEventListener('click', function() {
        STATE.editingProductId = null;
        $('modal-product-title').textContent = 'Nuevo Producto';
        $('input-product-name').value = '';
        $('input-product-price').value = '';
        $('input-product-category').value = '';
        $('modal-product').classList.remove('hidden');
    });
    $('btn-modal-product-cancel').addEventListener('click', function() {
        $('modal-product').classList.add('hidden');
    });
    $('btn-modal-product-save').addEventListener('click', function() {
        var name = $('input-product-name').value.trim();
        var price = parseFloat($('input-product-price').value);
        var cat = $('input-product-category').value.trim() || 'General';
        if (name && !isNaN(price) && price >= 0) {
            if (STATE.editingProductId) {
                var p = STATE.menu.find(function(x) { return x.id === STATE.editingProductId; });
                if (p) { p.name = name; p.price = price; p.category = cat; }
            } else {
                STATE.menu.push({ id: genId(), name: name, price: price, category: cat });
            }
            saveState();
            renderMenu();
            $('modal-product').classList.add('hidden');
        }
    });

    // Order Panel
    var btnOk = $('btn-ok-order');
    if (btnOk) btnOk.addEventListener('click', closeOrder);
    $('order-panel-overlay').addEventListener('click', closeOrder);
    $('order-tip-checkbox').addEventListener('change', function(e) {
        var t = getTable();
        if (t) { t.tip = e.target.checked; saveState(); renderOrderItems(); }
    });

    $('order-search').addEventListener('input', function() {
        renderOrderMenu();
    });

    $('btn-print-receipt').addEventListener('click', function() {
        var t = getTable();
        if (t && t.order.length > 0) {
            var subtotal = calcTotal(t.order);
            var tipAmt = t.tip ? subtotal * 0.1 : 0;
            var total = subtotal + tipAmt;
            var payment = $('order-payment-method').value;
            var recItems = t.order.map(function(it) {
                var p = STATE.menu.find(function(x) { return x.id === it.productId; });
                return { name: p ? p.name : '?', price: p ? p.price : 0, qty: it.qty, subtotal: (p ? p.price : 0) * it.qty };
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

    $('btn-charge-order').addEventListener('click', function() {
        var t = getTable();
        if (t && t.order.length > 0) {
            var subtotal = calcTotal(t.order);
            var tipAmt = t.tip ? subtotal * 0.1 : 0;
            var total = subtotal + tipAmt;
            var payment = $('order-payment-method').value;
            var recItems = t.order.map(function(it) {
                var p = STATE.menu.find(function(x) { return x.id === it.productId; });
                return { name: p ? p.name : '?', price: p ? p.price : 0, qty: it.qty, subtotal: (p ? p.price : 0) * it.qty };
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
            STATE.history.push(rec);
            t.order = []; t.tickets = []; t.status = 'free';
            saveState(); renderTables(); renderHistory(); updateDaily(); closeOrder();
        }
    });

    var btnSendKds = $('btn-send-kds');
    if (btnSendKds) {
        btnSendKds.addEventListener('click', function() {
            var t = getTable();
            if (!t || !t.order) return;
            var sentAny = false;
            var now = Date.now();
            if (!t.tickets) t.tickets = [];
            var ticketItems = [];
            t.order.forEach(function(it) {
                var p = STATE.menu.find(function(x) { return x.id === it.productId; });
                if (!p) return;
                var previouslySent = 0;
                t.tickets.forEach(function(tk) {
                    var tItem = tk.items.find(function(x) { return x.productId === it.productId; });
                    if (tItem) previouslySent += tItem.qty;
                });
                var diff = it.qty - previouslySent;
                if (diff > 0) {
                    ticketItems.push({ productId: it.productId, name: p.name, qty: diff, done: false });
                }
            });
            if (ticketItems.length > 0) {
                t.tickets.push({ id: genId(), timestamp: now, items: ticketItems, status: 'pending', printed: false });
                saveState();
                sentAny = true;
                if (CURRENT_ROLE !== 'barista') renderTables();
            }
            closeOrder();
            if (sentAny) {
                if (PrinterManager.isServer) alert('Comanda enviada a cocina e impresión encolada.');
                else alert('Comanda enviada. La Caja principal la imprimirá.');
            } else {
                alert('No hay productos nuevos para enviar.');
            }
        });
    }

    // Confirm modal
    $('btn-confirm-cancel').addEventListener('click', function() { $('modal-confirm').classList.add('hidden'); confirmCb = null; });
    $('btn-confirm-ok').addEventListener('click', function() { $('modal-confirm').classList.add('hidden'); if (confirmCb) confirmCb(); });

    // History filter
    $('history-date-filter').addEventListener('change', function() { $('history-month-filter').value = ''; renderHistory(); });
    $('history-month-filter').addEventListener('change', function() { $('history-date-filter').value = ''; renderHistory(); });
    $('btn-clear-filter').addEventListener('click', function() { $('history-date-filter').value = ''; $('history-month-filter').value = ''; renderHistory(); });

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
        selPrintMode.addEventListener('change', function(e) {
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
        chkIsServer.addEventListener('change', function(e) {
            PrinterManager.isServer = e.target.checked;
            localStorage.setItem('fudo_is_server', e.target.checked);
        });
    }

    var btnPairCaja = $('btn-pair-caja'); if(btnPairCaja) btnPairCaja.addEventListener('click', function() { PrinterManager.connect('caja'); });
    var btnPairCocina = $('btn-pair-cocina'); if(btnPairCocina) btnPairCocina.addEventListener('click', function() { PrinterManager.connect('cocina'); });
    var chkSamePrinter = $('setting-same-printer'); 
    if(chkSamePrinter) {
        chkSamePrinter.addEventListener('change', function(e) { 
            PrinterManager.samePrinter = e.target.checked; 
            $('container-printer-cocina').style.opacity = e.target.checked ? '0.5' : '1';
            $('btn-pair-cocina').disabled = e.target.checked;
        });
    }

    // Firebase Listeners
    db.ref('tables').on('value', function(snapshot) {
        var rawTables = Object.values(snapshot.val() || {});
        STATE.tables = rawTables.map(function(t) {
            if (t.order && !Array.isArray(t.order)) t.order = Object.values(t.order);
            if (!t.order) t.order = [];
            if (t.tickets && !Array.isArray(t.tickets)) t.tickets = Object.values(t.tickets);
            if (!t.tickets) t.tickets = [];
            t.tickets.forEach(function(tk) {
                if (tk.items && !Array.isArray(tk.items)) tk.items = Object.values(tk.items);
                if (!tk.items) tk.items = [];
            });
            return t;
        });
        if (CURRENT_ROLE === 'barista') renderKDS();
        else renderTables();
        
        // Print Server Logic
        if (PrinterManager.isServer) {
            var needSave = false;
            STATE.tables.forEach(function(t) {
                if (t.tickets) {
                    t.tickets.forEach(function(tk) {
                        if (tk.status === 'pending' && tk.printed === false) {
                            PrinterManager.enqueueJob(t.name, tk.items, t.id, tk.id);
                            tk.printed = true;
                            needSave = true;
                        }
                    });
                }
            });
            if (needSave) saveState();
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
    }, function(error) {
        alert('Error de conexión a Mesas: ' + error.message);
    });

    db.ref('menu').on('value', function(snapshot) {
        STATE.menu = Object.values(snapshot.val() || {});
        renderMenu();
        if (STATE.currentTableId) renderOrderMenu();
    }, function(error) {
        alert('Error de conexión a Menú: ' + error.message);
    });

    db.ref('history').on('value', function(snapshot) {
        var rawHistory = Object.values(snapshot.val() || {});
        STATE.history = rawHistory.map(function(h) {
            if (h.items && !Array.isArray(h.items)) h.items = Object.values(h.items);
            return h;
        });
        renderHistory();
        updateDaily();
    }, function(error) {
        alert('Error de conexión a Historial: ' + error.message);
    });
}

function getTable() { return STATE.tables.find(function(t) { return t.id === STATE.currentTableId; }); }
function calcTotal(order) {
    if (!order) return 0;
    return order.reduce(function(s, it) {
        var p = STATE.menu.find(function(x) { return x.id === it.productId; });
        return s + (p ? p.price * it.qty : 0);
    }, 0);
}
function getCats() {
    var s = {};
    STATE.menu.forEach(function(p) { s[p.category] = true; });
    return ['Todos', 'Más vendidos'].concat(Object.keys(s));
}
function showConfirm(msg, cb) {
    $('modal-confirm-message').textContent = msg;
    confirmCb = cb;
    $('modal-confirm').classList.remove('hidden');
}

function applyRole() {
    var sidebar = $('sidebar');
    var bottomNav = $('bottom-nav');
    if (CURRENT_ROLE === 'barista') {
        if (sidebar) sidebar.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        qsa('.view').forEach(function(v) { v.classList.remove('active'); });
        var viewKds = $('view-kds');
        if (viewKds) viewKds.classList.add('active');
        renderKDS();
    } else {
        if (sidebar) sidebar.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'flex';
        qsa('.view').forEach(function(v) { v.classList.remove('active'); });
        var viewTables = $('view-tables');
        if (viewTables) viewTables.classList.add('active');
        renderTables();
    }
}

// =================== Tables ===================
function renderTables() {
    ['salon', 'terraza', 'pendientes'].forEach(function(z) {
        var el = $('grid-' + z);
        if (el) el.innerHTML = '';
    });
    if (STATE.tables.length === 0) {
        var g = $('grid-salon');
        if (g) g.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">Toca "Nueva Mesa" para empezar</div>';
        return;
    }
    STATE.tables.forEach(function(table) {
        var subtotal = calcTotal(table.order);
        var total = subtotal + (table.tip ? subtotal * 0.1 : 0);
        
        var bandejaLista = table.tickets && table.tickets.some(function(tk) {
            return tk.status === 'pending' && tk.items.every(function(it) { return it.done; });
        });

        var d = document.createElement('div');
        d.className = 'table-card' + (bandejaLista ? ' bandeja-lista' : '');
        d.setAttribute('data-status', table.status);
        var z = (table.zone || 'salon').toLowerCase().replace('ó', 'o');
        var iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="4" rx="1"/><path d="M5 11v6"/><path d="M19 11v6"/></svg>';
        if (z === 'terraza') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 17.5L19 19"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M5 19l1.5-1.5"/><path d="M17.5 6.5L19 5"/><circle cx="12" cy="12" r="3"/></svg>';
        } else if (z === 'pendientes') {
            iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
        }
        d.innerHTML = '<div class="table-status-indicator"></div>' +
            '<div class="table-icon">' + iconSvg + '</div>' +
            '<div class="table-info"><div class="table-name">' + table.name + '</div>' +
            '<div class="table-amount">' + (table.status !== 'free' ? fmt(total) : 'Libre') + '</div></div>' +
            (bandejaLista ? '<div style="background:#10b981;color:#fff;font-size:0.75rem;padding:0.2rem 0.5rem;border-radius:4px;margin-top:0.5rem;text-align:center;">Bandeja Lista</div>' : '') +
            '<div class="table-actions"><button class="btn-table-delete" data-id="' + table.id + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
        d.addEventListener('click', function(e) {
            if (!e.target.closest('.btn-table-delete')) openOrder(table.id);
        });
        var del = d.querySelector('.btn-table-delete');
        del.addEventListener('click', function(e) {
            e.stopPropagation();
            if (table.status !== 'free') { alert('Mesa ocupada, no se puede eliminar.'); return; }
            showConfirm('Eliminar esta mesa?', function() {
                STATE.tables = STATE.tables.filter(function(x) { return x.id !== table.id; });
                saveState(); renderTables();
            });
        });
        var zoneKey = table.zone ? table.zone.toLowerCase().replace('ó', 'o') : 'salon';
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
    getCats().forEach(function(cat) {
        var p = document.createElement('div');
        p.className = 'category-pill' + (cat === orderCatFilter ? ' active' : '');
        p.textContent = cat;
        p.addEventListener('click', function() { orderCatFilter = cat; renderOrderCats(); renderOrderMenu(); });
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
        STATE.history.forEach(function(h) { h.items.forEach(function(i) { sales[i.name] = (sales[i.name] || 0) + i.qty; }); });
        items = STATE.menu.filter(function(p) { return p.name.toLowerCase().indexOf(q) >= 0; }).map(function(p) {
            return { p: p, qty: sales[p.name] || 0 };
        }).sort(function(a, b) { return b.qty - a.qty; }).map(function(x) { return x.p; }).slice(0, 10);
    } else {
        items = STATE.menu.filter(function(p) {
            return p.name.toLowerCase().indexOf(q) >= 0 && (orderCatFilter === 'Todos' || p.category === orderCatFilter);
        });
    }
    if (items.length === 0) { c.innerHTML = '<div style="color:var(--text-muted);padding:.5rem;">Sin resultados</div>'; return; }
    items.forEach(function(p) {
        var r = document.createElement('div');
        r.className = 'menu-item-row';
        r.innerHTML = '<span class="item-row-name">' + p.name + '</span><span class="item-row-price">' + fmt(p.price) + '</span>';
        r.addEventListener('click', function() { addToOrder(p.id); });
        c.appendChild(r);
    });
}
function addToOrder(pid) {
    var t = getTable();
    if (!t) return;
    var ex = t.order.find(function(x) { return x.productId === pid; });
    if (ex) { ex.qty++; } else { t.order.push({ productId: pid, qty: 1 }); }
    t.status = 'occupied';
    saveState(); renderTables(); renderOrderItems();
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
        saveState(); renderTables(); renderOrderItems();
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
    t.order.forEach(function(it) {
        var p = STATE.menu.find(function(x) { return x.id === it.productId; });
        if (!p) return;
        var sub = p.price * it.qty;
        subtotal += sub;
        var el = document.createElement('div');
        el.className = 'order-item';
        el.innerHTML = '<div class="order-item-info"><div class="order-item-name">' + p.name + '</div><div class="order-item-price">' + fmt(p.price) + ' c/u</div></div>' +
            '<div class="order-item-controls"><button class="qty-btn btn-m">-</button><span class="item-qty">' + it.qty + '</span><button class="qty-btn btn-p">+</button><span class="item-total">' + fmt(sub) + '</span></div>';
        el.querySelector('.btn-m').addEventListener('click', function() { changeQty(it.productId, -1); });
        el.querySelector('.btn-p').addEventListener('click', function() { changeQty(it.productId, 1); });
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

    var readyTks = t.tickets ? t.tickets.filter(function(tk) { 
        return tk.status === 'pending' && tk.items.every(function(it){ return it.done; }); 
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
        btnDespachar.addEventListener('click', function() {
            t.tickets.forEach(function(tk) {
                if (tk.status === 'pending' && tk.items.every(function(it){ return it.done; })) {
                    tk.status = 'delivered';
                }
            });
            saveState();
            renderTables();
            renderOrderItems();
        });
        c.appendChild(btnDespachar);
    }
}

// =================== Menu ===================
var menuCatFilter = 'Todos';
function renderMenu() {
    var bar = $('menu-categories-bar');
    bar.innerHTML = '';
    getCats().forEach(function(cat) {
        var b = document.createElement('button');
        b.className = 'btn btn-outline';
        if (cat === menuCatFilter) { b.style.background = 'var(--primary)'; b.style.color = '#fff'; b.style.borderColor = 'var(--primary)'; }
        b.textContent = cat;
        b.addEventListener('click', function() { menuCatFilter = cat; renderMenu(); });
        bar.appendChild(b);
    });
    var list = $('menu-products-list');
    list.innerHTML = '';
    STATE.menu.filter(function(p) { return menuCatFilter === 'Todos' || p.category === menuCatFilter; }).forEach(function(p) {
        var c = document.createElement('div');
        c.className = 'product-card';
        c.innerHTML = '<span class="product-category-tag">' + p.category + '</span><div class="product-name">' + p.name + '</div><div class="product-price">' + fmt(p.price) + '</div>' +
            '<div class="product-actions"><button class="btn btn-outline btn-ep" style="flex:1;padding:.25rem;">Editar</button><button class="btn btn-danger btn-dp" style="padding:.25rem .5rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
        c.querySelector('.btn-ep').addEventListener('click', function() {
            STATE.editingProductId = p.id;
            $('modal-product-title').textContent = 'Editar Producto';
            $('input-product-name').value = p.name;
            $('input-product-price').value = p.price;
            $('input-product-category').value = p.category;
            $('modal-product').classList.remove('hidden');
        });
        c.querySelector('.btn-dp').addEventListener('click', function() {
            showConfirm('Eliminar ' + p.name + '?', function() {
                STATE.menu = STATE.menu.filter(function(x) { return x.id !== p.id; });
                saveState(); renderMenu();
            });
        });
        list.appendChild(c);
    });
}

// =================== History ===================
function updateDaily() {
    var today = new Date().toISOString().split('T')[0];
    var total = STATE.history.filter(function(h) { return h.date.indexOf(today) === 0; }).reduce(function(s, h) { return s + h.total; }, 0);
    $('daily-total').textContent = fmt(total);
}
function renderHistory() {
    var fd = $('history-date-filter').value;
    var fm = $('history-month-filter').value;
    var list = STATE.history.slice().reverse();
    if (fd) list = list.filter(function(h) { return h.date.indexOf(fd) === 0; });
    if (fm) list = list.filter(function(h) { return h.date.indexOf(fm) === 0; });
    var tr = list.reduce(function(s, h) { return s + h.total; }, 0);
    var te = list.filter(function(h) { return h.paymentMethod === 'Efectivo'; }).reduce(function(s, h) { return s + h.total; }, 0);
    var td = list.filter(function(h) { return h.paymentMethod === 'Débito'; }).reduce(function(s, h) { return s + h.total; }, 0);
    var tc = list.filter(function(h) { return h.paymentMethod === 'Crédito'; }).reduce(function(s, h) { return s + h.total; }, 0);
    
    $('history-summary').innerHTML = '<div class="summary-card"><div class="summary-title">Total Recaudado</div><div class="summary-value">' + fmt(tr) + '</div></div>' +
        '<div class="summary-card"><div class="summary-title">Ventas</div><div class="summary-value">' + list.length + '</div></div>' +
        '<div class="summary-card" style="grid-column:1/-1; display:flex; justify-content:space-between; padding:1rem;">' +
        '<div><small>Efectivo:</small> <b>' + fmt(te) + '</b></div>' +
        '<div><small>Débito:</small> <b>' + fmt(td) + '</b></div>' +
        '<div><small>Crédito:</small> <b>' + fmt(tc) + '</b></div></div>';
    var hl = $('history-list');
    hl.innerHTML = '';
    if (list.length === 0) { hl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Sin ventas</div>'; return; }
    list.forEach(function(r) {
        var d = new Date(r.date);
        var ic = r.items.reduce(function(s, i) { return s + i.qty; }, 0);
        var el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = '<div class="history-item-info"><h4>' + r.tableName + '</h4><div class="history-item-date">' + d.toLocaleDateString() + ' - ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</div><div class="history-item-details">' + ic + ' items &bull; ' + (r.paymentMethod || 'Efectivo') + '</div></div><div class="history-item-total">' + fmt(r.total) + '</div>';
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
        } catch(e) {
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
    
    encodeText: function(str) {
        var s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var bytes = new Uint8Array(s.length);
        for(var i=0; i<s.length; i++) {
            var c = s.charCodeAt(i);
            bytes[i] = c < 128 ? c : 63;
        }
        return bytes;
    },
    
    createTicket: function(rec) {
        var bytes = [];
        var push = function(arr) { for(var i=0; i<arr.length; i++) bytes.push(arr[i]); };
        var text = function(str) { push(escpos.encodeText(str)); };
        
        push(escpos.init);
        push(escpos.alignCenter);
        push(escpos.boldOn);
        push(escpos.doubleSize);
        text("Buen Dia Cafe\n");
        push(escpos.normalSize);
        push(escpos.boldOff);
        
        var d = new Date(rec.date);
        text(d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + "\n");
        text(rec.tableName + "\n");
        text("--------------------------------\n");
        push(escpos.alignLeft);
        
        rec.items.forEach(function(it) {
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
    
    createComanda: function(tableName, items) {
        var bytes = [];
        var push = function(arr) { for(var i=0; i<arr.length; i++) bytes.push(arr[i]); };
        var text = function(str) { push(escpos.encodeText(str)); };
        
        push(escpos.init);
        push(escpos.alignCenter);
        push(escpos.boldOn);
        push(escpos.doubleSize);
        text("COMANDA\n");
        text(tableName + "\n");
        push(escpos.normalSize);
        push(escpos.boldOff);
        var d = new Date();
        text(d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + "\n");
        text("--------------------------------\n");
        push(escpos.alignLeft);
        
        push(escpos.boldOn);
        push(escpos.doubleSize);
        items.forEach(function(it) {
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
        PrinterManager.printCaja(data).catch(function(e) {
            console.warn('Fallo impresion bluetooth', e);
            fallbackPrintTicket(rec);
        });
    } else {
        fallbackPrintTicket(rec);
    }
}

function fallbackPrintTicket(rec) {
    var d = new Date(rec.date);
    $('ticket-date').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    $('ticket-table').textContent = rec.tableName;
    var tb = $('ticket-items-body');
    tb.innerHTML = '';
    rec.items.forEach(function(it) {
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
        PrinterManager.printCocina(data).catch(function(e) {
            console.warn('Fallo impresion comanda bluetooth', e);
            fallbackPrintComanda(tableName, items);
        });
    } else {
        fallbackPrintComanda(tableName, items);
    }
}

function fallbackPrintComanda(tableName, items) {
    var d = new Date();
    $('comanda-date').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    $('comanda-table').textContent = tableName;
    var tb = $('comanda-items-body');
    tb.innerHTML = '';
    items.forEach(function(it) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="ticket-td-center" style="font-size:16px;">' + it.qty + '</td><td class="ticket-td-left" style="font-size:16px;font-weight:bold;">' + it.name + '</td>';
        tb.appendChild(tr);
    });
    
    document.body.className = 'printing-comanda';
    window.print();
    document.body.className = '';
}

// Start
init();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').catch(function(err) {
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
    STATE.tables.forEach(function(t) {
        if (!t.tickets) return;
        var pendingTks = t.tickets.filter(function(tk) { return tk.status === 'pending'; });
        if (pendingTks.length > 0) {
            pendingTables.push({ table: t, tickets: pendingTks });
        }
    });

    if (pendingTables.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">No hay comandas pendientes</div>';
        return;
    }

    pendingTables.sort(function(a, b) {
        var aMin = Math.min.apply(null, a.tickets.map(function(tk){ return tk.timestamp; }));
        var bMin = Math.min.apply(null, b.tickets.map(function(tk){ return tk.timestamp; }));
        return aMin - bMin;
    });

    var now = Date.now();
    pendingTables.forEach(function(pt) {
        var t = pt.table;
        var oldestTime = Math.min.apply(null, pt.tickets.map(function(tk){ return tk.timestamp; }));
        var mins = Math.floor((now - oldestTime) / 60000);
        
        var urgencyClass = 'urgent-low';
        if (mins >= 10) urgencyClass = 'urgent-high';
        else if (mins >= 5) urgencyClass = 'urgent-med';

        var card = document.createElement('div');
        card.className = 'kds-card ' + urgencyClass;
        
        var itemsHtml = '';
        pt.tickets.forEach(function(tk) {
            tk.items.forEach(function(it) {
                var checked = it.done ? 'checked' : '';
                var lineClass = it.done ? 'completed' : '';
                itemsHtml += '<label class="kds-item ' + lineClass + '" style="cursor:pointer; display:flex; align-items:center; gap:1rem;">' +
                    '<input type="checkbox" data-tid="' + t.id + '" data-tk="' + tk.id + '" data-pid="' + it.productId + '" style="transform:scale(1.5);" ' + checked + '>' +
                    '<span class="kds-item-qty">' + it.qty + 'x</span><span class="kds-item-name">' + it.name + '</span>' +
                '</label>';
            });
        });

        var allDone = pt.tickets.every(function(tk) { return tk.items.every(function(i){ return i.done; }); });

        if (allDone) {
            urgencyClass = 'urgent-low';
            card.className = 'kds-card ' + urgencyClass;
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + t.name + '</span></div>' +
                '<div style="text-align:center; padding:1.5rem 0; color:#10b981; font-weight:700; font-size:1.2rem;">¡Bandeja Lista!<br><small style="color:var(--text-muted);font-weight:normal;font-size:0.9rem;">Esperando que el mesero despache</small></div>';
        } else {
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + t.name + '</span><span class="kds-card-time">' + (mins > 0 ? mins + ' min' : 'Ahora') + '</span></div>' +
                '<div class="kds-items" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">' + itemsHtml + '</div>';
            
            card.querySelectorAll('input[type="checkbox"]').forEach(function(chk) {
                chk.addEventListener('change', function(e) {
                    var isChecked = e.target.checked;
                    var tid = e.target.getAttribute('data-tid');
                    var tkid = e.target.getAttribute('data-tk');
                    var pid = e.target.getAttribute('data-pid');
                    
                    var actualTable = STATE.tables.find(function(x){ return x.id === tid; });
                    if (actualTable && actualTable.tickets) {
                        var actualTk = actualTable.tickets.find(function(x){ return x.id === tkid; });
                        if (actualTk) {
                            var actualIt = actualTk.items.find(function(x){ return x.productId === pid; });
                            if (actualIt) {
                                actualIt.done = isChecked;
                                saveState();
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
