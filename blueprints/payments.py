# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify, session
from models import cargar_datos, guardar_datos, sincronizar_y_auditar_sistema, DEFAULT_CLIENTES, DEFAULT_PROVEEDORES
import datetime

bp_payments = Blueprint('payments', __name__)

@bp_payments.route('/api/cc/clientes', methods=['GET'])
def get_cc_clientes():
    sincronizar_y_auditar_sistema()
    return jsonify(cargar_datos('cc_clientes.json', {}))

@bp_payments.route('/api/cc/proveedores', methods=['GET'])
def get_cc_proveedores():
    sincronizar_y_auditar_sistema()
    return jsonify(cargar_datos('cc_proveedores.json', {}))

@bp_payments.route('/api/cc/clientes/cobro', methods=['POST'])
def save_cc_cobro():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    data = request.json or {}
    cid = data.get("cliente_id")
    monto = float(data.get("monto", 0))
    concepto = data.get("concepto", "Cobro s/Recibo").strip()
    fecha = data.get("fecha", datetime.date.today().isoformat())
    
    if monto <= 0:
        return jsonify({"success": False, "message": "Monto debe ser mayor que cero"}), 400
        
    cc = cargar_datos('cc_clientes.json', {})
    if cid not in cc:
        cc[cid] = {"saldo": 0.0, "historical": []}
        
    # Descontar de documentos individuales si viene detallado (con aislamiento estricto por cliente_id)
    pagos_docs = data.get("pagos_documentos", [])
    if pagos_docs:
        pedidos = cargar_datos('pedidos.json', [])
        remitos = cargar_datos('remitos.json', [])
        
        for pdoc in pagos_docs:
            num = pdoc.get("numero")
            doc_id = pdoc.get("doc_id") or pdoc.get("id")
            m_pago = float(pdoc.get("monto", 0))
            
            # Buscar en pedidos de este cliente especifico
            for doc in pedidos:
                if (doc_id and doc.get("id") == doc_id) or (doc.get("numero") == num and doc.get("cliente_id") == cid):
                    doc["saldo_pendiente"] = max(0.0, float(doc.get("saldo_pendiente", doc.get("total", 0))) - m_pago)
                    break
            # Buscar en remitos de este cliente especifico
            for doc in remitos:
                if (doc_id and doc.get("id") == doc_id) or (doc.get("numero") == num and doc.get("cliente_id") == cid):
                    doc["saldo_pendiente"] = max(0.0, float(doc.get("saldo_pendiente", doc.get("total", 0))) - m_pago)
                    break
                    
        guardar_datos('pedidos.json', pedidos)
        guardar_datos('remitos.json', remitos)

    cc[cid]["saldo"] -= monto
    
    documentos_asociados = data.get("documentos_asociados", [])
    if documentos_asociados:
        for doc_item in documentos_asociados:
            doc_num = doc_item.get("numero")
            monto_ap = float(doc_item.get("monto_aplicado", 0))
            
            remitos = cargar_datos('remitos.json', [])
            rem_doc = next((r for r in remitos if r["numero"] == doc_num and r.get("cliente_id") == cid), None)
            if rem_doc:
                rem_doc["saldo_pendiente"] = max(0.0, float(rem_doc.get("saldo_pendiente", rem_doc["total"])) - monto_ap)
                guardar_datos('remitos.json', remitos)
            else:
                pedidos = cargar_datos('pedidos.json', [])
                ped_doc = next((p for p in pedidos if p["numero"] == doc_num and p.get("cliente_id") == cid), None)
                if ped_doc:
                    ped_doc["saldo_pendiente"] = max(0.0, float(ped_doc.get("saldo_pendiente", ped_doc["total"])) - monto_ap)
                    guardar_datos('pedidos.json', pedidos)

    cc[cid]["historical"].append({
        "fecha": fecha,
        "tipo": "COBRO_CC",
        "concepto": concepto,
        "monto": monto,
        "saldo_acumulado": cc[cid]["saldo"],
        "medio_pago": data.get("medio_pago", "efectivo"),
        "transferencia_alias": data.get("transferencia_alias", ""),
        "transferencia_txid": data.get("transferencia_txid", ""),
        "tarjeta_lote": data.get("tarjeta_lote", ""),
        "tarjeta_ult4": data.get("tarjeta_ult4", ""),
        "cheque_num": data.get("cheque_num", ""),
        "cheque_banco": data.get("cheque_banco", ""),
        "cheque_venc": data.get("cheque_venc", "")
    })
    
    # Registrar movimiento automático en Caja Diaria
    caja = cargar_datos('caja.json', {"movimientos": []})
    movs = caja.get("movimientos", [])
    movs.append({
        "id": f"MOV-{len(movs) + 1:04d}",
        "fecha": fecha,
        "tipo": "INGRESO",
        "monto": monto,
        "medio_pago": data.get("medio_pago", "efectivo"),
        "concepto": f"Cobro CC Cliente {cid} ({concepto})",
        "usuario": session.get("usuario", "admin")
    })
    caja["movimientos"] = movs
    guardar_datos('caja.json', caja)

    guardar_datos('cc_clientes.json', cc)
    sincronizar_y_auditar_sistema()
    return jsonify({"success": True, "cc": cc[cid]})

@bp_payments.route('/api/cc/proveedores/pago', methods=['POST'])
def save_cc_pago():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    data = request.json or {}
    pid = data.get("proveedor_id")
    monto = float(data.get("monto", 0))
    concepto = data.get("concepto", "Pago s/Comprobante").strip()
    fecha = data.get("fecha", datetime.date.today().isoformat())
    
    if monto <= 0:
        return jsonify({"success": False, "message": "Monto debe ser mayor que cero"}), 400
        
    cc = cargar_datos('cc_proveedores.json', {})
    if pid not in cc:
        cc[pid] = {"saldo": 0.0, "historical": []}
        
    # Descontar de documentos individuales si viene detallado (con aislamiento estricto por proveedor_id)
    pagos_docs = data.get("pagos_documentos", [])
    if pagos_docs:
        pedidos = cargar_datos('pedidos.json', [])
        remitos = cargar_datos('remitos.json', [])
        
        for pdoc in pagos_docs:
            num = pdoc.get("numero")
            doc_id = pdoc.get("doc_id") or pdoc.get("id")
            m_pago = float(pdoc.get("monto", 0))
            
            # Buscar en pedidos de este proveedor especifico
            for doc in pedidos:
                if (doc_id and doc.get("id") == doc_id) or (doc.get("numero") == num and doc.get("proveedor_id") == pid):
                    doc["saldo_pendiente"] = max(0.0, float(doc.get("saldo_pendiente", doc.get("total", 0))) - m_pago)
                    break
            # Buscar en remitos de este proveedor especifico
            for doc in remitos:
                if (doc_id and doc.get("id") == doc_id) or (doc.get("numero") == num and doc.get("proveedor_id") == pid):
                    doc["saldo_pendiente"] = max(0.0, float(doc.get("saldo_pendiente", doc.get("total", 0))) - m_pago)
                    break
                    
        guardar_datos('pedidos.json', pedidos)
        guardar_datos('remitos.json', remitos)

    cc[pid]["saldo"] -= monto
    
    documentos_asociados = data.get("documentos_asociados", [])
    if documentos_asociados:
        for doc_item in documentos_asociados:
            doc_num = doc_item.get("numero")
            monto_ap = float(doc_item.get("monto_applied", 0)) or float(doc_item.get("monto_aplicado", 0))
            
            remitos = cargar_datos('remitos.json', [])
            rem_doc = next((r for r in remitos if r["numero"] == doc_num and r.get("proveedor_id") == pid), None)
            if rem_doc:
                rem_doc["saldo_pendiente"] = max(0.0, float(rem_doc.get("saldo_pendiente", rem_doc["total"])) - monto_ap)
                guardar_datos('remitos.json', remitos)
            else:
                pedidos = cargar_datos('pedidos.json', [])
                ped_doc = next((p for p in pedidos if p["numero"] == doc_num and p.get("proveedor_id") == pid), None)
                if ped_doc:
                    ped_doc["saldo_pendiente"] = max(0.0, float(ped_doc.get("saldo_pendiente", ped_doc["total"])) - monto_ap)
                    guardar_datos('pedidos.json', pedidos)

    cc[pid]["historical"].append({
        "fecha": fecha,
        "tipo": "PAGO_CC",
        "concepto": concepto,
        "monto": monto,
        "saldo_acumulado": cc[pid]["saldo"],
        "medio_pago": data.get("medio_pago", "efectivo"),
        "transferencia_alias": data.get("transferencia_alias", ""),
        "transferencia_txid": data.get("transferencia_txid", ""),
        "tarjeta_lote": data.get("tarjeta_lote", ""),
        "tarjeta_ult4": data.get("tarjeta_ult4", ""),
        "cheque_num": data.get("cheque_num", ""),
        "cheque_banco": data.get("cheque_banco", ""),
        "cheque_venc": data.get("cheque_venc", "")
    })
    
    # Registrar movimiento automático en Caja Diaria
    caja = cargar_datos('caja.json', {"movimientos": []})
    movs = caja.get("movimientos", [])
    movs.append({
        "id": f"MOV-{len(movs) + 1:04d}",
        "fecha": fecha,
        "tipo": "EGRESO",
        "monto": -monto,
        "medio_pago": data.get("medio_pago", "efectivo"),
        "concepto": f"Pago CC Proveedor {pid} ({concepto})",
        "usuario": session.get("usuario", "admin")
    })
    caja["movimientos"] = movs
    guardar_datos('caja.json', caja)

    guardar_datos('cc_proveedores.json', cc)
    sincronizar_y_auditar_sistema()
    return jsonify({"success": True, "cc": cc[pid]})

# --- APIS ACADÉMICAS: STRIPE Y EMAIL SIMULADO ---

@bp_payments.route('/api/payments/charge', methods=['POST'])
def simulated_stripe_charge():
    data = request.json or {}
    amount = float(data.get("amount", 0))
    card_number = data.get("card_number", "").strip()
    
    import sys
    print("=" * 65, file=sys.stderr)
    print(" [STRIPE API SIMULATOR] - HTTPS POST request received!", file=sys.stderr)
    print(f" URL: https://api.stripe.com/v3/charges", file=sys.stderr)
    print(f" Request Payload: {{'amount': {amount * 100:.0f}, 'currency': 'usd', 'source': 'tok_visa'}}", file=sys.stderr)
    print(f" HTTP Headers: {{'Authorization': 'Bearer sk_test_51Mz...48g'}}", file=sys.stderr)
    print(" [STRIPE API SIMULATOR] - Running credit card validity checks...", file=sys.stderr)
    
    return jsonify({
        "success": True,
        "charge_id": "ch_3Mzv7kLkdI9Ty9bX1Tz48gX0",
        "status": "succeeded",
        "amount": amount,
        "network_status": "approved_by_network",
        "receipt_url": "https://stripe.com/receipts/acct_103254"
    })

@bp_payments.route('/api/payments/email', methods=['POST'])
def simulated_email_send():
    data = request.json or {}
    to_email = data.get("to", "").strip()
    subject = data.get("subject", "").strip()
    body = data.get("body", "").strip()
    doc_num = data.get("doc_number", "DOC-001")
    contacto_id = data.get("contacto_id")
    contacto_tipo = data.get("contacto_tipo", "cliente")
    
    if to_email and contacto_id:
        if contacto_tipo == "cliente":
            clientes = cargar_datos('clientes.json', DEFAULT_CLIENTES)
            if contacto_id in clientes:
                if clientes[contacto_id].get("email") != to_email:
                    clientes[contacto_id]["email"] = to_email
                    guardar_datos('clientes.json', clientes)
        else:
            proveedores = cargar_datos('proveedores.json', DEFAULT_PROVEEDORES)
            if contacto_id in proveedores:
                if proveedores[contacto_id].get("email") != to_email:
                    proveedores[contacto_id]["email"] = to_email
                    guardar_datos('proveedores.json', proveedores)

    config = cargar_datos('config.json', {})
    gmail_user = config.get("gmail_user", "").strip()
    gmail_pass = config.get("gmail_app_password", "").strip()
    
    if gmail_user and gmail_pass:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        try:
            msg = MIMEMultipart()
            msg['From'] = gmail_user
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain', 'utf-8'))
            
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(gmail_user, gmail_pass)
            server.send_message(msg)
            server.quit()
            
            return jsonify({
                "success": True,
                "message": f"¡Correo enviado con éxito vía Gmail SMTP a {to_email}!"
            })
        except Exception as e:
            print(f"Error enviando correo por SMTP: {e}")
            return jsonify({
                "success": False,
                "message": f"Error enviando por Gmail SMTP: {str(e)}"
            }), 500

    import sys
    print("=" * 65, file=sys.stderr)
    print(" [SMTP MAIL SIMULATOR] - Establishing secure connection...", file=sys.stderr)
    print(f" To: {to_email} | Subject: {subject}", file=sys.stderr)
    print("=" * 65, file=sys.stderr)
    
    return jsonify({
        "success": True,
        "message": f"¡Comprobante {doc_num} enviado (Simulación) a {to_email}!"
    })

# --- API CONTROL & FLUJO DE CAJA (CAJA DIARIA V2.0) ---

@bp_payments.route('/api/caja', methods=['GET'])
def get_caja():
    return jsonify(cargar_datos('caja.json', {"movimientos": []}))

@bp_payments.route('/api/caja/movimiento', methods=['POST'])
def save_caja_movimiento():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin", "vendedor"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    data = request.json or {}
    tipo = data.get("tipo", "INGRESO")
    monto = float(data.get("monto", 0))
    medio = data.get("medio_pago", "efectivo")
    concepto = data.get("concepto", "Movimiento de Caja").strip()
    fecha = data.get("fecha", datetime.date.today().isoformat())
    
    if monto <= 0:
        return jsonify({"success": False, "message": "Monto debe ser mayor a cero"}), 400
        
    caja = cargar_datos('caja.json', {"movimientos": []})
    movs = caja.get("movimientos", [])
    
    nuevo_mov = {
        "id": f"MOV-{len(movs) + 1:04d}",
        "fecha": fecha,
        "tipo": tipo,
        "monto": monto if tipo == "INGRESO" else -monto,
        "medio_pago": medio,
        "concepto": concepto,
        "usuario": session.get("usuario", "admin")
    }
    movs.append(nuevo_mov)
    caja["movimientos"] = movs
    guardar_datos('caja.json', caja)
    return jsonify({"success": True, "movimiento": nuevo_mov})
