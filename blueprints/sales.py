# -*- coding: utf-8 -*-
import re
import datetime
from flask import Blueprint, request, jsonify, session
from models import cargar_datos, guardar_datos, sincronizar_y_auditar_sistema, DEFAULT_CLIENTES, DEFAULT_PROVEEDORES, DEFAULT_ARTICULOS

bp_sales = Blueprint('sales', __name__)

@bp_sales.route('/api/clientes', methods=['GET'])
def get_clientes():
    return jsonify(cargar_datos('clientes.json', DEFAULT_CLIENTES))

@bp_sales.route('/api/clientes', methods=['POST'])
def save_cliente():
    if "usuario" not in session:
        return jsonify({"success": False, "message": "Inicie sesión primero"}), 401
    
    clientes = cargar_datos('clientes.json', DEFAULT_CLIENTES)
    data = request.json or {}
    
    cid = data.get("id")
    if not cid:
        existentes = [int(k.split('-')[1]) for k in clientes.keys() if k.startswith("CLI-") and len(k.split('-')) > 1 and k.split('-')[1].isdigit()]
        siguiente = max(existentes) + 1 if existentes else 1
        cid = f"CLI-{siguiente:03d}"
        
    clientes[cid] = {
        "id": cid,
        "nombre": data.get("nombre", "").strip(),
        "contacto": data.get("contacto", "").strip(),
        "telefono": data.get("telefono", "").strip(),
        "email": data.get("email", "").strip()
    }
    guardar_datos('clientes.json', clientes)
    return jsonify({"success": True, "cliente": clientes[cid]})

@bp_sales.route('/api/clientes/<id>', methods=['DELETE'])
def delete_cliente(id):
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
    clientes = cargar_datos('clientes.json', DEFAULT_CLIENTES)
    if id in clientes:
        clientes.pop(id)
        guardar_datos('clientes.json', clientes)
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Cliente no encontrado"}), 404

@bp_sales.route('/api/proveedores', methods=['GET'])
def get_proveedores():
    return jsonify(cargar_datos('proveedores.json', DEFAULT_PROVEEDORES))

@bp_sales.route('/api/proveedores', methods=['POST'])
def save_proveedor():
    if "usuario" not in session:
        return jsonify({"success": False, "message": "Inicie sesión"}), 401
    proveedores = cargar_datos('proveedores.json', DEFAULT_PROVEEDORES)
    data = request.json or {}
    
    pid = data.get("id")
    if not pid:
        existentes = [int(k.split('-')[1]) for k in proveedores.keys() if k.startswith("PROV-") and len(k.split('-')) > 1 and k.split('-')[1].isdigit()]
        siguiente = max(existentes) + 1 if existentes else 1
        pid = f"PROV-{siguiente:03d}"
        
    proveedores[pid] = {
        "id": pid,
        "nombre": data.get("nombre", "").strip(),
        "contacto": data.get("contacto", "").strip(),
        "telefono": data.get("telefono", "").strip(),
        "email": data.get("email", "").strip()
    }
    guardar_datos('proveedores.json', proveedores)
    return jsonify({"success": True, "proveedor": proveedores[pid]})

@bp_sales.route('/api/proveedores/<id>', methods=['DELETE'])
def delete_proveedor(id):
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
    proveedores = cargar_datos('proveedores.json', DEFAULT_PROVEEDORES)
    if id in proveedores:
        proveedores.pop(id)
        guardar_datos('proveedores.json', proveedores)
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Proveedor no encontrado"}), 404

# --- CONTROLADOR CENTRAL DE DOCUMENTOS (V2.0) ---

@bp_sales.route('/api/documentos/<tipo>', methods=['GET'])
def get_documentos(tipo):
    if tipo not in ["presupuestos", "pedidos", "remitos"]:
        return jsonify({"success": False, "message": "Tipo inválido"}), 400
    sincronizar_y_auditar_sistema()
    return jsonify(cargar_datos(f'{tipo}.json', []))

@bp_sales.route('/api/documentos/<tipo>', methods=['POST'])
def save_documento(tipo):
    if "usuario" not in session:
        return jsonify({"success": False, "message": "Acceso denegado"}), 401
        
    if tipo not in ["presupuestos", "pedidos", "remitos"]:
        return jsonify({"success": False, "message": "Tipo de documento inválido"}), 400
        
    data = request.json or {}
    items = data.get("items", [])
    if not items:
        return jsonify({"success": False, "message": "El documento no tiene artículos"}), 400
        
    # Validar rol para edición de precios
    user_role = session.get("rol")
    if user_role == "vendedor":
        articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
        for item in items:
            cod = item.get("codigo")
            if cod in articulos:
                precio_sugerido = articulos[cod]["precio_venta"]
                precio_ingresado = float(item.get("precio_unitario", 0))
                if abs(precio_sugerido - precio_ingresado) > 0.01 and data.get("tipo_op") == "VENTA":
                    return jsonify({"success": False, "message": "El vendedor no está autorizado a modificar precios inline"}), 403

    documentos = cargar_datos(f'{tipo}.json', [])
    
    # Resolver folios y numeración de forma inteligente
    numero_manual = data.get("numero", "").strip()
    if tipo == "remitos" and numero_manual:
        folio = numero_manual
    else:
        prefijos = {"presupuestos": "PRE", "pedidos": "PED", "remitos": "REM"}
        pref = prefijos[tipo]
        # Calcular siguiente numero basandose en el mayor numero entero existente
        nums_existentes = []
        for d in documentos:
            num_str = d.get("numero", "")
            if num_str.startswith(f"{pref}-"):
                try:
                    num_val = int(num_str.split("-")[1])
                    nums_existentes.append(num_val)
                except Exception:
                    pass
        siguiente = max(nums_existentes) + 1 if nums_existentes else (len(documentos) + 1)
        folio = f"{pref}-{siguiente:04d}"
        
    tipo_op = data.get("tipo_op", "VENTA") # VENTA (Clientes) o COMPRA (Proveedores)
    entidad_id = data.get("cliente_id") if tipo_op == "VENTA" else data.get("proveedor_id")
    
    # Generar ID compuesto de documento para aislamiento absoluto entre proveedores/clientes
    doc_id = f"{tipo_op}_{entidad_id or 'GEN'}_{tipo}_{folio}"
    
    # Crear estructura de documento
    nuevo_doc = {
        "id": doc_id,
        "numero": folio,
        "fecha": data.get("fecha", datetime.date.today().isoformat()),
        "tipo": tipo_op,
        "cliente_id": data.get("cliente_id"),
        "proveedor_id": data.get("proveedor_id"),
        "items": items,
        "subtotal": float(data.get("subtotal", 0)),
        "descuento": float(data.get("descuento", 0)),
        "total": float(data.get("total", 0)),
        "metodo_pago": data.get("metodo_pago", "efectivo"),
        "creado_por": session["usuario"],
        "estado": data.get("estado", "APROBADO"),
        "saldo_pendiente": float(data.get("total", 0)) if data.get("metodo_pago") == "cc" else 0.0
    }
    
    # --- PROCESO LÓGICO DE STOCK (PEDIDOS Y REMITOS) ---
    if tipo in ["remitos", "pedidos"]:
        articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
        
        for item in items:
            cod = item["codigo"]
            cant = int(item["cantidad"])
            if cod in articulos:
                if tipo_op == "VENTA":
                    if articulos[cod]["cantidad"] < cant:
                        return jsonify({"success": False, "message": f"Stock insuficiente para {articulos[cod]['descripcion']}. Disponible: {articulos[cod]['cantidad']}"}), 400
                    articulos[cod]["cantidad"] -= cant
                else:
                    articulos[cod]["cantidad"] += cant
        guardar_datos('articulos.json', articulos)
        
        # --- PROCESO LÓGICO FINANCIERO EN CUENTA CORRIENTE ---
        metodo = nuevo_doc["metodo_pago"]
        total = nuevo_doc["total"]
        if metodo == "cc":
            if tipo_op == "VENTA":
                cid = nuevo_doc["cliente_id"]
                cc = cargar_datos('cc_clientes.json', {})
                if cid not in cc:
                    cc[cid] = {"saldo": 0.0, "historical": []}
                cc[cid]["saldo"] += total
                cc[cid]["historical"].append({
                    "fecha": nuevo_doc["fecha"],
                    "tipo": f"{tipo.upper()}_VENTA",
                    "concepto": f"{tipo.capitalize()[:-1]} {folio} ({cid})",
                    "monto": total,
                    "saldo_acumulado": cc[cid]["saldo"]
                })
                guardar_datos('cc_clientes.json', cc)
            else:
                pid = nuevo_doc["proveedor_id"]
                cc = cargar_datos('cc_proveedores.json', {})
                if pid not in cc:
                    cc[pid] = {"saldo": 0.0, "historical": []}
                cc[pid]["saldo"] += total
                cc[pid]["historical"].append({
                    "fecha": nuevo_doc["fecha"],
                    "tipo": f"{tipo.upper()}_COMPRA",
                    "concepto": f"{tipo.capitalize()[:-1]} {folio} ({pid})",
                    "monto": total,
                    "saldo_acumulado": cc[pid]["saldo"]
                })
                guardar_datos('cc_proveedores.json', cc)
                
        # --- MOVIMIENTO DE CAJA AUTOMÁTICO ---
        if metodo != "cc":
            caja = cargar_datos('caja.json', {"movimientos": []})
            movs = caja.get("movimientos", [])
            tipo_caja = "INGRESO" if tipo_op == "VENTA" else "EGRESO"
            monto_caja = total if tipo_op == "VENTA" else -total
            movs.append({
                "id": f"MOV-{len(movs) + 1:04d}",
                "fecha": nuevo_doc["fecha"],
                "tipo": tipo_caja,
                "monto": monto_caja,
                "medio_pago": metodo,
                "concepto": f"{tipo.capitalize()[:-1]} {folio} ({nuevo_doc['tipo']})",
                "usuario": session["usuario"]
            })
            caja["movimientos"] = movs
            guardar_datos('caja.json', caja)

    documentos.append(nuevo_doc)
    guardar_datos(f'{tipo}.json', documentos)
    sincronizar_y_auditar_sistema()
    return jsonify({"success": True, "documento": nuevo_doc})

@bp_sales.route('/api/documentos/convertir', methods=['POST'])
def convertir_presupuesto():
    if "usuario" not in session:
        return jsonify({"success": False, "message": "Acceso denegado"}), 401
        
    data = request.json or {}
    pre_num = data.get("presupuesto_numero")
    
    presupuestos = cargar_datos('presupuestos.json', [])
    pre_doc = next((p for p in presupuestos if p["numero"] == pre_num), None)
    if not pre_doc:
        return jsonify({"success": False, "message": "Presupuesto no encontrado"}), 404
        
    pedidos = cargar_datos('pedidos.json', [])
    nums_existentes = []
    for p in pedidos:
        if p.get("numero", "").startswith("PED-"):
            try: nums_existentes.append(int(p["numero"].split("-")[1]))
            except Exception: pass
    siguiente = max(nums_existentes) + 1 if nums_existentes else (len(pedidos) + 1)
    folio = f"PED-{siguiente:04d}"
    
    tipo_op = pre_doc["tipo"]
    entidad_id = pre_doc.get("proveedor_id") if tipo_op == "COMPRA" else pre_doc.get("cliente_id")
    doc_id = f"{tipo_op}_{entidad_id or 'GEN'}_pedidos_{folio}"
    
    nuevo_pedido = {
        "id": doc_id,
        "numero": folio,
        "fecha": datetime.date.today().isoformat(),
        "tipo": tipo_op,
        "cliente_id": pre_doc["cliente_id"],
        "proveedor_id": pre_doc["proveedor_id"],
        "items": pre_doc["items"],
        "subtotal": pre_doc["subtotal"],
        "descuento": pre_doc["descuento"],
        "total": pre_doc["total"],
        "metodo_pago": data.get("metodo_pago", "efectivo"),
        "creado_por": session["usuario"],
        "estado": "APROBADO",
        "saldo_pendiente": float(pre_doc["total"]) if data.get("metodo_pago") == "cc" else 0.0
    }
    
    # Al convertir presupuesto en pedido, APLICAR MOVIMIENTO DE STOCK
    articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    items = nuevo_pedido["items"]
    
    for item in items:
        cod = item["codigo"]
        cant = int(item["cantidad"])
        if cod in articulos:
            if tipo_op == "VENTA":
                if articulos[cod]["cantidad"] < cant:
                    return jsonify({"success": False, "message": f"Stock insuficiente para convertir: {articulos[cod]['descripcion']}. Disponible: {articulos[cod]['cantidad']}"}), 400
                articulos[cod]["cantidad"] -= cant
            else:
                articulos[cod]["cantidad"] += cant
    guardar_datos('articulos.json', articulos)
    
    # Procesar financiera CC
    metodo = nuevo_pedido["metodo_pago"]
    total = nuevo_pedido["total"]
    
    if metodo == "cc":
        if tipo_op == "VENTA":
            cid = nuevo_pedido["cliente_id"]
            cc = cargar_datos('cc_clientes.json', {})
            if cid not in cc:
                cc[cid] = {"saldo": 0.0, "historical": []}
            cc[cid]["saldo"] += total
            cc[cid]["historical"].append({
                "fecha": nuevo_pedido["fecha"],
                "tipo": "PEDIDO_VENTA",
                "concepto": f"Pedido {folio} (Conv.)",
                "monto": total,
                "saldo_acumulado": cc[cid]["saldo"]
            })
            guardar_datos('cc_clientes.json', cc)
        else:
            pid = nuevo_pedido["proveedor_id"]
            cc = cargar_datos('cc_proveedores.json', {})
            if pid not in cc:
                cc[pid] = {"saldo": 0.0, "historical": []}
            cc[pid]["saldo"] += total
            cc[pid]["historical"].append({
                "fecha": nuevo_pedido["fecha"],
                "tipo": "PEDIDO_COMPRA",
                "concepto": f"Pedido {folio} (Conv.)",
                "monto": total,
                "saldo_acumulado": cc[pid]["saldo"]
            })
            guardar_datos('cc_proveedores.json', cc)
            
    if metodo != "cc":
        caja = cargar_datos('caja.json', {"movimientos": []})
        movs = caja.get("movimientos", [])
        tipo_caja = "INGRESO" if tipo_op == "VENTA" else "EGRESO"
        monto_caja = total if tipo_op == "VENTA" else -total
        movs.append({
            "id": f"MOV-{len(movs) + 1:04d}",
            "fecha": nuevo_pedido["fecha"],
            "tipo": tipo_caja,
            "monto": monto_caja,
            "medio_pago": metodo,
            "concepto": f"Pedido {folio} (Conv. Presupuesto {pre_num})",
            "usuario": session["usuario"]
        })
        caja["movimientos"] = movs
        guardar_datos('caja.json', caja)

    pedidos.append(nuevo_pedido)
    guardar_datos('pedidos.json', pedidos)
    
    pre_doc["estado"] = f"ACEPTADO ({folio})"
    guardar_datos('presupuestos.json', presupuestos)
    sincronizar_y_auditar_sistema()
    return jsonify({"success": True, "pedido": nuevo_pedido})


@bp_sales.route('/api/cc/<entidad_tipo>/<id>/pendientes', methods=['GET'])
def get_cc_pendientes(entidad_tipo, id):
    if entidad_tipo not in ["clientes", "proveedores"]:
        return jsonify({"success": False, "message": "Entidad inválida"}), 400
    sincronizar_y_auditar_sistema()
    pedidos = cargar_datos('pedidos.json', [])
    remitos = cargar_datos('remitos.json', [])
    
    todos = pedidos + remitos
    
    filtrados = []
    for doc in todos:
        if doc.get("metodo_pago") == "cc" and float(doc.get("saldo_pendiente", 0)) > 0.01:
            if entidad_tipo == "clientes" and doc.get("tipo") == "VENTA" and doc.get("cliente_id") == id:
                filtrados.append(doc)
            elif entidad_tipo == "proveedores" and doc.get("tipo") == "COMPRA" and doc.get("proveedor_id") == id:
                filtrados.append(doc)
                
    return jsonify(filtrados)


@bp_sales.route('/api/documentos/<tipo>/<numero>', methods=['DELETE'])
def delete_documento(tipo, numero):
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado. Se requieren permisos de administrador."}), 403
        
    if tipo not in ["presupuestos", "pedidos", "remitos"]:
        return jsonify({"success": False, "message": "Tipo de documento no válido"}), 400
        
    data = request.args or request.json or {}
    entidad_id = data.get("entidad_id") or data.get("proveedor_id") or data.get("cliente_id")
    doc_id = data.get("doc_id")
    
    documentos = cargar_datos(f'{tipo}.json', [])
    
    doc = None
    if doc_id:
        doc = next((d for d in documentos if d.get("id") == doc_id), None)
    if not doc and entidad_id:
        doc = next((d for d in documentos if d.get("numero") == numero and (d.get("proveedor_id") == entidad_id or d.get("cliente_id") == entidad_id)), None)
    if not doc:
        doc = next((d for d in documentos if d.get("numero") == numero), None)
        
    if not doc:
        return jsonify({"success": False, "message": "Comprobante no encontrado"}), 404
        
    # Revertir stock si es Remito o Pedido (Presupuesto nunca alteró stock)
    if tipo in ["remitos", "pedidos"]:
        articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
        tipo_op = doc.get("tipo", "VENTA")
        items = doc.get("items", [])
        for item in items:
            cod = item.get("codigo")
            cant = int(item.get("cantidad", 0))
            if cod in articulos:
                if tipo_op == "VENTA":
                    articulos[cod]["cantidad"] += cant
                else:
                    articulos[cod]["cantidad"] = max(0, articulos[cod]["cantidad"] - cant)
        guardar_datos('articulos.json', articulos)
        
    # Revertir saldo pendiente de Cuenta Corriente si correspondía
    metodo = doc.get("metodo_pago")
    saldo_pend = float(doc.get("saldo_pendiente", 0))
    if metodo == "cc" and saldo_pend > 0.01:
        tipo_op = doc.get("tipo", "VENTA")
        if tipo_op == "VENTA" and doc.get("cliente_id"):
            cid = doc.get("cliente_id")
            cc = cargar_datos('cc_clientes.json', {})
            if cid in cc:
                cc[cid]["saldo"] = max(0.0, cc[cid]["saldo"] - saldo_pend)
                cc[cid]["historical"].append({
                    "fecha": datetime.date.today().isoformat(),
                    "tipo": "ANULACION_COMPROBANTE",
                    "concepto": f"Anulación {numero} ({cid})",
                    "monto": -saldo_pend,
                    "saldo_acumulado": cc[cid]["saldo"]
                })
                guardar_datos('cc_clientes.json', cc)
        elif tipo_op == "COMPRA" and doc.get("proveedor_id"):
            pid = doc.get("proveedor_id")
            cc = cargar_datos('cc_proveedores.json', {})
            if pid in cc:
                cc[pid]["saldo"] = max(0.0, cc[pid]["saldo"] - saldo_pend)
                cc[pid]["historical"].append({
                    "fecha": datetime.date.today().isoformat(),
                    "tipo": "ANULACION_COMPROBANTE",
                    "concepto": f"Anulación {numero} ({pid})",
                    "monto": -saldo_pend,
                    "saldo_acumulado": cc[pid]["saldo"]
                })
                guardar_datos('cc_proveedores.json', cc)

    # Eliminar documento
    documentos = [d for d in documentos if d != doc]
    guardar_datos(f'{tipo}.json', documentos)
    sincronizar_y_auditar_sistema()
    
    return jsonify({"success": True, "message": f"Comprobante {numero} eliminado correctamente"})
