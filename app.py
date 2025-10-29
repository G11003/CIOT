import os
import mysql.connector
from flask import Flask, request, jsonify
from flask_cors import CORS
# ***** NUEVAS IMPORTACIONES *****
from flask_socketio import SocketIO, emit 
# ***** FIN NUEVAS IMPORTACIONES *****
import json
from decimal import Decimal
from datetime import datetime

# --- Configuración de la App ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'tu_llave_secreta_aqui!' # Necesario para SocketIO
CORS(app) 
# ***** INICIALIZAR SOCKETIO *****
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet') # Permite conexiones de cualquier origen

# --- Configuración de la Base de Datos ---
db_config = {
    'host': os.environ.get('DB_HOST', 'db-iot.ctce8ue4icnc.us-east-1.rds.amazonaws.com'),
    'user': os.environ.get('DB_USER', 'admin'),
    'password': os.environ.get('DB_PASS', 'Admin12345#!'),
    'database': os.environ.get('DB_NAME', 'IOT_Dispositivo')
}

# --- Funciones Auxiliares (default_converter, db_callproc_json) ---
def default_converter(o):
    if isinstance(o, Decimal): return float(o)
    if isinstance(o, datetime): return o.isoformat()

def db_callproc_json(proc_name, args=()):
    results = [] 
    new_id = None 
    conn = None 
    cursor = None 
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True) 
        
        if proc_name == 'sp_agregar_secuencia_demo':
            cursor.callproc(proc_name, args)
            conn.commit(); cursor.execute("SELECT LAST_INSERT_ID() as new_id;") 
            id_result = cursor.fetchone(); new_id = id_result['new_id'] if id_result else None
            return {"success": True, "id_secuencia": new_id} # Devuelve diccionario

        elif proc_name == 'sp_iniciar_ejecucion_demo':
             cursor.callproc(proc_name, args); conn.commit()
             for result_set in cursor.stored_results(): results = result_set.fetchall()
             return results # Devuelve lista de diccionarios

        else: 
            cursor.callproc(proc_name, args)
            for result_set in cursor.stored_results(): results.extend(result_set.fetchall())
            conn.commit() 
            if proc_name.startswith('sp_registrar') or proc_name.startswith('sp_actualizar') or proc_name == 'sp_eliminar_secuencia_demo':
                 if results: return results 
                 return {"success": True}
            else: 
                 return results
            
    except mysql.connector.Error as err:
        print(f"Error DB llamando a {proc_name}: {err}")
        raise err 
    finally:
        if cursor: cursor.close()
        if conn and conn.is_connected(): conn.close()

# =================================================================
# == ENDPOINTS DE LA API (Modificados para emitir eventos)
# =================================================================

@app.route('/registrar-evento', methods=['POST'])
def registrar_evento():
    data = request.json
    client_ip = request.remote_addr 
    proc_name = ''
    evento_tipo = data.get('tipo_evento')
    device_name = data.get('p_nombre_dispositivo', 'Robot Explorador v1')

    if evento_tipo == 'Operacion':
        proc_name = 'sp_registrar_operacion'
    elif evento_tipo == 'Obstaculo':
        proc_name = 'sp_registrar_obstaculo'
    else:
        return jsonify(error="Tipo de evento no válido"), 400

    args = (
        device_name,
        data.get('p_status_clave'), client_ip, data.get('p_client_pais'), 
        data.get('p_client_ciudad'), data.get('p_client_latitud'), data.get('p_client_longitud')
    )
    
    try:
        result = db_callproc_json(proc_name, args)
        
        if result.get("success"):
            print(f"Evento '{evento_tipo}' registrado, emitiendo 'update_monitor'")
            
            ultimo_estatus_lista = db_callproc_json('sp_ultimo_estatus', (device_name,))
            
            payload = { 'tipo': evento_tipo }
            if ultimo_estatus_lista:
                # --- INICIO DE LA CORRECCIÓN ---
                # Convertimos los datos (que tienen datetime) a un string JSON
                # usando nuestro conversor, y luego lo volvemos a cargar
                # como un diccionario "limpio" que socketio SÍ puede manejar.
                data_str = json.dumps(ultimo_estatus_lista[0], default=default_converter) # <--- MODIFICADO
                payload['data'] = json.loads(data_str) # <--- MODIFICADO
                # --- FIN DE LA CORRECCIÓN ---

            socketio.emit('update_monitor', payload) 
        
        return jsonify(result)
    except mysql.connector.Error as err:
        return jsonify(success=False, error=str(err)), 500

# --- Endpoints de Monitoreo (Sin cambios, solo leen datos) ---
@app.route('/monitor/ultimo', methods=['GET'])
def get_ultimo_estatus():
    dispositivo = request.args.get('dispositivo', 'Robot Explorador v1')
    try: 
        # Aquí usamos jsonify, que SÍ sabe usar el default_converter
        return jsonify(db_callproc_json('sp_ultimo_estatus', (dispositivo,)))
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

@app.route('/monitor/movimientos', methods=['GET'])
def get_ultimos_movimientos():
    dispositivo = request.args.get('dispositivo', 'Robot Explorador v1')
    try: 
        return json.dumps(db_callproc_json('sp_ultimos_10_movimientos', (dispositivo,)), default=default_converter)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

@app.route('/monitor/obstaculos', methods=['GET'])
def get_ultimos_obstaculos():
    dispositivo = request.args.get('dispositivo', 'Robot Explorador v1')
    try: 
        return json.dumps(db_callproc_json('sp_ultimos_10_obstaculos', (dispositivo,)), default=default_converter)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

@app.route('/monitor/demos', methods=['GET'])
def get_ultimas_demos():
    dispositivo = request.args.get('dispositivo', 'Robot Explorador v1')
    try: 
        return json.dumps(db_callproc_json('sp_ultimas_20_ejecuciones', (dispositivo,)), default=default_converter)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500


# --- Endpoints de Demos (Modificados para emitir al actualizar estado) ---
@app.route('/demos/listar', methods=['GET'])
def listar_demos():
    try: 
        return json.dumps(db_callproc_json('sp_listar_demos', ()), default=default_converter)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

@app.route('/demos/guardar', methods=['POST'])
def guardar_demo():
    data = request.json
    movimientos_str = json.dumps(data.get('p_movimientos_json', [])) 
    args = (data.get('p_nombre_secuencia'), movimientos_str )
    try: 
        result = db_callproc_json('sp_agregar_secuencia_demo', args)
        return jsonify(result)
    except mysql.connector.Error as err: return jsonify(success=False, error=str(err)), 500

@app.route('/demos/iniciar', methods=['POST'])
def iniciar_demo():
    data = request.json
    client_ip = request.remote_addr
    device_name = data.get('p_nombre_dispositivo', 'Robot Explorador v1') 
    args = ( data.get('p_id_secuencia'), device_name, client_ip )
    try: 
        result = db_callproc_json('sp_iniciar_ejecucion_demo', args)
        
        ultimas_demos_lista = db_callproc_json('sp_ultimas_20_ejecuciones', (device_name,))
        
        # --- INICIO DE LA CORRECCIÓN ---
        data_str = json.dumps(ultimas_demos_lista, default=default_converter) # <--- MODIFICADO
        payload = {
            'tipo': 'Demo',
            'data_demos': json.loads(data_str) # <--- MODIFICADO
        }
        # --- FIN DE LA CORRECCIÓN ---
        
        socketio.emit('update_monitor', payload)
        
        return jsonify(result)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

@app.route('/demos/actualizar-estado', methods=['POST'])
def actualizar_demo():
    data = request.json
    args = ( data.get('p_id_ejecucion'), data.get('p_nuevo_estatus'), data.get('p_paso_actual') )
    try: 
        result = db_callproc_json('sp_actualizar_ejecucion_demo', args)
        
        if result.get("success"):
            print(f"Estado demo {data.get('p_id_ejecucion')} actualizado a '{data.get('p_nuevo_estatus')}', emitiendo 'update_monitor'")
            
            device_name = 'Robot Explorador v1'
            ultimas_demos_lista = db_callproc_json('sp_ultimas_20_ejecuciones', (device_name,))
            
            # --- INICIO DE LA CORRECCIÓN ---
            data_str = json.dumps(ultimas_demos_lista, default=default_converter) # <--- MODIFICADO
            payload = {
                'tipo': 'Demo',
                'data_demos': json.loads(data_str) # <--- MODIFICADO
            }
            # --- FIN DE LA CORRECCIÓN ---
            
            socketio.emit('update_monitor', payload) 
        
        return jsonify(result)
    except mysql.connector.Error as err: return jsonify(success=False, error=str(err)), 500

@app.route('/demos/eliminar/<int:id_secuencia>', methods=['DELETE'])
def eliminar_demo(id_secuencia):
    args = (id_secuencia,)
    try: 
        result = db_callproc_json('sp_eliminar_secuencia_demo', args)
        return jsonify(result)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

# --- Endpoint de Lógica de Obstáculos (Sin cambios) ---
@app.route('/resolver-obstaculo', methods=['POST'])
def resolver_obstaculo():
    data = request.json
    args = ( data.get('p_nombre_dispositivo', 'Robot Explorador v1'), data.get('p_accion_fallida_clave') )
    try: 
        return json.dumps(db_callproc_json('sp_resolver_obstaculo', args), default=default_converter)
    except mysql.connector.Error as err: return jsonify(error=str(err)), 500

# ***** EVENTOS SOCKETIO (Opcional: para manejar conexiones/desconexiones) *****
@socketio.on('connect')
def handle_connect():
    print('Cliente conectado al WebSocket')

@socketio.on('disconnect')
def handle_disconnect():
    print('Cliente desconectado del WebSocket')
# **************************************************************************

# --- Iniciar el Servidor ---
if __name__ == '__main__':
    print("Iniciando servidor Flask con SocketIO en modo producción...")
    print(f"Escuchando en http://0.0.0.0:5500")
    # debug=False es vital para producción
    # host='0.0.0.0' permite conexiones externas
    socketio.run(app, debug=False, host='0.0.0.0', port=5500)