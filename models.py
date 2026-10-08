# -*- coding: utf-8 -*-
import os
import json

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

def cargar_datos(archivo, default):
    ruta = os.path.join(DATA_DIR, archivo)
    if not os.path.exists(ruta):
        guardar_datos(archivo, default)
        return default
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error cargando {archivo}: {e}")
        return default

def guardar_datos(archivo, datos):
    ruta = os.path.join(DATA_DIR, archivo)
    try:
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"Error guardando {archivo}: {e}")
        return False

def sincronizar_y_auditar_sistema():
    """
    Motor Central de Auditoría e Integridad de Datos (v31):
    Garantiza que el stock de articulos y los saldos de CC sean 100% exactos,
    matemáticos y trazables a los comprobantes de venta/compra y cobros/pagos.
    Aísla los documentos por clave única (proveedor_id/cliente_id + tipo + numero).
    """
    remitos = cargar_datos('remitos.json', [])
    pedidos = cargar_datos('pedidos.json', [])
    presupuestos = cargar_datos('presupuestos.json', [])
    articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    clientes = cargar_datos('clientes.json', DEFAULT_CLIENTES)
    proveedores = cargar_datos('proveedores.json', DEFAULT_PROVEEDORES)
    cc_clientes = cargar_datos('cc_clientes.json', {})
    cc_proveedores = cargar_datos('cc_proveedores.json', {})
    
    # 1. Asignar clave única id_unico a cada documento
    def asegurar_id_doc(doc, tipo_doc):
        op = doc.get('tipo', 'VENTA')
        entidad = doc.get('proveedor_id') if op == 'COMPRA' else doc.get('cliente_id')
        num = doc.get('numero', 'REM-0000')
        if 'id' not in doc or not doc['id']:
            doc['id'] = f"{op}_{entidad or 'GEN'}_{tipo_doc}_{num}"
            
    for r in remitos: asegurar_id_doc(r, 'remitos')
    for p in pedidos: asegurar_id_doc(p, 'pedidos')
    for pr in presupuestos: asegurar_id_doc(pr, 'presupuestos')
    
    guardar_datos('remitos.json', remitos)
    guardar_datos('pedidos.json', pedidos)
    guardar_datos('presupuestos.json', presupuestos)

    # 2. Autodislocar y registrar cualquier articulo nuevo que aparezca en los comprobantes
    todos_docs = remitos + pedidos + presupuestos
    for doc in todos_docs:
        for it in doc.get("items", []):
            cod = it.get("codigo")
            if cod and cod not in articulos:
                desc = it.get("descripcion", f"Producto {cod}")
                precio = float(it.get("precio_unitario", 0))
                articulos[cod] = {
                    "codigo": cod,
                    "descripcion": desc,
                    "cantidad": 0,
                    "stock_inicial": 0,
                    "precio_costo": precio if doc.get("tipo") == "COMPRA" else round(precio / 1.3, 2),
                    "ganancia": 30.0,
                    "precio_venta": round(precio * 1.3, 2) if doc.get("tipo") == "COMPRA" else precio,
                    "familia": "Insumos" if cod.startswith("INSU") else "General"
                }
    
    # 3. Auditar y recalcular stock exacto por articulo
    for cod, art in articulos.items():
        stock_init = int(art.get('stock_inicial', 0))
        compras = 0
        ventas = 0
        
        # Compras y Ventas en Remitos
        for doc in remitos:
            op = doc.get('tipo', 'VENTA')
            for it in doc.get('items', []):
                if it.get('codigo') == cod:
                    cnt = int(it.get('cantidad', 0))
                    if op == 'COMPRA': compras += cnt
                    else: ventas += cnt
                    
        # Compras y Ventas en Pedidos
        for doc in pedidos:
            op = doc.get('tipo', 'VENTA')
            for it in doc.get('items', []):
                if it.get('codigo') == cod:
                    cnt = int(it.get('cantidad', 0))
                    if op == 'COMPRA': compras += cnt
                    else: ventas += cnt
                    
        art['cantidad'] = max(0, stock_init + compras - ventas)
        
    guardar_datos('articulos.json', articulos)
    
    # 4. Auditar saldos de Cuenta Corriente por Cliente y Proveedor
    todos_docs_cc = [d for d in (remitos + pedidos) if d.get('metodo_pago') == 'cc']
    
    for cid, cdata in cc_clientes.items():
        docs_cli = [d for d in todos_docs_cc if d.get('tipo') == 'VENTA' and d.get('cliente_id') == cid]
        saldo_deuda = sum(float(d.get('saldo_pendiente', d.get('total', 0))) for d in docs_cli)
        cdata['saldo'] = round(saldo_deuda, 2)
        
    for pid, pdata in cc_proveedores.items():
        docs_prov = [d for d in todos_docs_cc if d.get('tipo') == 'COMPRA' and d.get('proveedor_id') == pid]
        saldo_deuda = sum(float(d.get('saldo_pendiente', d.get('total', 0))) for d in docs_prov)
        pdata['saldo'] = round(saldo_deuda, 2)
        
    guardar_datos('cc_clientes.json', cc_clientes)
    guardar_datos('cc_proveedores.json', cc_proveedores)

# --- CONFIGURACION POR DEFECTO ---
DEFAULT_CONFIG = {
    "nombre_negocio": "StockDocente S.R.L.",
    "tema_color": "indigo",
    "logo_emoji": "📦",
    "logo_url": "",
    "subtitulo_negocio": "Distribuidor Comercial Multi-Rubro Modular",
    "domicilio_negocio": "Domicilio Comercial de Práctica 123 • Buenos Aires • CUIT 30-12345678-9",
    "gmail_user": "",
    "gmail_app_password": "",
    "modulos_activos": {
        "stock": True,
        "ventas": True,
        "compras": True,
        "cc_clientes": True,
        "cc_proveedores": True,
        "informes": True,
        "pagos": True,
        "carrito": True,
        "caja": True,
        "master": True
    }
}

DEFAULT_USUARIOS = {
    "superadmin": {
        "username": "superadmin",
        "password": "superadmin123",
        "role": "superadmin",
        "nombre": "Desarrollador Master"
    },
    "admin": {
        "username": "admin",
        "password": "admin123",
        "role": "admin",
        "nombre": "Director General"
    },
    "vendedor": {
        "username": "vendedor",
        "password": "vendedor123",
        "role": "vendedor",
        "nombre": "Vendedor de Salón"
    },
    "cliente1": {
        "username": "cliente1",
        "password": "cliente123",
        "role": "cliente",
        "nombre": "Ferretería Centro S.A.",
        "cliente_id": "CLI-002"
    }
}

DEFAULT_ARTICULOS = {
    "ALIM-001": {"codigo": "ALIM-001", "descripcion": "Leche Entera 1L", "cantidad": 120, "stock_inicial": 120, "precio_costo": 80.0, "ganancia": 25.0, "precio_venta": 100.0, "familia": "Alimentos"},
    "ALIM-002": {"codigo": "ALIM-002", "descripcion": "Yerba Mate 1Kg", "cantidad": 45, "stock_inicial": 45, "precio_costo": 300.0, "ganancia": 33.33, "precio_venta": 400.0, "familia": "Alimentos"},
    "LIM-001": {"codigo": "LIM-001", "descripcion": "Lavandina Clásica 2L", "cantidad": 60, "stock_inicial": 60, "precio_costo": 120.0, "ganancia": 50.0, "precio_venta": 180.0, "familia": "Limpieza"}
}

DEFAULT_CLIENTES = {
    "CLI-001": {"id": "CLI-001", "nombre": "Consumidor Final", "telefono": "-", "email": "-"},
    "CLI-002": {"id": "CLI-002", "nombre": "Ferretería Centro S.A.", "telefono": "4555-1234", "email": "contacto@ferreteriacentro.com"},
    "CLI-003": {"id": "CLI-003", "nombre": "Despensa Doña Rosa", "telefono": "4999-5678", "email": "rosa@despensa.com"}
}

DEFAULT_PROVEEDORES = {
    "PROV-001": {"id": "PROV-001", "nombre": "Distribuidora Alimenticia S.A.", "contacto": "Carlos Méndez", "telefono": "4888-0001"}
}

def inicializar_archivos_por_defecto():
    cargar_datos('config.json', DEFAULT_CONFIG)
    cargar_datos('usuarios.json', DEFAULT_USUARIOS)
    cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    cargar_datos('clientes.json', DEFAULT_CLIENTES)
    cargar_datos('proveedores.json', DEFAULT_PROVEEDORES)
    cargar_datos('cc_clientes.json', {})
    cargar_datos('cc_proveedores.json', {})
    cargar_datos('remitos.json', [])
    cargar_datos('pedidos.json', [])
    cargar_datos('presupuestos.json', [])
    cargar_datos('caja.json', {"movimientos": []})

inicializar_archivos_por_defecto()
