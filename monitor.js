document.addEventListener("DOMContentLoaded", () => {
  // Definición de comandos
  const commands = [
    { status_clave: 1, status_texto: "Adelante" },
    { status_clave: 2, status_texto: "Atrás" },
    { status_clave: 3, status_texto: "Detener" },
    { status_clave: 4, status_texto: "Vuelta adelante derecha" },
    { status_clave: 5, status_texto: "Vuelta adelante izquierda" },
    { status_clave: 6, status_texto: "Vuelta atrás derecha" },
    { status_clave: 7, status_texto: "Vuelta atrás izquierda" },
    { status_clave: 8, status_texto: "Giro 90° derecha" },
    { status_clave: 9, status_texto: "Giro 90° izquierda" },
    { status_clave: 10, status_texto: "Giro 360° derecha" },
    { status_clave: 11, status_texto: "Giro 360° izquierda" },
    { status_clave: 12, status_texto: "Evasión: Atrás" },
    { status_clave: 13, status_texto: "Evasión: Giro 90° izquierda" },
    { status_clave: 14, status_texto: "Evasión: Giro 90° derecha" },
    { status_clave: 15, status_texto: "Evasión: Retroceso Corto y Giro Izq" },
    { status_clave: 16, status_texto: "Evasión: Retroceso Corto y Giro Der" },
    { status_clave: 21, status_texto: "Adelante (Baja)" },
    { status_clave: 22, status_texto: "Adelante (Alta)" },
    { status_clave: 23, status_texto: "Atrás (Baja)" },
    { status_clave: 24, status_texto: "Atrás (Alta)" },
  ];

  const apiBaseUrl = 'http://54.161.121.152:5500';
  const dispositivoNombre = 'Robot Explorador v1';
  const urlParams = `?dispositivo=${encodeURIComponent(dispositivoNombre)}`;

  // ==================================================================
  // ===== INTERRUPTOR DE SIMULACIÓN AUTOMÁTICA =====
  const MODO_SIMULACION_AUTO_RESOLVER = true;
  // ==================================================================

  // Referencias a todos los elementos del dashboard
  const lastCommandTextEl = document.getElementById("last-command-text");
  const lastObstacleTextEl = document.getElementById("last-obstacle-text");
  const movesLogListEl = document.getElementById("moves-log-list");
  const demosLogListEl = document.getElementById("demos-log-list");
  const obstaclesLogListEl = document.getElementById("obstacles-log-list");
  const obstacleActionTextEl = document.getElementById("obstacle-action-text");
  const executeObstacleActionBtnEl = document.getElementById("execute-obstacle-action-btn");
  
  let currentRecommendedAction = null; 
  let autoResolveTimer = null; 

  const defaultMoveText = "Esperando...";
  const defaultObstacleText = "Esperando datos del sensor...";
  const defaultActionText = "Esperando datos...";

  // --- Función de Utilidad (NUEVA) ---
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // --- Funciones de renderizado ---
  function renderList(listElement, data, emptyMessage) {
    if (!listElement) return;
    listElement.innerHTML = ''; 
    if (!data || data.length === 0) {
      listElement.innerHTML = `<li class="empty-log">${emptyMessage}</li>`;
      return;
    }
    data.slice().forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      listElement.appendChild(li);
    });
  }

  function renderEstatusFromSocket(data) {
    if (!data) return; 

    const { tipo_evento, descripcion_estatus, status_clave_evento } = data;
    const statusString = `${descripcion_estatus} (${status_clave_evento})`;

    if (tipo_evento === 'Operacion') {
      lastCommandTextEl.textContent = statusString;
      
      // ... (lógica de añadir a lista de movimientos) ...
      const newLi = document.createElement('li');
      newLi.textContent = statusString;
      const firstLi = movesLogListEl.querySelector('li:not(.empty-log)');
      if (firstLi) {
        movesLogListEl.insertBefore(newLi, firstLi);
      } else {
        movesLogListEl.innerHTML = ''; 
        movesLogListEl.appendChild(newLi);
      }
      while (movesLogListEl.children.length > 10) {
        movesLogListEl.removeChild(movesLogListEl.lastChild);
      }
      
    } else if (tipo_evento === 'Obstaculo') {
      lastObstacleTextEl.textContent = statusString;
      
      // ... (lógica de añadir a lista de obstáculos) ...
      const newLi = document.createElement('li');
      newLi.textContent = statusString;
      const firstLi = obstaclesLogListEl.querySelector('li:not(.empty-log)');
      if (firstLi) {
        obstaclesLogListEl.insertBefore(newLi, firstLi);
      } else {
        obstaclesLogListEl.innerHTML = '';
        obstaclesLogListEl.appendChild(newLi);
      }
      while (obstaclesLogListEl.children.length > 10) {
        obstaclesLogListEl.removeChild(obstaclesLogListEl.lastChild);
      }
      
      // Re-evaluar la acción de obstáculo
      updateObstacleAction(statusString);

      // Notificar a otras pestañas (demos.js) que se vio un obstáculo
      localStorage.setItem('iot_last_obstacle', statusString);
      window.dispatchEvent(new StorageEvent('storage', { 
          key: 'iot_last_obstacle', 
          newValue: statusString 
      }));
    }
  }
  
  function renderDemosFromSocket(demoDataList) {
      if (!demoDataList) {
          refreshDemosLog();
          return;
      }
      const log = demoDataList.map(item => `${item.nombre_secuencia} (${item.estatus})`);
      renderList(demosLogListEl, log, "No se han ejecutado demos");
  }

  // --- Funciones de Lógica de Obstáculo ---
  async function updateObstacleAction(obstacleStatus) {
    if (!obstacleStatus || obstacleStatus.includes(defaultObstacleText) || obstacleStatus.includes("Sin Obstáculos")) {
      obstacleActionTextEl.textContent = "Sin acción requerida.";
      executeObstacleActionBtnEl.disabled = true;
      executeObstacleActionBtnEl.classList.add('disabled');
      currentRecommendedAction = null;
      return;
    }

    if (obstacleStatus.toLowerCase().includes("obstáculo")) {
      const accionFallidaClave = 1; // Asumimos "Adelante (1)"

      try {
        const res = await fetch(`${apiBaseUrl}/resolver-obstaculo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_nombre_dispositivo: dispositivoNombre,
            p_accion_fallida_clave: accionFallidaClave
          })
        });
        const data = await res.json();
        
        if (data && data.length > 0) {
          const accionSugerida = data[0];
          obstacleActionTextEl.innerHTML = `Acción: <strong>${accionSugerida.status_texto}</strong>`;
          executeObstacleActionBtnEl.disabled = false;
          executeObstacleActionBtnEl.classList.remove('disabled');
          currentRecommendedAction = accionSugerida;
        } else {
          // ... (manejo de error)
        }
      } catch (e) {
        console.error("Error llamando a /resolver-obstaculo", e);
      }
    }
  }

  // --- Funciones de Carga de Datos (Refactorizadas) ---
  // (Sin cambios: refreshUltimoEstatus, refreshMovimientosLog, 
  // refreshObstaculosLog, refreshDemosLog, loadInitialData)
  async function refreshUltimoEstatus() {
    try {
        let ultimoObstaculoTexto = defaultObstacleText;
        let ultimoMovimientoTexto = defaultMoveText;
        const resMov = await fetch(`${apiBaseUrl}/monitor/movimientos${urlParams}`);
        const dataMov = await resMov.json();
        if (dataMov && dataMov.length > 0) {
            ultimoMovimientoTexto = `${dataMov[0].status_texto} (${dataMov[0].status_clave})`;
        }
        const resObs = await fetch(`${apiBaseUrl}/monitor/obstaculos${urlParams}`);
        const dataObs = await resObs.json();
        if (dataObs && dataObs.length > 0) {
            ultimoObstaculoTexto = `${dataObs[0].status_texto} (${dataObs[0].status_clave})`;
        }
        lastCommandTextEl.textContent = ultimoMovimientoTexto;
        lastObstacleTextEl.textContent = ultimoObstaculoTexto;
        await updateObstacleAction(ultimoObstaculoTexto); 
    } catch (e) { console.error('Error cargando ultimo estatus:', e); }
  }
  async function refreshMovimientosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/movimientos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.status_texto} (${item.status_clave})`);
        renderList(movesLogListEl, log, "No hay movimientos registrados");
    } catch (e) { console.error('Error cargando movimientos:', e); }
  }
  async function refreshObstaculosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/obstaculos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.status_texto} (${item.status_clave})`);
        renderList(obstaclesLogListEl, log, "No hay registro de obstáculos");
    } catch (e) { console.error('Error cargando obstaculos:', e); }
  }
  async function refreshDemosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/demos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.nombre_secuencia} (${item.estatus})`);
        renderList(demosLogListEl, log, "No se han ejecutado demos");
    } catch (e) { console.error('Error cargando demos:', e); }
  }
  function loadInitialData() {
    refreshUltimoEstatus();
    refreshMovimientosLog();
    refreshObstaculosLog();
    refreshDemosLog();
  }
  
  // --- Cliente Socket.IO ---
  const socket = io(apiBaseUrl);

  socket.on('connect', () => {
    console.log('Monitor conectado al servidor WebSocket.');
  });

  socket.on('update_monitor', async (data) => {
    console.log('¡Actualización de monitor recibida!', data);
    if (!data || !data.tipo) return;

    if (autoResolveTimer) {
      clearTimeout(autoResolveTimer);
      autoResolveTimer = null;
      console.log("SIMULACIÓN: Timer de auto-resolución cancelado.");
    }

    switch (data.tipo) {
      case 'Operacion':
      case 'Obstaculo':
        console.log("Renderizando estatus desde WebSocket...");
        renderEstatusFromSocket(data.data);
        break;
      case 'Demo':
        console.log("Renderizando demos desde WebSocket...");
        renderDemosFromSocket(data.data_demos);
        break;
    }

    // --- Lógica de Simulación ---
    if (data.tipo === 'Obstaculo' && MODO_SIMULACION_AUTO_RESOLVER === true) {
      const newObstacleStatus = lastObstacleTextEl.textContent;
      const isAnObstacle = newObstacleStatus.toLowerCase().includes('obstáculo');
      const isNotSinObstaculos = !newObstacleStatus.includes('(5)'); 

      if (isAnObstacle && isNotSinObstaculos) {
        console.log(`SIMULACIÓN: Obstáculo "${newObstacleStatus}" detectado. Iniciando timer de 5s...`);
        autoResolveTimer = setTimeout(() => {
          sendSinObstaculosAPI();
          autoResolveTimer = null;
        }, 5500); 
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Monitor desconectado del servidor WebSocket.');
  });

  // --- Función de Simulación ---
  function sendSinObstaculosAPI() {
    console.log("SIMULACIÓN: Enviando 'Sin Obstáculos (5)' a la API...");
    const apiDataSinObstaculo = {
        p_nombre_dispositivo: dispositivoNombre,
        p_status_clave: 5, 
        tipo_evento: 'Obstaculo'
    };
    fetch(`${apiBaseUrl}/registrar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiDataSinObstaculo),
    })
    .then(res => res.json())
    .then(data => console.log("SIMULACIÓN: 'Sin Obstáculos' registrado."))
    .catch(error => console.error('Error en sendSinObstaculosAPI:', error));
  }


  // ===================================================================
  // --- ¡INICIO DE LAS FUNCIONES DE EVASIÓN DE 2 PASOS! ---
  // ===================================================================

  /**
   * (NUEVA FUNCIÓN AUXILIAR)
   * Envía un único comando de evasión a la API.
   */
  async function sendEvasionCommand(commandKey) {
    // Buscar el texto del comando solo para los logs
    const commandText = commands.find(c => c.status_clave === commandKey)?.status_texto || 'Comando Desconocido';
    console.log(`MODO REAL: Enviando paso de evasión: ${commandText} (${commandKey})`);
    
    const apiData = {
        p_nombre_dispositivo: dispositivoNombre,
        p_status_clave: commandKey,
        tipo_evento: 'Operacion' 
    };

    try {
      const res = await fetch(`${apiBaseUrl}/registrar-evento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiData),
      });
      if (!res.ok) throw new Error(`Fallo al registrar comando ${commandKey}`);
      const data = await res.json();
      console.log(`MODO REAL: Paso ${commandKey} registrado en BD.`);
      return data; // Devuelve la respuesta
    } catch (error) {
      console.error(`Error de API en Evasión (Paso ${commandKey}):`, error);
      obstacleActionTextEl.textContent = "Error al enviar la acción.";
      throw error; // Lanza el error para detener la secuencia
    }
  }


  /**
   * (MODIFICADO PARA MÚLTIPLES PASOS)
   * Ejecuta la acción recomendada (se llama desde el botón)
   */
  async function executeRecommendedAction() { // <-- ¡Marcado como async!
    if (!currentRecommendedAction) {
      console.warn("No hay acción recomendada para ejecutar.");
      return;
    }

    const recommendedKey = currentRecommendedAction.status_clave;
    const commandString = `${currentRecommendedAction.status_texto} (${recommendedKey})`;
    console.log("MODO REAL: Ejecutando acción completa:", commandString);

    // Deshabilitar botón
    obstacleActionTextEl.textContent = "Acción de evasión en progreso...";
    executeObstacleActionBtnEl.disabled = true;
    executeObstacleActionBtnEl.classList.add('disabled'); 
    currentRecommendedAction = null;

    try {
      // ===== ¡INICIO DE LA NUEVA LÓGICA! =====
      if (recommendedKey === 15) {
        // Acción 15: Atrás (2) + Giro Izq (9)
        await sendEvasionCommand(2); // Atrás
        await sleep(600); // Espera (simula tiempo de retroceso)
        await sendEvasionCommand(9); // Giro Izq
        await sleep(400); // Espera (simula tiempo de giro)
      } else if (recommendedKey === 16) {
        // Acción 16: Atrás (2) + Giro Der (8)
        await sendEvasionCommand(2); // Atrás
        await sleep(600); // Espera
        await sendEvasionCommand(8); // Giro Der
        await sleep(400); // Espera
      } else {
        // Acción simple (ej: 13 o 14, que el SP no usa pero por si acaso)
        await sendEvasionCommand(recommendedKey);
        await sleep(500); // Espera genérica
      }
      // ===== ¡FIN DE LA NUEVA LÓGICA! =====

      // Si todo salió bien, avisar al servidor que reanude la demo
      console.log("MONITOR: Evasión manual completada. Enviando 'request_demo_resume' al servidor.");
      socket.emit('request_demo_resume', { status: 'resume_after_evasion' });

    } catch (error) {
      console.error("MONITOR: Falló la secuencia de evasión. No se reanudará la demo.", error);
      // No re-habilitamos el botón, se queda en error
      obstacleActionTextEl.textContent = "Error durante la evasión.";
    }
  }

  // ===================================================================
  // --- ¡FIN DE LAS FUNCIONES DE EVASIÓN DE 2 PASOS! ---
  // ===================================================================


  // --- START ---
  
  // Listener para sincronizar estado con otras pestañas
  window.addEventListener('storage', (event) => {
    if (event.key === 'lastCommand' && lastCommandTextEl) {
      lastCommandTextEl.textContent = event.newValue;
    }
  });
  
  // Asigna el evento al botón
  executeObstacleActionBtnEl.addEventListener('click', executeRecommendedAction);
  
  // Carga los datos desde la API al iniciar
  loadInitialData();
  
});