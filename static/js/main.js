
function formatearFecha(fechaStr) {
    if (!fechaStr || fechaStr === '-') return '-';
    const clean = fechaStr.split('T')[0].split(' ')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
        const yyyy = parts[0];
        const mm = parts[1];
        const dd = parts[2];
        const yy = yyyy.length === 4 ? yyyy.substring(2) : yyyy;
        return `${dd}/${mm}/${yy}`;
    }
    return fechaStr;
}

// -*- coding: utf-8 -*-
/**
 * main.js - Core interactivo WYSIWYG de Facturación, Autocompletado y Control de Acceso
 */

let CATALOGO_ARTICULOS = {};
let CARTERA_CLIENTES = {};
let CARTERA_PROVEEDORES = {};
let REMITO_ACTUAL_ITEMS = []; // Ítems cargados en el comprobante actual
let USUARIO_ACTIVO = null;
let CONTACTO_SELECCIONADO = null; // Cliente o Proveedor actual vinculado al documento

document.addEventListener('DOMContentLoaded', async () => {

    // --- ATAJOS TECLADO COMPROBANTE ---
    const metodoPagoSel = document.getElementById('remito-metodo-pago');
    if (metodoPagoSel) {
        metodoPagoSel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const descInput = document.getElementById('remito-desc-porcentaje');
                if (descInput) {
                    descInput.focus();
                    descInput.select();
                }
            }
        });
    }

    const descInput = document.getElementById('remito-desc-porcentaje');
    if (descInput) {
        descInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                guardarComprobanteDefinitivo();
            }
        });
    }

    if (SESION_INICIAL) {
        configurarSesionActiva(SESION_INICIAL);
        await actualizarTodo();
    }
    
    // Configurar fecha de hoy por defecto
    const hoy = new Date().toISOString().split('T')[0];
    const inputFecha = document.getElementById('remito-fecha');
    if (inputFecha) inputFecha.value = hoy;
    
    // Ocultar sugerencias si se hace clic afuera
    document.addEventListener('click', (e) => {
        const suggest = document.getElementById('documento-contacto-suggest');
        if (suggest && e.target.id !== 'documento-contacto-nombre') {
            suggest.classList.add('hidden');
        }
    });

    // Atajo de teclado 'Enter' secuencial para cargar artículos e ir a Condición de Venta
    const selItem = document.getElementById('remito-item-selector');
    if (selItem) {
        selItem.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === 'Add') {
                e.preventDefault();
                if (typeof abrirModalArticulo === 'function') {
                    abrirModalArticulo();
                }
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                if (e.key === 'Tab' && !selItem.value) {
                    // Allow normal tab or jump to payment method
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                }
                
                if (!selItem.value) {
                    const metodoPagoSel = document.getElementById('remito-metodo-pago');
                    if (metodoPagoSel) {
                        metodoPagoSel.focus();
                        mostrarToast("Carga de artículos finalizada. Pasando a Condición de Venta.", "info");
                    }
                } else {
                    const cantInput = document.getElementById('form-item-cant');
                    if (cantInput) cantInput.focus();
                }
            }
            // ArrowDown and ArrowUp are not intercepted so native dropdown navigation works!
        });
    }

    const cantInput = document.getElementById('form-item-cant');
    if (cantInput) {
        cantInput.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === 'Add') {
                e.preventDefault();
                if (typeof abrirModalArticulo === 'function') abrirModalArticulo();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const priceInput = document.getElementById('form-item-precio-u');
                if (priceInput) priceInput.focus();
            }
        });
    }

    const priceInput = document.getElementById('form-item-precio-u');
    if (priceInput) {
        priceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                agregarItemARemito();
                if (selItem) selItem.focus();
            }
        });
    }
});

function configurarSesionActiva(sesion) {
    USUARIO_ACTIVO = sesion;
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('pantalla-app').classList.remove('hidden');
    
    document.getElementById('sesion-usr-nombre').innerText = sesion.nombre;
    document.getElementById('sesion-usr-rol').innerText = sesion.rol;
    
    // Control de visibilidad del Panel Master y Pestañas
    const btnMaster = document.getElementById('btn-tab-master');
    if (sesion.rol === 'superadmin') {
        if (btnMaster) {
            btnMaster.classList.remove('hidden');
            cambiarPestana('master');
        }
    } else if (sesion.rol === 'cliente') {
        if (btnMaster) btnMaster.classList.add('hidden');
        document.getElementById('btn-tab-remito')?.classList.add('hidden');
        document.getElementById('btn-tab-stock')?.classList.add('hidden');
        document.getElementById('btn-tab-clientes')?.classList.add('hidden');
        document.getElementById('btn-tab-proveedores')?.classList.add('hidden');
        document.getElementById('btn-tab-cc')?.classList.add('hidden');
        document.getElementById('btn-tab-informes')?.classList.add('hidden');
        
        const btnCart = document.getElementById('btn-tab-carrito');
        if (btnCart) btnCart.classList.remove('hidden');
        cambiarPestana('carrito');
    } else {
        if (btnMaster) btnMaster.classList.add('hidden');
        document.getElementById('btn-tab-remito')?.classList.remove('hidden');
        document.getElementById('btn-tab-stock')?.classList.remove('hidden');
        document.getElementById('btn-tab-clientes')?.classList.remove('hidden');
        document.getElementById('btn-tab-proveedores')?.classList.remove('hidden');
        document.getElementById('btn-tab-cc')?.classList.remove('hidden');
        document.getElementById('btn-tab-informes')?.classList.remove('hidden');
        document.getElementById('btn-tab-carrito')?.classList.add('hidden');
        
        cambiarPestana('remito');
    }
}

async function ejecutarLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const uEl = document.getElementById('login-user');
    const pEl = document.getElementById('login-pass');
    if (!uEl || !pEl) return;
    
    const username = uEl.value.trim();
    const password = pEl.value.trim();
    
    if (!username || !password) {
        mostrarToast("Ingrese usuario y contraseña", "error");
        return;
    }
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("¡Ingreso exitoso! Bienvenido.", "success");
            configurarSesionActiva(r.usuario);
            try {
                await actualizarTodo();
            } catch(eTodo) {
                console.warn("Error en actualizarTodo:", eTodo);
            }
        } else {
            mostrarToast(r.message || "Credenciales inválidas", "error");
        }
    } catch (err) {
        console.error("Error en ejecutarLogin:", err);
        mostrarToast("Error de conexión con el servidor", "error");
    }
}

async function ejecutarLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        mostrarToast("Sesión finalizada correctamente.", "info");
        setTimeout(() => location.reload(), 1000);
    } catch(err) {
        location.reload();
    }
}

async function actualizarTodo() {
    await cargarArticulos();
    await cargarClientes();
    await cargarProveedores();
    await cargarConfigBranding(); // Teñir y configurar marca
    actualizarSelectores();
    actualizarTipoComprobante();
    if (typeof cargarStockTabla === 'function') await cargarStockTabla();
    if (typeof renderCatalogoEcommerce === 'function') renderCatalogoEcommerce();
    if (typeof configurarColumnasReporte === 'function') configurarColumnasReporte();
}

// --- CONFIGURACIÓN DE BRANDING INLINE (V2.0) ---
async function cargarConfigBranding() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        document.getElementById('branding-nombre').innerText = config.nombre_negocio;
        document.getElementById('remito-brand-name').innerText = config.nombre_negocio;
        
        // Renderizar logo por URL o Emoji
        const headerLogo = document.getElementById('branding-logo');
        const paperLogo = document.getElementById('remito-papel-logo-emoji');
        if (config.logo_url && config.logo_url.trim() !== '') {
            if (headerLogo) headerLogo.innerHTML = `<img src="${config.logo_url}" class="h-8 w-8 object-contain rounded inline-block" alt="Logo">`;
            if (paperLogo) paperLogo.innerHTML = `<img src="${config.logo_url}" class="h-10 w-10 object-contain rounded inline-block" alt="Logo">`;
        } else {
            if (headerLogo) headerLogo.innerHTML = config.logo_emoji || "📦";
            if (paperLogo) paperLogo.innerHTML = config.logo_emoji || "📦";
        }
        
        // Renderizar subtítulo y domicilio/CUIT en el papel
        const paperSub = document.getElementById('remito-brand-subtitulo');
        const paperDom = document.getElementById('remito-brand-domicilio');
        if (paperSub) paperSub.innerText = config.subtitulo_negocio || 'Distribuidor Comercial Multi-Rubro Modular';
        if (paperDom) paperDom.innerText = config.domicilio_negocio || 'Domicilio Comercial de Práctica 123 • Buenos Aires • CUIT 30-12345678-9';
        
        aplicarTemaColor(config.tema_color);
        
        // Cargar valores en el modal por si se abre
        document.getElementById('brand-input-nombre').value = config.nombre_negocio;
        document.getElementById('brand-input-emoji').value = config.logo_emoji;
        document.getElementById('brand-input-subtitulo').value = config.subtitulo_negocio || '';
        document.getElementById('brand-input-domicilio').value = config.domicilio_negocio || '';
        document.getElementById('brand-input-logourl').value = config.logo_url || '';
    } catch(e) {
        console.error("Error cargando branding:", e);
    }
}

function aplicarTemaColor(color) {
    const root = document.documentElement;
    const temas = {
        indigo: { primary: '#4f46e5', hover: '#4338ca', light: '#e0e7ff', accent: '#6366f1' },
        emerald: { primary: '#059669', hover: '#047857', light: '#d1fae5', accent: '#10b981' },
        rose: { primary: '#e11d48', hover: '#be123c', light: '#ffe4e6', accent: '#f43f5e' },
        amber: { primary: '#d97706', hover: '#b45309', light: '#fef3c7', accent: '#f59e0b' },
        slate: { primary: '#475569', hover: '#334155', light: '#f1f5f9', accent: '#64748b' },
        cyan: { primary: '#0891b2', hover: '#0e7490', light: '#ecfeff', accent: '#06b6d4' }
    };
    const t = temas[color] || temas.indigo;
    root.style.setProperty('--theme-primary', t.primary);
    root.style.setProperty('--theme-primary-hover', t.hover);
    root.style.setProperty('--theme-primary-light', t.light);
    root.style.setProperty('--theme-accent', t.accent);
}

function abrirModalBranding() {
    if (USUARIO_ACTIVO?.rol === 'admin' || USUARIO_ACTIVO?.rol === 'superadmin') {
        document.getElementById('modal-branding-inline').classList.remove('hidden');
    }
}

function cerrarModalBranding() {
    document.getElementById('modal-branding-inline').classList.add('hidden');
}

async function guardarConfiguracionBranding() {
    const nombre = document.getElementById('brand-input-nombre').value.trim();
    const emoji = document.getElementById('brand-input-emoji').value;
    const subtitulo = document.getElementById('brand-input-subtitulo').value.trim();
    const domicilio = document.getElementById('brand-input-domicilio').value.trim();
    const logourl = document.getElementById('brand-input-logourl').value.trim();
    const gmailUser = document.getElementById('brand-input-gmail-user') ? document.getElementById('brand-input-gmail-user').value.trim() : '';
    const gmailPass = document.getElementById('brand-input-gmail-pass') ? document.getElementById('brand-input-gmail-pass').value.trim() : '';
    
    if (!nombre) {
        mostrarToast("El nombre no puede estar vacío", "error");
        return;
    }
    
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nombre_negocio: nombre, 
                logo_emoji: emoji,
                subtitulo_negocio: subtitulo,
                domicilio_negocio: domicilio,
                logo_url: logourl,
                gmail_user: gmailUser,
                gmail_app_password: gmailPass
            })
        });
        if (res.ok) {
            mostrarToast("Identidad de marca actualizada con éxito", "success");
            await cargarConfigBranding();
            cerrarModalBranding();
        } else {
            mostrarToast("Error de permisos al guardar la identidad", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al guardar identidad", "error");
    }
}

async function guardarTemaColor(color) {
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tema_color: color })
        });
        if (res.ok) {
            mostrarToast(`Tema cambiado a ${color}`, "success");
            await cargarConfigBranding();
        }
    } catch(e) {}
}

// --- AUTOCOMPLETADO E HISTORIAL DINÁMICO ---
function buscarContactoInline() {
    const input = document.getElementById('documento-contacto-nombre');
    const query = input.value.trim().toLowerCase();
    const suggest = document.getElementById('documento-contacto-suggest');
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    
    suggest.innerHTML = '';
    
    if (!query) {
        suggest.classList.add('hidden');
        document.getElementById('documento-contacto-crear-accion').classList.add('hidden');
        return;
    }
    
    const base = isVenta ? CARTERA_CLIENTES : CARTERA_PROVEEDORES;
    const coincidencias = Object.values(base).filter(c => c.nombre.toLowerCase().includes(query));
    
    if (coincidencias.length === 0) {
        suggest.classList.add('hidden');
        // Mostrar botón de creación rápida inline
        document.getElementById('documento-contacto-crear-accion').classList.remove('hidden');
        CONTACTO_SELECCIONADO = null;
        limpiarHistorialDocumentos();
        return;
    }
    
    document.getElementById('documento-contacto-crear-accion').classList.add('hidden');
    suggest.classList.remove('hidden');
    
    coincidencias.forEach(c => {
        const div = document.createElement('div');
        div.className = "p-2.5 hover:bg-slate-100 cursor-pointer transition";
        div.innerText = `${c.nombre} (${c.id})`;
        div.onclick = () => seleccionarContactoInline(c);
        suggest.appendChild(div);
    });
}

function seleccionarContactoInline(contacto) {
    CONTACTO_SELECCIONADO = contacto;
    document.getElementById('documento-contacto-nombre').value = contacto.nombre;
    document.getElementById('documento-contacto-suggest').classList.add('hidden');
    document.getElementById('documento-contacto-crear-accion').classList.add('hidden');
    
    cargarHistorialDocumentos(contacto.id);
}

function limpiarHistorialDocumentos() {
    document.getElementById('documento-historial-comprobantes').innerHTML = '<span class="text-slate-400 italic">No hay historial disponible.</span>';
}

async function cargarHistorialDocumentos(contactoId) {
    const tipoDoc = document.getElementById('doc-tipo-comprobante').value;
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    
    try {
        const res = await fetch(`/api/documentos/${tipoDoc}`);
        const documentos = await res.json();
        
        // Filtrar documentos del contacto actual
        const filtrados = documentos.filter(doc => {
            return isVenta ? doc.cliente_id === contactoId : doc.proveedor_id === contactoId;
        });
        
        const contenedor = document.getElementById('documento-historial-comprobantes');
        contenedor.innerHTML = '';
        
        if (filtrados.length === 0) {
            contenedor.innerHTML = '<span class="text-slate-400 italic">Sin documentos cargados.</span>';
            return;
        }
        
        // Mostrar los últimos 3 documentos para facilidad de carga
        filtrados.slice(-3).reverse().forEach(doc => {
            const btn = document.createElement('button');
            btn.className = "block w-full text-left p-1 rounded bg-slate-100 hover:bg-theme-primary hover:text-white transition truncate mb-1";
            btn.innerText = `📄 ${doc.numero} - Total: $${doc.total.toFixed(2)}`;
            btn.onclick = () => cargarDocumentoEnPantalla(doc);
            contenedor.appendChild(btn);
        });
    } catch(e) {}
}

async function cargarDocumentoEnPantalla(doc) {
    if (!doc) return;
    const fEl = document.getElementById('remito-fecha');
    if (fEl) fEl.value = doc.fecha || new Date().toISOString().split('T')[0];
    
    const mEl = document.getElementById('remito-metodo-pago');
    if (mEl) mEl.value = doc.metodo_pago || 'efectivo';
    
    const dEl = document.getElementById('remito-desc-porcentaje');
    if (dEl) dEl.value = doc.descuento || 0;
    
    const nEl = document.getElementById('documento-numero-input');
    if (nEl) nEl.value = doc.numero || '';
    
    const tipoDocEl = document.getElementById('doc-tipo-comprobante');
    if (tipoDocEl) {
        if (doc.numero.startsWith('PED')) tipoDocEl.value = 'pedidos';
        else if (doc.numero.startsWith('PRE')) tipoDocEl.value = 'presupuestos';
        else tipoDocEl.value = 'remitos';
    }
    
    const tipoOpEl = document.getElementById('remito-tipo-op');
    if (tipoOpEl) tipoOpEl.value = doc.tipo || 'VENTA';
    
    // Set client / supplier name
    const isVenta = (doc.tipo === 'VENTA');
    const cId = isVenta ? doc.cliente_id : doc.proveedor_id;
    if (cId) {
        const base = isVenta ? CARTERA_CLIENTES : CARTERA_PROVEEDORES;
        if (base[cId]) {
            seleccionarContactoInline(base[cId]);
        } else {
            const nameEl = document.getElementById('documento-contacto-nombre');
            if (nameEl) nameEl.value = cId;
        }
    }
    
    REMITO_ACTUAL_ITEMS = (doc.items || []).map(i => ({...i}));
    renderTablaRemito();
    cambiarPestana('remito');
    mostrarToast(`Cargado en pantalla ${doc.numero}`, "info");
}

async function guardarContactoInlineRapido() {
    const nombre = document.getElementById('documento-contacto-nombre').value.trim();
    if (!nombre) return;
    
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    const endpoint = isVenta ? '/api/clientes' : '/api/proveedores';
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre })
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("Contacto registrado correctamente en base de datos", "success");
            if (isVenta) {
                await cargarClientes();
                seleccionarContactoInline(r.cliente);
            } else {
                await cargarProveedores();
                seleccionarContactoInline(r.proveedor);
            }
        }
    } catch(e) {}
}

// --- WYSIWYG CALCULADORA DE ITEMS INLINE ---
function actualizarTipoComprobante() {
    const docTipoEl = document.getElementById('doc-tipo-comprobante');
    if (!docTipoEl) return;
    const tipoDoc = docTipoEl.value;
    const isRemito = (tipoDoc === 'remitos');
    const isPresupuesto = (tipoDoc === 'presupuestos');
    
    // Folio / Número de documento
    const numInput = document.getElementById('documento-numero-input');
    if (numInput) {
        if (isRemito) {
            numInput.readOnly = false;
            numInput.placeholder = "REM-XXXX (Editable)";
        } else {
            numInput.readOnly = true;
            numInput.placeholder = tipoDoc === 'pedidos' ? "PED-XXXX" : "PRE-XXXX";
        }
    }
    
    // Visibilidad del botón de conversión
    const btnConvertir = document.getElementById('btn-convertir-comprobante');
    if (btnConvertir) {
        if (isPresupuesto && REMITO_ACTUAL_ITEMS.length > 0) {
            btnConvertir.classList.remove('hidden');
        } else {
            btnConvertir.classList.add('hidden');
        }
    }
    
    getSiguienteFolioSimulado(tipoDoc);
    if (CONTACTO_SELECCIONADO) {
        cargarHistorialDocumentos(CONTACTO_SELECCIONADO.id);
    }
}

async function getSiguienteFolioSimulado(tipoDoc) {
    try {
        const res = await fetch(`/api/documentos/${tipoDoc}`);
        const documentos = await res.json();
        const prefijos = { presupuestos: "PRE", pedidos: "PED", remitos: "REM" };
        const pref = prefijos[tipoDoc];
        const numInput = document.getElementById('documento-numero-input');
        if (numInput && (tipoDoc !== 'remitos' || !numInput.value)) {
            numInput.value = `${pref}-${(documentos.length + 1).toString().padStart(4, '0')}`;
        }
    } catch(e) {}
}

function actualizarTipoOperacion() {
    const tipoEl = document.getElementById('remito-tipo-op');
    if (!tipoEl) return;
    const tipo = tipoEl.value;
    const isVenta = (tipo === 'VENTA');
    
    const rolLabel = document.getElementById('remito-contacto-rol');
    if (rolLabel) rolLabel.innerText = isVenta ? "DATOS DEL CLIENTE" : "DATOS DEL PROVEEDOR";
    
    const cNombre = document.getElementById('documento-contacto-nombre');
    if (cNombre) cNombre.value = '';
    CONTACTO_SELECCIONADO = null;
    limpiarHistorialDocumentos();
    
    // Limpiar carrito de la factura actual
    REMITO_ACTUAL_ITEMS = [];
    renderTablaRemito();
    actualizarSelectores();
}

function actualizarSelectores() {
    const opEl = document.getElementById('remito-tipo-op');
    const isVenta = opEl ? opEl.value === 'VENTA' : true;
    const selArt = document.getElementById('remito-item-selector');
    if (selArt) {
        selArt.innerHTML = '<option value="">-- Seleccione Artículo --</option>';
        selArt.innerHTML += '<option value="__NUEVO_ARTICULO__" class="text-indigo-600 font-bold bg-indigo-50 font-semibold">✨ + [Crear Nuevo Artículo en Catálogo...]</option>';
        Object.values(CATALOGO_ARTICULOS).forEach(art => {
            const precioSugerido = isVenta ? art.precio_venta : art.precio_costo;
            selArt.innerHTML += `<option value="${art.codigo}">${art.descripcion} (${art.codigo}) - Sugerido: $${precioSugerido} - Stock: ${art.cantidad}</option>`;
        });
    }
}

function llenarCamposItemRemito() {
    const cod = document.getElementById('remito-item-selector').value;
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    
    if (cod === '__NUEVO_ARTICULO__') {
        document.getElementById('remito-item-selector').value = '';
        if (typeof abrirModalArticulo === 'function') {
            abrirModalArticulo();
        } else {
            mostrarToast("El módulo de stock no está activo para crear artículos.", "error");
        }
        return;
    }
    
    if (cod && CATALOGO_ARTICULOS[cod]) {
        const art = CATALOGO_ARTICULOS[cod];
        document.getElementById('form-item-codigo-val').innerText = art.codigo;
        document.getElementById('form-item-precio-u').value = isVenta ? art.precio_venta : art.precio_costo;
        document.getElementById('form-item-cant').value = 1;
        
        const importeVal = document.getElementById('form-item-importe-val');
        if (importeVal) importeVal.innerText = `$${(isVenta ? art.precio_venta : art.precio_costo).toFixed(2)}`;
    } else {
        document.getElementById('form-item-codigo-val').innerText = '--';
        document.getElementById('form-item-precio-u').value = '';
        document.getElementById('form-item-cant').value = 1;
        document.getElementById('form-item-importe-val').innerText = '$0.00';
    }
}

function agregarItemARemito() {
    const cod = document.getElementById('remito-item-selector').value;
    const cant = parseInt(document.getElementById('form-item-cant').value) || 0;
    const precio = parseFloat(document.getElementById('form-item-precio-u').value) || 0;
    
    if (!cod || cant <= 0 || precio <= 0) {
        mostrarToast("Complete el artículo, cantidad y precio válido", "error");
        return;
    }
    
    const art = CATALOGO_ARTICULOS[cod];
    const tipoOp = document.getElementById('remito-tipo-op').value;
    const tipoDoc = document.getElementById('doc-tipo-comprobante').value;
    
    // Validar stock si es venta y el documento es un Remito físico (único que mueve mercadería)
    if (tipoOp === 'VENTA' && tipoDoc === 'remitos') {
        const exist = REMITO_ACTUAL_ITEMS.find(i => i.codigo === cod);
        const demandada = cant + (exist ? exist.cantidad : 0);
        if (art.cantidad < demandada) {
            mostrarToast(`Stock insuficiente de ${art.descripcion}. Disp: ${art.cantidad}`, "error");
            return;
        }
    }
    
    const index = REMITO_ACTUAL_ITEMS.findIndex(i => i.codigo === cod);
    if (index !== -1) {
        REMITO_ACTUAL_ITEMS[index].cantidad += cant;
        REMITO_ACTUAL_ITEMS[index].precio_unitario = precio;
        REMITO_ACTUAL_ITEMS[index].importe = REMITO_ACTUAL_ITEMS[index].cantidad * precio;
    } else {
        REMITO_ACTUAL_ITEMS.push({
            codigo: cod,
            descripcion: art.descripcion,
            cantidad: cant,
            precio_unitario: precio,
            importe: cant * precio
        });
    }
    
    document.getElementById('remito-item-selector').value = '';
    llenarCamposItemRemito();
    renderTablaRemito();
    mostrarToast("Artículo cargado en la planilla", "success");
}

function eliminarItemDelRemito(idx) {
    REMITO_ACTUAL_ITEMS.splice(idx, 1);
    renderTablaRemito();
}

function recalcularFilaInline(idx, nuevaCantidad, nuevoPrecio) {
    const cant = parseInt(nuevaCantidad) || 0;
    const precio = parseFloat(nuevoPrecio) || 0;
    
    if (cant > 0 && precio > 0) {
        REMITO_ACTUAL_ITEMS[idx].cantidad = cant;
        REMITO_ACTUAL_ITEMS[idx].precio_unitario = precio;
        REMITO_ACTUAL_ITEMS[idx].importe = cant * precio;
        
        // Recalcular importe visible de forma asíncrona sin renderizar de nuevo todo
        document.getElementById(`importe-fila-${idx}`).innerText = `$${(cant * precio).toFixed(2)}`;
        calcularTotalesRemito();
    }
}

function renderTablaRemito() {
    const tbody = document.getElementById('remito-cuerpo-tabla');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (REMITO_ACTUAL_ITEMS.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-12 text-slate-400 font-medium italic">
                    <i class="fa-solid fa-file-signature text-4xl mb-2 block text-slate-300"></i>
                    El comprobante se encuentra vacío. Añada filas desde el selector de abajo.
                </td>
            </tr>
        `;
        calcularTotalesRemito();
        return;
    }
    
    const isVendedor = (USUARIO_ACTIVO?.rol === 'vendedor');
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    
    REMITO_ACTUAL_ITEMS.forEach((item, idx) => {
        // En base a rol, el precio unitario puede ser modificable o no
        const priceReadOnly = (isVendedor && isVenta) ? 'readonly class="w-full border rounded p-1 text-xs text-right font-mono text-slate-500 bg-slate-50 border-transparent"' : 'class="w-full border rounded p-1 text-xs text-right font-mono bg-white text-slate-800"';
        
        tbody.innerHTML += `
            <tr class="border-b hover:bg-slate-50/50 text-slate-700 text-xs">
                <td class="py-2 px-3 font-mono font-bold text-indigo-700">${item.codigo}</td>
                <td class="py-2 px-3 font-semibold">${item.descripcion}</td>
                <td class="py-2 px-3">
                    <input type="number" min="1" id="cant-fila-input-${idx}" value="${item.cantidad}" oninput="recalcularFilaInline(${idx}, this.value, document.getElementById('precio-fila-input-${idx}').value)" class="w-16 border rounded p-1 text-xs text-center font-bold bg-white text-slate-700">
                </td>
                <td class="py-2 px-3">
                    <input type="number" step="0.01" id="precio-fila-input-${idx}" value="${item.precio_unitario}" oninput="recalcularFilaInline(${idx}, document.getElementById('cant-fila-input-${idx}').value, this.value)" ${priceReadOnly}>
                </td>
                <td class="py-2 px-3 text-right font-mono font-bold text-slate-900" id="importe-fila-${idx}">$${item.importe.toFixed(2)}</td>
                <td class="py-2 px-3 text-center no-print">
                    <button onclick="eliminarItemDelRemito(${idx})" class="text-red-500 hover:text-red-700 transition">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Mostrar boton de conversion si es un Presupuesto
    const tipoDoc = document.getElementById('doc-tipo-comprobante').value;
    const btnConvertir = document.getElementById('btn-convertir-comprobante');
    if (tipoDoc === 'presupuestos') {
        btnConvertir.classList.remove('hidden');
    } else {
        btnConvertir.classList.add('hidden');
    }
    
    calcularTotalesRemito();
}

function calcularTotalesRemito() {
    const subtotal = REMITO_ACTUAL_ITEMS.reduce((sum, i) => sum + i.importe, 0);
    const descPct = parseFloat(document.getElementById('remito-desc-porcentaje')?.value || 0);
    const descMonto = subtotal * (descPct / 100);
    const total = subtotal - descMonto;
    
    document.getElementById('remito-val-subtotal').innerText = `$${subtotal.toFixed(2)}`;
    document.getElementById('remito-val-total').innerText = `$${total.toFixed(2)}`;
    
    const pPct = document.getElementById('remito-print-desc-pct');
    if (pPct) {
        pPct.innerText = descPct;
        document.getElementById('remito-print-desc-monto').innerText = `-$${descMonto.toFixed(2)}`;
    }
}

function limpiarRemito() {
    REMITO_ACTUAL_ITEMS = [];
    document.getElementById('remito-desc-porcentaje').value = 0;
    document.getElementById('documento-contacto-nombre').value = '';
    CONTACTO_SELECCIONADO = null;
    limpiarHistorialDocumentos();
    
    renderTablaRemito();
    actualizarTipoComprobante();
}

async function guardarComprobanteDefinitivo() {
    if (REMITO_ACTUAL_ITEMS.length === 0) {
        mostrarToast("No hay artículos cargados en la hoja de firmas", "error");
        return;
    }
    
    const inputNombre = document.getElementById('documento-contacto-nombre').value.trim();
    if (!inputNombre) {
        mostrarToast("Ingrese la Razón Social / Identidad del contacto para este comprobante", "error");
        return;
    }
    
    const isVenta = document.getElementById('remito-tipo-op').value === 'VENTA';
    const base = isVenta ? CARTERA_CLIENTES : CARTERA_PROVEEDORES;
    
    // 1. Intentar buscar coincidencia exacta
    let matched = Object.values(base).find(c => c.nombre.toLowerCase() === inputNombre.toLowerCase());
    
    if (matched) {
        CONTACTO_SELECCIONADO = matched;
    } else {
        // 2. Si no existe, ¡Darle de alta automáticamente ("Alta Tanto al Cliente como al nuevo documento completamente")!
        mostrarToast("Contacto nuevo detectado. Registrando en base de datos...", "info");
        try {
            const endpoint = isVenta ? '/api/clientes' : '/api/proveedores';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: inputNombre })
            });
            const r = await res.json();
            if (r.success) {
                if (isVenta) {
                    await cargarClientes();
                    matched = r.cliente;
                } else {
                    await cargarProveedores();
                    matched = r.proveedor;
                }
                CONTACTO_SELECCIONADO = matched;
                mostrarToast(`Contacto ${matched.nombre} registrado de forma automática`, "success");
            } else {
                mostrarToast("No se pudo registrar el contacto de forma automática", "error");
                return;
            }
        } catch(e) {
            mostrarToast("Error de conexión al registrar contacto automáticamente", "error");
            return;
        }
    }
    
    const tipoDoc = document.getElementById('doc-tipo-comprobante').value;
    const tipoOp = document.getElementById('remito-tipo-op').value;
    const subtotal = parseFloat(document.getElementById('remito-val-subtotal').innerText.replace('$', ''));
    const descuento = parseFloat(document.getElementById('remito-desc-porcentaje').value) || 0;
    const total = parseFloat(document.getElementById('remito-val-total').innerText.replace('$', ''));
    const metodo = document.getElementById('remito-metodo-pago').value;
    const numero_manual = document.getElementById('documento-numero-input').value.trim();
    
    const payload = {
        fecha: document.getElementById('remito-fecha').value,
        tipo_op: tipoOp,
        cliente_id: tipoOp === 'VENTA' ? CONTACTO_SELECCIONADO.id : null,
        proveedor_id: tipoOp === 'COMPRA' ? CONTACTO_SELECCIONADO.id : null,
        items: REMITO_ACTUAL_ITEMS,
        subtotal: subtotal,
        descuento: descuento,
        total: total,
        metodo_pago: metodo,
        numero: numero_manual
    };
    
    // Si es un pedido de tipo Tarjeta, simular Stripe primero de forma académica
    if (tipoDoc === 'pedidos' && metodo === 'tarjeta') {
        abrirPasarelaPagoSimulada(total, async () => {
            await enviarDocumentoAlServidor(tipoDoc, payload);
        });
        return;
    }
    
    // Proceder con el guardado normal
    await enviarDocumentoAlServidor(tipoDoc, payload);
}

async function enviarDocumentoAlServidor(tipoDoc, payload) {
    try {
        const res = await fetch(`/api/documentos/${tipoDoc}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast(`¡Comprobante ${r.documento.numero} guardado con éxito!`, "success");
            limpiarRemito();
            await actualizarTodo();
        } else {
            mostrarToast(r.message, "error");
        }
    } catch(err) {
        mostrarToast("Error enviando el comprobante", "error");
    }
}

async function ejecutarConversionPresupuesto() {
    const folioInput = document.getElementById('documento-numero-input').value;
    const metodo = document.getElementById('remito-metodo-pago').value;
    
    try {
        const res = await fetch('/api/documentos/convertir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presupuesto_numero: folioInput, metodo_pago: metodo })
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast(`¡Presupuesto aceptado! Generado Pedido ${r.pedido.numero}`, "success");
            limpiarRemito();
            await actualizarTodo();
        } else {
            mostrarToast(r.message, "error");
        }
    } catch(e) {}
}

function imprimirComprobanteHTML() {
    if (REMITO_ACTUAL_ITEMS.length === 0) {
        mostrarToast("No hay información que imprimir", "error");
        return;
    }
    window.print();
}

// --- SIMULACION DE ENVIÓ DE CORREO MODAL ---
function abrirModalEmailSimulado() {
    if (REMITO_ACTUAL_ITEMS.length === 0) {
        mostrarToast("Añada información antes de enviar", "error");
        return;
    }
    const emailTo = CONTACTO_SELECCIONADO ? (CONTACTO_SELECCIONADO.email || "") : "";
    document.getElementById('email-to-input').value = emailTo;
    
    const num = document.getElementById('documento-numero-input').value;
    document.getElementById('email-subject-input').value = `Envío de Comprobante Comercial ${num}`;
    document.getElementById('email-body-input').value = `Estimado cliente, adjuntamos en este correo el documento digital en formato PDF de su transacción número ${num}. Saludos cordiales de la administración.`;
    
    document.getElementById('modal-email-simulado').classList.remove('hidden');
}

function cerrarModalEmailSimulado() {
    document.getElementById('modal-email-simulado').classList.add('hidden');
}

async function ejecutarEnvioEmailSimulado() {
    const to = document.getElementById('email-to-input').value.trim();
    const subject = document.getElementById('email-subject-input').value.trim();
    const body = document.getElementById('email-body-input').value.trim();
    const num = document.getElementById('documento-numero-input').value;
    
    if (!to) {
        mostrarToast("El destinatario es obligatorio", "error");
        return;
    }
    
    try {
        const res = await fetch('/api/payments/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, body, doc_number: num })
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast(r.message, "success");
            cerrarModalEmailSimulado();
        }
    } catch(e) {}
}

// --- COMUNICACIONES API LOCALES AUXILIARES ---
async function cargarArticulos() {
    try {
        const res = await fetch('/api/articulos');
        CATALOGO_ARTICULOS = await res.json();
    } catch(e) {}
}

async function cargarClientes() {
    try {
        const res = await fetch('/api/clientes');
        CARTERA_CLIENTES = await res.json();
        
        const tbody = document.getElementById('tabla-clientes-cuerpo');
        if (tbody) {
            tbody.innerHTML = '';
            Object.values(CARTERA_CLIENTES).forEach(cli => {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-slate-50 transition text-slate-700 text-xs">
                        <td class="py-2.5 px-4 font-mono font-bold text-indigo-700">${cli.id}</td>
                        <td class="py-2.5 px-4 font-semibold">${cli.nombre}</td>
                        <td class="py-2.5 px-4 text-slate-500 font-mono">${cli.telefono || '-'}</td>
                        <td class="py-2.5 px-4 text-slate-500 font-mono">${cli.email || '-'}</td>
                        <td class="py-2.5 px-4 text-center space-x-1.5 no-print">
                            <button onclick="verComprobantesContacto('cliente', '${cli.id}')" class="text-amber-600 hover:text-amber-800 font-bold p-1" title="Ver Comprobantes"><i class="fa-solid fa-folder-open"></i></button>
                            <button onclick="editarContacto('cliente', '${cli.id}')" class="text-indigo-500 hover:text-indigo-700 font-bold p-1" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="eliminarContacto('cliente', '${cli.id}')" class="text-red-500 hover:text-red-700 font-bold" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) {
        console.error("Error cargando clientes:", e);
    }
}

async function cargarProveedores() {
    try {
        const res = await fetch('/api/proveedores');
        CARTERA_PROVEEDORES = await res.json();
        
        const tbody = document.getElementById('tabla-proveedores-cuerpo');
        if (tbody) {
            tbody.innerHTML = '';
            Object.values(CARTERA_PROVEEDORES).forEach(prov => {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-slate-50 transition text-slate-700 text-xs">
                        <td class="py-2.5 px-4 font-mono font-bold text-indigo-700">${prov.id}</td>
                        <td class="py-2.5 px-4 font-semibold">${prov.nombre}</td>
                        <td class="py-2.5 px-4 font-semibold text-slate-600">${prov.contacto || '-'}</td>
                        <td class="py-2.5 px-4 text-slate-500 font-mono">${prov.telefono || '-'}</td>
                        <td class="py-2.5 px-4 text-center space-x-1.5 no-print">
                            <button onclick="verComprobantesContacto('proveedor', '${prov.id}')" class="text-amber-600 hover:text-amber-800 font-bold p-1" title="Ver Comprobantes"><i class="fa-solid fa-folder-open"></i></button>
                            <button onclick="editarContacto('proveedor', '${prov.id}')" class="text-indigo-500 hover:text-indigo-700 font-bold p-1" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="eliminarContacto('proveedor', '${prov.id}')" class="text-red-500 hover:text-red-700 font-bold" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(e) {
        console.error("Error cargando proveedores:", e);
    }
}


// =================================================================
// HELPERS, MODALES Y NAVEGACIÓN COMPLETADOS POR AUDITORÍA (V2.0)
// =================================================================

function cambiarPestana(id) {
    document.querySelectorAll('.pestana-contenido').forEach(el => el.classList.add('hidden'));
    const panel = document.getElementById(`tab-${id}`);
    if (panel) panel.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = "tab-btn px-4 py-2 rounded-md font-medium text-slate-200 hover:bg-slate-600 transition text-sm";
    });
    const activoBtn = document.getElementById(`btn-tab-${id}`);
    if (activoBtn) {
        if (id === 'master') {
            activoBtn.className = "tab-btn px-4 py-2 rounded-md font-bold bg-amber-500 text-slate-950 shadow-inner text-sm";
        } else {
            activoBtn.className = "tab-btn px-4 py-2 rounded-md font-medium bg-theme-primary text-white shadow-inner text-sm";
        }
    }
    
    // Acciones especiales al cambiar de pestaña
    if (id === 'caja' && typeof cargarCajaDiaria === 'function') { cargarCajaDiaria(); }
    if (id === 'informes' && typeof configurarColumnasReporte === 'function') {
        configurarColumnasReporte();
    }
    if (id === 'carrito' && typeof renderCatalogoEcommerce === 'function') {
        renderCatalogoEcommerce();
    }
}

function toggleSeccionRapida(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`${id}-icon`);
    if (el) {
        el.classList.toggle('hidden');
        if (icon) {
            icon.className = el.classList.contains('hidden') 
                ? "fa-solid fa-chevron-down text-slate-400 cursor-pointer" 
                : "fa-solid fa-chevron-up text-slate-400 cursor-pointer";
        }
    }
}

function toggleElemento(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
}

// --- SISTEMA TOAST DE NOTIFICACIONES ---
function mostrarToast(mensaje, tipo = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    
    let bg = "bg-emerald-600";
    let icono = "fa-circle-check";
    if (tipo === "error") {
        bg = "bg-red-600";
        icono = "fa-circle-exclamation";
    } else if (tipo === "info") {
        bg = "bg-indigo-600";
        icono = "fa-circle-info";
    }

    toast.className = `${bg} text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center space-x-2 text-xs font-bold transition duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `<i class="fa-solid ${icono} text-sm"></i> <span>${mensaje}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-1');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- GESTIÓN DE CONTACTOS (ABM MODAL) ---
function abrirModalContacto(tipo) {
    document.getElementById('modal-cont-tipo').value = tipo;
    document.getElementById('modal-cont-id').value = '';
    document.getElementById('modal-cont-nombre').value = '';
    document.getElementById('modal-cont-personal').value = '';
    document.getElementById('modal-cont-telefono').value = '';
    document.getElementById('modal-cont-email').value = '';

    document.getElementById('modal-contacto-titulo').innerText = tipo === 'cliente' ? 'Nuevo Cliente' : 'Nuevo Proveedor';
    document.getElementById('modal-label-nombre').innerText = tipo === 'cliente' ? 'Nombre Cliente / Razón Social' : 'Razón Social / Proveedor';

    document.getElementById('grupo-modal-contacto-pers').classList.remove('hidden');
    document.getElementById('grupo-modal-email').classList.remove('hidden');
    document.getElementById('modal-contacto').classList.remove('hidden');
}

function editarContacto(tipo, id) {
    const data = tipo === 'cliente' ? CARTERA_CLIENTES[id] : CARTERA_PROVEEDORES[id];
    if (!data) return;

    document.getElementById('modal-cont-tipo').value = tipo;
    document.getElementById('modal-cont-id').value = id;
    document.getElementById('modal-cont-nombre').value = data.nombre || '';
    document.getElementById('modal-cont-personal').value = data.contacto || '';
    document.getElementById('modal-cont-telefono').value = data.telefono || '';
    document.getElementById('modal-cont-email').value = data.email || '';

    document.getElementById('modal-contacto-titulo').innerText = tipo === 'cliente' ? `Modificar Cliente [${id}]` : `Modificar Proveedor [${id}]`;
    document.getElementById('grupo-modal-contacto-pers').classList.remove('hidden');
    document.getElementById('grupo-modal-email').classList.remove('hidden');
    document.getElementById('modal-contacto').classList.remove('hidden');
}

function cerrarModalContacto() {
    document.getElementById('modal-contacto').classList.add('hidden');
}

async function guardarContactoModal() {
    const tipo = document.getElementById('modal-cont-tipo').value;
    const id = document.getElementById('modal-cont-id').value;
    const nombre = document.getElementById('modal-cont-nombre').value.trim();
    const contactoPers = document.getElementById('modal-cont-personal').value.trim();
    const tel = document.getElementById('modal-cont-telefono').value.trim();
    const email = document.getElementById('modal-cont-email').value.trim();

    if (!nombre) {
        mostrarToast("Nombre u Razón Social obligatorio.", "error");
        return;
    }

    let payload = { id: id || null, nombre, contacto: contactoPers, telefono: tel, email: email };

    const url = tipo === 'cliente' ? '/api/clientes' : '/api/proveedores';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            mostrarToast("Contacto registrado con éxito.", "success");
            cerrarModalContacto();
            await actualizarTodo();
        } else {
            mostrarToast("Error de acceso o permisos.", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al guardar contacto.", "error");
    }
}

async function eliminarContacto(tipo, id) {
    if (!confirm("¿Desea eliminar este contacto de la base de datos?")) return;
    const url = tipo === 'cliente' ? `/api/clientes/${id}` : `/api/proveedores/${id}`;
    try {
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
            mostrarToast("Contacto removido.", "info");
            await actualizarTodo();
        } else {
            const r = await res.json();
            mostrarToast(r.message || "Error eliminando contacto.", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al eliminar contacto.", "error");
    }
}

// --- MODAL DE PERFIL ---
async function abrirModalPerfil() {
    document.getElementById('perfil-contra-actual').value = '';
    document.getElementById('perfil-contra-nueva').value = '';
    try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        const gUserEl = document.getElementById('perfil-gmail-user');
        const gPassEl = document.getElementById('perfil-gmail-pass');
        if (gUserEl) gUserEl.value = cfg.gmail_user || '';
        if (gPassEl) gPassEl.value = cfg.gmail_app_password || '';
    } catch(e) {}
    document.getElementById('modal-perfil').classList.remove('hidden');
}

function cerrarModalPerfil() {
    document.getElementById('modal-perfil').classList.add('hidden');
}

async function guardarNuevaContrasena() {
    const old_p = document.getElementById('perfil-contra-actual').value;
    const new_p = document.getElementById('perfil-contra-nueva').value;
    
    if (!old_p || !new_p) {
        mostrarToast("Complete ambos campos.", "error");
        return;
    }
    try {
        const res = await fetch('/api/profile/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: old_p, new_password: new_p })
        });
        const r = await res.json();
        if (r.success) {
            const gUser = document.getElementById('perfil-gmail-user')?.value.trim() || '';
            const gPass = document.getElementById('perfil-gmail-pass')?.value.trim() || '';
            try {
                await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gmail_user: gUser, gmail_app_password: gPass })
                });
            } catch(e) {}
            mostrarToast("Perfil y credenciales actualizadas con éxito.", "success");
            cerrarModalPerfil();
        } else {
            mostrarToast(r.message || "Error al actualizar clave", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al actualizar clave.", "error");
    }
}


function loginRapidoRol(rol) {
    const creds = {
        'superadmin': ['superadmin', 'superadmin123'],
        'admin': ['admin', 'admin123'],
        'vendedor': ['vendedor', 'vendedor123'],
        'cliente': ['cliente1', 'cliente123']
    };
    if (creds[rol]) {
        const uInput = document.getElementById('login-user');
        const pInput = document.getElementById('login-pass');
        if (uInput) uInput.value = creds[rol][0];
        if (pInput) pInput.value = creds[rol][1];
        const evt = { preventDefault: () => {} };
        ejecutarLogin(evt);
    }
}


let UL_COMPROBANTE_GUARDADO = null;

function abrirModalPostGuardar(folio, total) {
    const folEl = document.getElementById('post-guardar-folio');
    const totEl = document.getElementById('post-guardar-total');
    if (folEl) folEl.innerText = folio;
    if (totEl) totEl.innerText = `$${parseFloat(total).toFixed(2)}`;
    
    const modal = document.getElementById('modal-post-guardar');
    if (modal) {
        modal.classList.remove('hidden');
        const btnNo = document.getElementById('btn-post-guardar-no');
        if (btnNo) btnNo.focus();
    }
}

function cerrarModalPostGuardar() {
    const modal = document.getElementById('modal-post-guardar');
    if (modal) modal.classList.add('hidden');
    limpiarRemito();
    const selItem = document.getElementById('remito-item-selector');
    if (selItem) selItem.focus();
}

function postGuardarAccion(accion) {
    const modal = document.getElementById('modal-post-guardar');
    if (modal) modal.classList.add('hidden');
    
    if (accion === 'imprimir') {
        imprimirComprobanteHTML();
        limpiarRemito();
    } else if (accion === 'email') {
        abrirModalEmailSimulado();
    } else if (accion === 'whatsapp') {
        const num = UL_COMPROBANTE_GUARDADO ? UL_COMPROBANTE_GUARDADO.numero : '';
        const total = UL_COMPROBANTE_GUARDADO ? UL_COMPROBANTE_GUARDADO.total : 0;
        const txt = encodeURIComponent(`Hola! Le enviamos el resumen del comprobante ${num} por un total de $${parseFloat(total).toFixed(2)}. ¡Muchas gracias!`);
        window.open(`https://wa.me/?text=${txt}`, '_blank');
        limpiarRemito();
    }
}

// Global Enter key handler for post-guardar modal
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modal-post-guardar');
    if (modal && !modal.classList.contains('hidden') && e.key === 'Enter') {
        e.preventDefault();
        cerrarModalPostGuardar();
    }
});


async function verComprobantesContacto(tipoContacto, idContacto) {
    const isVenta = (tipoContacto === 'cliente');
    const endpoint = isVenta ? '/api/clientes' : '/api/proveedores';
    
    try {
        const resCont = await fetch(endpoint);
        const contactos = await resCont.json();
        const cont = contactos[idContacto];
        const nombre = cont ? cont.nombre : idContacto;
        
        document.getElementById('modal-comprobantes-contacto-titulo').innerHTML = `<i class="fa-solid fa-folder-open text-amber-600 mr-2"></i>Comprobantes de ${nombre} (${idContacto})`;
        
        const [rPres, rPed, rRem] = await Promise.all([
            fetch('/api/documentos/presupuestos').then(r => r.json()),
            fetch('/api/documentos/pedidos').then(r => r.json()),
            fetch('/api/documentos/remitos').then(r => r.json())
        ]);
        
        const pMapped = rPres.map(d => ({ ...d, tipo_doc: "presupuestos", nombre_doc: "Presupuesto" }));
        const pedMapped = rPed.map(d => ({ ...d, tipo_doc: "pedidos", nombre_doc: "Pedido" }));
        const rMapped = rRem.map(d => ({ ...d, tipo_doc: "remitos", nombre_doc: "Remito" }));
        
        const todos = [...pMapped, ...pedMapped, ...rMapped];
        const filtrados = todos.filter(doc => isVenta ? doc.cliente_id === idContacto : doc.proveedor_id === idContacto);
        
        const tbody = document.getElementById('tabla-comprobantes-contacto-cuerpo');
        if (tbody) {
            tbody.innerHTML = '';
            if (filtrados.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-medium italic">No se encontraron comprobantes registrados para este contacto.</td></tr>`;
            } else {
                const isAdmin = (USUARIO_ACTIVO?.rol === 'admin' || USUARIO_ACTIVO?.rol === 'superadmin');
                filtrados.reverse().forEach(doc => {
                    const btnBorrar = isAdmin ? `<button onclick="eliminarComprobanteContacto('${doc.tipo_doc}', '${doc.numero}', '${tipoContacto}', '${idContacto}')" class="text-red-500 hover:text-red-700 font-bold p-1" title="Eliminar Comprobante"><i class="fa-solid fa-trash-can"></i></button>` : '';
                    tbody.innerHTML += `
                        <tr class="border-b hover:bg-slate-50 transition text-slate-700 text-xs">
                            <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${doc.numero}</td>
                            <td class="py-2.5 px-3 font-semibold">${doc.nombre_doc}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-500">${doc.fecha}</td>
                            <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${doc.tipo === 'VENTA' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200'}">${doc.tipo || 'VENTA'}</span></td>
                            <td class="py-2.5 px-3 text-right font-mono font-bold">$${(doc.total||0).toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200">${doc.estado||'APROBADO'}</span></td>
                            <td class="py-2.5 px-3 text-center space-x-1 no-print">
                                <button onclick="verComprobanteWYSIWYG(${JSON.stringify(doc).replace(/"/g, '&quot;')}, '${tipoContacto}', '${idContacto}')" class="text-indigo-600 hover:text-indigo-800 font-bold p-1" title="Ver Comprobante Completo"><i class="fa-solid fa-eye"></i></button>
                                ${btnBorrar}
                            </td>
                        </tr>
                    `;
                });
            }
        }
        document.getElementById('modal-comprobantes-contacto').classList.remove('hidden');
    } catch(e) {
        mostrarToast("Error cargando comprobantes del contacto", "error");
    }
}

function cerrarModalComprobantesContacto() {
    const modal = document.getElementById('modal-comprobantes-contacto');
    if (modal) modal.classList.add('hidden');
}

async function eliminarComprobanteContacto(tipoDoc, numero, tipoContacto, idContacto) {
    if (!confirm(`¿Está seguro de eliminar el comprobante ${numero}? Esta acción repondrá stock y ajustará saldos.`)) return;
    try {
        const res = await fetch(`/api/documentos/${tipoDoc}/${numero}?entidad_id=${idContacto}`, { method: 'DELETE' });
        const r = await res.json();
        if (r.success) {
            mostrarToast(r.message, "success");
            await verComprobantesContacto(tipoContacto, idContacto);
            await actualizarTodo();
        } else {
            mostrarToast(r.message || "Error al eliminar comprobante", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al eliminar comprobante", "error");
    }
}





async function cargarDocumentoEnPantalla(doc) {
    if (!doc) return;
    
    const isVenta = (doc.tipo === 'VENTA');
    if (isVenta && (!CARTERA_CLIENTES || Object.keys(CARTERA_CLIENTES).length === 0)) await cargarClientes();
    if (!isVenta && (!CARTERA_PROVEEDORES || Object.keys(CARTERA_PROVEEDORES).length === 0)) await cargarProveedores();
    
    const fEl = document.getElementById('remito-fecha');
    if (fEl) fEl.value = doc.fecha || new Date().toISOString().split('T')[0];
    
    const mEl = document.getElementById('remito-metodo-pago');
    if (mEl) mEl.value = doc.metodo_pago || 'efectivo';
    
    const dEl = document.getElementById('remito-desc-porcentaje');
    if (dEl) dEl.value = doc.descuento || 0;
    
    const nEl = document.getElementById('documento-numero-input');
    if (nEl) nEl.value = doc.numero || '';
    
    const tipoDocEl = document.getElementById('doc-tipo-comprobante');
    if (tipoDocEl) {
        if (doc.numero.startsWith('PED')) tipoDocEl.value = 'pedidos';
        else if (doc.numero.startsWith('PRE')) tipoDocEl.value = 'presupuestos';
        else tipoDocEl.value = 'remitos';
    }
    
    const tipoOpEl = document.getElementById('remito-tipo-op');
    if (tipoOpEl) tipoOpEl.value = doc.tipo || 'VENTA';
    
    // Set client / supplier name
    const base = isVenta ? CARTERA_CLIENTES : CARTERA_PROVEEDORES;
    const cId = isVenta ? doc.cliente_id : doc.proveedor_id;
    
    if (cId) {
        let match = base[cId] || Object.values(base).find(c => c.id === cId || c.nombre === cId);
        if (match) {
            seleccionarContactoInline(match);
        } else {
            const nameEl = document.getElementById('documento-contacto-nombre');
            if (nameEl) nameEl.value = cId;
        }
    }
    
    REMITO_ACTUAL_ITEMS = (doc.items || []).map(i => ({...i}));
    renderTablaRemito();
    cambiarPestana('remito');
    mostrarToast(`Cargado en pantalla ${doc.numero}`, "info");
}

// --- VISTA MODAL WYSIWYG REAL Y PAGO DIRECTO SOBRE COMPROBANTE ---
let WYSIWYG_DOC_ACTUAL = null;
let WYSIWYG_CONTACTO_TIPO = null;
let WYSIWYG_CONTACTO_ID = null;

async function verComprobanteWYSIWYG(doc, tipoContacto, idContacto) {
    if (!doc) return;
    
    WYSIWYG_DOC_ACTUAL = doc;
    WYSIWYG_CONTACTO_TIPO = tipoContacto || (doc.tipo === 'VENTA' ? 'cliente' : 'proveedor');
    WYSIWYG_CONTACTO_ID = idContacto || doc.cliente_id || doc.proveedor_id;
    
    // 1. Branding info
    const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    const bName = document.getElementById('wysiwyg-brand-name');
    const bSub = document.getElementById('wysiwyg-brand-sub');
    const bDom = document.getElementById('wysiwyg-brand-dom');
    const bLogo = document.getElementById('wysiwyg-brand-logo');
    
    if (bName) bName.innerText = cfg.nombre_negocio || 'StockDocente S.R.L.';
    if (bSub) bSub.innerText = cfg.subtitulo_negocio || 'Distribuidor Comercial Multi-Rubro Modular';
    if (bDom) bDom.innerText = cfg.domicilio_negocio || 'Domicilio Comercial de Práctica 123 • Buenos Aires • CUIT 30-12345678-9';
    
    if (bLogo) {
        if (cfg.logo_url && cfg.logo_url.trim() !== '') {
            bLogo.innerHTML = `<img src="${cfg.logo_url}" class="h-10 w-10 object-contain rounded inline-block" alt="Logo">`;
        } else {
            bLogo.innerText = cfg.logo_emoji || '📦';
        }
    }

    // 2. Doc headers
    const badgeTipo = document.getElementById('wysiwyg-modal-badge-tipo');
    const docNombre = doc.nombre_doc || (doc.numero.startsWith('REM') ? 'Remito' : (doc.numero.startsWith('PED') ? 'Pedido' : 'Presupuesto'));
    if (badgeTipo) badgeTipo.innerText = docNombre.toUpperCase();
    
    const dNum = document.getElementById('wysiwyg-doc-numero');
    const dTipoNom = document.getElementById('wysiwyg-doc-tipo-nombre');
    const dFecha = document.getElementById('wysiwyg-doc-fecha');
    const dOp = document.getElementById('wysiwyg-doc-operacion');
    
    if (dNum) dNum.innerText = doc.numero;
    if (dTipoNom) dTipoNom.innerText = `Comprobante - ${docNombre}`;
    if (dFecha) dFecha.innerText = doc.fecha || '-';
    if (dOp) dOp.innerText = doc.tipo || (WYSIWYG_CONTACTO_TIPO === 'cliente' ? 'VENTA' : 'COMPRA');

    // 3. Contact Info Resolution (100% Complete)
    const isVenta = (WYSIWYG_CONTACTO_TIPO === 'cliente' || doc.tipo === 'VENTA');
    const endpoint = isVenta ? '/api/clientes' : '/api/proveedores';
    const contactos = await fetch(endpoint).then(r => r.json()).catch(() => ({}));
    
    const targetId = WYSIWYG_CONTACTO_ID;
    let cont = contactos[targetId];
    if (!cont && targetId) {
        cont = Object.values(contactos).find(c => c.id === targetId || c.nombre === targetId);
    }
    if (!cont) cont = {};

    const nombreMostrar = cont.nombre || doc.cliente_id || doc.proveedor_id || 'Contacto Comercial';
    const idMostrar = cont.id || targetId || '-';
    const telMostrar = cont.telefono || '-';
    const emailMostrar = cont.email || cont.contacto || '-';

    const cNombre = document.getElementById('wysiwyg-contacto-nombre');
    const cId = document.getElementById('wysiwyg-contacto-id');
    const cTel = document.getElementById('wysiwyg-contacto-tel');
    const cEmail = document.getElementById('wysiwyg-contacto-email');
    
    if (cNombre) cNombre.innerText = nombreMostrar;
    if (cId) cId.innerText = idMostrar;
    if (cTel) cTel.innerText = telMostrar;
    if (cEmail) cEmail.innerText = emailMostrar;

    // 4. Render Table Items
    const tbody = document.getElementById('wysiwyg-tabla-items-cuerpo');
    if (tbody) {
        tbody.innerHTML = '';
        const items = doc.items || [];
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400 italic">No hay artículos registrados en este comprobante.</td></tr>`;
        } else {
            items.forEach(it => {
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="py-2 px-3 font-mono font-bold text-indigo-700">${it.codigo || '-'}</td>
                        <td class="py-2 px-3 font-semibold">${it.descripcion || '-'}</td>
                        <td class="py-2 px-3 text-center font-bold">${it.cantidad || 1}</td>
                        <td class="py-2 px-3 text-right font-mono">$${(parseFloat(it.precio_unitario)||0).toFixed(2)}</td>
                        <td class="py-2 px-3 text-right font-mono font-bold text-slate-800">$${(parseFloat(it.importe)||0).toFixed(2)}</td>
                    </tr>
                `;
            });
        }
    }

    // 5. Totals and Condition
    const itemsList = doc.items || [];
    const subtotal = parseFloat(doc.subtotal) || itemsList.reduce((s, i) => s + (parseFloat(i.importe)||0), 0);
    const descPct = parseFloat(doc.descuento) || 0;
    const descMonto = subtotal * (descPct / 100);
    const total = parseFloat(doc.total) || (subtotal - descMonto);
    
    const dSub = document.getElementById('wysiwyg-doc-subtotal');
    const dPct = document.getElementById('wysiwyg-doc-desc-pct');
    const dMonto = document.getElementById('wysiwyg-doc-desc-monto');
    const dTot = document.getElementById('wysiwyg-doc-total');
    
    if (dSub) dSub.innerText = `$${subtotal.toFixed(2)}`;
    if (dPct) dPct.innerText = descPct;
    if (dMonto) dMonto.innerText = `-$${descMonto.toFixed(2)}`;
    if (dTot) dTot.innerText = `$${total.toFixed(2)}`;
    
    const metodosEtiquetas = {
        efectivo: "Contado - Efectivo",
        tarjeta: "Contado - Tarjeta",
        billetera: "Contado - Transferencia / QR",
        cc: "Cuenta Corriente"
    };
    const dMetodo = document.getElementById('wysiwyg-doc-metodo-pago');
    const dCreado = document.getElementById('wysiwyg-doc-creado-por');
    const dEst = document.getElementById('wysiwyg-doc-estado');
    
    if (dMetodo) dMetodo.innerText = metodosEtiquetas[doc.metodo_pago] || doc.metodo_pago || 'Contado';
    if (dCreado) dCreado.innerText = doc.creado_por || 'admin';
    if (dEst) dEst.innerText = doc.estado || 'APROBADO';

    // 6. Cuenta Corriente Financial Status & Payment Form
    const seccionCC = document.getElementById('wysiwyg-seccion-cc');
    if (seccionCC) {
        if (doc.metodo_pago === 'cc') {
            seccionCC.classList.remove('hidden');
            
            let docFresca = doc;
            try {
                const tipoQuery = doc.tipo_doc || (doc.numero.startsWith('REM') ? 'remitos' : (doc.numero.startsWith('PED') ? 'pedidos' : 'presupuestos'));
                const allDocs = await fetch(`/api/documentos/${tipoQuery}`).then(r => r.json());
                const targetEntidad = WYSIWYG_CONTACTO_ID; const found = allDocs.find(d => (doc.id && d.id === doc.id) || (d.numero === doc.numero && (d.proveedor_id === targetEntidad || d.cliente_id === targetEntidad)));
                if (found) docFresca = found;
            } catch(e) {}

            const totalDoc = parseFloat(docFresca.total) || total;
            const pend = docFresca.saldo_pendiente !== undefined ? parseFloat(docFresca.saldo_pendiente) : totalDoc;
            const abonado = Math.max(0, totalDoc - pend);
            
            const valTot = document.getElementById('wysiwyg-cc-val-total');
            const valAbo = document.getElementById('wysiwyg-cc-val-abonado');
            const valPen = document.getElementById('wysiwyg-cc-val-pendiente');
            
            if (valTot) valTot.innerText = `$${totalDoc.toFixed(2)}`;
            if (valAbo) valAbo.innerText = `$${abonado.toFixed(2)}`;
            if (valPen) valPen.innerText = `$${pend.toFixed(2)}`;

            const badgeEstado = document.getElementById('wysiwyg-cc-badge-estado');
            const formAbono = document.getElementById('wysiwyg-cc-form-abono');
            const inputMonto = document.getElementById('wysiwyg-cc-input-monto');
            
            if (pend <= 0.01) {
                if (badgeEstado) {
                    badgeEstado.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-emerald-100 text-emerald-800 border-emerald-300";
                    badgeEstado.innerHTML = "🟢 PAGADO 100%";
                }
                if (formAbono) formAbono.classList.add('hidden');
            } else if (abonado > 0.01) {
                if (badgeEstado) {
                    badgeEstado.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-amber-100 text-amber-800 border-amber-300";
                    badgeEstado.innerHTML = "🟡 PAGO PARCIAL";
                }
                if (formAbono) formAbono.classList.remove('hidden');
                if (inputMonto) inputMonto.value = pend.toFixed(2);
            } else {
                if (badgeEstado) {
                    badgeEstado.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-red-100 text-red-800 border-red-300";
                    badgeEstado.innerHTML = "🔴 IMPAGO / DEUDA PENDIENTE";
                }
                if (formAbono) formAbono.classList.remove('hidden');
                if (inputMonto) inputMonto.value = pend.toFixed(2);
            }
        } else {
            seccionCC.classList.add('hidden');
        }
    }

    habilitarArrastreModalWYSIWYG();
    const modal = document.getElementById('modal-ver-comprobante-wysiwyg');
    if (modal) modal.classList.remove('hidden');
}

function cerrarModalVerComprobanteWYSIWYG() {
    const modal = document.getElementById('modal-ver-comprobante-wysiwyg');
    if (modal) modal.classList.add('hidden');
}

function wysiwygAutofillTotalDeuda() {
    const txtPend = document.getElementById('wysiwyg-cc-val-pendiente')?.innerText.replace('$', '') || '0';
    const val = parseFloat(txtPend) || 0;
    const inp = document.getElementById('wysiwyg-cc-input-monto');
    if (inp) inp.value = val.toFixed(2);
}

async function ejecutarPagoDirectoWYSIWYG() {
    if (!WYSIWYG_DOC_ACTUAL) return;
    const monto = parseFloat(document.getElementById('wysiwyg-cc-input-monto')?.value || 0);
    if (monto <= 0) {
        mostrarToast("Ingrese un monto válido a abonar", "error");
        return;
    }
    
    const medio = document.getElementById('wysiwyg-cc-input-medio')?.value || 'efectivo';
    const isVenta = (WYSIWYG_CONTACTO_TIPO === 'cliente');
    const endpoint = isVenta ? '/api/cc/clientes/cobro' : '/api/cc/proveedores/pago';
    
    const payload = {
        monto: monto,
        concepto: `Abono Directo s/Comprobante ${WYSIWYG_DOC_ACTUAL.numero}`,
        medio_pago: medio,
        pagos_documentos: [{ id: WYSIWYG_DOC_ACTUAL.id, numero: WYSIWYG_DOC_ACTUAL.numero, monto: monto }]
    };
    if (isVenta) {
        payload.cliente_id = WYSIWYG_CONTACTO_ID;
    } else {
        payload.proveedor_id = WYSIWYG_CONTACTO_ID;
    }
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast(`¡Abono de $${monto.toFixed(2)} registrado con éxito!`, "success");
            await verComprobanteWYSIWYG(WYSIWYG_DOC_ACTUAL, WYSIWYG_CONTACTO_TIPO, WYSIWYG_CONTACTO_ID);
            if (typeof verComprobantesContacto === 'function') {
                await verComprobantesContacto(WYSIWYG_CONTACTO_TIPO, WYSIWYG_CONTACTO_ID);
            }
        } else {
            mostrarToast(r.message || "Error al procesar el pago", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al procesar el pago", "error");
    }
}


function imprimirModalWYSIWYG() {
    const papel = document.querySelector('#modal-ver-comprobante-wysiwyg .bg-slate-50.p-6');
    if (!papel) {
        window.print();
        return;
    }
    const win = window.open('', '_blank', 'width=850,height=900');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Comprobante Comercial - Imprimir</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { padding: 25px; background: white; color: #1e293b; font-family: sans-serif; }
                .no-print { display: none !important; }
            </style>
        </head>
        <body>
            <div class="max-w-[750px] mx-auto border p-6 rounded-xl shadow-sm">
                ${papel.innerHTML}
            </div>
            <script>
                setTimeout(() => { window.print(); window.close(); }, 500);
            </script>
        </body>
        </html>
    `);
    win.document.close();
}


// --- MANEJADOR DE ARRASTRE Y VENTANA FLOTANTE WYSIWYG ---
function habilitarArrastreModalWYSIWYG() {
    const header = document.getElementById('wysiwyg-modal-header');
    const dialog = document.getElementById('modal-ver-comprobante-dialog');
    if (!header || !dialog) return;

    if (header.dataset.dragInit !== 'true') {
        header.dataset.dragInit = 'true';
        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = dialog.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            dialog.style.transform = 'none';
            dialog.style.margin = '0';
            dialog.style.left = `${initialLeft}px`;
            dialog.style.top = `${initialTop}px`;

            header.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';

            const onMouseMove = (ev) => {
                if (!isDragging) return;
                const deltaX = ev.clientX - startX;
                const deltaY = ev.clientY - startY;

                let newLeft = initialLeft + deltaX;
                let newTop = initialTop + deltaY;

                const maxLeft = window.innerWidth - 120;
                const maxTop = window.innerHeight - 80;

                newLeft = Math.max(10, Math.min(newLeft, maxLeft));
                newTop = Math.max(10, Math.min(newTop, maxTop));

                dialog.style.left = `${newLeft}px`;
                dialog.style.top = `${newTop}px`;
            };

            const onMouseUp = () => {
                isDragging = false;
                header.style.cursor = 'grab';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }
}


function abrirComprobantePopUp2Monitor() {
    const papel = document.querySelector('#modal-ver-comprobante-wysiwyg .bg-slate-50.p-6');
    if (!papel) {
        mostrarToast("No se pudo obtener la vista del comprobante", "error");
        return;
    }
    const win = window.open('', '_blank', 'width=850,height=900,resizable=yes,scrollbars=yes');
    if (!win) {
        mostrarToast("Permita las ventanas emergentes (pop-ups) en su navegador para usar el 2º monitor", "error");
        return;
    }
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Comprobante Comercial - Vista 2º Monitor</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { padding: 20px; background: #f8fafc; color: #1e293b; font-family: sans-serif; }
                .no-print { display: none !important; }
            </style>
        </head>
        <body>
            <div class="max-w-[750px] mx-auto bg-white border border-slate-300 p-6 rounded-xl shadow-lg">
                ${papel.innerHTML}
            </div>
            <script>
                function wysiwygAutofillTotalDeuda() {
                    const txtPend = document.getElementById('wysiwyg-cc-val-pendiente')?.innerText.replace('$', '') || '0';
                    const val = parseFloat(txtPend) || 0;
                    const inp = document.getElementById('wysiwyg-cc-input-monto');
                    if (inp) inp.value = val.toFixed(2);
                }
                async function ejecutarPagoDirectoWYSIWYG() {
                    const monto = parseFloat(document.getElementById('wysiwyg-cc-input-monto')?.value || 0);
                    const medio = document.getElementById('wysiwyg-cc-input-medio')?.value || 'efectivo';
                    if (monto <= 0) { alert('Ingrese un monto válido a abonar'); return; }
                    if (window.opener && window.opener.ejecutarPagoDirectoDesdePopUp) {
                        const ok = await window.opener.ejecutarPagoDirectoDesdePopUp(monto, medio);
                        if (ok) window.location.reload();
                    }
                }
            </script>
        </body>
        </html>
    `);
    win.document.close();
}


async function cargarCajaDiaria() {
    try {
        const res = await fetch('/api/caja');
        const caja = await res.json();
        const movs = caja.movimientos || [];
        
        let neto = 0;
        let efectivo = 0;
        let bancos = 0;
        let tarjetas = 0;
        
        movs.forEach(m => {
            const mnt = parseFloat(m.monto) || 0;
            neto += mnt;
            if (m.medio_pago === 'efectivo') efectivo += mnt;
            else if (m.medio_pago === 'transferencia' || m.medio_pago === 'billetera') bancos += mnt;
            else if (m.medio_pago === 'tarjeta') tarjetas += mnt;
            else efectivo += mnt;
        });
        
        const elNeto = document.getElementById('caja-val-neto');
        const elEfectivo = document.getElementById('caja-val-efectivo');
        const elBancos = document.getElementById('caja-val-bancos');
        const elTarjetas = document.getElementById('caja-val-tarjetas');
        
        if (elNeto) elNeto.innerText = `$${neto.toFixed(2)}`;
        if (elEfectivo) elEfectivo.innerText = `$${efectivo.toFixed(2)}`;
        if (elBancos) elBancos.innerText = `$${bancos.toFixed(2)}`;
        if (elTarjetas) elTarjetas.innerText = `$${tarjetas.toFixed(2)}`;
        
        const tbody = document.getElementById('tabla-caja-movimientos-cuerpo');
        if (tbody) {
            tbody.innerHTML = '';
            if (movs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-medium italic">No hay movimientos registrados en la caja diaria.</td></tr>`;
            } else {
                movs.slice().reverse().forEach(m => {
                    const color = m.monto >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200';
                    tbody.innerHTML += `
                        <tr class="border-b hover:bg-slate-50 transition text-xs">
                            <td class="py-2.5 px-4 font-mono font-bold text-indigo-700">${m.id || '-'}</td>
                            <td class="py-2.5 px-4 font-mono text-slate-500">${m.fecha || '-'}</td>
                            <td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-black border ${color}">${m.tipo || (m.monto >= 0 ? 'INGRESO' : 'EGRESO')}</span></td>
                            <td class="py-2.5 px-4 font-semibold text-slate-600 uppercase">${m.medio_pago || 'efectivo'}</td>
                            <td class="py-2.5 px-4 font-semibold text-slate-800">${m.concepto || '-'}</td>
                            <td class="py-2.5 px-4 text-right font-mono font-bold ${m.monto >= 0 ? 'text-emerald-700' : 'text-red-600'}">$${Math.abs(m.monto).toFixed(2)}</td>
                            <td class="py-2.5 px-4 text-center font-bold text-slate-500">${m.usuario || 'admin'}</td>
                        </tr>
                    `;
                });
            }
        }
    } catch(e) {
        console.error("Error cargando caja diaria:", e);
    }
}

async function registrarMovimientoCajaManual() {
    const tipo = document.getElementById('form-caja-tipo').value;
    const monto = parseFloat(document.getElementById('form-caja-monto').value || 0);
    const medio = document.getElementById('form-caja-medio').value;
    const concepto = document.getElementById('form-caja-concepto').value.trim();
    
    if (monto <= 0) {
        mostrarToast("Ingrese un monto mayor a cero", "error");
        return;
    }
    if (!concepto) {
        mostrarToast("Ingrese el motivo o concepto del movimiento", "error");
        return;
    }
    
    try {
        const res = await fetch('/api/caja/movimiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, monto, medio_pago: medio, concepto })
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("Movimiento de caja asentado con éxito", "success");
            document.getElementById('form-caja-monto').value = '';
            document.getElementById('form-caja-concepto').value = '';
            await cargarCajaDiaria();
        } else {
            mostrarToast(r.message || "Error al asentar movimiento", "error");
        }
    } catch(e) {
        mostrarToast("Error de conexión al asentar movimiento", "error");
    }
}

async function ejecutarPagoDirectoDesdePopUp(monto, medio) {
    if (!WYSIWYG_DOC_ACTUAL) return false;
    const isVenta = (WYSIWYG_CONTACTO_TIPO === 'cliente');
    const endpoint = isVenta ? '/api/cc/clientes/cobro' : '/api/cc/proveedores/pago';
    
    const payload = {
        monto: monto,
        concepto: `Abono Directo s/Comprobante ${WYSIWYG_DOC_ACTUAL.numero}`,
        medio_pago: medio,
        pagos_documentos: [{ id: WYSIWYG_DOC_ACTUAL.id, numero: WYSIWYG_DOC_ACTUAL.numero, monto: monto }]
    };
    if (isVenta) {
        payload.cliente_id = WYSIWYG_CONTACTO_ID;
    } else {
        payload.proveedor_id = WYSIWYG_CONTACTO_ID;
    }
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast(`¡Abono de $${monto.toFixed(2)} registrado con éxito!`, "success");
            await verComprobanteWYSIWYG(WYSIWYG_DOC_ACTUAL, WYSIWYG_CONTACTO_TIPO, WYSIWYG_CONTACTO_ID);
            if (typeof verComprobantesContacto === 'function') {
                await verComprobantesContacto(WYSIWYG_CONTACTO_TIPO, WYSIWYG_CONTACTO_ID);
            }
            await actualizarTodo();
            return true;
        } else {
            mostrarToast(r.message || "Error al procesar el pago", "error");
            return false;
        }
    } catch(e) {
        mostrarToast("Error de conexión al procesar el pago", "error");
        return false;
    }
}
