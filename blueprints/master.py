# -*- coding: utf-8 -*-
import os
import re
import json
import base64
from flask import Blueprint, request, jsonify, session

bp_master = Blueprint('master', __name__)

@bp_master.route('/api/master/compile', methods=['POST'])
def compile_modular_script():
    # El Panel Master SOLO se puede ver y ejecutar si es SUPERADMIN
    if "usuario" not in session or session.get("rol") != "superadmin":
        return jsonify({"success": False, "message": "Acceso denegado"}), 403
        
    data = request.json or {}
    modules = data.get("modules", {})
    raw_filename = data.get("filename", "instalar_cliente_personalizado").strip()
    
    # Forzar desactivacion de consola de desarrollo en el cliente para seguridad absoluta
    modules["master"] = False
    modules["remitos"] = modules.get("stock", False) or modules.get("ventas", False) or modules.get("compras", False)
    
    filename = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_filename)
    if not filename:
        filename = "instalar_cliente_personalizado"
    filename_py = f"{filename}.py"
    
    try:
        dir_actual = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # 1. Leer y podar archivos del proyecto actual
        files_to_bundle = {}
        
        # app.py
        with open(os.path.join(dir_actual, "app.py"), "r", encoding="utf-8") as f:
            app_raw = f.read()
        files_to_bundle["app.py"] = prune_code_lines(app_raw, modules, 'python')
        
        # models.py (Prunear superadmin)
        with open(os.path.join(dir_actual, "models.py"), "r", encoding="utf-8") as f:
            models_raw = f.read()
        files_to_bundle["models.py"] = prune_code_lines(models_raw, modules, 'python')
            
        # templates/index.html
        with open(os.path.join(dir_actual, "templates", "index.html"), "r", encoding="utf-8") as f:
            html_raw = f.read()
        files_to_bundle["templates/index.html"] = prune_code_lines(html_raw, modules, 'html')
        
        # Blueprints condicionales
        blueprints_avail = ["auth", "stock", "sales", "payments", "reports", "master"]
        for bp in blueprints_avail:
            bp_file = f"blueprints/{bp}.py"
            bp_path = os.path.join(dir_actual, bp_file)
            if os.path.exists(bp_path):
                mod_mapping = {
                    "stock": "stock",
                    "sales": "remitos",
                    "payments": "pagos",
                    "reports": "informes",
                    "master": "master"
                }
                mod_req = mod_mapping.get(bp)
                if not mod_req or modules.get(mod_req, True):
                    with open(bp_path, "r", encoding="utf-8") as f:
                        files_to_bundle[bp_file] = f.read()
                        
        # Archivos JS Estáticos
        js_files = ["main.js", "stock.js", "cart.js", "payments.js", "reports.js", "master.js"]
        for js in js_files:
            js_file = f"static/js/{js}"
            js_path = os.path.join(dir_actual, js_file)
            if os.path.exists(js_path):
                mod_mapping = {
                    "stock.js": "stock",
                    "cart.js": "carrito",
                    "payments.js": "pagos",
                    "reports.js": "informes",
                    "master.js": "master"
                }
                mod_req = mod_mapping.get(js)
                if not mod_req or modules.get(mod_req, True):
                    with open(js_path, "r", encoding="utf-8") as f:
                        files_to_bundle[js_file] = f.read()
                        
        # 2. Generar el script SFX autodesplegable encapsulado en Base64
        bundled_b64 = {}
        for r_file, content in files_to_bundle.items():
            b64_content = base64.b64encode(content.encode('utf-8')).decode('utf-8')
            bundled_b64[r_file] = b64_content
            
        json_b64_data = base64.b64encode(json.dumps(bundled_b64).encode('utf-8')).decode('utf-8')
        
        # 3. Armar plantilla del instalador
        sfx_template = f"""# -*- coding: utf-8 -*-
import os
import sys
import json
import base64
import webbrowser
import subprocess

DIRECTORIO_PROYECTO = os.path.dirname(os.path.abspath(__file__)) if __file__ else os.getcwd()
B64_PROJECT_ARCHIVE = "{json_b64_data}"

def main():
    print("=" * 65)
    print("      DESPLIEGUE MODULAR SEGURO - CLIENTE STOCKDOCENTE v2.0")
    print("=" * 65)
    print("[*] Descomprimiendo archivos de la arquitectura modular...")
    
    try:
        archive_raw = base64.b64decode(B64_PROJECT_ARCHIVE).decode('utf-8')
        archive = json.loads(archive_raw)
        
        for file_path, b64_content in archive.items():
            content = base64.b64decode(b64_content).decode('utf-8')
            rel_path = file_path.replace('/', os.sep) if '/' in file_path else file_path
            full_path = os.path.join(DIRECTORIO_PROYECTO, rel_path)
            
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
                
        print("[+] Arquitectura modular generada con éxito en tu disco local.")
    except Exception as e:
        print("[!] Error crítico reconstruyendo los módulos:", e)
        sys.exit(1)
        
    data_dir = os.path.join(DIRECTORIO_PROYECTO, "data")
    os.makedirs(data_dir, exist_ok=True)
    
    config_dict = {{
        "nombre_negocio": "Comercio Modular S.A.",
        "tema_color": "indigo",
        "logo_emoji": "📦",
        "logo_url": "",
        "modulos_activos": {modules}
    }}
    with open(os.path.join(data_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(config_dict, f, ensure_ascii=False, indent=4)
        
    ruta_venv = os.path.join(DIRECTORIO_PROYECTO, "env")
    es_windows = sys.platform.startswith("win") or os.name == "nt"
    if es_windows:
        ruta_python_env = os.path.join(ruta_venv, "Scripts", "python.exe")
        ruta_pip_env = os.path.join(ruta_venv, "Scripts", "pip.exe")
    else:
        ruta_python_env = os.path.join(ruta_venv, "bin", "python")
        ruta_pip_env = os.path.join(ruta_venv, "bin", "pip")

    if not os.path.exists(ruta_venv):
        print("[*] Creando entorno virtual local (venv) para evitar colisiones...")
        try:
            subprocess.check_call([sys.executable, "-m", "venv", ruta_venv])
            print("[+] Entorno virtual 'env' creado correctamente.")
        except Exception as eVenv:
            print("[!] Error creando venv, se usará intérprete del sistema:", eVenv)
            ruta_python_env = sys.executable

    if not os.path.exists(ruta_python_env):
        ruta_python_env = sys.executable

    print("[*] Verificando e instalando Flask en el entorno virtual local...")
    try:
        if os.path.exists(ruta_pip_env):
            subprocess.check_call([ruta_pip_env, "install", "Flask", "--quiet"])
        else:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "Flask", "--quiet"])
        print("[+] Flask se encuentra listo dentro del entorno virtual.")
    except Exception as ePip:
        print("[!] Advertencia instalando dependencias:", ePip)
        
    print("=" * 65)
    print("[*] Levantando Servidor Local...")
    print("[*] Abriendo navegador predeterminado en: http://127.0.0.1:5000")
    print("=" * 65)
    
    try:
        webbrowser.open("http://127.0.0.1:5000")
    except Exception:
        pass
    
    try:
        subprocess.run([ruta_python_env, os.path.join(DIRECTORIO_PROYECTO, "app.py")])
    except KeyboardInterrupt:
        print("
[+] Servidor finalizado de manera segura.")

if __name__ == "__main__":
    main()
"""
        if os.path.exists("/workspace/out"):
            ruta_salida = os.path.join("/workspace/out", filename_py)
        else:
            ruta_salida = os.path.join(dir_actual, filename_py)
            
        with open(ruta_salida, "w", encoding="utf-8") as f_out:
            f_out.write(sfx_template)
            
        return jsonify({
            "success": True, 
            "message": f"¡Proyecto v2.0 compilado con éxito como '{filename_py}'!",
            "archivo": filename_py
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error de compilación: {e}"}), 500

def prune_code_lines(content, enabled, comment_type='python'):
    lines = content.split('\n')
    pruned = []
    skip_stack = []
    
    start_m = "# START_MODULE:" if comment_type == 'python' else "<!-- START_MODULE:"
    end_m = "# END_MODULE:" if comment_type == 'python' else "<!-- END_MODULE:"
    
    for l in lines:
        stripped = l.strip()
        if start_m in stripped:
            mod = stripped.split("START_MODULE:")[1].strip().replace("-->", "").strip().lower()
            if not enabled.get(mod, False):
                skip_stack.append(mod)
            continue
        elif end_m in stripped:
            mod = stripped.split("END_MODULE:")[1].strip().replace("-->", "").strip().lower()
            if skip_stack and skip_stack[-1] == mod:
                skip_stack.pop()
            continue
            
        if not skip_stack:
            pruned.append(l)
            
    return '\n'.join(pruned)
