# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify, session
from models import cargar_datos, guardar_datos, sincronizar_y_auditar_sistema, DEFAULT_ARTICULOS

bp_stock = Blueprint('stock', __name__)

@bp_stock.route('/api/articulos', methods=['GET'])
def get_articulos():
    sincronizar_y_auditar_sistema()
    return jsonify(cargar_datos('articulos.json', DEFAULT_ARTICULOS))

@bp_stock.route('/api/articulos', methods=['POST'])
def save_articulo():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    data = request.json or {}
    
    cod = data.get('codigo')
    fam = data.get('familia', 'Varios').strip() or 'Varios'
    prefijo = "".join([c for c in fam if c.isalnum()]).upper()[:4]
    if not prefijo:
        prefijo = "ART"
        
    if not cod:
        existentes = [k for k in articulos.keys() if k.startswith(prefijo)]
        if existentes:
            numeros = []
            for e in existentes:
                try:
                    num = int(e.split('-')[1])
                    numeros.append(num)
                except Exception:
                    pass
            siguiente = max(numeros) + 1 if numeros else 1
        else:
            siguiente = 1
        cod = f"{prefijo}-{siguiente:03d}"
        
    cant_ingresada = int(data.get("cantidad", 0))
    art_existente = articulos.get(cod, {})
    stock_init = art_existente.get("stock_inicial", cant_ingresada)
    
    articulos[cod] = {
        "codigo": cod,
        "descripcion": data.get("descripcion", "").strip(),
        "cantidad": cant_ingresada,
        "stock_inicial": stock_init,
        "precio_costo": float(data.get("precio_costo", 0)),
        "ganancia": float(data.get("ganancia", 0)),
        "precio_venta": float(data.get("precio_venta", 0)),
        "familia": fam
    }
    
    guardar_datos('articulos.json', articulos)
    sincronizar_y_auditar_sistema()
    return jsonify({"success": True, "articulo": articulos[cod]})

@bp_stock.route('/api/articulos/<codigo>', methods=['DELETE'])
def delete_articulo(codigo):
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
    articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    if codigo in articulos:
        articulos.pop(codigo)
        guardar_datos('articulos.json', articulos)
        sincronizar_y_auditar_sistema()
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Artículo no encontrado"}), 404

@bp_stock.route('/api/importar', methods=['POST'])
def importar_datos():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
    data = request.json or {}
    texto = data.get("texto", "")
    
    articulos = cargar_datos('articulos.json', DEFAULT_ARTICULOS)
    lineas = [l.strip() for l in texto.split("\n") if l.strip()]
    
    importados = 0
    for l in lineas:
        partes = [p.strip() for p in l.split(";") if p.strip()]
        if len(partes) >= 5:
            try:
                cod = partes[0]
                desc = partes[1]
                cant = int(partes[2])
                costo = float(partes[3])
                venta = float(partes[4])
                fam = partes[5] if len(partes) > 5 else "Importados"
                
                ganancia = ((venta - costo) / costo * 100) if costo > 0 else 0.0
                articulos[cod] = {
                    "codigo": cod,
                    "descripcion": desc,
                    "cantidad": cant,
                    "stock_inicial": cant,
                    "precio_costo": costo,
                    "ganancia": round(ganancia, 2),
                    "precio_venta": venta,
                    "familia": fam
                }
                importados += 1
            except Exception:
                pass
                
    if importados > 0:
        guardar_datos('articulos.json', articulos)
        sincronizar_y_auditar_sistema()
        
    return jsonify({"success": True, "importados": importados})
