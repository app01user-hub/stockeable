// -*- coding: utf-8 -*-
/**
 * master.js - Consola de desarrollo y compilación modular de clientes
 */

async function compilarInstaladorPersonalizado() {
    const stock = document.getElementById('m-comp-stock').checked;
    const ventas = document.getElementById('m-comp-ventas').checked;
    const compras = document.getElementById('m-comp-compras').checked;
    const cc_clientes = document.getElementById('m-comp-cc_clientes').checked;
    const cc_proveedores = document.getElementById('m-comp-cc_proveedores').checked;
    const informes = document.getElementById('m-comp-informes').checked;
    const pagos = document.getElementById('m-comp-pagos').checked;
    const carrito = document.getElementById('m-comp-carrito').checked;
    
    const filename_raw = document.getElementById('m-comp-filename').value.trim();
    if (!filename_raw) {
        mostrarToast("Ingrese un nombre de archivo para el script", "error");
        return;
    }
    
    mostrarToast("Compilando código a medida...", "info");
    
    const payload = {
        filename: filename_raw,
        modules: {
            stock,
            ventas,
            compras,
            cc_clientes,
            cc_proveedores,
            informes,
            pagos,
            carrito
        }
    };
    
    try {
        const res = await fetch('/api/master/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        if (r.success) {
            mostrarToast("¡Proyecto v2.0 compilado con éxito!", "success");
            alert(`¡Compilación modular exitosa! Se ha creado e inyectado el script '${r.archivo}' en tu bandeja de Studio. Puedes descargarlo directamente.`);
        } else {
            mostrarToast(r.message, "error");
        }
    } catch(e) {
        mostrarToast("Error en el compilador de metaprogramación", "error");
    }
}
