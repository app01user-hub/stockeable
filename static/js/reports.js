// -*- coding: utf-8 -*-
/**
 * reports.js - Generador dinámico de reportes, ordenamiento múltiple y reordenamiento de columnas (v2.0)
 */

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

let CONFIG_INFORMES = {
    DETALLE_COMPROBANTES: {
        columnas: ["numero", "tipo_doc", "fecha", "tipo_op", "contacto_nombre", "contacto_tel", "contacto_email", "items_count", "total", "metodo_pago", "estado", "creado_por"],
        etiquetas: { 
            numero: "Nº Folio", 
            tipo_doc: "Comprobante", 
            fecha: "Fecha", 
            tipo_op: "Operación", 
            contacto_nombre: "Cliente / Proveedor", 
            contacto_tel: "Teléfono",
            contacto_email: "Correo Electrónico",
            items_count: "Cant. Ítems", 
            total: "Total ($)", 
            metodo_pago: "Forma Pago", 
            estado: "Estado", 
            creado_por: "Emitido Por" 
        },
        obtenerDatos: async () => {
            const [rPres, rPed, rRem, rCli, rProv] = await Promise.all([
                fetch('/api/documentos/presupuestos').then(r => r.json()).catch(() => []),
                fetch('/api/documentos/pedidos').then(r => r.json()).catch(() => []),
                fetch('/api/documentos/remitos').then(r => r.json()).catch(() => []),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            
            const pMapped = (Array.isArray(rPres) ? rPres : []).map(d => ({ ...d, tipo_doc: "Presupuesto" }));
            const pedMapped = (Array.isArray(rPed) ? rPed : []).map(d => ({ ...d, tipo_doc: "Pedido" }));
            const rMapped = (Array.isArray(rRem) ? rRem : []).map(d => ({ ...d, tipo_doc: "Remito" }));
            
            const dictCli = (rCli && typeof rCli === 'object') ? rCli : {};
            const dictProv = (rProv && typeof rProv === 'object') ? rProv : {};
            
            const todos = [...pMapped, ...pedMapped, ...rMapped];
            return todos.map(doc => {
                let contacto = "-";
                let tel = "-";
                let email = "-";
                
                if (doc.tipo === "VENTA") {
                    if (doc.cliente_id && dictCli[doc.cliente_id]) {
                        contacto = dictCli[doc.cliente_id].nombre;
                        tel = dictCli[doc.cliente_id].telefono || "-";
                        email = dictCli[doc.cliente_id].email || "-";
                    } else {
                        contacto = doc.cliente_id || "Consumidor Final";
                    }
                } else {
                    if (doc.proveedor_id && dictProv[doc.proveedor_id]) {
                        contacto = dictProv[doc.proveedor_id].nombre;
                        tel = dictProv[doc.proveedor_id].telefono || "-";
                        email = dictProv[doc.proveedor_id].email || dictProv[doc.proveedor_id].contacto || "-";
                    } else {
                        contacto = doc.proveedor_id || "Proveedor";
                    }
                }
                const cantItems = doc.items ? doc.items.reduce((s, i) => s + (parseInt(i.cantidad)||0), 0) : 0;
                return {
                    numero: doc.numero || '-',
                    tipo_doc: doc.tipo_doc || 'Comprobante',
                    fecha: doc.fecha || '-',
                    tipo_op: doc.tipo || "VENTA",
                    contacto_nombre: contacto,
                    contacto_tel: tel,
                    contacto_email: email,
                    items_count: cantItems,
                    total: doc.total || 0,
                    metodo_pago: doc.metodo_pago || "efectivo",
                    estado: doc.estado || "APROBADO",
                    creado_por: doc.creado_por || "-"
                };
            });
        }
    },

    COMPARATIVA_COSTOS_PROVEEDOR: {
        columnas: ["codigo", "descripcion", "proveedor_nombre", "fecha", "cantidad", "precio_costo", "precio_venta"],
        etiquetas: { 
            codigo: "Código Art.", 
            descripcion: "Producto / Detalle", 
            proveedor_nombre: "Proveedor Origen", 
            fecha: "Fecha Compra", 
            cantidad: "Cant. Comprada", 
            precio_costo: "Costo Unit. ($)", 
            precio_venta: "Venta Sugerido ($)" 
        },
        obtenerDatos: async () => {
            const [rRem, rPed, rProv, rArts] = await Promise.all([
                fetch('/api/documentos/remitos').then(r => r.json()).catch(() => []),
                fetch('/api/documentos/pedidos').then(r => r.json()).catch(() => []),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({})),
                fetch('/api/articulos').then(r => r.json()).catch(() => ({}))
            ]);
            
            const docsCompra = [...(Array.isArray(rRem) ? rRem : []), ...(Array.isArray(rPed) ? rPed : [])].filter(d => d.tipo === 'COMPRA');
            const dictProv = (rProv && typeof rProv === 'object') ? rProv : {};
            const dictArts = (rArts && typeof rArts === 'object') ? rArts : {};
            
            let comparativas = [];
            docsCompra.forEach(doc => {
                const pNombre = doc.proveedor_id && dictProv[doc.proveedor_id] ? dictProv[doc.proveedor_id].nombre : (doc.proveedor_id || 'Proveedor');
                if (doc.items && Array.isArray(doc.items)) {
                    doc.items.forEach(it => {
                        const cod = it.codigo || '-';
                        const vSugerido = dictArts[cod] ? dictArts[cod].precio_venta : 0;
                        comparativas.push({
                            codigo: cod,
                            descripcion: it.descripcion || '-',
                            proveedor_nombre: pNombre,
                            fecha: doc.fecha || '-',
                            cantidad: parseInt(it.cantidad) || 1,
                            precio_costo: parseFloat(it.precio_unitario) || 0,
                            precio_venta: parseFloat(vSugerido) || 0
                        });
                    });
                }
            });
            return comparativas;
        }
    },

    STOCK: {
        columnas: ["codigo", "descripcion", "familia", "cantidad", "precio_costo", "precio_venta"],
        etiquetas: { codigo: "Código", descripcion: "Descripción / Detalle", familia: "Familia", cantidad: "Stock Físico", precio_costo: "Costo ($)", precio_venta: "Venta ($)" },
        obtenerDatos: async () => {
            const res = await fetch('/api/articulos');
            const data = await res.json().catch(() => ({}));
            return Object.values((data && typeof data === 'object') ? data : {});
        }
    },

    EXISTENCIAS: {
        columnas: ["codigo", "descripcion", "familia", "cantidad", "precio_costo", "precio_venta"],
        etiquetas: { codigo: "Código", descripcion: "Descripción / Detalle", familia: "Familia", cantidad: "Stock Físico", precio_costo: "Costo ($)", precio_venta: "Venta ($)" },
        obtenerDatos: async () => {
            const res = await fetch('/api/articulos');
            const data = await res.json().catch(() => ({}));
            const list = Object.values((data && typeof data === 'object') ? data : {});
            return list.filter(art => art.cantidad <= 10);
        }
    },

    REMITOS: {
        columnas: ["numero", "fecha", "tipo", "contacto_nombre", "contacto_tel", "contacto_email", "total", "metodo_pago", "creado_por"],
        etiquetas: { numero: "Nº Folio", fecha: "Fecha", tipo: "Operación", contacto_nombre: "Cliente / Proveedor", contacto_tel: "Teléfono", contacto_email: "Correo Electrónico", total: "Total Neto ($)", metodo_pago: "Forma Pago", creado_por: "Emitido Por" },
        obtenerDatos: async () => {
            const [remitos, dictCli, dictProv] = await Promise.all([
                fetch('/api/documentos/remitos').then(r => r.json()).catch(() => []),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            return (Array.isArray(remitos) ? remitos : []).map(doc => {
                let contacto = "-";
                let tel = "-";
                let email = "-";
                if (doc.tipo === "VENTA") {
                    if (doc.cliente_id && dictCli[doc.cliente_id]) {
                        contacto = dictCli[doc.cliente_id].nombre;
                        tel = dictCli[doc.cliente_id].telefono || "-";
                        email = dictCli[doc.cliente_id].email || "-";
                    } else { contacto = doc.cliente_id || "Consumidor Final"; }
                } else {
                    if (doc.proveedor_id && dictProv[doc.proveedor_id]) {
                        contacto = dictProv[doc.proveedor_id].nombre;
                        tel = dictProv[doc.proveedor_id].telefono || "-";
                        email = dictProv[doc.proveedor_id].email || dictProv[doc.proveedor_id].contacto || "-";
                    } else { contacto = doc.proveedor_id || "Proveedor"; }
                }
                return {
                    numero: doc.numero || '-',
                    fecha: doc.fecha || '-',
                    tipo: doc.tipo || 'VENTA',
                    contacto_nombre: contacto,
                    contacto_tel: tel,
                    contacto_email: email,
                    total: doc.total || 0,
                    metodo_pago: doc.metodo_pago || 'efectivo',
                    creado_por: doc.creado_por || '-'
                };
            });
        }
    },

    PEDIDOS: {
        columnas: ["numero", "fecha", "tipo", "contacto_nombre", "contacto_tel", "contacto_email", "total", "metodo_pago", "estado", "creado_por"],
        etiquetas: { numero: "Nº Folio", fecha: "Fecha", tipo: "Operación", contacto_nombre: "Cliente / Proveedor", contacto_tel: "Teléfono", contacto_email: "Correo Electrónico", total: "Total Neto ($)", metodo_pago: "Forma Pago", estado: "Estado", creado_por: "Emitido Por" },
        obtenerDatos: async () => {
            const [pedidos, dictCli, dictProv] = await Promise.all([
                fetch('/api/documentos/pedidos').then(r => r.json()).catch(() => []),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            return (Array.isArray(pedidos) ? pedidos : []).map(doc => {
                let contacto = "-";
                let tel = "-";
                let email = "-";
                if (doc.tipo === "VENTA") {
                    if (doc.cliente_id && dictCli[doc.cliente_id]) {
                        contacto = dictCli[doc.cliente_id].nombre;
                        tel = dictCli[doc.cliente_id].telefono || "-";
                        email = dictCli[doc.cliente_id].email || "-";
                    } else { contacto = doc.cliente_id || "Consumidor Final"; }
                } else {
                    if (doc.proveedor_id && dictProv[doc.proveedor_id]) {
                        contacto = dictProv[doc.proveedor_id].nombre;
                        tel = dictProv[doc.proveedor_id].telefono || "-";
                        email = dictProv[doc.proveedor_id].email || dictProv[doc.proveedor_id].contacto || "-";
                    } else { contacto = doc.proveedor_id || "Proveedor"; }
                }
                return {
                    numero: doc.numero || '-',
                    fecha: doc.fecha || '-',
                    tipo: doc.tipo || 'VENTA',
                    contacto_nombre: contacto,
                    contacto_tel: tel,
                    contacto_email: email,
                    total: doc.total || 0,
                    metodo_pago: doc.metodo_pago || 'efectivo',
                    estado: doc.estado || 'APROBADO',
                    creado_por: doc.creado_por || '-'
                };
            });
        }
    },

    PRESUPUESTOS: {
        columnas: ["numero", "fecha", "tipo", "contacto_nombre", "contacto_tel", "contacto_email", "total", "metodo_pago", "estado", "creado_por"],
        etiquetas: { numero: "Nº Folio", fecha: "Fecha", tipo: "Operación", contacto_nombre: "Cliente / Proveedor", contacto_tel: "Teléfono", contacto_email: "Correo Electrónico", total: "Total Neto ($)", metodo_pago: "Forma Pago", estado: "Estado", creado_por: "Emitido Por" },
        obtenerDatos: async () => {
            const [presupuestos, dictCli, dictProv] = await Promise.all([
                fetch('/api/documentos/presupuestos').then(r => r.json()).catch(() => []),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            return (Array.isArray(presupuestos) ? presupuestos : []).map(doc => {
                let contacto = "-";
                let tel = "-";
                let email = "-";
                if (doc.tipo === "VENTA") {
                    if (doc.cliente_id && dictCli[doc.cliente_id]) {
                        contacto = dictCli[doc.cliente_id].nombre;
                        tel = dictCli[doc.cliente_id].telefono || "-";
                        email = dictCli[doc.cliente_id].email || "-";
                    } else { contacto = doc.cliente_id || "Consumidor Final"; }
                } else {
                    if (doc.proveedor_id && dictProv[doc.proveedor_id]) {
                        contacto = dictProv[doc.proveedor_id].nombre;
                        tel = dictProv[doc.proveedor_id].telefono || "-";
                        email = dictProv[doc.proveedor_id].email || dictProv[doc.proveedor_id].contacto || "-";
                    } else { contacto = doc.proveedor_id || "Proveedor"; }
                }
                return {
                    numero: doc.numero || '-',
                    fecha: doc.fecha || '-',
                    tipo: doc.tipo || 'VENTA',
                    contacto_nombre: contacto,
                    contacto_tel: tel,
                    contacto_email: email,
                    total: doc.total || 0,
                    metodo_pago: doc.metodo_pago || 'efectivo',
                    estado: doc.estado || 'APROBADO',
                    creado_por: doc.creado_por || '-'
                };
            });
        }
    },

    ITEMS_DETALLE: {
        columnas: ["doc_numero", "doc_tipo", "fecha", "contacto_nombre", "codigo", "descripcion", "cantidad", "precio_unitario", "importe"],
        etiquetas: { doc_numero: "Nº Comprobante", doc_tipo: "Comprobante", fecha: "Fecha", contacto_nombre: "Cliente / Proveedor", codigo: "Código Art.", descripcion: "Producto", cantidad: "Cantidad", precio_unitario: "P. Unitario ($)", importe: "Importe ($)" },
        obtenerDatos: async () => {
            const [rPres, rPed, rRem, rCli, rProv] = await Promise.all([
                fetch('/api/documentos/presupuestos').then(r => r.json()).catch(() => []),
                fetch('/api/documentos/pedidos').then(r => r.json()).catch(() => []),
                fetch('/api/documentos/remitos').then(r => r.json()).catch(() => []),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            const pMapped = (Array.isArray(rPres) ? rPres : []).map(d => ({ ...d, doc_tipo: "Presupuesto" }));
            const pedMapped = (Array.isArray(rPed) ? rPed : []).map(d => ({ ...d, doc_tipo: "Pedido" }));
            const rMapped = (Array.isArray(rRem) ? rRem : []).map(d => ({ ...d, doc_tipo: "Remito" }));
            const todos = [...pMapped, ...pedMapped, ...rMapped];
            
            const dictCli = (rCli && typeof rCli === 'object') ? rCli : {};
            const dictProv = (rProv && typeof rProv === 'object') ? rProv : {};

            let lineas = [];
            todos.forEach(doc => {
                let contacto = "-";
                if (doc.tipo === "VENTA") {
                    contacto = doc.cliente_id && dictCli[doc.cliente_id] ? dictCli[doc.cliente_id].nombre : (doc.cliente_id || "Consumidor Final");
                } else {
                    contacto = doc.proveedor_id && dictProv[doc.proveedor_id] ? dictProv[doc.proveedor_id].nombre : (doc.proveedor_id || "Proveedor");
                }
                if (doc.items && Array.isArray(doc.items)) {
                    doc.items.forEach(it => {
                        lineas.push({
                            doc_numero: doc.numero || '-',
                            doc_tipo: doc.doc_tipo || 'Remito',
                            fecha: doc.fecha || '-',
                            contacto_nombre: contacto,
                            codigo: it.codigo || '-',
                            descripcion: it.descripcion || '-',
                            cantidad: it.cantidad || 1,
                            precio_unitario: it.precio_unitario || 0,
                            importe: it.importe || 0
                        });
                    });
                }
            });
            return lineas;
        }
    },

    CC_CLIENTES: {
        columnas: ["id", "nombre", "telefono", "email", "saldo"],
        etiquetas: { id: "ID Cliente", nombre: "Nombre / Razón Social", telefono: "Teléfono", email: "Correo Electrónico", saldo: "Saldo Activo Deudor ($)" },
        obtenerDatos: async () => {
            const res1 = await fetch('/api/clientes');
            const clientes = await res1.json().catch(() => ({}));
            const res2 = await fetch('/api/cc/clientes');
            const cc = await res2.json().catch(() => ({}));
            return Object.entries(cc||{}).map(([id, data]) => ({
                id: id,
                nombre: clientes[id] ? clientes[id].nombre : id,
                telefono: clientes[id] ? (clientes[id].telefono || '-') : '-',
                email: clientes[id] ? (clientes[id].email || '-') : '-',
                saldo: data.saldo || 0
            }));
        }
    },

    CC_A_COBRAR: {
        columnas: ["numero", "fecha", "cliente_nombre", "cliente_tel", "cliente_email", "total", "saldo_pendiente"],
        etiquetas: { numero: "Nº Comprobante", fecha: "Fecha Emisión", cliente_nombre: "Cliente", cliente_tel: "Teléfono", cliente_email: "Correo Electrónico", total: "Total Neto ($)", saldo_pendiente: "Saldo Pendiente ($)" },
        obtenerDatos: async () => {
            const res1 = await fetch('/api/documentos/pedidos');
            const pedidos = await res1.json().catch(() => []);
            const res2 = await fetch('/api/documentos/remitos');
            const remitos = await res2.json().catch(() => []);
            const res3 = await fetch('/api/clientes');
            const clientes = await res3.json().catch(() => ({}));
            
            const todos = [...(Array.isArray(pedidos)?pedidos:[]), ...(Array.isArray(remitos)?remitos:[])];
            return todos.filter(doc => doc.tipo === "VENTA" && doc.metodo_pago === "cc" && doc.saldo_pendiente > 0.01).map(doc => ({
                numero: doc.numero,
                fecha: doc.fecha,
                cliente_nombre: clientes[doc.cliente_id] ? clientes[doc.cliente_id].nombre : doc.cliente_id,
                cliente_tel: clientes[doc.cliente_id] ? (clientes[doc.cliente_id].telefono || '-') : '-',
                cliente_email: clientes[doc.cliente_id] ? (clientes[doc.cliente_id].email || '-') : '-',
                total: doc.total,
                saldo_pendiente: doc.saldo_pendiente
            }));
        }
    },

    CC_PROVEEDORES: {
        columnas: ["id", "nombre", "contacto", "telefono", "email", "saldo"],
        etiquetas: { id: "ID Proveedor", nombre: "Razón Social", contacto: "Contacto Principal", telefono: "Teléfono", email: "Correo Electrónico", saldo: "Saldo Deudor ($)" },
        obtenerDatos: async () => {
            const res1 = await fetch('/api/proveedores');
            const proveedores = await res1.json().catch(() => ({}));
            const res2 = await fetch('/api/cc/proveedores');
            const cc = await res2.json().catch(() => ({}));
            return Object.entries(cc||{}).map(([id, data]) => ({
                id: id,
                nombre: proveedores[id] ? proveedores[id].nombre : id,
                contacto: proveedores[id] ? (proveedores[id].contacto || '-') : '-',
                telefono: proveedores[id] ? (proveedores[id].telefono || '-') : '-',
                email: proveedores[id] ? (proveedores[id].email || '-') : '-',
                saldo: data.saldo || 0
            }));
        }
    },

    CC_A_PAGAR: {
        columnas: ["numero", "fecha", "proveedor_nombre", "proveedor_tel", "proveedor_email", "total", "saldo_pendiente"],
        etiquetas: { numero: "Nº Comprobante", fecha: "Fecha Emisión", proveedor_nombre: "Proveedor", proveedor_tel: "Teléfono", proveedor_email: "Correo Electrónico", total: "Total Neto ($)", saldo_pendiente: "Saldo Pendiente ($)" },
        obtenerDatos: async () => {
            const res1 = await fetch('/api/documentos/pedidos');
            const pedidos = await res1.json().catch(() => []);
            const res2 = await fetch('/api/documentos/remitos');
            const remitos = await res2.json().catch(() => []);
            const res3 = await fetch('/api/proveedores');
            const proveedores = await res3.json().catch(() => ({}));
            
            const todos = [...(Array.isArray(pedidos)?pedidos:[]), ...(Array.isArray(remitos)?remitos:[])];
            return todos.filter(doc => doc.tipo === "COMPRA" && doc.metodo_pago === "cc" && doc.saldo_pendiente > 0.01).map(doc => ({
                numero: doc.numero,
                fecha: doc.fecha,
                proveedor_nombre: proveedores[doc.proveedor_id] ? proveedores[doc.proveedor_id].nombre : doc.proveedor_id,
                proveedor_tel: proveedores[doc.proveedor_id] ? (proveedores[doc.proveedor_id].telefono || '-') : '-',
                proveedor_email: proveedores[doc.proveedor_id] ? (proveedores[doc.proveedor_id].email || proveedores[doc.proveedor_id].contacto || '-') : '-',
                total: doc.total,
                saldo_pendiente: doc.saldo_pendiente
            }));
        }
    },

    MOVIMIENTOS_CC: {
        columnas: ["entidad_tipo", "entidad_id", "entidad_nombre", "fecha", "tipo", "concepto", "monto", "saldo_acumulado", "medio_pago"],
        etiquetas: { entidad_tipo: "Tipo Entidad", entidad_id: "ID Entidad", entidad_nombre: "Nombre / Razón Social", fecha: "Fecha", tipo: "Operación", concepto: "Concepto / Detalle", monto: "Monto ($)", saldo_acumulado: "Saldo Acum. ($)", medio_pago: "Forma Pago" },
        obtenerDatos: async () => {
            const [rCli, rProv, cliDict, provDict] = await Promise.all([
                fetch('/api/cc/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/cc/proveedores').then(r => r.json()).catch(() => ({})),
                fetch('/api/clientes').then(r => r.json()).catch(() => ({})),
                fetch('/api/proveedores').then(r => r.json()).catch(() => ({}))
            ]);
            let movs = [];
            Object.entries((rCli && typeof rCli === 'object') ? rCli : {}).forEach(([id, data]) => {
                const nombre = cliDict[id] ? cliDict[id].nombre : id;
                if (data.historical && Array.isArray(data.historical)) {
                    data.historical.forEach(h => {
                        movs.push({
                            entidad_tipo: "Cliente",
                            entidad_id: id,
                            entidad_nombre: nombre,
                            fecha: h.fecha,
                            tipo: h.tipo,
                            concepto: h.concepto,
                            monto: h.monto,
                            saldo_acumulado: h.saldo_acumulado,
                            medio_pago: h.medio_pago || "-"
                        });
                    });
                }
            });
            Object.entries((rProv && typeof rProv === 'object') ? rProv : {}).forEach(([id, data]) => {
                const nombre = provDict[id] ? provDict[id].nombre : id;
                if (data.historical && Array.isArray(data.historical)) {
                    data.historical.forEach(h => {
                        movs.push({
                            entidad_tipo: "Proveedor",
                            entidad_id: id,
                            entidad_nombre: nombre,
                            fecha: h.fecha,
                            tipo: h.tipo,
                            concepto: h.concepto,
                            monto: h.monto,
                            saldo_acumulado: h.saldo_acumulado,
                            medio_pago: h.medio_pago || "-"
                        });
                    });
                }
            });
            return movs;
        }
    },

    CAJA_DIARIA: {
        columnas: ["id", "fecha", "tipo", "medio_pago", "concepto", "monto", "usuario"],
        etiquetas: { id: "ID Movimiento", fecha: "Fecha", tipo: "Tipo", medio_pago: "Medio de Pago", concepto: "Concepto / Motivo", monto: "Monto Neto ($)", usuario: "Registrado Por" },
        obtenerDatos: async () => {
            const res = await fetch('/api/caja');
            const caja = await res.json().catch(() => ({}));
            return caja.movimientos || [];
        }
    }
};

let REPORTE_COLUMNAS_ACTUALES = [];
let REPORTE_FILAS_ACTUALES = [];

document.addEventListener('DOMContentLoaded', () => {
    const repEl = document.getElementById('rep-tipo');
    if (repEl) {
        configurarColumnasReporte();
    }
});

function configurarColumnasReporte() {
    const repEl = document.getElementById('rep-tipo');
    if (!repEl) return;
    const tipo = repEl.value;
    const conf = CONFIG_INFORMES[tipo];
    if (!conf) return;
    
    REPORTE_COLUMNAS_ACTUALES = [...conf.columnas];
    
    const sel1 = document.getElementById('rep-orden-col-1');
    const sel2 = document.getElementById('rep-orden-col-2');
    
    if (sel1) {
        sel1.innerHTML = '';
        REPORTE_COLUMNAS_ACTUALES.forEach(col => {
            sel1.innerHTML += `<option value="${col}">${conf.etiquetas[col] || col}</option>`;
        });
        sel1.value = REPORTE_COLUMNAS_ACTUALES[0];
    }
    
    if (sel2) {
        sel2.innerHTML = '<option value="">-- Ninguno (Opcional) --</option>';
        REPORTE_COLUMNAS_ACTUALES.forEach(col => {
            sel2.innerHTML += `<option value="${col}">${conf.etiquetas[col] || col}</option>`;
        });
        sel2.value = "";
    }
    
    renderizarControlesColumnas();
    generarReporteDinamico();
}

function renderizarControlesColumnas() {
    const repEl = document.getElementById('rep-tipo');
    if (!repEl) return;
    const tipo = repEl.value;
    const conf = CONFIG_INFORMES[tipo];
    if (!conf) return;
    
    const cbContainer = document.getElementById('rep-columnas-checkboxes');
    if (cbContainer) {
        cbContainer.innerHTML = '';
        conf.columnas.forEach(col => {
            const checked = REPORTE_COLUMNAS_ACTUALES.includes(col) ? 'checked' : '';
            cbContainer.innerHTML += `
                <label class="flex items-center space-x-1.5 cursor-pointer">
                    <input type="checkbox" value="${col}" ${checked} onchange="toggleVisibilidadColumna('${col}')" class="rounded border-slate-300 text-indigo-600 h-4 w-4">
                    <span>${conf.etiquetas[col] || col}</span>
                </label>
            `;
        });
    }
    
    const reorderContainer = document.getElementById('rep-columnas-reordenador');
    if (reorderContainer) {
        reorderContainer.innerHTML = '';
        REPORTE_COLUMNAS_ACTUALES.forEach((col, idx) => {
            const leftDisabled = idx === 0 ? 'disabled' : '';
            const rightDisabled = idx === REPORTE_COLUMNAS_ACTUALES.length - 1 ? 'disabled' : '';
            
            reorderContainer.innerHTML += `
                <span class="inline-flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] font-extrabold shadow-sm text-slate-700">
                    <span>${conf.etiquetas[col] || col}</span>
                    <button onclick="moverColumna(${idx}, -1)" ${leftDisabled} class="text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 font-bold px-0.5">◀</button>
                    <button onclick="moverColumna(${idx}, 1)" ${rightDisabled} class="text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 font-bold px-0.5">▶</button>
                </span>
            `;
        });
    }
}

function toggleVisibilidadColumna(col) {
    if (REPORTE_COLUMNAS_ACTUALES.includes(col)) {
        if (REPORTE_COLUMNAS_ACTUALES.length <= 1) {
            if (typeof mostrarToast === 'function') mostrarToast("Al menos una columna debe permanecer visible", "error");
            configurarColumnasReporte();
            return;
        }
        REPORTE_COLUMNAS_ACTUALES = REPORTE_COLUMNAS_ACTUALES.filter(c => c !== col);
    } else {
        REPORTE_COLUMNAS_ACTUALES.push(col);
    }
    renderizarControlesColumnas();
    if (REPORTE_FILAS_ACTUALES.length > 0) {
        renderizarTablaResultado();
    }
}

function moverColumna(idx, direccion) {
    const destino = idx + direccion;
    if (destino < 0 || destino >= REPORTE_COLUMNAS_ACTUALES.length) return;
    
    const temp = REPORTE_COLUMNAS_ACTUALES[idx];
    REPORTE_COLUMNAS_ACTUALES[idx] = REPORTE_COLUMNAS_ACTUALES[destino];
    REPORTE_COLUMNAS_ACTUALES[destino] = temp;
    
    renderizarControlesColumnas();
    if (REPORTE_FILAS_ACTUALES.length > 0) {
        renderizarTablaResultado();
    }
}

async function generarReporteDinamico() {
    const repEl = document.getElementById('rep-tipo');
    if (!repEl) return;
    const tipo = repEl.value;
    const conf = CONFIG_INFORMES[tipo];
    if (!conf) return;
    
    const spinner = document.getElementById('spinner-rep');
    if (spinner) spinner.classList.remove('hidden');
    
    try {
        const datos = await conf.obtenerDatos();
        
        const sel1 = document.getElementById('rep-orden-col-1');
        const sel2 = document.getElementById('rep-orden-col-2');
        const dirEl = document.getElementById('rep-orden-dir');
        
        const ordenCol1 = sel1 ? sel1.value : '';
        const ordenCol2 = sel2 ? sel2.value : '';
        const direccion = dirEl ? dirEl.value : 'ASC';
        
        if (ordenCol1) {
            datos.sort((a, b) => {
                let valA1 = a[ordenCol1];
                let valB1 = b[ordenCol1];
                
                let comp1 = compararValoresDinamicos(valA1, valB1, direccion);
                if (comp1 !== 0) return comp1;
                
                if (ordenCol2) {
                    let valA2 = a[ordenCol2];
                    let valB2 = b[ordenCol2];
                    return compararValoresDinamicos(valA2, valB2, direccion);
                }
                return 0;
            });
        }
        
        REPORTE_FILAS_ACTUALES = datos;
        renderizarTablaResultado();
        if (typeof mostrarToast === 'function') {
            mostrarToast("Reporte dinámico generado con éxito", "success");
        }
    } catch(e) {
        if (typeof mostrarToast === 'function') {
            mostrarToast("Error cargando los datos del reporte", "error");
        }
    } finally {
        if (spinner) spinner.classList.add('hidden');
    }
}

function compararValoresDinamicos(valA, valB, dir) {
    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';
    
    let comp = 0;
    if (typeof valA === 'string' && typeof valB === 'string') {
        comp = valA.localeCompare(valB);
    } else {
        comp = valA - valB;
    }
    
    return dir === 'ASC' ? comp : -comp;
}

function renderizarTablaResultado() {
    const repEl = document.getElementById('rep-tipo');
    if (!repEl) return;
    const tipo = repEl.value;
    const conf = CONFIG_INFORMES[tipo];
    if (!conf) return;
    
    const thead = document.getElementById('tabla-informe-cabecera');
    const tbody = document.getElementById('tabla-informe-cuerpo');
    if (!thead || !tbody) return;
    
    thead.innerHTML = '';
    tbody.innerHTML = '';
    
    const trHead = document.createElement('tr');
    trHead.className = "bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b";
    REPORTE_COLUMNAS_ACTUALES.forEach(col => {
        trHead.innerHTML += `<th class="py-3 px-4">${conf.etiquetas[col] || col}</th>`;
    });
    thead.appendChild(trHead);
    
    if (REPORTE_FILAS_ACTUALES.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-slate-400 font-medium italic">No hay datos disponibles para este informe.</td></tr>`;
        return;
    }
    
    REPORTE_FILAS_ACTUALES.forEach(row => {
        const trRow = document.createElement('tr');
        trRow.className = "border-b hover:bg-slate-50 text-slate-700 text-xs";
        
        REPORTE_COLUMNAS_ACTUALES.forEach(col => {
            let val = row[col];
            if (val === undefined || val === null) val = '-';
            
            let valDisplay = val;
            if (col === 'fecha') {
                valDisplay = formatearFecha(val);
            }
            
            let celdaHtml = `<td class="py-2.5 px-4">${valDisplay}</td>`;
            
            if (typeof val === 'number') {
                if (col.includes('precio') || col.includes('total') || col.includes('saldo') || col.includes('monto') || col.includes('importe')) {
                    celdaHtml = `<td class="py-2.5 px-4 font-mono font-bold">$${val.toFixed(2)}</td>`;
                } else if (col === 'cantidad') {
                    const stockRojoClass = val <= 10 ? 'text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5' : '';
                    celdaHtml = `<td class="py-2.5 px-4 text-center font-bold ${stockRojoClass}">${val}</td>`;
                }
            } else if (col === 'codigo' || col === 'numero' || col === 'doc_numero' || col === 'id') {
                celdaHtml = `<td class="py-2.5 px-4 font-mono font-bold text-indigo-700">${valDisplay}</td>`;
            } else if (col === 'tipo' || col === 'tipo_op') {
                const color = (val === 'VENTA' || val === 'INGRESO') ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200';
                celdaHtml = `<td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${color}">${valDisplay}</span></td>`;
            } else if (col === 'tipo_doc') {
                let badgeBg = 'bg-slate-100 text-slate-700 border-slate-300';
                if (val === 'Pedido') badgeBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                if (val === 'Remito') badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                celdaHtml = `<td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeBg}">${valDisplay}</span></td>`;
            } else if (col === 'estado') {
                let stBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                if (val === 'PENDIENTE') stBg = 'bg-amber-50 text-amber-700 border-amber-200';
                celdaHtml = `<td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${stBg}">${valDisplay}</span></td>`;
            } else if (col === 'metodo_pago' || col === 'medio_pago') {
                const metodosLabels = {
                    efectivo: "💵 Efectivo",
                    cc: "⚖️ Cuenta Corriente",
                    tarjeta: "💳 Tarjeta",
                    billetera: "📱 Transferencia / QR",
                    transferencia: "📱 Transferencia / QR",
                    cheque: "📄 Cheque"
                };
                const txtLabel = metodosLabels[val] || val || 'Efectivo';
                celdaHtml = `<td class="py-2.5 px-4 font-semibold text-slate-700">${txtLabel}</td>`;
            }
            trRow.innerHTML += celdaHtml;
        });
        tbody.appendChild(trRow);
    });
}

function exportarCSVReporteDinamico() {
    if (REPORTE_FILAS_ACTUALES.length === 0) {
        if (typeof mostrarToast === 'function') mostrarToast("Genere un reporte antes de exportar", "error");
        return;
    }
    const repEl = document.getElementById('rep-tipo');
    if (!repEl) return;
    const tipo = repEl.value;
    const conf = CONFIG_INFORMES[tipo];
    
    let csv = REPORTE_COLUMNAS_ACTUALES.map(col => conf.etiquetas[col] || col).join(';') + '\n';
    
    REPORTE_FILAS_ACTUALES.forEach(row => {
        let fila = REPORTE_COLUMNAS_ACTUALES.map(col => {
            let v = row[col];
            if (v === undefined || v === null) v = '';
            if (col === 'fecha') v = formatearFecha(v);
            if (typeof v === 'string') return `"${v}"`;
            return v;
        }).join(';');
        csv += fila + '\n';
    });
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Reporte_Dinamico_${tipo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof mostrarToast === 'function') mostrarToast("CSV descargado con éxito", "success");
}

function imprimirReporteDinamico() {
    if (REPORTE_FILAS_ACTUALES.length === 0) return;
    window.print();
}
