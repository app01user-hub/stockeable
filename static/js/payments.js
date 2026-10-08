// -*- coding: utf-8 -*-
/**
 * payments.js - Pasarela de pagos, Algoritmo Luhn, QR Canvas e Impresión
 */

let CHECKOUT_AMOUNT = 0;
let CHECKOUT_CALLBACK = null;

function abrirPasarelaPagoSimulada(monto, callback = null) {
    CHECKOUT_AMOUNT = monto;
    CHECKOUT_CALLBACK = callback;
    
    document.getElementById('stripe-log-container').classList.add('hidden');
    document.getElementById('stripe-log').innerText = '';
    document.getElementById('card-number').value = '';
    document.getElementById('card-validation-label').innerText = 'Ingrese número';
    document.getElementById('card-validation-label').className = 'text-[9px] mt-1 block font-bold text-slate-400';
    
    cambiarMetodoPagoCheckout('card');
    document.getElementById('modal-checkout-pago').classList.remove('hidden');
}

function cerrarPasarelaPago() {
    document.getElementById('modal-checkout-pago').classList.add('hidden');
    CHECKOUT_CALLBACK = null;
}

function cambiarMetodoPagoCheckout(metodo) {
    document.getElementById('pay-form-card').classList.add('hidden');
    document.getElementById('pay-form-qr').classList.add('hidden');
    document.getElementById('pay-form-direct').classList.add('hidden');
    
    document.getElementById('tab-btn-card').className = 'w-full py-2';
    document.getElementById('tab-btn-qr').className = 'w-full py-2';
    document.getElementById('tab-btn-direct').className = 'w-full py-2';
    
    const activeBtn = document.getElementById(`tab-btn-${metodo}`);
    if (activeBtn) {
        activeBtn.className = 'w-full py-2 bg-white text-indigo-600 rounded border-b-2 border-indigo-500 font-black';
    }
    
    if (metodo === 'card') {
        document.getElementById('pay-form-card').classList.remove('hidden');
    } else if (metodo === 'qr') {
        document.getElementById('pay-form-qr').classList.remove('hidden');
        generarCodigoQRCanvas();
    } else {
        document.getElementById('pay-form-direct').classList.remove('hidden');
    }
}

// Algoritmo de Luhn para verificación de tarjetas
function validarTarjetaLuhn(numero) {
    let sum = 0;
    let alternar = false;
    // Eliminar espacios vacíos
    numero = numero.replace(/\s+/g, '');
    
    if (numero.length < 13 || isNaN(numero)) return false;
    
    for (let i = numero.length - 1; i >= 0; i--) {
        let n = parseInt(numero.charAt(i), 10);
        if (alternar) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternar = !alternar;
    }
    return (sum % 10 === 0);
}

function validarTarjetaLuhnUI() {
    const num = document.getElementById('card-number').value.trim();
    const lbl = document.getElementById('card-validation-label');
    
    if (!num) {
        lbl.innerText = 'Ingrese número';
        lbl.className = 'text-[9px] mt-1 block font-bold text-slate-400';
        return;
    }
    
    const esValido = validarTarjetaLuhn(num);
    if (esValido) {
        lbl.innerText = '✅ Tarjeta Válida (Luhn Check OK)';
        lbl.className = 'text-[9px] mt-1 block font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded';
    } else {
        lbl.innerText = '❌ Tarjeta Inválida (Algoritmo Luhn fallido)';
        lbl.className = 'text-[9px] mt-1 block font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded';
    }
}

function generarCodigoQRCanvas() {
    const canvas = document.getElementById('qr-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar un código QR didáctico mediante patrones vectoriales en Canvas
    ctx.fillStyle = '#1e293b'; // Slate 800
    ctx.fillRect(10, 10, 30, 30);
    ctx.fillRect(10, 110, 30, 30);
    ctx.fillRect(110, 10, 30, 30);
    
    ctx.clearRect(15, 15, 20, 20);
    ctx.clearRect(15, 115, 20, 20);
    ctx.clearRect(115, 15, 20, 20);
    
    ctx.fillRect(20, 20, 10, 10);
    ctx.fillRect(20, 120, 10, 10);
    ctx.fillRect(120, 20, 10, 10);
    
    // Generar laberinto de bits aleatorio para simular el cuerpo del código QR
    ctx.fillStyle = '#0f172a';
    for (let x = 10; x < 140; x += 6) {
        for (let y = 10; y < 140; y += 6) {
            // No pisar las esquinas de sincronía
            if ((x < 50 && y < 50) || (x < 50 && y > 100) || (x > 100 && y < 50)) continue;
            if (Math.random() > 0.45) {
                ctx.fillRect(x, y, 4, 4);
            }
        }
    }
    
    // Añadir marca de agua de MercadoPago / QR Oficial en el centro
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(60, 60, 30, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 75, 75);
}

async function procesarPagoDefinitivo() {
    const logsContainer = document.getElementById('stripe-log-container');
    const logArea = document.getElementById('stripe-log');
    
    // Si estamos usando tarjeta, forzar validación Luhn estricta
    const activeTabStyle = document.getElementById('tab-btn-card').className;
    const esTarjeta = activeTabStyle.includes('text-indigo-600');
    
    if (esTarjeta) {
        const num = document.getElementById('card-number').value.trim();
        if (!validarTarjetaLuhn(num)) {
            mostrarToast("El número de tarjeta no cumple las reglas del Algoritmo de Luhn", "error");
            return;
        }
    }
    
    logsContainer.classList.remove('hidden');
    logArea.innerText = `[CLIENT] -> POST Request dispatched to backend API /api/payments/charge...\n`;
    
    try {
        const res = await fetch('/api/payments/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: CHECKOUT_AMOUNT })
        });
        const r = await res.json();
        if (r.success) {
            logArea.innerText += `[SERVER] -> STATUS: 200 OK\n`;
            logArea.innerText += `[SERVER] -> CHARGE SUCCEEDED: Authorization approved!\n`;
            logArea.innerText += `[SERVER] -> ID: ${r.charge_id}\n`;
            logArea.innerText += `[SERVER] -> Network status: ${r.network_status}\n`;
            logArea.innerText += `[SERVER] -> Receipt URL: ${r.receipt_url}\n`;
            
            mostrarToast("¡Transacción autorizada y saldada!", "success");
            
            setTimeout(async () => {
                cerrarPasarelaPago();
                if (CHECKOUT_CALLBACK) {
                    await CHECKOUT_CALLBACK();
                } else {
                    // Si viene del facturador normal
                    const subtotal = parseFloat(document.getElementById('remito-val-subtotal').innerText.replace('$', ''));
                    const descuento = parseFloat(document.getElementById('remito-desc-porcentaje').value) || 0;
                    const total = parseFloat(document.getElementById('remito-val-total').innerText.replace('$', ''));
                    const metodo = document.getElementById('remito-metodo-pago').value;
                    const num = document.getElementById('documento-numero-input').value;
                    
                    const payload = {
                        fecha: document.getElementById('remito-fecha').value,
                        tipo_op: document.getElementById('remito-tipo-op').value,
                        cliente_id: CONTACTO_SELECCIONADO.id,
                        items: REMITO_ACTUAL_ITEMS,
                        subtotal: subtotal,
                        descuento: descuento,
                        total: total,
                        metodo_pago: metodo,
                        numero: num
                    };
                    await enviarDocumentoAlServidor("pedidos", payload);
                }
            }, 2500);
        }
    } catch(e) {
        logArea.innerText += `[API CLIENT] -> Error fatal conectando con el relay local: ${e}\n`;
    }
}

// Cargar saldos de Cuentas Corrientes en el Panel CC
async function cargarSaldosCC() {
    // CC Clientes
    try {
        const res = await fetch('/api/cc/clientes');
        const ccCli = await res.json();
        const tbody = document.getElementById('cc-clientes-tabla');
        if (tbody) {
            tbody.innerHTML = '';
            Object.entries(ccCli).forEach(([cid, data]) => {
                const nombre = CARTERA_CLIENTES[cid] ? CARTERA_CLIENTES[cid].nombre : cid;
                tbody.innerHTML += `
                    <tr class="border-b font-semibold text-slate-700">
                        <td class="py-2.5 px-3 truncate max-w-[150px]">${nombre}</td>
                        <td class="py-2.5 px-3 text-right font-mono font-bold ${data.saldo > 0 ? 'text-red-600 bg-red-50' : 'text-slate-500'}">$${data.saldo.toFixed(2)}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button onclick="verFichaCCCliente('${cid}')" class="text-indigo-500 hover:text-indigo-700"><i class="fa-solid fa-folder-open"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) {}
    
    // CC Proveedores
    try {
        const res = await fetch('/api/cc/proveedores');
        const ccProv = await res.json();
        const tbody = document.getElementById('cc-proveedores-tabla');
        if (tbody) {
            tbody.innerHTML = '';
            Object.entries(ccProv).forEach(([pid, data]) => {
                const nombre = CARTERA_PROVEEDORES[pid] ? CARTERA_PROVEEDORES[pid].nombre : pid;
                tbody.innerHTML += `
                    <tr class="border-b font-semibold text-slate-700">
                        <td class="py-2.5 px-3 truncate max-w-[150px]">${nombre}</td>
                        <td class="py-2.5 px-3 text-right font-mono font-bold ${data.saldo > 0 ? 'text-amber-600 bg-amber-50' : 'text-slate-500'}">$${data.saldo.toFixed(2)}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button onclick="verFichaCCProveedor('${pid}')" class="text-amber-500 hover:text-amber-700"><i class="fa-solid fa-folder-open"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) {}
}

async function verFichaCCCliente(cid) {
    const res = await fetch('/api/cc/clientes');
    const cc = await res.json();
    if (!cc[cid]) return;
    
    document.getElementById('cc-cliente-nombre-resumen').innerText = CARTERA_CLIENTES[cid] ? CARTERA_CLIENTES[cid].nombre : cid;
    const tbody = document.getElementById('tabla-cc-cliente-historial');
    tbody.innerHTML = '';
    
    cc[cid].historical.forEach(h => {
        let detalleBadge = "";
        if (h.medio_pago && h.medio_pago !== 'efectivo') {
            if (h.medio_pago === 'transferencia') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">📱 [TRANSF] Alias: ${h.transferencia_alias || '-'}, TXID: ${h.transferencia_txid || '-'}</div>`;
            } else if (h.medio_pago === 'tarjeta') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">💳 [TARJETA] Lote: ${h.tarjeta_lote || '-'}, Ult4: ${h.tarjeta_ult4 || '-'}</div>`;
            } else if (h.medio_pago === 'cheque') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">📄 [CHEQUE] Nº: ${h.cheque_num || '-'}, Banco: ${h.cheque_banco || '-'}, Venc: ${h.cheque_venc ? h.cheque_venc.split('-').reverse().join('/') : '-'}</div>`;
            }
        }
        tbody.innerHTML += `
            <tr class="border-b hover:bg-slate-100 text-slate-600 text-xs">
                <td class="py-2 px-2.5">${h.fecha.split('-').reverse().join('/')}</td>
                <td class="py-2 px-2.5">
                    <span class="font-bold">${h.concepto}</span>
                    ${detalleBadge}
                </td>
                <td class="py-2 px-2.5 text-right font-mono font-bold ${h.tipo.includes('COBRO') ? 'text-emerald-600' : 'text-red-500'}">${h.tipo.includes('COBRO') ? '-' : '+'}$${h.monto.toFixed(2)}</td>
                <td class="py-2 px-2.5 text-right font-mono font-bold">$${h.saldo_acumulado.toFixed(2)}</td>
            </tr>
        `;
    });
    
    document.getElementById('panel-ficha-cc-cliente').classList.remove('hidden');
}

function cerrarFichaCCCliente() {
    document.getElementById('panel-ficha-cc-cliente').classList.add('hidden');
}

async function verFichaCCProveedor(pid) {
    const res = await fetch('/api/cc/proveedores');
    const cc = await res.json();
    if (!cc[pid]) return;
    
    document.getElementById('cc-proveedor-nombre-resumen').innerText = CARTERA_PROVEEDORES[pid] ? CARTERA_PROVEEDORES[pid].nombre : pid;
    const tbody = document.getElementById('tabla-cc-proveedor-historial');
    tbody.innerHTML = '';
    
    cc[pid].historical.forEach(h => {
        let detalleBadge = "";
        if (h.medio_pago && h.medio_pago !== 'efectivo') {
            if (h.medio_pago === 'transferencia') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">📱 [TRANSF] Alias: ${h.transferencia_alias || '-'}, TXID: ${h.transferencia_txid || '-'}</div>`;
            } else if (h.medio_pago === 'tarjeta') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">💳 [TARJETA] Lote: ${h.tarjeta_lote || '-'}, Ult4: ${h.tarjeta_ult4 || '-'}</div>`;
            } else if (h.medio_pago === 'cheque') {
                detalleBadge = `<div class="text-[9px] text-slate-500 mt-0.5 font-semibold">📄 [CHEQUE] Nº: ${h.cheque_num || '-'}, Banco: ${h.cheque_banco || '-'}, Venc: ${h.cheque_venc ? h.cheque_venc.split('-').reverse().join('/') : '-'}</div>`;
            }
        }
        tbody.innerHTML += `
            <tr class="border-b hover:bg-slate-100 text-slate-600 text-xs">
                <td class="py-2 px-2.5">${h.fecha.split('-').reverse().join('/')}</td>
                <td class="py-2 px-2.5">
                    <span class="font-bold">${h.concepto}</span>
                    ${detalleBadge}
                </td>
                <td class="py-2 px-2.5 text-right font-mono font-bold ${h.tipo.includes('PAGO') ? 'text-emerald-600' : 'text-amber-500'}">${h.tipo.includes('PAGO') ? '-' : '+'}$${h.monto.toFixed(2)}</td>
                <td class="py-2 px-2.5 text-right font-mono font-bold">$${h.saldo_acumulado.toFixed(2)}</td>
            </tr>
        `;
    });
    
    document.getElementById('panel-ficha-cc-proveedor').classList.remove('hidden');
}

function cerrarFichaCCProveedor() {
    document.getElementById('panel-ficha-cc-proveedor').classList.add('hidden');
}

function abrirModalCobroCC() {
    const sel = document.getElementById('modal-cobro-cliente-id');
    sel.innerHTML = '';
    Object.values(CARTERA_CLIENTES).forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nombre} (${c.id})</option>`;
    });
    document.getElementById('modal-cobro-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-cobro-monto').value = '';
    document.getElementById('modal-cobro-concepto').value = 'Cobro s/Recibo';
    
    const firstVal = sel.value;
    cargarDocumentosPendientesEnModal('clientes', firstVal);
    
    document.getElementById('modal-cobro-cc').classList.remove('hidden');
}

function cerrarModalCobroCC() {
    document.getElementById('modal-cobro-cc').classList.add('hidden');
}

async function guardarCobroCC() {
    const cid = document.getElementById('modal-cobro-cliente-id').value;
    const monto = parseFloat(document.getElementById('modal-cobro-monto').value) || 0;
    const fecha = document.getElementById('modal-cobro-fecha').value;
    const concepto = document.getElementById('modal-cobro-concepto').value.trim() || 'Cobro s/Recibo';
    
    if (monto <= 0) return;
    
    const pagos_documentos = [];
    const container = document.getElementById('modal-cobro-pendientes-container');
    if (container) {
        const checked = container.querySelectorAll('.doc-pend-check:checked');
        checked.forEach(chk => {
            pagos_documentos.push({
                numero: chk.value,
                monto: parseFloat(chk.getAttribute('data-total')) || 0
            });
        });
    }
    
    try {
        const res = await fetch('/api/cc/clientes/cobro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cliente_id: cid, monto, fecha, concepto, pagos_documentos })
        });
        if (res.ok) {
            mostrarToast("Cobro acreditado y balance actualizado", "success");
            cerrarModalCobroCC();
            await cargarSaldosCC();
            cerrarFichaCCCliente();
        }
    } catch(e) {}
}

function abrirModalPagoCC() {
    const sel = document.getElementById('modal-pago-proveedor-id');
    sel.innerHTML = '';
    Object.values(CARTERA_PROVEEDORES).forEach(p => {
        sel.innerHTML += `<option value="${p.id}">${p.nombre} (${p.id})</option>`;
    });
    document.getElementById('modal-pago-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-pago-monto').value = '';
    document.getElementById('modal-pago-concepto').value = 'Pago s/Comprobante';
    
    const firstVal = sel.value;
    cargarDocumentosPendientesEnModal('proveedores', firstVal);
    
    document.getElementById('modal-pago-cc').classList.remove('hidden');
}

function cerrarModalPagoCC() {
    document.getElementById('modal-pago-cc').classList.add('hidden');
}

async function guardarPagoCC() {
    const pid = document.getElementById('modal-pago-proveedor-id').value;
    const monto = parseFloat(document.getElementById('modal-pago-monto').value) || 0;
    const fecha = document.getElementById('modal-pago-fecha').value;
    const concepto = document.getElementById('modal-pago-concepto').value.trim() || 'Pago s/Comprobante';
    
    if (monto <= 0) return;
    
    const pagos_documentos = [];
    const container = document.getElementById('modal-pago-pendientes-container');
    if (container) {
        const checked = container.querySelectorAll('.doc-pend-check:checked');
        checked.forEach(chk => {
            pagos_documentos.push({
                numero: chk.value,
                monto: parseFloat(chk.getAttribute('data-total')) || 0
            });
        });
    }
    
    try {
        const res = await fetch('/api/cc/proveedores/pago', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proveedor_id: pid, monto, fecha, concepto, pagos_documentos })
        });
        if (res.ok) {
            mostrarToast("Pago registrado y balance actualizado", "success");
            cerrarModalPagoCC();
            await cargarSaldosCC();
            cerrarFichaCCProveedor();
        }
    } catch(e) {}
}


async function cargarDocumentosPendientesEnModal(entidadTipo, id) {
    const containerId = entidadTipo === 'clientes' ? 'modal-cobro-pendientes-container' : 'modal-pago-pendientes-container';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    if (!id) {
        container.classList.add('hidden');
        return;
    }
    
    try {
        const res = await fetch(`/api/cc/${entidadTipo}/${id}/pendientes`);
        const documentos = await res.json();
        
        if (documentos.length === 0) {
            container.innerHTML = '<span class="text-[10px] text-slate-400 italic p-1 block">Sin comprobantes pendientes de pago (cc)</span>';
            container.classList.remove('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        documentos.forEach(doc => {
            container.innerHTML += `
                <label class="flex items-center justify-between p-1 bg-white border rounded hover:bg-slate-50 transition cursor-pointer text-[10px] mb-1">
                    <div class="flex items-center space-x-1.5 font-semibold text-slate-700">
                        <input type="checkbox" class="doc-pend-check rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3 w-3" value="${doc.numero}" data-total="${doc.saldo_pendiente}" onchange="recalcularMontoDesdePendientes('${entidadTipo}')">
                        <span>${doc.numero} (${doc.fecha})</span>
                    </div>
                    <div class="text-right text-slate-500">
                        <span>Pendiente: </span>
                        <span class="font-bold text-red-600">$${doc.saldo_pendiente.toFixed(2)}</span>
                    </div>
                </label>
            `;
        });
    } catch(e) {
        console.error("Error cargando documentos pendientes:", e);
    }
}

function recalcularMontoDesdePendientes(entidadTipo) {
    const containerId = entidadTipo === 'clientes' ? 'modal-cobro-pendientes-container' : 'modal-pago-pendientes-container';
    const inputMontoId = entidadTipo === 'clientes' ? 'modal-cobro-monto' : 'modal-pago-monto';
    
    const container = document.getElementById(containerId);
    const inputMonto = document.getElementById(inputMontoId);
    
    if (!container || !inputMonto) return;
    
    let total = 0.0;
    const checks = container.querySelectorAll('.doc-pend-check:checked');
    checks.forEach(chk => {
        total += parseFloat(chk.getAttribute('data-total')) || 0;
    });
    
    inputMonto.value = total > 0 ? total.toFixed(2) : '';
}

function cambiarMedioPagoCC(tipo, metodo) {
    const tDiv = document.getElementById(`${tipo}-detalles-transferencia`);
    const cDiv = document.getElementById(`${tipo}-detalles-tarjeta`);
    const qDiv = document.getElementById(`${tipo}-detalles-cheque`);
    
    if (tDiv) tDiv.classList.add('hidden');
    if (cDiv) cDiv.classList.add('hidden');
    if (qDiv) qDiv.classList.add('hidden');
    
    if (metodo === 'transferencia' && tDiv) {
        tDiv.classList.remove('hidden');
    } else if (metodo === 'tarjeta' && cDiv) {
        cDiv.classList.remove('hidden');
    } else if (metodo === 'cheque' && qDiv) {
        qDiv.classList.remove('hidden');
    }
}

async function cargarDocumentosPendientesEnModal(tipoEntidad, idEntidad) {
    const containerId = tipoEntidad === 'clientes' ? 'modal-cobro-pendientes-container' : 'modal-pago-pendientes-container';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<span class="text-slate-400 italic text-[10px]">Buscando facturas pendientes...</span>';
    container.classList.remove('hidden');
    
    try {
        const res = await fetch(`/api/cc/${tipoEntidad}/${idEntidad}/pendientes`);
        const docs = await res.json();
        
        container.innerHTML = '';
        if (docs.length === 0) {
            container.innerHTML = '<span class="text-slate-500 italic text-[10px]">Sin comprobantes pendientes de saldo.</span>';
            return;
        }
        
        docs.forEach(doc => {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between text-[11px] font-semibold text-slate-700 bg-white p-1 rounded border border-slate-200";
            
            const cbId = `cb-${tipoEntidad === 'clientes' ? 'cobro' : 'pago'}-${doc.numero}`;
            const cbClass = tipoEntidad === 'clientes' ? 'cc-cobro-doc-checkbox' : 'cc-pago-doc-checkbox';
            
            div.innerHTML = `
                <label for="${cbId}" class="flex items-center gap-1.5 cursor-pointer truncate">
                    <input type="checkbox" id="${cbId}" class="${cbClass} rounded text-indigo-600" data-doc-numero="${doc.numero}" data-doc-total="${doc.saldo_pendiente}" onchange="recalcularTotalesCheckboxCC('${tipoEntidad === 'clientes' ? 'cobro' : 'pago'}')">
                    <span class="font-mono text-indigo-600 font-bold">${doc.numero}</span> 
                    <span class="text-slate-400 text-[9px]">${doc.fecha.split('-').reverse().join('/')}</span>
                </label>
                <span class="font-mono text-slate-800 font-extrabold">$${doc.saldo_pendiente.toFixed(2)}</span>
            `;
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<span class="text-red-500 italic text-[10px]">Error cargando pendientes.</span>';
    }
}

function recalcularTotalesCheckboxCC(tipo) {
    let acumulado = 0;
    document.querySelectorAll(`.cc-${tipo}-doc-checkbox:checked`).forEach(cb => {
        acumulado += parseFloat(cb.dataset.docTotal) || 0;
    });
    const montoInput = document.getElementById(`modal-${tipo}-monto`);
    if (montoInput) {
        montoInput.value = acumulado > 0 ? acumulado.toFixed(2) : '';
    }
}
