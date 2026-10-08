// -*- coding: utf-8 -*-
/**
 * stock.js - Módulo de Gestión de Inventario y Catálogo de Productos
 */

async function cargarStockTabla() {
    const tbody = document.getElementById('tabla-stock-cuerpo');
    if (!tbody) return;
    
    try {
        const res = await fetch('/api/articulos');
        const articulos = await res.json();
        CATALOGO_ARTICULOS = articulos;
        
        tbody.innerHTML = '';
        Object.values(articulos).forEach(art => {
            const stockRojoClass = art.cantidad <= 10 ? 'text-red-600 bg-red-50 font-black border border-red-200 px-2 py-0.5 rounded' : 'font-bold';
            tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 transition text-slate-700 text-xs">
                    <td class="py-2.5 px-4 font-mono font-bold text-indigo-700">${art.codigo}</td>
                    <td class="py-2.5 px-4 font-semibold">${art.descripcion}</td>
                    <td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border">${art.familia || 'General'}</span></td>
                    <td class="py-2.5 px-4 text-center ${stockRojoClass}">${art.cantidad}</td>
                    <td class="py-2.5 px-4 text-right font-mono">$${(art.precio_costo || 0).toFixed(2)}</td>
                    <td class="py-2.5 px-4 text-right font-mono font-bold text-slate-900">$${(art.precio_venta || 0).toFixed(2)}</td>
                    <td class="py-2.5 px-4 text-center space-x-1.5 no-print">
                        <button onclick="editarArticuloModal('${art.codigo}')" class="text-indigo-500 hover:text-indigo-700 font-bold" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="eliminarArticulo('${art.codigo}')" class="text-red-500 hover:text-red-700 font-bold" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch(e) {
        console.error("Error cargando stock:", e);
    }
}

function abrirModalArticulo() {
    document.getElementById('modal-art-id').value = '';
    document.getElementById('modal-art-desc').value = '';
    document.getElementById('modal-art-cant').value = 0;
    document.getElementById('modal-art-fam').value = 'General';
    document.getElementById('modal-art-costo').value = '';
    document.getElementById('modal-art-ganancia').value = 30;
    document.getElementById('modal-art-venta').value = '';
    
    document.getElementById('modal-articulo-titulo').innerText = 'Agregar Nuevo Artículo';
    document.getElementById('modal-articulo').classList.remove('hidden');
    setTimeout(() => { const descEl = document.getElementById('modal-art-desc'); if (descEl) { descEl.focus(); descEl.select(); } }, 100);
}

function cerrarModalArticulo() {
    document.getElementById('modal-articulo').classList.add('hidden');
}

function editarArticuloModal(cod) {
    const art = CATALOGO_ARTICULOS[cod];
    if (!art) return;
    
    document.getElementById('modal-articulo-titulo').innerText = `Editar Artículo [${cod}]`;
    document.getElementById('modal-art-id').value = art.codigo;
    document.getElementById('modal-art-desc').value = art.descripcion;
    document.getElementById('modal-art-cant').value = art.cantidad;
    document.getElementById('modal-art-fam').value = art.familia;
    document.getElementById('modal-art-costo').value = art.precio_costo;
    document.getElementById('modal-art-ganancia').value = art.ganancia;
    document.getElementById('modal-art-venta').value = art.precio_venta;
    
    document.getElementById('modal-articulo').classList.remove('hidden');
    setTimeout(() => { const descEl = document.getElementById('modal-art-desc'); if (descEl) { descEl.focus(); descEl.select(); } }, 100);
}

async function guardarArticuloModal() {
    const id = document.getElementById('modal-art-id').value;
    const desc = document.getElementById('modal-art-desc').value.trim();
    const cant = parseInt(document.getElementById('modal-art-cant').value) || 0;
    const fam = document.getElementById('modal-art-fam').value.trim();
    const costo = parseFloat(document.getElementById('modal-art-costo').value) || 0;
    const ganancia = parseFloat(document.getElementById('modal-art-ganancia').value) || 0;
    const venta = parseFloat(document.getElementById('modal-art-venta').value) || 0;
    
    if (!desc) {
        mostrarToast("Ingrese la descripción del producto", "error");
        return;
    }
    
    const payload = {
        codigo: id || null,
        descripcion: desc,
        cantidad: cant,
        familia: fam,
        precio_costo: costo,
        ganancia: ganancia,
        precio_venta: venta
    };
    
    try {
        const res = await fetch('/api/articulos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("Artículo guardado correctamente", "success");
            cerrarModalArticulo();
            
            // ACTUALIZAR BASE DE DATOS LOCAL GLOBAL
            await cargarArticulos();
            
            if (typeof cargarStockTabla === 'function') {
                await cargarStockTabla();
            }
            actualizarSelectores();
            
            // Auto-seleccionar y rellenar en el documento con la cantidad creada
            const selArt = document.getElementById('remito-item-selector');
            if (selArt) {
                selArt.value = r.articulo.codigo;
                llenarCamposItemRemito();
                const cantInput = document.getElementById('form-item-cant');
                if (cantInput && r.articulo.cantidad > 0) {
                    cantInput.value = r.articulo.cantidad;
                    cantInput.focus();
                    cantInput.select();
                }
            }
        } else {
            mostrarToast(r.message || "Error guardando el artículo", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al guardar el artículo", "error");
    }
}

async function eliminarArticulo(cod) {
    if (!confirm(`¿Desea eliminar el artículo [${cod}]?`)) return;
    try {
        const res = await fetch(`/api/articulos/${cod}`, { method: 'DELETE' });
        if (res.ok) {
            mostrarToast("Artículo eliminado del catálogo", "info");
            await cargarArticulos();
            if (typeof cargarStockTabla === 'function') {
                await cargarStockTabla();
            }
            actualizarSelectores();
        } else {
            mostrarToast("Error al eliminar el artículo", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al eliminar", "error");
    }
}

function calcularVentaModal(origen) {
    const costo = parseFloat(document.getElementById('modal-art-costo').value) || 0;
    const ganancia = parseFloat(document.getElementById('modal-art-ganancia').value) || 0;
    const venta = parseFloat(document.getElementById('modal-art-venta').value) || 0;

    if (origen === 'costo' || origen === 'ganancia') {
        if (costo > 0) {
            const precioCalculado = costo * (1 + (ganancia / 100));
            document.getElementById('modal-art-venta').value = precioCalculado.toFixed(2);
        }
    } else if (origen === 'venta') {
        if (costo > 0 && venta > 0) {
            const gananciaCalculada = ((venta - costo) / costo) * 100;
            document.getElementById('modal-art-ganancia').value = gananciaCalculada.toFixed(2);
        }
    }
}
