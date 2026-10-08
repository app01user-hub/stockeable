# -*- coding: utf-8 -*-
import os
import sys
from flask import Flask, render_template, session, redirect, url_for, jsonify, request
from models import cargar_datos, DEFAULT_CONFIG, DEFAULT_USUARIOS

# Soporte para ejecutable nativo PyInstaller (Zero-Dependency)
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

app.secret_key = "stockdocente_super_secret_session_key_v2_0_9988"

# Registrar Blueprints condicionales
from blueprints.auth import bp_auth
app.register_blueprint(bp_auth)

config = cargar_datos("config.json", DEFAULT_CONFIG)
modulos = config.get("modulos_activos", {})

# START_MODULE: stock
if modulos.get("stock", True):
    from blueprints.stock import bp_stock
    app.register_blueprint(bp_stock)
# END_MODULE: stock

# START_MODULE: remitos
if modulos.get("ventas", True) or modulos.get("compras", True) or modulos.get("stock", True):
    from blueprints.sales import bp_sales
    app.register_blueprint(bp_sales)
# END_MODULE: remitos

# START_MODULE: pagos
if modulos.get("pagos", True) or modulos.get("cc_clientes", True) or modulos.get("cc_proveedores", True):
    from blueprints.payments import bp_payments
    app.register_blueprint(bp_payments)
# END_MODULE: pagos

# START_MODULE: informes
if modulos.get("informes", True):
    from blueprints.reports import bp_reports
    app.register_blueprint(bp_reports)
# END_MODULE: informes

# Panel Master (Solo accesible para superadmin en backend)
# START_MODULE: master
from blueprints.master import bp_master
app.register_blueprint(bp_master)
# END_MODULE: master

@app.route('/')
def index():
    if "usuario" not in session:
        return render_template("index.html", config=cargar_datos("config.json", DEFAULT_CONFIG), sesion=None)
    
    cfg = cargar_datos("config.json", DEFAULT_CONFIG)
    ses = {
        "username": session["usuario"],
        "rol": session["rol"],
        "nombre": session["nombre"],
        "cliente_id": session.get("cliente_id", None)
    }
    return render_template("index.html", config=cfg, sesion=ses)

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5000)
