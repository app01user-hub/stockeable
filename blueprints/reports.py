# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, session
from models import cargar_datos

bp_reports = Blueprint('reports', __name__)

@bp_reports.route('/api/reports/summary', methods=['GET'])
def get_consolidated_summary():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso restringido"}), 403
        
    articulos = cargar_datos('articulos.json', {})
    remitos = cargar_datos('remitos.json', [])
    pedidos = cargar_datos('pedidos.json', [])
    cc_cli = cargar_datos('cc_clientes.json', {})
    cc_prov = cargar_datos('cc_proveedores.json', {})
    
    total_articulos = len(articulos)
    total_stock = sum([a.get('cantidad', 0) for a in articulos.values()])
    valor_inventario = sum([a.get('cantidad', 0) * a.get('precio_costo', 0) for a in articulos.values()])
    
    total_ventas = sum([p.get('total', 0) for p in pedidos if p.get('tipo') == 'VENTA'])
    total_compras = sum([p.get('total', 0) for p in pedidos if p.get('tipo') == 'COMPRA'])
    
    saldo_clientes = sum([c.get('saldo', 0.0) for c in cc_cli.values()])
    saldo_proveedores = sum([p.get('saldo', 0.0) for p in cc_prov.values()])
    
    return jsonify({
        "success": True,
        "total_articulos": total_articulos,
        "total_stock": total_stock,
        "valor_inventario": valor_inventario,
        "total_ventas": total_ventas,
        "total_compras": total_compras,
        "saldo_clientes": saldo_clientes,
        "saldo_proveedores": saldo_proveedores
    })
