# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify, session
from models import cargar_datos, guardar_datos, DEFAULT_USUARIOS, DEFAULT_CONFIG

bp_auth = Blueprint('auth', __name__)

@bp_auth.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    
    usuarios = cargar_datos("usuarios.json", DEFAULT_USUARIOS)
    
    if username in usuarios and usuarios[username]["password"] == password:
        u = usuarios[username]
        session["usuario"] = u["username"]
        session["rol"] = u["role"]
        session["nombre"] = u["nombre"]
        session["cliente_id"] = u.get("cliente_id", None)
        return jsonify({
            "success": True, 
            "usuario": {
                "username": u["username"], 
                "rol": u["role"], 
                "nombre": u["nombre"],
                "cliente_id": u.get("cliente_id", None)
            }
        })
    
    return jsonify({"success": False, "message": "Credenciales inválidas"}), 401

@bp_auth.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

@bp_auth.route('/api/profile/password', methods=['POST'])
def change_password():
    if "usuario" not in session:
        return jsonify({"success": False, "message": "Inicie sesión primero"}), 401
    
    data = request.json or {}
    old_p = data.get("old_password", "").strip()
    new_p = data.get("new_password", "").strip()
    new_user = data.get("new_username", "").strip()
    
    usuarios = cargar_datos("usuarios.json", DEFAULT_USUARIOS)
    user = session["usuario"]
    
    if user in usuarios and usuarios[user]["password"] == old_p:
        # Si se cambia el nombre de usuario, actualizar llave en diccionario
        if new_user and new_user != user:
            usuarios[new_user] = usuarios.pop(user)
            usuarios[new_user]["username"] = new_user
            session["usuario"] = new_user
            user = new_user
        
        usuarios[user]["password"] = new_p
        guardar_datos("usuarios.json", usuarios)
        return jsonify({"success": True})
    
    return jsonify({"success": False, "message": "Clave actual incorrecta"}), 400


@bp_auth.route('/api/config', methods=['GET'])
def get_config():
    config = cargar_datos('config.json', DEFAULT_CONFIG)
    return jsonify(config)

@bp_auth.route('/api/config', methods=['POST'])
def save_config():
    if "usuario" not in session or session.get("rol") not in ["admin", "superadmin"]:
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    config = cargar_datos('config.json', DEFAULT_CONFIG)
    data = request.json or {}
    
    if "nombre_negocio" in data:
        config["nombre_negocio"] = data["nombre_negocio"]
    if "tema_color" in data:
        config["tema_color"] = data["tema_color"]
    if "logo_emoji" in data:
        config["logo_emoji"] = data["logo_emoji"]
    if "logo_url" in data:
        config["logo_url"] = data["logo_url"]
    if "subtitulo_negocio" in data:
        config["subtitulo_negocio"] = data["subtitulo_negocio"]
    if "domicilio_negocio" in data:
        config["domicilio_negocio"] = data["domicilio_negocio"]
    if "gmail_user" in data:
        config["gmail_user"] = data["gmail_user"].strip()
    if "gmail_app_password" in data:
        config["gmail_app_password"] = data["gmail_app_password"].strip()
        
    guardar_datos('config.json', config)
    return jsonify({"success": True, "config": config})
