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
    { status_clave: 16, status_texto: "Evasión: Retroceso Corto y Giro Der" }
  ];

  const apiBaseUrl = 'http://54.161.121.152:5500';
  const dispositivoNombre = 'Robot Explorador v1';
  const urlParams = `?dispositivo=${encodeURIComponent(dispositivoNombre)}`;

  // ==================================================================
  // ===== INTERRUPTOR DE SIMULACIÓN AUTOMÁTICA =====
  // true = Resuelve obstáculos automáticamente después de 5s
  // false = Modo real (espera al robot)
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
  let autoResolveTimer = null; // Timer global para la simulación

  const defaultMoveText = "Esperando...";
  const defaultObstacleText = "Esperando datos del sensor...";
  const defaultActionText = "Esperando datos...";

  // --- Funciones de renderizado ---
  function renderList(listElement, data, emptyMessage) {
    if (!listElement) return;
    listElement.innerHTML = ''; 
    if (!data || data.length === 0) {
      listElement.innerHTML = `<li class="empty-log">${emptyMessage}</li>`;
      return;
    }
    // MODIFICADO: Quitamos .reverse() para que el más nuevo (que viene
    // primero de la API) se renderice primero (arriba).
    data.slice().forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      listElement.appendChild(li);
    });
  }

  /**
   * Actualiza la UI con datos de estatus (movimiento/obstáculo)
   * recibidos directamente desde el WebSocket.
   */
  function renderEstatusFromSocket(data) {
    if (!data) return; // No hay datos, no hacer nada

    const { tipo_evento, descripcion_estatus, status_clave_evento } = data;
    const statusString = `${descripcion_estatus} (${status_clave_evento})`;

    if (tipo_evento === 'Operacion') {
      lastCommandTextEl.textContent = statusString;
      
      // Añadir al log de movimientos (arriba de la lista)
      const newLi = document.createElement('li');
      newLi.textContent = statusString;
      const firstLi = movesLogListEl.querySelector('li:not(.empty-log)');
      if (firstLi) {
        movesLogListEl.insertBefore(newLi, firstLi);
      } else {
        movesLogListEl.innerHTML = ''; // Limpiar "vacío"
        movesLogListEl.appendChild(newLi);
      }
      // Limitar a 10
      while (movesLogListEl.children.length > 10) {
        movesLogListEl.removeChild(movesLogListEl.lastChild);
      }
      
    } else if (tipo_evento === 'Obstaculo') {
      lastObstacleTextEl.textContent = statusString;
      
      // Añadir al log de obstáculos (arriba de la lista)
      const newLi = document.createElement('li');
      newLi.textContent = statusString;
      const firstLi = obstaclesLogListEl.querySelector('li:not(.empty-log)');
      if (firstLi) {
        obstaclesLogListEl.insertBefore(newLi, firstLi);
      } else {
        obstaclesLogListEl.innerHTML = '';
        obstaclesLogListEl.appendChild(newLi);
      }
      // Limitar a 10
      while (obstaclesLogListEl.children.length > 10) {
        obstaclesLogListEl.removeChild(obstaclesLogListEl.lastChild);
      }
      
      // Re-evaluar la acción de obstáculo
      updateObstacleAction(statusString);
    }
  }
  
  /**
   * Actualiza el log de demos desde el WebSocket
   */
  function renderDemosFromSocket(demoDataList) {
      if (!demoDataList) {
          // Si no vienen datos, recarga por si acaso
          refreshDemosLog();
          return;
      }
      // La API ya manda los datos en orden (DESC)
      const log = demoDataList.map(item => `${item.nombre_secuencia} (${item.estatus})`);
      // Usamos renderList (que ahora no invierte)
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
      const accionFallidaClave = 1; // Asumimos que la acción que falló fue "Adelante (1)"

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

    } catch (e) { 
      console.error('Error cargando ultimo estatus:', e);
    }
  }

  async function refreshMovimientosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/movimientos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.status_texto} (${item.status_clave})`);
        renderList(movesLogListEl, log, "No hay movimientos registrados");
    } catch (e) { 
      console.error('Error cargando movimientos:', e); 
    }
  }

  async function refreshObstaculosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/obstaculos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.status_texto} (${item.status_clave})`);
        renderList(obstaclesLogListEl, log, "No hay registro de obstáculos");
    } catch (e) { 
      console.error('Error cargando obstaculos:', e); 
    }
  }

  async function refreshDemosLog() {
    try {
        const res = await fetch(`${apiBaseUrl}/monitor/demos${urlParams}`);
        const data = await res.json();
        const log = data.map(item => `${item.nombre_secuencia} (${item.estatus})`);
        renderList(demosLogListEl, log, "No se han ejecutado demos");
    } catch (e) { 
      console.error('Error cargando demos:', e); 
    }
  }

  function loadInitialData() {
    refreshUltimoEstatus();
    refreshMovimientosLog();
    refreshObstaculosLog();
    refreshDemosLog();
  }
  
  // --- Cliente Socket.IO (CON LÓGICA DE SIMULACIÓN) ---
  
  const socket = io(apiBaseUrl);

  socket.on('connect', () => {
    console.log('Monitor conectado al servidor WebSocket.');
  });

  socket.on('update_monitor', async (data) => { // <-- Marcado como async
    console.log('¡Actualización de monitor recibida!', data);

    if (!data || !data.tipo) return;

    // Detener cualquier simulación de auto-resolución pendiente
    if (autoResolveTimer) {
      clearTimeout(autoResolveTimer);
      autoResolveTimer = null;
      console.log("SIMULACIÓN: Timer de auto-resolución cancelado (llegó nuevo evento).");
    }

    switch (data.tipo) {
      case 'Operacion':
      case 'Obstaculo':
        // ===========================================
        // ===== MODIFICADO (FIX PROBLEMA 1) =====
        // ===========================================
        console.log("Renderizando estatus desde WebSocket...");
        renderEstatusFromSocket(data.data);
        
        // Ya no necesitamos las recargas 'await'
        // await refreshUltimoEstatus();
        // await refreshMovimientosLog();
        // await refreshObstaculosLog();
        break;
        // ===========================================

      case 'Demo':
        // ===========================================
        // ===== MODIFICADO (FIX PROBLEMA 1) =====
        // ===========================================
        console.log("Renderizando demos desde WebSocket...");
        renderDemosFromSocket(data.data_demos);
        // Ya no necesitamos esto
        // await refreshDemosLog(); 
        break;
        // ===========================================
    }

    // --- INICIO BLOQUE DE SIMULACIÓN AUTOMÁTICA ---
    // (Esta lógica se mantiene igual)
    if (data.tipo === 'Obstaculo' && MODO_SIMULACION_AUTO_RESOLVER === true) {
      // Leemos el estatus que acabamos de refrescar
      const newObstacleStatus = lastObstacleTextEl.textContent;
      const isAnObstacle = newObstacleStatus.toLowerCase().includes('obstáculo');
      const isNotSinObstaculos = !newObstacleStatus.includes('(5)'); // Clave de "Sin Obstáculos"

      if (isAnObstacle && isNotSinObstaculos) {
        console.log(`SIMULACIÓN: Obstáculo "${lastObstacleTextEl.textContent}" detectado. Iniciando timer de 5s...`);
        autoResolveTimer = setTimeout(() => {
          sendSinObstaculosAPI();
          autoResolveTimer = null;
        }, 5500); // 5 segundos
      }
    }
    // --- FIN BLOQUE DE SIMULACIÓN AUTOMÁTICA ---
  });

  socket.on('disconnect', () => {
    console.log('Monitor desconectado del servidor WebSocket.');
  });


  // --- NUEVA FUNCIÓN AUXILIAR (Solo para simulación) ---

  /**
   * (FUNCIÓN PARA SIMULACIÓN)
   * Envía el evento "Sin Obstáculos (5)" a la API.
   */
  function sendSinObstaculosAPI() {
    console.log("SIMULACIÓN: Enviando 'Sin Obstáculos (5)' a la API...");
    
    const apiDataSinObstaculo = {
        p_nombre_dispositivo: dispositivoNombre,
        p_status_clave: 5, // Clave para "Sin Obstáculos"
        tipo_evento: 'Obstaculo'
    };

    fetch(`${apiBaseUrl}/registrar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiDataSinObstaculo),
    })
    .then(res => {
      if (!res.ok) throw new Error('Fallo al simular Sin Obstáculo');
      return res.json();
    })
    .then(data => {
      console.log("SIMULACIÓN: 'Sin Obstáculos' registrado.");
    })
    .catch(error => {
      console.error('Error en sendSinObstaculosAPI:', error);
    });
  }


  // --- FUNCIÓN DEL BOTÓN (MODO REAL) ---

  /**
   * Ejecuta la acción recomendada (se llama desde el botón)
   * Esta función ahora solo envía la evasión (MODO REAL).
   * La simulación de "resolver" es automática si está activada.
   */
  function executeRecommendedAction() {
    if (!currentRecommendedAction) {
      console.warn("No hay acción recomendada para ejecutar.");
      return;
    }

    const command = currentRecommendedAction;
    const commandString = `${command.status_texto} (${command.status_clave})`;
    console.log("MODO REAL: Ejecutando acción:", commandString);
    
    const apiData = {
        p_nombre_dispositivo: dispositivoNombre,
        p_status_clave: command.status_clave,
        tipo_evento: 'Operacion' 
    };

    // Deshabilitar botón
    obstacleActionTextEl.textContent = "Acción de evasión enviada...";
    executeObstacleActionBtnEl.disabled = true;
    executeObstacleActionBtnEl.classList.add('disabled'); 
    currentRecommendedAction = null;

    fetch(`${apiBaseUrl}/registrar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
    })
    .then(res => {
      if (!res.ok) throw new Error('Fallo al registrar evasión');
      return res.json();
    })
    .then(data => {
        console.log("MODO REAL: Acción de evasión registrada en BD.");
    })
    .catch(error => {
        console.error('Error de API en Evasión (MODO REAL):', error);
        obstacleActionTextEl.textContent = "Error al enviar la acción.";
    });
  }

  // --- START ---
  
  // Asigna el evento al botón
  executeObstacleActionBtnEl.addEventListener('click', executeRecommendedAction);
  
  // Carga los datos desde la API al iniciar
  loadInitialData();
  
});