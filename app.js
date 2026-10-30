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
    customers: [],
    currentTableId: null,
    editingProductId: null,
    editingTableId: null,
    editingIngredientId: null,
    editingCustomerId: null,
    isSaving: false,
    isConnected: false,
    menuKeys: [],
    loaded: { tables: false, menu: false, history: false, customers: false }
};

var CURRENT_ROLE = localStorage.getItem('fudo_role') || null;
var BARISTA_CATS = ['Cafetería', 'Bebidas', 'Cafetería fría', 'Té'];
var activeZone = 'salon';

// Guarda una mesa. Si se pasan `fields`, solo escribe esos campos para no pisar
// cambios hechos al mismo tiempo desde otro dispositivo en el resto de la mesa.
function saveTable(table, fields) {
    if (!table || !table.id) return Promise.resolve();
    var ref = db.ref('tables/' + table.id);
    var p;
    if (fields && fields.length) {
        var upd = {};
        fields.forEach(function (f) { upd[f] = (table[f] === undefined) ? null : table[f]; });
        p = ref.update(upd);
    } else {
        p = ref.set(table);
    }
    return p.catch(function (e) { console.error(e); toast('Error al guardar mesa: ' + e.message, 'error'); throw e; });
}
function deleteTable(tableId) {
    db.ref('tables/' + tableId).remove().catch(function (e) { console.error(e); toast('Error al eliminar mesa: ' + e.message, 'error'); });
}
function saveMenu() {
    db.ref('menu').set(STATE.menu || []).catch(function (e) { console.error(e); toast('Error al guardar menú: ' + e.message, 'error'); });
}
// Guarda un solo producto en su posición del arreglo `menu` sin reescribir el resto.
function saveProduct(p) {
    var idx = STATE.menu.indexOf(p);
    var keys = STATE.menuKeys || [];
    var key = idx >= 0 && idx < keys.length ? keys[idx] : null;
    if (key === null && idx >= 0) {
        // producto nuevo: siguiente índice numérico libre
        var nums = keys.map(Number);
        if (nums.some(isNaN)) { saveMenu(); return; }
        key = String(nums.length ? Math.max.apply(null, nums) + 1 : 0);
        keys.push(key);
    }
    if (key === null) { saveMenu(); return; }
    db.ref('menu/' + key).set(p).catch(function (e) { console.error(e); toast('Error al guardar producto: ' + e.message, 'error'); });
}
function genId() { return Math.random().toString(36).substr(2, 9); }
// Pesos chilenos: enteros con separador de miles ($12.500)
function fmt(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-CL');
}
// Costos unitarios de ingredientes pueden ser fracciones de peso ($0,35 / g)
function fmtCost(n) {
    var v = Number(n) || 0;
    if (Math.abs(v) >= 100 || v === Math.round(v)) return fmt(v);
    return '$' + v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}
// Totales de un pedido, redondeados a pesos enteros
function calcTotals(order, discountPct, withTip) {
    var subtotal = Math.round(calcTotal(order));
    var pct = discountPct || 0;
    var discountAmt = Math.round(subtotal * pct / 100);
    var afterDiscount = subtotal - discountAmt;
    var tipAmt = withTip ? Math.round(afterDiscount * 0.1) : 0;
    return { subtotal: subtotal, discountPct: pct, discountAmt: discountAmt, tipAmt: tipAmt, total: afterDiscount + tipAmt };
}
// Fecha local YYYY-MM-DD (o YYYY-MM con month=true); evita que ventas nocturnas caigan al día siguiente por UTC
function localDayKey(date, month) {
    var d = (date instanceof Date) ? date : new Date(date);
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    if (month) return y + '-' + m;
    return y + '-' + m + '-' + ('0' + d.getDate()).slice(-2);
}
var TIP_LINE = 'Propina Sugerida (10%)';
function isAdjustmentLine(it) {
    return !it || !it.name || it.name === TIP_LINE || it.name.indexOf('Descuento (') === 0;
}

// =================== Toasts ===================
function toast(msg, type) {
    var host = document.getElementById('toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        host.className = 'toast-host';
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var ttl = type === 'error' ? 6000 : 3200;
    var close = function () { el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250); };
    el.addEventListener('click', close);
    setTimeout(close, ttl);
}

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
    var btnCr2 = $('btn-change-role-mesero'); if (btnCr2) btnCr2.addEventListener('click', function () {
        $('more-sheet').classList.add('hidden');
        $('role-selection-overlay').classList.remove('hidden');
    });
    var btnCr3 = $('btn-change-role-barista'); if (btnCr3) btnCr3.addEventListener('click', function () { $('role-selection-overlay').classList.remove('hidden'); });

    setInterval(function () { if (CURRENT_ROLE === 'barista') renderKDS(); }, 30000);

    // Navigation
    qsa('.nav-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            qsa('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            qsa('.view').forEach(function (v) { v.classList.remove('active'); });
            var viewName = btn.getAttribute('data-view');
            var targetView = $('view-' + viewName);
            if (targetView) targetView.classList.add('active');
            if (viewName === 'balance') {
                renderBalance();
            } else if (viewName === 'loyalty') {
                renderLoyalty();
            } else if (viewName === 'kds') {
                renderKDS();
            }
            // Marcar el botón equivalente en la otra navegación (sidebar / hoja "Más")
            qsa('.nav-btn[data-view="' + viewName + '"]').forEach(function (b) { b.classList.add('active'); });
            var moreBtn = $('nav-more');
            if (moreBtn) moreBtn.classList.toggle('active', !!qs('#more-sheet .nav-btn[data-view="' + viewName + '"]'));
            setMoreSheet(false);
            var main = $('view-' + viewName);
            if (main) main.scrollTop = 0;
        });
    });

    // Hoja "Más" del celular
    function setMoreSheet(open) {
        var sheet = $('more-sheet');
        var moreBtn = $('nav-more');
        if (!sheet) return;
        sheet.classList.toggle('hidden', !open);
        if (moreBtn) moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    var navMore = $('nav-more');
    if (navMore) navMore.addEventListener('click', function () { setMoreSheet($('more-sheet').classList.contains('hidden')); });
    qsa('[data-close-more]').forEach(function (el) { el.addEventListener('click', function () { setMoreSheet(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMoreSheet(false); });

    // Pestañas del panel de pedido (en celular se ve una sección a la vez)
    qsa('.order-tab').forEach(function (tab) {
        tab.addEventListener('click', function () { setOrderTab(tab.getAttribute('data-order-tab')); });
    });

    // Loyalty Event Handlers
    var loyaltySearch = $('loyalty-search');
    if (loyaltySearch) {
        loyaltySearch.addEventListener('input', renderLoyalty);
    }

    var btnAddCustomer = $('btn-add-customer');
    if (btnAddCustomer) {
        btnAddCustomer.addEventListener('click', function () {
            STATE.editingCustomerId = null;
            $('modal-customer-title').textContent = 'Nuevo Socio de Fidelidad';
            $('input-customer-name').value = '';
            $('input-customer-phone').value = '';
            $('input-customer-email').value = '';
            $('input-customer-stamps').value = '0';
            $('modal-customer').classList.remove('hidden');
        });
    }

    var btnModalCustCancel = $('btn-modal-customer-cancel');
    if (btnModalCustCancel) {
        btnModalCustCancel.addEventListener('click', function () {
            $('modal-customer').classList.add('hidden');
            STATE.editingCustomerId = null;
        });
    }

    var btnModalCustSave = $('btn-modal-customer-save');
    if (btnModalCustSave) {
        btnModalCustSave.addEventListener('click', function () {
            var name = $('input-customer-name').value.trim();
            var phone = $('input-customer-phone').value.trim();
            var email = $('input-customer-email').value.trim();
            var stamps = parseInt($('input-customer-stamps').value) || 0;

            if (!name || !phone) {
                toast('Ingresa al menos nombre y teléfono.', 'error');
                return;
            }

            var custId = STATE.editingCustomerId || ('c_' + Math.random().toString(36).substr(2, 7));

            // Evitar socios duplicados: comparar teléfonos normalizados (sin espacios ni prefijo)
            var phoneNorm = normalizePhone(phone);
            var dupCustomer = (STATE.customers || []).filter(function (x) {
                return x.id !== custId && phoneNorm.length === 9 && normalizePhone(x.phone) === phoneNorm;
            })[0];
            if (dupCustomer) {
                showConfirm('Ya existe un socio con este teléfono: ' + dupCustomer.name + ' (' + (dupCustomer.stamps || 0) + ' sellos). ¿Guardar de todas formas como socio separado?',
                    doSave, { okText: 'Guardar igual', variant: 'primary' });
            } else {
                doSave();
            }

            function doSave() {
            var custData = {
                id: custId,
                name: name,
                phone: phone,
                phoneNormalized: phoneNorm,
                email: email,
                stamps: stamps,
                updatedAt: new Date().toISOString()
            };

            if (!STATE.editingCustomerId) {
                custData.createdAt = new Date().toISOString();
                custData.rewardsClaimed = 0;
            }

            db.ref('customers/' + custId).update(custData).then(function () {
                $('modal-customer').classList.add('hidden');
                STATE.editingCustomerId = null;
                toast('Socio guardado.', 'success');
            }).catch(function (e) {
                toast('Error al guardar socio: ' + e.message, 'error');
            });
            }
        });
    }

    // QR Scan / Search Modal
    var btnScanQr = $('btn-scan-qr');
    if (btnScanQr) {
        btnScanQr.addEventListener('click', function () {
            $('input-qr-code').value = '';
            $('qr-scan-result').style.display = 'none';
            $('qr-scan-result').innerHTML = '';
            $('modal-qr-scanner').classList.remove('hidden');
            setTimeout(function () { $('input-qr-code').focus(); }, 200);
        });
    }

    var btnModalQrCancel = $('btn-modal-qr-cancel');
    if (btnModalQrCancel) {
        btnModalQrCancel.addEventListener('click', function () {
            stopQrCamera();
            $('modal-qr-scanner').classList.add('hidden');
        });
    }

    var btnModalQrSearch = $('btn-modal-qr-search');
    var inputQrCode = $('input-qr-code');
    function processQrSearch() {
        var query = (inputQrCode.value || '').trim();
        if (!query) return;

        var queryPhone = normalizePhone(query);
        var c = (STATE.customers || []).find(function (x) {
            return (x.id || '').toLowerCase() === query.toLowerCase() ||
                   (x.phone || '').toLowerCase() === query.toLowerCase() ||
                   (queryPhone.length === 9 && normalizePhone(x.phone) === queryPhone) ||
                   (x.name || '').toLowerCase().indexOf(query.toLowerCase()) >= 0;
        });

        var resBox = $('qr-scan-result');
        resBox.style.display = 'block';

        if (c) {
            var stamps = c.stamps || 0;
            var isReady = stamps >= 10;
            var fav = c.favoriteCoffee;
            var favText = '';
            if (fav) {
                favText = typeof fav === 'string' ? fav :
                    [fav.drink, fav.milk, fav.size, fav.shot, fav.dessert, fav.notes].filter(Boolean).join(' · ');
            }
            resBox.innerHTML =
                '<div class="qr-result-card">' +
                    '<h4 class="qr-result-name">' + escapeHtml(c.name) + '</h4>' +
                    '<p class="qr-result-meta">' + escapeHtml(c.phone) + ' · ID ' + escapeHtml(c.id) + '</p>' +
                    (favText ? '<p class="qr-result-fav"><span>Su habitual:</span> ' + escapeHtml(favText) + '</p>' : '') +
                    '<div class="qr-result-stamps">' + stampDotsHtml(stamps) + '<b>' + stamps + ' / 10</b></div>' +
                    '<div class="qr-result-actions">' +
                        '<button class="btn btn-primary" id="btn-qr-add-stamp">' + icon('plus') + ' 1 sello</button>' +
                        (isReady ? '<button class="btn btn-accent" id="btn-qr-redeem">' + icon('gift') + ' Canjear premio</button>' : '') +
                    '</div>' +
                '</div>';

            var addBtn = $('btn-qr-add-stamp');
            if (addBtn) {
                addBtn.addEventListener('click', function () {
                    addBtn.disabled = true;
                    addCustomerStamp(c.id, 1).then(processQrSearch, processQrSearch);
                });
            }

            var redeemBtn = $('btn-qr-redeem');
            if (redeemBtn) {
                redeemBtn.addEventListener('click', function () {
                    redeemCustomerReward(c.id, processQrSearch);
                });
            }
        } else {
            resBox.innerHTML = '<div class="inline-error">No se encontró ningún socio con esa identificación.</div>';
        }
    }

    if (btnModalQrSearch) {
        btnModalQrSearch.addEventListener('click', processQrSearch);
    }
    if (inputQrCode) {
        inputQrCode.addEventListener('keyup', function (e) {
            if (e.key === 'Enter') processQrSearch();
        });
    }

    // ---- Cámara QR (html5-qrcode) ----
    var _qrScanner = null;
    var _qrRunning = false;

    function stopQrCamera() {
        if (_qrScanner && _qrRunning) {
            _qrScanner.stop().catch(function() {});
            _qrRunning = false;
        }
        var startBtn = $('btn-start-camera');
        var stopBtn  = $('btn-stop-camera');
        var status   = $('qr-camera-status');
        if (startBtn) startBtn.style.display = '';
        if (stopBtn)  stopBtn.style.display = 'none';
        if (status)   status.style.display = 'none';
    }

    var btnStartCamera = $('btn-start-camera');
    if (btnStartCamera) {
        btnStartCamera.addEventListener('click', function () {
            if (typeof Html5Qrcode === 'undefined') {
                toast('La librería de escaneo no está cargada. Revisa tu conexión a internet.', 'error');
                return;
            }
            btnStartCamera.style.display = 'none';
            var stopBtn = $('btn-stop-camera');
            var status  = $('qr-camera-status');
            if (stopBtn) stopBtn.style.display = '';
            if (status)  status.style.display = 'block';

            if (!_qrScanner) {
                _qrScanner = new Html5Qrcode('qr-camera-reader');
            }

            _qrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 230, height: 230 } },
                function onScanSuccess(decodedText) {
                    var inp = $('input-qr-code');
                    if (inp) inp.value = decodedText.trim();
                    stopQrCamera();
                    processQrSearch();
                },
                function onScanError() { /* silencioso */ }
            ).then(function () {
                _qrRunning = true;
            }).catch(function (err) {
                stopQrCamera();
                toast('No se pudo acceder a la cámara. Da permiso de cámara al navegador. (' + err + ')', 'error');
            });
        });
    }

    var btnStopCamera = $('btn-stop-camera');
    if (btnStopCamera) {
        btnStopCamera.addEventListener('click', stopQrCamera);
    }

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
            var whRow = $('input-table-wh-row');
            var radiusRow = $('input-table-radius-row');
            if (val === 'round') {
                if (whRow) whRow.style.display = 'none';
                if (radiusRow) radiusRow.style.display = 'block';
                $('input-table-radius').value = 10;
                $('input-table-tip-container').style.display = 'block';
            } else {
                if (whRow) whRow.style.display = 'flex';
                if (radiusRow) radiusRow.style.display = 'none';
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
                    saveTable(table, ['zone']);
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
                saveTable(table, ['zone']);
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
                    toast('Ingrediente registrado.', 'success');
                }).catch(function (err) {
                    toast('Error: ' + err.message, 'error');
                });
            } else {
                toast('Ingresa un nombre y un costo válido.', 'error');
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
                    toast('Ingrediente actualizado.', 'success');
                }).catch(function (err) {
                    toast('Error: ' + err.message, 'error');
                });
            } else {
                toast('Ingresa datos válidos.', 'error');
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

                    saveProduct(p);
                    showRecipeDetails(pid);
                    $('recipe-ing-qty').value = '';
                    $('recipe-ing-select').value = '';
                    $('recipe-ing-unit-display').value = '';
                }
            } else {
                toast('Selecciona un ingrediente y una cantidad válida.', 'error');
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
        var whRow = $('input-table-wh-row');
        var radiusRow = $('input-table-radius-row');
        if (whRow) whRow.style.display = 'flex';
        if (radiusRow) radiusRow.style.display = 'none';
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
        var w, h, radius;
        if (type === 'round') {
            radius = parseInt($('input-table-radius').value) || 10;
            w = radius * 2;
            h = w;
        } else {
            w = parseInt($('input-table-w').value) || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 12);
            h = parseInt($('input-table-h').value) || (type === 'bar' ? 14 : type === 'sofa' ? 14 : 18);
            radius = null;
        }
        
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
                    if (type === 'round') t.radius = radius;
                    else delete t.radius;
                    saveTable(t, ['name', 'zone', 'tip', 'type', 'w', 'h', 'radius']);
                }
            } else {
                var rx = Math.round(10 + Math.random() * 30);
                var ry = Math.round(10 + Math.random() * 30);
                var newTable = { 
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
                };
                if (type === 'round') newTable.radius = radius;
                STATE.tables.push(newTable);
                saveTable(newTable);
            }
            renderTables();
            $('modal-table').classList.add('hidden');
            STATE.editingTableId = null;
        } else {
            fieldError('input-table-name', 'Escribe un nombre para la mesa.');
        }
    });

    // Add Product
    $('btn-add-product').addEventListener('click', function () {
        STATE.editingProductId = null;
        $('modal-product-title').textContent = 'Nuevo Producto';
        $('input-product-name').value = '';
        $('input-product-price').value = '';
        var catSel = $('input-product-category');
        catSel.value = (menuCatFilter !== 'Todos' && menuCatFilter) ? menuCatFilter : '';
        if (!catSel.value && catSel.options.length) catSel.selectedIndex = 0;
        $('modal-product').classList.remove('hidden');
    });
    $('btn-modal-product-cancel').addEventListener('click', function () {
        $('modal-product').classList.add('hidden');
    });
    $('btn-modal-product-save').addEventListener('click', function () {
        var name = $('input-product-name').value.trim();
        var price = Math.round(parseFloat($('input-product-price').value));
        var cat = $('input-product-category').value.trim() || 'General';
        if (!name) { fieldError('input-product-name', 'Escribe el nombre del producto.'); return; }
        if (isNaN(price) || price < 0) { fieldError('input-product-price', 'Ingresa un precio válido.'); return; }
        if (STATE.editingProductId) {
            var p = STATE.menu.find(function (x) { return x.id === STATE.editingProductId; });
            if (p) { p.name = name; p.price = price; p.category = cat; saveProduct(p); }
        } else {
            STATE.menu.push({ id: genId(), name: name, price: price, category: cat });
            saveProduct(STATE.menu[STATE.menu.length - 1]);
        }
        renderMenu();
        $('modal-product').classList.add('hidden');
    });

    // Order Panel
    var btnOk = $('btn-ok-order');
    if (btnOk) btnOk.addEventListener('click', closeOrder);
    $('order-panel-overlay').addEventListener('click', closeOrder);
    $('order-tip-checkbox').addEventListener('change', function (e) {
        var t = getTable();
        if (t) { t.tip = e.target.checked; saveTable(t, ['tip']); renderOrderItems(); }
    });

    $('order-discount-select').addEventListener('change', function (e) {
        var t = getTable();
        if (t) { t.discount = parseInt(e.target.value) || 0; saveTable(t, ['discount']); renderOrderItems(); }
    });

    $('order-search').addEventListener('input', function () {
        renderOrderMenu();
    });
    // Enter agrega el primer resultado de la búsqueda y limpia el buscador
    $('order-search').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        var first = qs('#order-menu-items .menu-item-row');
        if (first) { first.click(); e.target.value = ''; renderOrderMenu(); }
    });

    // Arma el registro de venta de una mesa (montos en pesos enteros)
    function buildSaleRecord(t) {
        var tot = calcTotals(t.order, t.discount, t.tip);
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
        if (tot.discountPct > 0) {
            recItems.push({ name: 'Descuento (' + tot.discountPct + '%)', price: -tot.discountAmt, qty: 1, subtotal: -tot.discountAmt });
        }
        if (t.tip) {
            recItems.push({ name: TIP_LINE, price: tot.tipAmt, qty: 1, subtotal: tot.tipAmt });
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
        return {
            id: genId(), date: new Date().toISOString(),
            tableId: t.id, tableName: t.name, total: tot.total,
            paymentMethod: $('order-payment-method').value,
            items: recItems,
            preparationCost: Math.round(preparationCost),
            tipAmount: tot.tipAmt,
            discountPercent: tot.discountPct,
            discountAmount: tot.discountAmt
        };
    }

    $('btn-print-receipt').addEventListener('click', function () {
        var t = getTable();
        if (t && t.order.length > 0) printTicket(buildSaleRecord(t));
    });

    $('btn-charge-order').addEventListener('click', function () {
        if (STATE.isSaving) return;
        var t = getTable();
        if (t && t.order.length > 0) {
            STATE.isSaving = true;
            var btnCharge = $('btn-charge-order');
            var btnLabel = btnCharge ? btnCharge.innerHTML : '';
            if (btnCharge) { btnCharge.disabled = true; btnCharge.textContent = 'Procesando...'; }
            var rec = buildSaleRecord(t);
            var done = function () {
                STATE.isSaving = false;
                if (btnCharge) { btnCharge.disabled = false; btnCharge.innerHTML = btnLabel; }
            };
            // Primero se guarda la venta; la mesa se libera solo si eso funcionó
            db.ref('history').push(rec).then(function () {
                t.order = []; t.tickets = []; t.status = 'free'; t.discount = 0;
                saveTable(t, ['order', 'tickets', 'status', 'discount']);
                renderTables(); updateDaily();
                closeOrder();
                toast('Cobro registrado: ' + fmt(rec.total), 'success');
                done();
            }).catch(function (e) {
                console.error(e);
                toast('No se pudo guardar el cobro: ' + e.message + '. La mesa sigue abierta.', 'error');
                done();
            });
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
                saveTable(t, ['tickets']);
                sentAny = true;
                if (CURRENT_ROLE !== 'barista') renderTables();
            }
            setTimeout(function () { STATE.isSaving = false; btnSendKds.disabled = false; }, 1200);
            if (sentAny) {
                closeOrder();
                if (PrinterManager.isServer) toast('Comanda enviada a preparación e impresión encolada.', 'success');
                else toast('Comanda enviada. La caja principal la imprimirá.', 'success');
            } else {
                toast('No hay productos nuevos para enviar.', 'info');
            }
        });
    }

    // Confirm modal
    $('btn-confirm-cancel').addEventListener('click', function () { $('modal-confirm').classList.add('hidden'); confirmCb = null; });
    $('btn-confirm-ok').addEventListener('click', function () {
        $('modal-confirm').classList.add('hidden');
        var cb = confirmCb; confirmCb = null;
        if (cb) cb();
    });

    // Modales: cerrar con Escape o tocando el fondo (equivale a "Cancelar")
    function modalCancel(modal) {
        var cancel = modal.querySelector('[data-cancel]');
        if (cancel) cancel.click(); else modal.classList.add('hidden');
    }
    var MODAL_SEL = '.modal:not(#role-selection-overlay)';
    qsa(MODAL_SEL).forEach(function (m) {
        m.addEventListener('click', function (e) {
            if (e.target === m || e.target.classList.contains('modal-backdrop')) modalCancel(m);
        });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var open = qsa(MODAL_SEL + ':not(.hidden)');
        if (open.length) { modalCancel(open[open.length - 1]); return; }
        if (STATE.currentTableId) closeOrder();
    });
    // Foco al primer campo al abrir un modal
    if (window.MutationObserver) {
        var mo = new MutationObserver(function (muts) {
            muts.forEach(function (mu) {
                var m = mu.target;
                if (!m.classList.contains('hidden') && mu.oldValue && mu.oldValue.indexOf('hidden') >= 0) {
                    m.querySelectorAll('.has-error').forEach(clearFieldError);
                    var f = m.querySelector('input:not([type=hidden]):not([readonly]), select, textarea, button');
                    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (err) { } }, 60);
                }
            });
        });
        qsa(MODAL_SEL).forEach(function (m) { mo.observe(m, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }); });
    }
    // Limpiar error de campo al escribir
    document.addEventListener('input', function (e) {
        if (e.target.classList && e.target.classList.contains('has-error')) clearFieldError(e.target);
    });

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
        document.body.classList.toggle('is-caja', savedIsServer);
        chkIsServer.addEventListener('change', function (e) {
            PrinterManager.isServer = e.target.checked;
            localStorage.setItem('fudo_is_server', e.target.checked);
            document.body.classList.toggle('is-caja', e.target.checked);
            renderTables();
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
        qsa('.connection-status').forEach(function (indicator) {
            indicator.textContent = STATE.isConnected ? 'En línea' : 'Sin conexión';
            indicator.classList.toggle('is-offline', !STATE.isConnected);
        });
        document.body.classList.toggle('is-offline', !STATE.isConnected);
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
        STATE.loaded.tables = true;
        if (CURRENT_ROLE === 'barista') renderKDS();
        else renderTables();

        // Print Server Logic: marca solo el campo `printed` de cada comanda
        if (PrinterManager.isServer) {
            STATE.tables.forEach(function (t) {
                var upd = {};
                t.tickets.forEach(function (tk, i) {
                    if (tk.status === 'pending' && tk.printed === false) {
                        PrinterManager.enqueueJob(t.name, tk.items, t.id, tk.id);
                        tk.printed = true;
                        upd['tickets/' + i + '/printed'] = true;
                    }
                });
                if (Object.keys(upd).length) {
                    db.ref('tables/' + t.id).update(upd).catch(function (e) { console.error(e); });
                }
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
        toast('Error de conexión a Mesas: ' + error.message, 'error');
    });

    db.ref('menu').on('value', function (snapshot) {
        var rawMenu = snapshot.val() || {};
        STATE.menuKeys = Object.keys(rawMenu);
        STATE.menu = STATE.menuKeys.map(function (k) { return rawMenu[k]; });
        STATE.loaded.menu = true;
        renderMenu();
        // Los totales de las mesas dependen de los precios: redibujar al cargar el menú
        if (CURRENT_ROLE === 'barista') renderKDS(); else renderTables();
        if (STATE.currentTableId) renderOrderMenu();
        if ($('view-balance') && $('view-balance').classList.contains('active')) {
            renderBalance();
        }
    }, function (error) {
        toast('Error de conexión a Menú: ' + error.message, 'error');
    });

    db.ref('history').on('value', function (snapshot) {
        var rawVal = snapshot.val() || {};
        STATE.history = Object.keys(rawVal).map(function (key) {
            var h = rawVal[key];
            h.firebaseKey = key;
            if (h.items && !Array.isArray(h.items)) h.items = Object.values(h.items);
            return h;
        });
        STATE.loaded.history = true;
        renderHistory();
        updateDaily();
        renderBestSellersChart();
    }, function (error) {
        toast('Error de conexión a Historial: ' + error.message, 'error');
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
        toast('Error de conexión a Ingredientes: ' + error.message, 'error');
    });

    db.ref('customers').on('value', function (snapshot) {
        var rawVal = snapshot.val() || {};
        STATE.customers = Object.keys(rawVal).map(function (key) {
            var c = rawVal[key];
            if (typeof c === 'object' && c !== null) {
                c.id = key;
                return c;
            }
            return { id: key, name: 'Socio', stamps: 0 };
        });
        STATE.loaded.customers = true;
        renderLoyalty();
    }, function (error) {
        console.error('Error de conexión a Clientes: ' + error.message);
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
// withBestSellers: solo el panel de pedido ofrece la pseudo-categoría "Más vendidos"
function getCats(withBestSellers) {
    var s = {};
    STATE.menu.forEach(function (p) { s[p.category || 'General'] = true; });
    return (withBestSellers ? ['Todos', 'Más vendidos'] : ['Todos']).concat(Object.keys(s));
}
// opts: { title, okText, variant: 'danger' | 'primary' }
function showConfirm(msg, cb, opts) {
    opts = opts || {};
    $('modal-confirm-message').textContent = msg;
    var title = $('modal-confirm-title');
    if (title) title.textContent = opts.title || (opts.variant === 'primary' ? 'Confirmar' : '¿Estás seguro?');
    var ok = $('btn-confirm-ok');
    ok.textContent = opts.okText || 'Eliminar';
    ok.className = 'btn ' + (opts.variant === 'primary' ? 'btn-primary' : 'btn-danger');
    confirmCb = cb;
    $('modal-confirm').classList.remove('hidden');
}
// Error de validación junto al campo
function fieldError(id, msg) {
    var el = $(id);
    if (!el) { toast(msg, 'error'); return; }
    clearFieldError(el);
    el.classList.add('has-error');
    el.setAttribute('aria-invalid', 'true');
    var m = document.createElement('div');
    m.className = 'field-error';
    m.textContent = msg;
    el.insertAdjacentElement('afterend', m);
    el.focus();
}
function clearFieldError(el) {
    el.classList.remove('has-error');
    el.removeAttribute('aria-invalid');
    var n = el.nextElementSibling;
    if (n && n.classList.contains('field-error')) n.parentNode.removeChild(n);
}
// Ícono del sprite SVG definido en index.html
function icon(name, size) {
    var s = size || 18;
    return '<svg class="icon" width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}
function stampDotsHtml(stamps) {
    var h = '<span class="stamp-dots" aria-hidden="true">';
    for (var i = 1; i <= 10; i++) h += '<i class="' + (i <= stamps ? 'on' : '') + '"></i>';
    return h + '</span>';
}
function timeAgo(ts) {
    var mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return mins + ' min';
    return Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
}

function applyRole() {
    var sidebar = $('sidebar');
    document.body.classList.toggle('role-barista', CURRENT_ROLE === 'barista');
    if (CURRENT_ROLE === 'barista') {
        if (sidebar) sidebar.style.display = 'none';
        qsa('.view').forEach(function (v) { v.classList.remove('active'); });
        var viewKds = $('view-kds');
        if (viewKds) viewKds.classList.add('active');
        renderKDS();
    } else {
        if (sidebar) sidebar.style.display = '';
        qsa('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === 'tables'); });
        qsa('.view').forEach(function (v) { v.classList.remove('active'); });
        var viewTables = $('view-tables');
        if (viewTables) viewTables.classList.add('active');
        renderTables();
    }
}

function emptyState(iconName, title, hint, centered) {
    return '<div class="empty-state' + (centered ? ' empty-state-centered' : '') + '">' +
        '<span class="empty-state-icon">' + icon(iconName, 28) + '</span>' +
        '<strong>' + title + '</strong>' + (hint ? '<span>' + hint + '</span>' : '') + '</div>';
}
function skeletonCards(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="skeleton skeleton-card" aria-hidden="true"></div>';
    return h;
}

// =================== Tables ===================
function renderTables() {
    var canvasSalon = $('canvas-salon');
    var canvasTerraza = $('canvas-terraza');
    var gridSalon = $('grid-salon');
    var gridTerraza = $('grid-terraza');
    var gridPendientes = $('grid-pendientes');
    
    if (canvasSalon) canvasSalon.innerHTML = '';
    if (canvasTerraza) canvasTerraza.innerHTML = '';
    if (gridSalon) gridSalon.innerHTML = '';
    if (gridTerraza) gridTerraza.innerHTML = '';
    if (gridPendientes) gridPendientes.innerHTML = '';
    
    var isCaja = PrinterManager.isServer;
    document.body.classList.toggle('is-caja', isCaja);
    
    var tabSalon = $('tab-zone-salon');
    var tabTerraza = $('tab-zone-terraza');
    if (tabSalon && tabTerraza) {
        if (isCaja) {
            tabSalon.textContent = 'Salón';
            // Hide Terraza tab in caja mode
            tabTerraza.style.display = 'none';
            if (activeZone === 'terraza') {
                activeZone = 'salon';
                tabTerraza.classList.remove('active');
                tabSalon.classList.add('active');
                var secTerraza = $('zone-section-terraza');
                var secSalon = $('zone-section-salon');
                if (secTerraza) secTerraza.style.display = 'none';
                if (secSalon) secSalon.style.display = 'block';
            }
        } else {
            tabSalon.textContent = 'Salón';
            tabTerraza.textContent = 'Terraza';
            tabTerraza.style.display = '';
        }
    }

    var salonCount = 0;
    var terrazaCount = 0;
    var pendientesCount = 0;

    STATE.tables.forEach(function (table) {
        var type = table.type || 'table';
        if (type === 'sofa' && !isCaja) return;
        var zoneKey = (table.zone || 'salon').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        if (zoneKey === 'salon') salonCount++;
        else if (zoneKey === 'terraza') terrazaCount++;
        else if (zoneKey === 'pendientes') pendientesCount++;
    });

    if (!STATE.loaded.tables) {
        [gridSalon, gridTerraza, gridPendientes].forEach(function (g) { if (g) g.innerHTML = skeletonCards(6); });
        return;
    }

    if (isCaja) {
        if (activeZone === 'salon' && salonCount === 0 && canvasSalon) {
            canvasSalon.innerHTML = emptyState('table', 'El salón está vacío', 'Toca "Nueva mesa" para dibujar el plano.', true);
        }
        if (activeZone === 'terraza' && terrazaCount === 0 && canvasTerraza) {
            canvasTerraza.innerHTML = emptyState('sun', 'La terraza está vacía', 'Toca "Nueva mesa" para agregar una.', true);
        }
        if (activeZone === 'pendientes' && pendientesCount === 0 && gridPendientes) {
            gridPendientes.innerHTML = emptyState('clock', 'Sin pedidos pendientes', 'Los pedidos para llevar aparecerán aquí.');
        }
    } else {
        if (salonCount === 0 && gridSalon) {
            gridSalon.innerHTML = emptyState('table', 'No hay mesas en el salón', 'Toca "Nueva mesa" para crear la primera.');
        }
        if (terrazaCount === 0 && gridTerraza) {
            gridTerraza.innerHTML = emptyState('sun', 'No hay mesas en la terraza', 'Toca "Nueva mesa" para crear la primera.');
        }
        if (pendientesCount === 0 && gridPendientes) {
            gridPendientes.innerHTML = emptyState('clock', 'Sin pedidos pendientes', 'Los pedidos para llevar aparecerán aquí.');
        }
    }

    STATE.tables.forEach(function (table) {
        var zoneKey = (table.zone || 'salon').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
        var type = table.type || 'table';
        if (type === 'sofa' && !isCaja) return;
        
        if (isCaja && zoneKey !== activeZone) return;

        var total = calcTotals(table.order, table.discount, table.tip).total;
        var itemCount = table.order.reduce(function (s, it) { return s + (it.qty || 0); }, 0);
        var pendingTk = (table.tickets || []).filter(function (tk) { return tk.status === 'pending'; });
        var oldestPending = pendingTk.length ? Math.min.apply(null, pendingTk.map(function (tk) { return tk.timestamp; })) : 0;

        var bandejaLista = table.tickets && table.tickets.some(function (tk) {
            return tk.status === 'pending' && tk.items.every(function (it) { return it.done; });
        });

        var d = document.createElement('div');
        d.className = 'table-card' + (bandejaLista ? ' bandeja-lista' : '');
        d.setAttribute('data-status', table.status || 'free');
        var type = table.type || 'table';
        d.setAttribute('data-type', type);

        var iconName = type === 'sofa' ? 'sofa' : type === 'bar' ? 'bar' : type === 'round' ? 'round' : (zoneKey === 'terraza' ? 'sun' : 'table');
        var isFree = (table.status || 'free') === 'free';
        var statusLabel = type === 'sofa' ? 'Decorativo' : bandejaLista ? 'Lista' : isFree ? 'Libre' : 'Ocupada';
        var safeName = escapeHtml(table.name);
        var safeId = escapeHtml(table.id);

        var meta = '';
        if (type !== 'sofa' && !isFree) {
            meta = '<div class="table-meta">' +
                '<span>' + itemCount + (itemCount === 1 ? ' ítem' : ' ítems') + '</span>' +
                (oldestPending ? '<span class="table-wait">' + icon('clock', 12) + ' ' + timeAgo(oldestPending) + '</span>' : '') +
                '</div>';
        }

        d.setAttribute('role', 'button');
        d.setAttribute('tabindex', type === 'sofa' ? '-1' : '0');
        d.setAttribute('aria-label', table.name + ', ' + statusLabel + (isFree ? '' : ', ' + fmt(total)));

        d.innerHTML =
            '<div class="drag-handle" aria-hidden="true">' + icon('grip', 14) + '</div>' +
            '<div class="table-card-top">' +
                '<span class="table-icon">' + icon(iconName, 20) + '</span>' +
                '<span class="table-status-chip">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="table-info"><div class="table-name">' + safeName + '</div>' +
            (type === 'sofa' ? '' : '<div class="table-amount">' + (isFree ? '&nbsp;' : fmt(total)) + '</div>') +
            meta + '</div>' +
            '<div class="table-actions">' +
                '<button class="btn-table-edit" data-id="' + safeId + '" aria-label="Editar ' + safeName + '" title="Editar">' + icon('edit', 16) + '</button>' +
                '<button class="btn-table-delete" data-id="' + safeId + '" aria-label="Eliminar ' + safeName + '" title="Eliminar">' + icon('trash', 16) + '</button>' +
            '</div>';

        if (isCaja && (zoneKey === 'salon' || zoneKey === 'terraza')) {
            var w, h;
            if (type === 'round') {
                var radius = table.radius || 10;
                w = radius * 2;
                var canvas = document.querySelector('.floor-plan-canvas');
                var ratio = 16 / 9;
                if (canvas && canvas.clientWidth && canvas.clientHeight) {
                    ratio = canvas.clientWidth / canvas.clientHeight;
                }
                h = w * ratio;
            } else {
                w = table.w || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 14);
                h = table.h || (type === 'bar' ? 10 : type === 'sofa' ? 10 : 13);
            }
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
                    
                    // Capture pointer for reliable mobile drag
                    handle.setPointerCapture(e.pointerId);
                    
                    // Prevent parent scroll while dragging
                    var viewEl = d.closest('.view');
                    var prevOverflow = '';
                    if (viewEl) {
                        prevOverflow = viewEl.style.overflowY;
                        viewEl.style.overflowY = 'hidden';
                    }

                    function onPointerMove(moveEvent) {
                        moveEvent.preventDefault();
                        var dx = moveEvent.clientX - startX;
                        var dy = moveEvent.clientY - startY;
                        
                        var pctDx = (dx / rect.width) * 100;
                        var pctDy = (dy / rect.height) * 100;
                        
                        var newX = Math.max(0, Math.min(100 - w, initX + pctDx));
                        var newY = Math.max(0, Math.min(100 - h, initY + pctDy));
                        
                        // Use 2 decimal places for smooth sub-pixel movement
                        newX = Math.round(newX * 100) / 100;
                        newY = Math.round(newY * 100) / 100;
                        
                        d.style.left = newX + '%';
                        d.style.top = newY + '%';
                        
                        table.x = newX;
                        table.y = newY;
                    }

                    function onPointerUp(upEvent) {
                        try { handle.releasePointerCapture(upEvent.pointerId); } catch (err) { }
                        document.removeEventListener('pointermove', onPointerMove);
                        document.removeEventListener('pointerup', onPointerUp);
                        document.removeEventListener('pointercancel', onPointerUp);
                        d.style.zIndex = '';

                        // Restore parent scroll
                        if (viewEl) {
                            viewEl.style.overflowY = prevOverflow;
                        }

                        // Round to 1 decimal for storage
                        table.x = Math.round(table.x * 10) / 10;
                        table.y = Math.round(table.y * 10) / 10;
                        saveTable(table, ['x', 'y']);
                    }

                    document.addEventListener('pointermove', onPointerMove);
                    document.addEventListener('pointerup', onPointerUp);
                    document.addEventListener('pointercancel', onPointerUp);
                });
            }
        }

        // Long-press to show edit/delete on mobile
        (function (card) {
            var lpTimer = null;
            var startX = 0, startY = 0;
            card._wasLongPressed = false;

            card.addEventListener('pointerdown', function (e) {
                if (e.target.closest('.drag-handle') || e.target.closest('.btn-table-edit') || e.target.closest('.btn-table-delete')) return;
                startX = e.clientX;
                startY = e.clientY;
                card._wasLongPressed = false;
                lpTimer = setTimeout(function () {
                    // Remove long-pressed from all other cards
                    document.querySelectorAll('.table-card.long-pressed').forEach(function (c) {
                        if (c !== card) c.classList.remove('long-pressed');
                    });
                    card.classList.add('long-pressed');
                    card._wasLongPressed = true;
                }, 600);
            });

            card.addEventListener('pointermove', function (e) {
                if (lpTimer) {
                    var dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
                    if (dist > 10) { // Cancel only if finger moved more than 10px
                        clearTimeout(lpTimer);
                        lpTimer = null;
                    }
                }
            });

            card.addEventListener('pointerup', function () {
                if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            });

            card.addEventListener('pointercancel', function () {
                if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            });
        })(d);
        d.addEventListener('click', function (e) {
            if (d._wasLongPressed) {
                d._wasLongPressed = false;
                return;
            }
            if (!e.target.closest('.btn-table-delete') &&
                !e.target.closest('.btn-table-edit') &&
                !e.target.closest('.drag-handle')) {
                if (type !== 'sofa') {
                    openOrder(table.id);
                }
            }
        });
        d.addEventListener('keydown', function (e) {
            if ((e.key === 'Enter' || e.key === ' ') && e.target === d && type !== 'sofa') {
                e.preventDefault();
                openOrder(table.id);
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
            var whRow = $('input-table-wh-row');
            var radiusRow = $('input-table-radius-row');
            if (type === 'round') {
                if (whRow) whRow.style.display = 'none';
                if (radiusRow) radiusRow.style.display = 'block';
                $('input-table-radius').value = table.radius || 10;
            } else {
                if (whRow) whRow.style.display = 'flex';
                if (radiusRow) radiusRow.style.display = 'none';
                $('input-table-w').value = table.w || (type === 'bar' ? 20 : type === 'sofa' ? 18 : 12);
                $('input-table-h').value = table.h || (type === 'bar' ? 14 : type === 'sofa' ? 14 : 18);
            }
            $('input-table-tip').checked = !!table.tip;
            $('input-table-tip-container').style.display = (type === 'sofa') ? 'none' : 'block';
            $('modal-table').classList.remove('hidden');
        });

        var del = d.querySelector('.btn-table-delete');
        del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (type !== 'sofa' && table.status !== 'free') {
                toast('La mesa está ocupada; cóbrala o vacíala antes de eliminarla.', 'error');
                return;
            }
            showConfirm('¿Eliminar "' + table.name + '"?', function () {
                STATE.tables = STATE.tables.filter(function (x) { return x.id !== table.id; });
                deleteTable(table.id); 
                renderTables();
            });
        });

        if (zoneKey === 'salon') {
            if (isCaja) {
                if (canvasSalon) canvasSalon.appendChild(d);
            } else {
                if (gridSalon) gridSalon.appendChild(d);
            }
        } else if (zoneKey === 'terraza') {
            if (isCaja) {
                if (canvasTerraza) canvasTerraza.appendChild(d);
            } else {
                if (gridTerraza) gridTerraza.appendChild(d);
            }
        } else if (zoneKey === 'pendientes') {
            if (gridPendientes) gridPendientes.appendChild(d);
        }
    });
}

// Dismiss long-pressed state when tapping outside a table card
document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.table-card')) {
        document.querySelectorAll('.table-card.long-pressed').forEach(function (c) {
            c.classList.remove('long-pressed');
        });
    }
});

// =================== Order Panel ===================
function setOrderTab(tab) {
    var panel = $('order-panel');
    if (!panel) return;
    panel.setAttribute('data-tab', tab);
    qsa('.order-tab').forEach(function (t) {
        var on = t.getAttribute('data-order-tab') === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}
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
    $('order-discount-select').value = (t.discount || 0).toString();
    // Mesa con pedido: abrir en "Pedido"; mesa libre: en "Agregar"
    setOrderTab(t.order.length ? 'order' : 'menu');
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
// Productos más vendidos según el historial (se recalcula solo si cambian ventas o menú)
var BEST_SELLERS_LIMIT = 12;
var _bestSellersCache = { key: '', list: [] };
function getBestSellers() {
    var key = STATE.history.length + '|' + STATE.menu.length;
    if (_bestSellersCache.key === key) return _bestSellersCache.list;
    var byId = {}, byName = {};
    STATE.history.forEach(function (h) {
        (h.items || []).forEach(function (i) {
            if (isAdjustmentLine(i)) return;
            if (i.productId) byId[i.productId] = (byId[i.productId] || 0) + (i.qty || 0);
            else byName[i.name] = (byName[i.name] || 0) + (i.qty || 0);
        });
    });
    var ranked = STATE.menu.map(function (p) {
        return { p: p, qty: (byId[p.id] || 0) + (byName[p.name] || 0) };
    }).filter(function (x) { return x.qty > 0; })
      .sort(function (a, b) { return b.qty - a.qty; })
      .map(function (x) { return x.p; })
      .slice(0, BEST_SELLERS_LIMIT);
    // Sin historial todavía: mostrar los primeros productos de la carta
    if (ranked.length === 0) ranked = STATE.menu.slice(0, BEST_SELLERS_LIMIT);
    _bestSellersCache = { key: key, list: ranked };
    return ranked;
}
function normalizeText(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function renderOrderMenu() {
    var c = $('order-menu-items');
    c.innerHTML = '';
    var q = normalizeText(($('order-search').value || '').trim());
    var label = $('order-menu-label');
    var items;
    if (q) {
        // Buscando: toda la carta (sin acentos: "cafe" encuentra "Café")
        // Por categoría solo con 4+ letras ("dulce"), para que "te" no traiga todo "Cafetería"
        items = STATE.menu.filter(function (p) {
            return normalizeText(p.name).indexOf(q) >= 0 || (q.length >= 4 && normalizeText(p.category).indexOf(q) >= 0);
        });
        if (label) label.textContent = items.length ? 'Resultados (' + items.length + ')' : 'Resultados';
    } else {
        items = getBestSellers();
        if (label) label.textContent = 'Más vendidos';
    }
    if (items.length === 0) { c.innerHTML = '<div class="muted-note">Sin resultados. Prueba con otra palabra.</div>'; return; }
    var t = getTable();
    items.forEach(function (p) {
        var inOrder = t ? t.order.find(function (x) { return x.productId === p.id; }) : null;
        var r = document.createElement('button');
        r.type = 'button';
        r.className = 'menu-item-row' + (inOrder ? ' in-order' : '');
        r.innerHTML = '<span class="item-row-name">' + escapeHtml(p.name) + '</span>' +
            (inOrder ? '<span class="item-row-qty">' + inOrder.qty + '</span>' : '') +
            '<span class="item-row-price">' + fmt(p.price) + '</span>' +
            '<span class="item-row-add" aria-hidden="true">' + icon('plus', 16) + '</span>';
        r.setAttribute('aria-label', 'Agregar ' + p.name + ', ' + fmt(p.price));
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
    saveTable(t, ['order', 'status']); renderTables(); renderOrderItems(); renderOrderMenu();
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
        saveTable(t, ['order', 'status']); renderTables(); renderOrderItems(); renderOrderMenu();
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
    var countEl = $('order-items-count');
    if (t.order.length === 0) {
        c.innerHTML = emptyState('cup', 'Pedido vacío', 'Toca un producto del menú para agregarlo.');
        $('order-total').textContent = fmt(0);
        $('order-subtotal-row').style.display = 'none';
        $('order-discount-row').style.display = 'none';
        $('order-tip-row').style.display = 'none';
        if (countEl) countEl.textContent = '';
        return;
    }
    var n = 0;
    t.order.forEach(function (it) {
        var p = STATE.menu.find(function (x) { return x.id === it.productId; });
        if (!p) return;
        n += it.qty;
        var sub = p.price * it.qty;
        var el = document.createElement('div');
        el.className = 'order-item';
        el.innerHTML = '<div class="order-item-info"><div class="order-item-name">' + escapeHtml(p.name) + '</div><div class="order-item-price">' + fmt(p.price) + ' c/u</div></div>' +
            '<div class="order-item-controls">' +
                '<button class="qty-btn btn-m" aria-label="Quitar uno de ' + escapeHtml(p.name) + '">' + icon(it.qty === 1 ? 'trash' : 'minus', 16) + '</button>' +
                '<span class="item-qty">' + it.qty + '</span>' +
                '<button class="qty-btn btn-p" aria-label="Agregar uno de ' + escapeHtml(p.name) + '">' + icon('plus', 16) + '</button>' +
            '</div>' +
            '<span class="item-total">' + fmt(sub) + '</span>';
        el.querySelector('.btn-m').addEventListener('click', function () { changeQty(it.productId, -1); });
        el.querySelector('.btn-p').addEventListener('click', function () { changeQty(it.productId, 1); });
        c.appendChild(el);
    });
    if (countEl) countEl.textContent = n + (n === 1 ? ' ítem' : ' ítems');
    var tot = calcTotals(t.order, t.discount, t.tip);

    // Show breakdown rows in footer
    var hasDiscount = tot.discountPct > 0;
    var hasTip = t.tip;
    var showBreakdown = hasDiscount || hasTip;

    $('order-subtotal-row').style.display = showBreakdown ? 'flex' : 'none';
    $('order-subtotal').textContent = fmt(tot.subtotal);

    $('order-discount-row').style.display = hasDiscount ? 'flex' : 'none';
    $('order-discount-pct').textContent = tot.discountPct;
    $('order-discount-amount').textContent = fmt(-tot.discountAmt);

    $('order-tip-row').style.display = hasTip ? 'flex' : 'none';
    $('order-tip-amount').textContent = fmt(tot.tipAmt);

    $('order-total').textContent = fmt(tot.total);

    var readyTks = t.tickets ? t.tickets.filter(function (tk) {
        return tk.status === 'pending' && tk.items.every(function (it) { return it.done; });
    }) : [];

    if (readyTks.length > 0) {
        var btnDespachar = document.createElement('button');
        btnDespachar.className = 'btn btn-success btn-block btn-lg btn-dispatch';
        btnDespachar.innerHTML = icon('check', 20) + ' Despachar bandeja (' + readyTks.length + ')';
        btnDespachar.addEventListener('click', function () {
            t.tickets.forEach(function (tk) {
                if (tk.status === 'pending' && tk.items.every(function (it) { return it.done; })) {
                    tk.status = 'delivered';
                }
            });
            saveTable(t, ['tickets']);
            renderTables();
            renderOrderItems();
        });
        c.insertBefore(btnDespachar, c.firstChild);
    }
}

// =================== Menu ===================
var menuCatFilter = 'Todos';
function renderMenu() {
    renderBestSellersChart();
    var bar = $('menu-categories-bar');
    bar.innerHTML = '';
    var cats = getCats(false);
    if (cats.indexOf(menuCatFilter) < 0) menuCatFilter = 'Todos';
    cats.forEach(function (cat) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'category-pill' + (cat === menuCatFilter ? ' active' : '');
        b.setAttribute('aria-pressed', cat === menuCatFilter ? 'true' : 'false');
        b.textContent = cat;
        b.addEventListener('click', function () { menuCatFilter = cat; renderMenu(); });
        bar.appendChild(b);
    });
    var list = $('menu-products-list');
    list.innerHTML = '';
    if (!STATE.loaded.menu) { list.innerHTML = skeletonCards(8); return; }
    var prods = STATE.menu.filter(function (p) { return menuCatFilter === 'Todos' || p.category === menuCatFilter; });
    if (prods.length === 0) {
        list.innerHTML = emptyState('cup', 'Aún no hay productos', 'Toca "Nuevo producto" para armar tu carta.');
        return;
    }
    prods.forEach(function (p) {
        var c = document.createElement('div');
        c.className = 'product-card';
        c.innerHTML = '<span class="product-category-tag">' + escapeHtml(p.category) + '</span><div class="product-name">' + escapeHtml(p.name) + '</div><div class="product-price">' + fmt(p.price) + '</div>' +
            '<div class="product-actions"><button class="btn btn-outline btn-sm btn-ep">' + icon('edit', 14) + ' Editar</button>' +
            '<button class="btn btn-ghost-danger btn-sm btn-icon btn-dp" aria-label="Eliminar ' + escapeHtml(p.name) + '" title="Eliminar">' + icon('trash', 16) + '</button></div>';
        c.querySelector('.btn-ep').addEventListener('click', function () {
            STATE.editingProductId = p.id;
            $('modal-product-title').textContent = 'Editar Producto';
            $('input-product-name').value = p.name;
            $('input-product-price').value = p.price;
            $('input-product-category').value = p.category;
            $('modal-product').classList.remove('hidden');
        });
        c.querySelector('.btn-dp').addEventListener('click', function () {
            showConfirm('¿Eliminar "' + p.name + '" de la carta?', function () {
                STATE.menu = STATE.menu.filter(function (x) { return x.id !== p.id; });
                saveMenu(); renderMenu();
            });
        });
        list.appendChild(c);
    });
}

// =================== History ===================
function updateDaily() {
    var today = localDayKey(new Date());
    var total = STATE.history.filter(function (h) { return h.date && localDayKey(h.date) === today; }).reduce(function (s, h) { return s + (h.total || 0); }, 0);
    qsa('.daily-total').forEach(function (el) { el.textContent = fmt(total); });
}
// Propina de una venta (registros nuevos traen tipAmount; los antiguos, una línea)
function saleTip(h) {
    if (typeof h.tipAmount === 'number') return h.tipAmount;
    var t = 0;
    (h.items || []).forEach(function (it) { if (it.name === TIP_LINE) t += it.subtotal || 0; });
    return t;
}
function renderHistory() {
    var fd = $('history-date-filter').value;
    var fm = $('history-month-filter').value;
    var list = STATE.history.slice().reverse();
    if (fd) list = list.filter(function (h) { return h.date && localDayKey(h.date) === fd; });
    if (fm) list = list.filter(function (h) { return h.date && localDayKey(h.date, true) === fm; });
    
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
        
        saleNet -= saleTip(h);
        if (typeof h.preparationCost === 'number') {
            // La propina es del personal: no cuenta como utilidad
            totalRealUtility += (saleNet - h.preparationCost);
            countWithPrepCost++;
        }

        (h.items || []).forEach(function (it) {
            if (isAdjustmentLine(it)) return;
            var cat = it.category;
            if (!cat) {
                var p = STATE.menu.find(function (x) { return x.id === it.productId; });
                if (p) cat = p.category;
            }
            if (cat && BARISTA_CATS.indexOf(cat) >= 0) inferredPeopleInSale += it.qty;
        });
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
    var peakHourStr = peakHour !== null ? peakHour + ':00 – ' + (parseInt(peakHour) + 1) + ':00' : '-';
    
    var totalTips = 0;
    list.forEach(function (h) { totalTips += saleTip(h); });

    function card(title, value, cls, sub) {
        return '<div class="summary-card' + (cls ? ' ' + cls : '') + '"><div class="summary-title">' + title + '</div>' +
            '<div class="summary-value">' + value + '</div>' + (sub ? '<div class="summary-sub">' + sub + '</div>' : '') + '</div>';
    }
    $('history-summary').innerHTML =
        card('Total recaudado', fmt(tr), 'summary-card-hero', list.length + (list.length === 1 ? ' venta' : ' ventas')) +
        card('Utilidad real', realUtilityStr, 'is-positive', 'Sin propinas') +
        card('Propinas', fmt(totalTips)) +
        card('Ticket promedio', fmt(ticketPromedioNeto), 'span-md-2', fmt(ticketPromedioPersona) + ' por persona') +
        card('Hora pico', peakHourStr, 'span-md-2') +
        '<div class="summary-card summary-card-wide">' +
            '<div class="summary-split"><span class="summary-title">Métodos de pago</span>' +
                '<span>Efectivo <b>' + fmt(te) + '</b></span><span>Débito <b>' + fmt(td) + '</b></span><span>Crédito <b>' + fmt(tc) + '</b></span></div>' +
            '<div class="summary-split"><span class="summary-title">Por zona</span>' +
                '<span>Salón <b>' + fmt(zoneTotals['Salón'] || 0) + '</b></span><span>Terraza <b>' + fmt(zoneTotals['Terraza'] || 0) + '</b></span>' +
                '<span>Otros <b>' + fmt((zoneTotals['Pendientes'] || 0) + (zoneTotals['Otros'] || 0)) + '</b></span></div>' +
        '</div>';

    var hl = $('history-list');
    hl.innerHTML = '';
    if (!STATE.loaded.history) { hl.innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>'; return; }
    if (list.length === 0) { hl.innerHTML = emptyState('receipt', 'Sin ventas en este período', 'Cambia el filtro de fecha o registra un cobro.'); return; }
    list.forEach(function (r) {
        var d = new Date(r.date);
        var ic = (r.items || []).reduce(function (s, i) { return s + (isAdjustmentLine(i) ? 0 : i.qty); }, 0);
        var el = document.createElement('div');
        el.className = 'history-item';

        var itemTip = saleTip(r);
        var utilityVal = (typeof r.preparationCost === 'number') ? fmt(r.total - itemTip - r.preparationCost) : '-';
        var tipStr = itemTip > 0 ? '<span>Propina <b>' + fmt(itemTip) + '</b></span>' : '';

        el.innerHTML = '<div class="history-item-info"><h4>' + escapeHtml(r.tableName) + '</h4>' +
            '<div class="history-item-date">' + d.toLocaleDateString('es-CL') + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '<div class="history-item-details"><span>' + ic + (ic === 1 ? ' ítem' : ' ítems') + '</span><span class="pay-chip">' + escapeHtml(r.paymentMethod || 'Efectivo') + '</span>' + tipStr + '<span>Utilidad <b>' + utilityVal + '</b></span></div></div>' +
            '<div class="history-item-end">' +
            '<div class="history-item-total">' + fmt(r.total) + '</div>' +
            (r.firebaseKey ? '<button class="btn-history-delete" aria-label="Eliminar venta" title="Eliminar venta">' + icon('trash', 16) + '</button>' : '') +
            '</div>';

        var delBtn = el.querySelector('.btn-history-delete');
        if (delBtn) {
            delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                showConfirm('¿Eliminar esta venta del historial? Se restará de los totales diarios, mensuales y anuales.', function () {
                    db.ref('history/' + r.firebaseKey).remove().then(function () {
                        toast('Venta eliminada.', 'success');
                    }).catch(function (error) {
                        toast('Error al eliminar venta: ' + error.message, 'error');
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
            toast('Impresora vinculada a ' + role + '.', 'success');
            this.updateUI();
        } catch (e) {
            console.error(e);
            toast('Error al vincular: ' + e.message, 'error');
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
        tr.innerHTML = '<td class="ticket-td-center">' + it.qty + '</td><td class="ticket-td-left">' + escapeHtml(it.name) + '</td><td class="ticket-td-right">' + fmt(it.subtotal) + '</td>';
        tb.appendChild(tr);
    });
    $('ticket-total-amount').textContent = fmt(rec.total);

    // classList (no className) para no borrar is-caja ni role-barista
    document.body.classList.add('printing-ticket');
    window.print();
    document.body.classList.remove('printing-ticket');
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
        tr.innerHTML = '<td class="ticket-td-center" style="font-size:22px; font-weight:bold; padding:4px 0;">' + it.qty + '</td><td class="ticket-td-left" style="font-size:22px; font-weight:bold; padding:4px 0;">' + escapeHtml(it.name) + '</td>';
        tb.appendChild(tr);
    });

    document.body.classList.add('printing-comanda');
    window.print();
    document.body.classList.remove('printing-comanda');
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

    var countEl = $('kds-count');
    if (countEl) countEl.textContent = pendingTables.length ? pendingTables.length + (pendingTables.length === 1 ? ' mesa en espera' : ' mesas en espera') : '';

    if (!STATE.loaded.tables) { grid.innerHTML = skeletonCards(3); return; }
    if (pendingTables.length === 0) {
        grid.innerHTML = emptyState('check', 'Todo al día', 'Las nuevas comandas aparecerán aquí automáticamente.');
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
        var doneCount = 0, totalCount = 0;
        pt.tickets.forEach(function (tk) {
            tk.items.forEach(function (it) {
                totalCount++;
                if (it.done) doneCount++;
                itemsHtml += '<label class="kds-item' + (it.done ? ' completed' : '') + '">' +
                    '<input type="checkbox" data-tid="' + escapeHtml(t.id) + '" data-tk="' + escapeHtml(tk.id) + '" data-pid="' + escapeHtml(it.productId) + '"' + (it.done ? ' checked' : '') + '>' +
                    '<span class="kds-check" aria-hidden="true">' + icon('check', 18) + '</span>' +
                    '<span class="kds-item-qty">' + it.qty + '×</span><span class="kds-item-name">' + escapeHtml(it.name) + '</span>' +
                    '</label>';
            });
        });

        var allDone = pt.tickets.every(function (tk) { return tk.items.every(function (i) { return i.done; }); });
        var safeName = escapeHtml(t.name);

        if (allDone) {
            card.className = 'kds-card kds-ready';
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + safeName + '</span></div>' +
                '<div class="kds-ready-body">' + icon('check', 32) + '<strong>¡Bandeja lista!</strong><small>Esperando que el mesero despache</small></div>';
        } else {
            card.innerHTML = '<div class="kds-card-header"><span class="kds-card-title">' + safeName + '</span>' +
                '<span class="kds-card-time">' + icon('clock', 14) + ' ' + timeAgo(oldestTime) + '</span></div>' +
                '<div class="kds-progress"><i style="width:' + Math.round(doneCount / totalCount * 100) + '%"></i></div>' +
                '<div class="kds-items">' + itemsHtml + '</div>';

            card.querySelectorAll('input[type="checkbox"]').forEach(function (chk) {
                chk.addEventListener('change', function (e) {
                    var isChecked = e.target.checked;
                    var tid = e.target.getAttribute('data-tid');
                    var tkid = e.target.getAttribute('data-tk');
                    var pid = e.target.getAttribute('data-pid');

                    var actualTable = STATE.tables.find(function (x) { return x.id === tid; });
                    if (actualTable && actualTable.tickets) {
                        var tkIdx = actualTable.tickets.findIndex(function (x) { return x.id === tkid; });
                        var actualTk = actualTable.tickets[tkIdx];
                        if (actualTk) {
                            var itIdx = actualTk.items.findIndex(function (x) { return x.productId === pid; });
                            if (itIdx >= 0) {
                                actualTk.items[itIdx].done = isChecked;
                                // Solo el campo `done` de ese ítem
                                db.ref('tables/' + tid + '/tickets/' + tkIdx + '/items/' + itIdx + '/done').set(isChecked)
                                    .catch(function (err) { toast('Error al guardar: ' + err.message, 'error'); });
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
                if (!isAdjustmentLine(it)) {
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
        row.innerHTML = '<div class="chart-bar-label" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
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
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No se encontraron ingredientes</td></tr>';
        return;
    }

    filtered.forEach(function (ing) {
        var tr = document.createElement('tr');
        var unit = escapeHtml(ing.unit);
        tr.innerHTML = '<td class="td-strong">' + escapeHtml(ing.name) + '</td>' +
            '<td class="td-muted">' + (ing.unit === 'unidades' ? 'Unidades' : unit) + '</td>' +
            '<td class="td-num td-strong">' + fmtCost(ing.cost) + ' / ' + unit + '</td>' +
            '<td class="td-actions">' +
            '<button class="btn btn-outline btn-sm btn-edit-ing">' + icon('edit', 14) + ' Editar</button>' +
            '<button class="btn btn-ghost-danger btn-sm btn-icon btn-del-ing" aria-label="Eliminar ' + escapeHtml(ing.name) + '" title="Eliminar">' + icon('trash', 16) + '</button>' +
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
            }, { okText: 'Eliminar ingrediente' });
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
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay ingredientes en esta receta.</td></tr>';
    } else {
        recipe.forEach(function (rItem) {
            var ing = STATE.ingredients.find(function (i) { return i.id === rItem.ingredientId; });
            if (!ing) return;
            
            var costSub = rItem.qty * (ing.cost || 0);
            totalCost += costSub;

            var tr = document.createElement('tr');
            tr.innerHTML = '<td class="td-strong">' + escapeHtml(ing.name) + '</td>' +
                '<td class="td-num">' + rItem.qty + ' ' + escapeHtml(ing.unit) + '</td>' +
                '<td class="td-num td-muted">' + fmtCost(ing.cost) + '</td>' +
                '<td class="td-num td-strong">' + fmt(costSub) + '</td>' +
                '<td class="td-actions">' +
                '<button class="btn btn-ghost-danger btn-sm btn-icon btn-del-recipe-ing" aria-label="Quitar ' + escapeHtml(ing.name) + '" title="Quitar">' + icon('trash', 16) + '</button>' +
                '</td>';

            tr.querySelector('.btn-del-recipe-ing').addEventListener('click', function () {
                p.recipe = p.recipe.filter(function (x) { return x.ingredientId !== rItem.ingredientId; });
                
                var newTotal = 0;
                p.recipe.forEach(function (x) {
                    var ig = STATE.ingredients.find(function (i) { return i.id === x.ingredientId; });
                    if (ig) newTotal += x.qty * (ig.cost || 0);
                });
                p.preparationCost = newTotal;

                saveProduct(p);
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

// Recalcula costos al cambiar ingredientes. Guarda solo los productos cuyo costo
// cambió de verdad (con tolerancia a decimales), para no reescribir todo el menú
// desde cada dispositivo conectado.
function recalculateAllRecipeCosts() {
    if (!STATE.loaded.menu || !STATE.menu || !STATE.ingredients) return;
    STATE.menu.forEach(function (p) {
        var recipe = p.recipe || [];
        var totalCost = 0;
        recipe.forEach(function (rItem) {
            var ing = STATE.ingredients.find(function (i) { return i.id === rItem.ingredientId; });
            if (ing) totalCost += rItem.qty * (ing.cost || 0);
        });
        var current = typeof p.preparationCost === 'number' ? p.preparationCost : 0;
        if (recipe.length === 0 && !(current > 0)) return;
        if (Math.abs(current - totalCost) > 0.01) {
            p.preparationCost = totalCost;
            saveProduct(p);
        }
    });
}

// ==========================================================================
// CLUB DE FIDELIDAD Y GESTIÓN DE CLIENTES
// ==========================================================================
function renderLoyalty() {
    var tbody = $('loyalty-customers-body');
    if (!tbody) return;

    var q = ($('loyalty-search') ? $('loyalty-search').value : '').toLowerCase().trim();
    var qDigits = q.replace(/\D/g, '');
    var filtered = (STATE.customers || []).filter(function (c) {
        var name = (c.name || '').toLowerCase();
        var phone = (c.phone || '').toLowerCase();
        var phoneDigits = (c.phone || '').replace(/\D/g, '');
        var id = (c.id || '').toLowerCase();
        var email = (c.email || '').toLowerCase();
        return name.indexOf(q) >= 0 || phone.indexOf(q) >= 0 || id.indexOf(q) >= 0 || email.indexOf(q) >= 0 ||
               (qDigits.length >= 4 && phoneDigits.indexOf(qDigits) >= 0);
    });

    // Actualizar resumen
    var totalCustomers = (STATE.customers || []).length;
    var totalStamps = (STATE.customers || []).reduce(function (sum, c) { return sum + (c.stamps || 0); }, 0);
    var totalRewards = (STATE.customers || []).reduce(function (sum, c) { return sum + (c.rewardsClaimed || 0); }, 0);

    if ($('loyalty-total-customers')) $('loyalty-total-customers').textContent = totalCustomers;
    if ($('loyalty-total-stamps')) $('loyalty-total-stamps').textContent = totalStamps;
    if ($('loyalty-total-rewards')) $('loyalty-total-rewards').textContent = totalRewards;

    tbody.innerHTML = '';

    if (!STATE.loaded.customers) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Cargando socios…</td></tr>';
        return;
    }
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' +
            (q ? 'No se encontraron socios con esa búsqueda.' : 'Aún no hay socios. Toca "Nuevo socio" para comenzar.') +
            '</td></tr>';
        return;
    }

    filtered.forEach(function (c) {
        var stamps = c.stamps || 0;
        var tr = document.createElement('tr');
        var isRewardReady = stamps >= 10;
        var safeName = escapeHtml(c.name || 'Sin nombre');

        tr.innerHTML =
            '<td data-label="Socio">' +
                '<strong class="td-strong">' + safeName + '</strong>' +
                '<div class="td-id">ID ' + escapeHtml(c.id) + '</div>' +
            '</td>' +
            '<td data-label="Contacto">' +
                '<div>' + escapeHtml(c.phone || '-') + '</div>' +
                (c.email ? '<div class="td-muted td-small">' + escapeHtml(c.email) + '</div>' : '') +
            '</td>' +
            '<td data-label="Sellos">' +
                stampDotsHtml(stamps) +
                '<span class="stamp-badge-tag ' + (isRewardReady ? 'stamp-badge-gold' : 'stamp-badge-green') + '">' +
                    (isRewardReady ? '¡Premio listo!' : stamps + ' / 10') + '</span>' +
            '</td>' +
            '<td data-label="Canjes" class="td-center"><strong>' + (c.rewardsClaimed || 0) + '</strong></td>' +
            '<td data-label="" class="td-actions">' +
                '<button class="btn btn-primary btn-sm btn-add-stamp">' + icon('plus', 14) + ' Sello</button>' +
                (stamps > 0 ? '<button class="btn btn-outline btn-sm btn-sub-stamp" aria-label="Restar 1 sello a ' + safeName + '" title="Restar 1 sello">−1</button>' : '') +
                (isRewardReady ? '<button class="btn btn-accent btn-sm btn-redeem-reward">' + icon('gift', 14) + ' Canjear</button>' : '') +
                '<button class="btn btn-outline btn-sm btn-icon btn-edit-customer" aria-label="Editar ' + safeName + '" title="Editar">' + icon('edit', 16) + '</button>' +
                '<button class="btn btn-ghost-danger btn-sm btn-icon btn-del-customer" aria-label="Eliminar ' + safeName + '" title="Eliminar">' + icon('trash', 16) + '</button>' +
            '</td>';

        // Eventos
        tr.querySelector('.btn-add-stamp').addEventListener('click', function () {
            addCustomerStamp(c.id, 1);
        });

        var subBtn = tr.querySelector('.btn-sub-stamp');
        if (subBtn) {
            subBtn.addEventListener('click', function () {
                addCustomerStamp(c.id, -1);
            });
        }

        var redeemBtn = tr.querySelector('.btn-redeem-reward');
        if (redeemBtn) {
            redeemBtn.addEventListener('click', function () {
                redeemCustomerReward(c.id);
            });
        }

        tr.querySelector('.btn-edit-customer').addEventListener('click', function () {
            editCustomer(c.id);
        });

        tr.querySelector('.btn-del-customer').addEventListener('click', function () {
            showConfirm('¿Eliminar al socio ' + c.name + ' (' + c.phone + ')? Perderá sus sellos.', function () {
                db.ref('customers/' + c.id).remove().then(function () {
                    toast('Socio eliminado.', 'success');
                }).catch(function (e) {
                    toast('Error: ' + e.message, 'error');
                });
            }, { okText: 'Eliminar socio' });
        });

        tbody.appendChild(tr);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Suma/resta sellos con transaction(): toques simultáneos (o la app de clientes)
// no se pisan. Devuelve una promesa.
function addCustomerStamp(customerId, count) {
    var c = (STATE.customers || []).find(function (x) { return x.id === customerId; });
    if (!c) return Promise.resolve();
    var oldStamps = 0;

    return db.ref('customers/' + customerId + '/stamps').transaction(function (cur) {
        oldStamps = cur || 0;
        return Math.max(0, oldStamps + count);
    }).then(function (res) {
        if (!res.committed) return;
        var newStamps = res.snapshot.val() || 0;
        if (count > 0) {
            db.ref('customers/' + customerId + '/lastVisit').set(new Date().toISOString());
        }

        // Bono de referido: la primera vez que el socio pasa de 0 a 1 sello
        if (oldStamps === 0 && newStamps >= 1 && c.referredBy) {
            var referrer = (STATE.customers || []).find(function (x) { return x.referralCode === c.referredBy; });
            if (referrer) {
                db.ref('customers/' + customerId + '/referredBy').set(null);
                db.ref('customers/' + referrer.id + '/stamps').transaction(function (cur) { return (cur || 0) + 1; });
                toast('Bono de referido: 1 sello para ' + (referrer.name || 'su amigo') + '.', 'success');
            }
        }
        if (count > 0) {
            toast(newStamps >= 10 ? c.name + ' completó 10 sellos. ¡Premio listo!' : '+1 sello para ' + c.name + ' (' + newStamps + '/10)', 'success');
        }
    }).catch(function (e) {
        toast('Error al guardar sellos: ' + e.message, 'error');
    });
}

function redeemCustomerReward(customerId, onDone) {
    var c = (STATE.customers || []).find(function (x) { return x.id === customerId; });
    if (!c) return;
    if ((c.stamps || 0) < 10) {
        toast('El socio aún no tiene 10 sellos.', 'error');
        return;
    }
    showConfirm('¿Canjear el premio de ' + c.name + '? Se descontarán 10 sellos.', function () {
        var result = null;
        db.ref('customers/' + customerId).transaction(function (cur) {
            if (!cur) return cur;
            if ((cur.stamps || 0) < 10) return; // otro dispositivo ya canjeó: abortar
            var tier = cur.tier || 1;
            cur.stamps = cur.stamps - 10;
            cur.rewardsClaimed = (cur.rewardsClaimed || 0) + 1;
            if (tier < 3) { cur.tier = tier + 1; cur.starsEarned = (cur.starsEarned || 0) + 1; }
            cur.lastRewardDate = new Date().toISOString();
            cur.lastVisit = cur.lastRewardDate;
            result = { oldTier: tier, newTier: cur.tier || tier };
            return cur;
        }).then(function (res) {
            if (!res.committed || !result) {
                toast('No se pudo canjear: el socio ya no tiene 10 sellos.', 'error');
            } else if (result.newTier > result.oldTier) {
                toast('Premio canjeado. ' + c.name + ' sube a la Senda ' + (result.newTier === 2 ? 'Plata' : 'Oro') + ' ⭐', 'success');
            } else {
                toast('Premio canjeado. Se descontaron 10 sellos.', 'success');
            }
            if (onDone) onDone();
        }).catch(function (e) {
            toast('Error al canjear premio: ' + e.message, 'error');
        });
    }, { title: 'Canjear premio', okText: 'Canjear', variant: 'primary' });
}

// Normaliza un teléfono chileno a 9 dígitos (9XXXXXXXX) para comparar socios
// sin importar cómo se escribió ("+56 9 1234 5678", "912345678", "12345678"...).
function normalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length > 9) d = d.slice(-9);
    if (d.length === 8) d = '9' + d;
    return d;
}

function editCustomer(customerId) {
    var c = (STATE.customers || []).find(function (x) { return x.id === customerId; });
    if (!c) return;
    STATE.editingCustomerId = customerId;
    $('modal-customer-title').textContent = 'Editar Socio';
    $('input-customer-name').value = c.name || '';
    $('input-customer-phone').value = c.phone || '';
    $('input-customer-email').value = c.email || '';
    $('input-customer-stamps').value = c.stamps || 0;
    $('modal-customer').classList.remove('hidden');
}

// --- Configuración App Cliente ---
var STATE_APPCONFIG = { storeStatus: 'auto', cafeSemana: '', granoSemana: null, tiers: {} };
var tiersDirty = false;

function initAppConfig() {
    db.ref('settings/appConfig').on('value', function (snap) {
        var data = snap.val() || {};
        var tiersJson = JSON.stringify(data.tiers || {});
        var tiersChanged = tiersJson !== JSON.stringify(STATE_APPCONFIG.tiers);
        STATE_APPCONFIG.storeStatus = data.storeStatus || 'auto';
        STATE_APPCONFIG.cafeSemana = data.cafeSemana || '';
        STATE_APPCONFIG.granoSemana = data.granoSemana || null;
        STATE_APPCONFIG.tiers = data.tiers || {};

        var selectStatus = $('setting-store-status');
        if (selectStatus) selectStatus.value = STATE_APPCONFIG.storeStatus;

        var inputCafeSemana = $('setting-cafe-semana');
        if (inputCafeSemana && document.activeElement !== inputCafeSemana) inputCafeSemana.value = STATE_APPCONFIG.cafeSemana || '';

        var inputGranoNombre = $('setting-grano-nombre');
        if (inputGranoNombre && document.activeElement !== inputGranoNombre) inputGranoNombre.value = (STATE_APPCONFIG.granoSemana && STATE_APPCONFIG.granoSemana.nombre) || '';

        var inputGranoDesc = $('setting-grano-desc');
        if (inputGranoDesc && document.activeElement !== inputGranoDesc) inputGranoDesc.value = (STATE_APPCONFIG.granoSemana && STATE_APPCONFIG.granoSemana.desc) || '';

        // No borrar lo que se está editando en las sendas si cambió otro campo
        if (!tiersDirty && (tiersChanged || !$('tier-list-1'))) renderTiersConfig();
    });
    var tiersBox = $('tiers-config-container');
    if (tiersBox) tiersBox.addEventListener('input', function () { tiersDirty = true; });

    var btnSaveStatus = $('btn-save-store-status');
    if (btnSaveStatus) {
        btnSaveStatus.addEventListener('click', function () {
            var val = $('setting-store-status').value;
            db.ref('settings/appConfig/storeStatus').set(val).then(function() {
                toast('Estado del local actualizado.', 'success');
            }).catch(function(e) {
                toast('Error al guardar estado: ' + e.message, 'error');
            });
        });
    }

    var btnSaveCafeSemana = $('btn-save-cafe-semana');
    if (btnSaveCafeSemana) {
        btnSaveCafeSemana.addEventListener('click', function () {
            var valCafe = $('setting-cafe-semana').value;
            var valNombre = $('setting-grano-nombre') ? $('setting-grano-nombre').value : '';
            var valDesc = $('setting-grano-desc') ? $('setting-grano-desc').value : '';
            
            var updates = {
                'settings/appConfig/cafeSemana': valCafe,
                'settings/appConfig/granoSemana': { nombre: valNombre, desc: valDesc }
            };
            
            db.ref().update(updates).then(function() {
                toast('Destacados actualizados.', 'success');
            }).catch(function(e) {
                toast('Error al guardar: ' + e.message, 'error');
            });
        });
    }

    var btnSaveTiers = $('btn-save-tiers');
    if (btnSaveTiers) {
        btnSaveTiers.addEventListener('click', function () {
            var newTiers = {
                1: {}, 2: {}, 3: {}
            };
            for (var s = 1; s <= 3; s++) {
                var items = document.querySelectorAll('.tier-milestone-row[data-tier="' + s + '"]');
                items.forEach(function(row) {
                    var stampNum = parseInt(row.querySelector('.milestone-stamp').value, 10);
                    var prize = row.querySelector('.milestone-prize').value.trim();
                    if (!isNaN(stampNum) && stampNum > 0 && stampNum <= 10 && prize) {
                        newTiers[s][stampNum] = prize;
                    }
                });
            }
            tiersDirty = false;
            db.ref('settings/appConfig/tiers').set(newTiers).then(function() {
                toast('Sendas actualizadas.', 'success');
            }).catch(function(e) {
                toast('Error al guardar sendas: ' + e.message, 'error');
            });
        });
    }
}

function renderTiersConfig() {
    var container = $('tiers-config-container');
    if (!container) return;
    
    var html = '';
    var sendaNames = {1: 'Bronce (Senda 1)', 2: 'Plata (Senda 2)', 3: 'Oro (Senda 3)'};
    
    for (var s = 1; s <= 3; s++) {
        html += '<div class="tier-block tier-' + s + '">';
        html += '<h4 class="tier-title">' + sendaNames[s] + '</h4>';
        html += '<div id="tier-list-' + s + '"></div>';
        html += '<button type="button" class="btn btn-outline btn-sm btn-add-milestone" data-tier="' + s + '">' + icon('plus', 14) + ' Agregar premio intermedio</button>';
        html += '</div>';
    }
    
    container.innerHTML = html;
    
    // Fill existing data
    for (var s = 1; s <= 3; s++) {
        var tierData = STATE_APPCONFIG.tiers[s] || {};
        var tierList = $('tier-list-' + s);
        
        Object.keys(tierData).forEach(function(stampNum) {
            addMilestoneRow(tierList, s, stampNum, tierData[stampNum]);
        });
        
        // Always add a default empty row if it's completely empty
        if (Object.keys(tierData).length === 0) {
            addMilestoneRow(tierList, s, '', '');
        }
    }
    
    document.querySelectorAll('.btn-add-milestone').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tier = btn.getAttribute('data-tier');
            tiersDirty = true;
            var tierList = $('tier-list-' + tier);
            addMilestoneRow(tierList, tier, '', '');
        });
    });
}

function addMilestoneRow(container, tier, stampNum, prize) {
    var div = document.createElement('div');
    div.className = 'tier-milestone-row';
    div.setAttribute('data-tier', tier);

    div.innerHTML =
        '<input type="number" class="input-field milestone-stamp" placeholder="Sello" aria-label="Número de sello" min="1" max="10" value="' + escapeHtml(stampNum || '') + '">' +
        '<input type="text" class="input-field milestone-prize" placeholder="Descripción del premio" aria-label="Premio" value="' + escapeHtml(prize || '') + '">' +
        '<button type="button" class="btn btn-ghost-danger btn-icon btn-remove-milestone" aria-label="Quitar premio" title="Quitar">' + icon('x', 16) + '</button>';

    div.querySelector('.btn-remove-milestone').addEventListener('click', function() {
        tiersDirty = true;
        div.remove();
    });
    
    container.appendChild(div);
}

// Call initAppConfig
initAppConfig();
