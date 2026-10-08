// -*- coding: utf-8 -*-
/**
 * cart.js - Carrito de compra y Portal de autogestión para clientes
 */

let CARRITO_ITEMS = []; // Items en el carrito

function renderCatalogoEcommerce() {
    const grid = document.getElementById('ecommerce-productos-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const familiaEmojis = {
        "Alimentos": "🍎",
        "Limpieza": "🧹",
        "Librería": "📚",
        "Ferretería": "🛠️",
        "Herramientas": "🔧",
        "Importados": "🚢"
    };
    
    Object.values(CATALOGO_ARTICULOS).forEach(art => {
        const emoji = familiaEmojis[art.familia] || "📦";
        const sinStock = art.cantidad <= 0;
        
        grid.innerHTML += `
            <div class="bg-white rounded-2xl border border-slate-200 shadow hover:shadow-xl transition flex flex-col justify-between overflow-hidden">
                <div class="p-5 space-y-3">
                    <div class="flex justify-between items-start">
                        <span class="text-4xl select-none bg-slate-50 p-2 rounded-xl border">${emoji}</span>
                        <span class="bg-slate-100 text-slate-500 font-mono text-[9px] tracking-wider py-1 px-2.5 rounded-full border">#${art.codigo}</span>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-slate-800 text-sm truncate" title="${art.descripcion}">${art.descripcion}</h4>
                        <span class="text-[9px] font-black text-indigo-500 tracking-wider uppercase">${art.familia}</span>
                    </div>
                    <div class="flex justify-between items-baseline pt-1">
                        <span class="text-indigo-600 font-mono font-black text-base">$${art.precio_venta.toFixed(2)}</span>
                        <span class="text-[10px] font-bold ${sinStock ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded' : 'text-slate-400'}">Disp: ${art.cantidad}</span>
                    </div>
                </div>
                <div class="p-4 border-t border-slate-100 no-print">
                    <button onclick="agregarAlCarrito('${art.codigo}')" ${sinStock ? 'disabled' : ''} class="w-full font-bold uppercase tracking-wider text-[10px] py-2 px-3 rounded-lg text-white transition flex justify-center items-center gap-1.5 shadow ${sinStock ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}">
                        <i class="fa-solid fa-cart-plus"></i> Añadir al Carrito
                    </button>
                </div>
            </div>
        `;
    });
    
    actualizarContadorCarrito();
}

function agregarAlCarrito(cod) {
    const art = CATALOGO_ARTICULOS[cod];
    if (!art) return;
    
    const exist = CARRITO_ITEMS.find(i => i.codigo === cod);
    const cant_actual = exist ? exist.cantidad : 0;
    
    if (art.cantidad <= cant_actual) {
        mostrarToast(`No disponemos de más stock para ${art.descripcion}`, "error");
        return;
    }
    
    if (exist) {
        exist.cantidad += 1;
        exist.importe = exist.cantidad * exist.precio_unitario;
    } else {
        CARRITO_ITEMS.push({
            codigo: cod,
            descripcion: art.descripcion,
            cantidad: 1,
            precio_unitario: art.precio_venta,
            importe: art.precio_venta
        });
    }
    
    actualizarContadorCarrito();
    mostrarToast(`Se agregó ${art.descripcion} al carrito`, "success");
}

function actualizarContadorCarrito() {
    const total_cant = CARRITO_ITEMS.reduce((sum, i) => sum + i.cantidad, 0);
    const counterBtn = document.getElementById('cart-counter-btn');
    const badge = document.getElementById('cart-badge');
    
    if (counterBtn) counterBtn.innerText = total_cant;
    if (badge) {
        badge.innerText = total_cant;
        if (total_cant > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }
}

function abrirCarritoCheckout() {
    const tbody = document.getElementById('carrito-cuerpo-items');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (CARRITO_ITEMS.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-slate-400 font-medium italic">
                    <i class="fa-solid fa-cart-arrow-down text-3xl mb-1 text-slate-300 block"></i>
                    Su carrito de compras se encuentra vacío.
                </td>
            </tr>
        `;
        document.getElementById('carrito-val-total').innerText = '$0.00';
    } else {
        CARRITO_ITEMS.forEach((item, idx) => {
            tbody.innerHTML += `
                <tr class="border-b font-semibold text-slate-700">
                    <td class="py-2.5 px-3 truncate max-w-[150px]">${item.descripcion}</td>
                    <td class="py-2.5 px-3 text-center font-bold">${item.cantidad}</td>
                    <td class="py-2.5 px-3 text-right font-mono">$${item.precio_unitario.toFixed(2)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold">$${item.importe.toFixed(2)}</td>
                    <td class="py-2.5 px-3 text-center">
                        <button onclick="quitarDelCarrito(${idx})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `;
        });
        
        const total = CARRITO_ITEMS.reduce((sum, i) => sum + i.importe, 0);
        document.getElementById('carrito-val-total').innerText = `$${total.toFixed(2)}`;
    }
    
    document.getElementById('modal-carrito-checkout').classList.remove('hidden');
}

function cerrarCarritoCheckout() {
    document.getElementById('modal-carrito-checkout').classList.add('hidden');
}

function quitarDelCarrito(idx) {
    CARRITO_ITEMS.splice(idx, 1);
    abrirCarritoCheckout();
    actualizarContadorCarrito();
    renderCatalogoEcommerce();
}

async function enviarPedidoDesdeCarrito() {
    if (CARRITO_ITEMS.length === 0) return;
    
    const total = parseFloat(document.getElementById('carrito-val-total').innerText.replace('$', ''));
    const metodo = document.getElementById('carrito-metodo-pago').value;
    
    const payload = {
        tipo_op: "VENTA",
        cliente_id: USUARIO_ACTIVO.cliente_id,
        items: CARRITO_ITEMS,
        subtotal: total,
        descuento: 0,
        total: total,
        metodo_pago: metodo,
        estado: "PENDIENTE" // Los pedidos e-commerce ingresan como pendientes de aprobacion
    };
    
    // Si elige pagar online con tarjeta, se simula Stripe académicamente
    if (metodo === 'tarjeta') {
        cerrarCarritoCheckout();
        abrirPasarelaPagoSimulada(total, async () => {
            // Callback en el exito de Stripe
            await enviarPedidoFinalAlServidor(payload);
        });
        return;
    }
    
    await enviarPedidoFinalAlServidor(payload);
}

async function enviarPedidoFinalAlServidor(payload) {
    try {
        const res = await fetch('/api/documentos/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("¡Pedido enviado correctamente! Pendiente de aprobación comercial.", "success");
            CARRITO_ITEMS = [];
            actualizarContCounter();
            cerrarCarritoCheckout();
            await actualizarTodo();
        }
    } catch(e) {}
}

function actualizarContCounter() {
    CARRITO_ITEMS = [];
    actualizarContadorCarrito();
}
