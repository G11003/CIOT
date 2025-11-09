// Espera a que todo el contenido del HTML esté cargado
document.addEventListener("DOMContentLoaded", () => {
  
  // Definición de comandos (copiado de control.js)
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
  ];

  // Constantes de API
  const apiBaseUrl = 'http://54.161.121.152:5500'; // URL de tu API
  const dispositivoNombre = 'Robot Explorador v1';


  // --- Estado Global ---
  let currentDemoMoves = []; // Para la demo que se está creando
  let savedDemos = []; // Cache local de demos (ahora incluye id_secuencia y moves)
  
  let demoRunState = 'stopped'; // 'stopped', 'running', 'paused'
  let currentDemoIndex = 0; // Índice del paso actual
  let currentRunningDemo = null; // Objeto de la demo en ejecución { id_secuencia, name, moves }
  let currentExecutionId = null; // ID de la ejecución en la BD

  // --- Referencias del DOM ---
  const allDemoButtons = document.querySelectorAll(".demo-controls-container .control-button");
  const movesListElement = document.getElementById("demo-moves-list");
  const saveDemoButton = document.getElementById("save-demo-button");
  const demoNameInput = document.getElementById("demo-name-input");
  
  // Referencias de Ejecución
  const demoSelectElement = document.getElementById("demo-select");
  const runDemoButton = document.getElementById("run-demo-button");
  const deleteDemoButton = document.getElementById("delete-demo-button");

  // Referencias de Pausa/Continuar/Finalizar
  const inProgressControls = document.getElementById("demo-in-progress-controls");
  const pauseDemoButton = document.getElementById("pause-demo-button");
  const resumeDemoButton = document.getElementById("resume-demo-button");
  const stopDemoButton = document.getElementById("stop-demo-button");

  // ==========================================================
  // ===== ¡NUEVO! Objeto para el comando "Detener" =====
  // ==========================================================
  const stopCommand = commands.find(c => c.status_clave === 3);
  // ==========================================================


  // --- Función de Utilidad ---
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // --- Funciones Principales ---

  /**
   * Carga demos DESDE LA API y las pone en el <select>.
   * (Esta función no tiene cambios)
   */
  async function loadSavedDemos() {
    try {
        const response = await fetch(`${apiBaseUrl}/demos/listar`);
        const demosFromApi = await response.json();
        const demosFromStorage = JSON.parse(localStorage.getItem('iotDemos') || '[]');

        savedDemos = demosFromApi.map(apiDemo => {
            const storedDemo = demosFromStorage.find(d => d.id_secuencia == apiDemo.id_secuencia);
            return { 
                id_secuencia: apiDemo.id_secuencia, 
                name: apiDemo.nombre_secuencia,
                moves: storedDemo ? storedDemo.moves : []
            };
        }); 
        
        localStorage.setItem('iotDemos', JSON.stringify(savedDemos)); 

        demoSelectElement.innerHTML = ''; 
        if (savedDemos.length === 0) {
          const option = document.createElement('option');
          option.value = "-1";
          option.textContent = "No hay demos guardadas";
          demoSelectElement.appendChild(option);
          runDemoButton.disabled = true; runDemoButton.classList.add('disabled');
          deleteDemoButton.disabled = true; deleteDemoButton.classList.add('disabled'); 
        } else {
          const defaultOption = document.createElement('option');
          defaultOption.value = "-1";
          defaultOption.textContent = "Selecciona una demo...";
          demoSelectElement.appendChild(defaultOption);

          savedDemos.forEach((demo) => { 
            const option = document.createElement('option');
            option.value = demo.id_secuencia;
            option.textContent = demo.name;
            demoSelectElement.appendChild(option);
          });
          
          runDemoButton.disabled = false; runDemoButton.classList.remove('disabled');
          deleteDemoButton.disabled = false; deleteDemoButton.classList.remove('disabled'); 
        }
    } catch (error) {
        console.error("Error al cargar demos desde la API:", error);
        savedDemos = JSON.parse(localStorage.getItem('iotDemos') || '[]');
        populateDemoSelectWithOptions();
        if(savedDemos.length === 0){
             demoSelectElement.innerHTML = '<option value="-1">Error al cargar demos</option>';
             runDemoButton.disabled = true; runDemoButton.classList.add('disabled');
             deleteDemoButton.disabled = true; deleteDemoButton.classList.add('disabled'); 
        }
    }
  }
  
  /**
   * Función auxiliar para poblar el <select> (usada en el fallback)
   * (Esta función no tiene cambios)
   */
   function populateDemoSelectWithOptions() {
        demoSelectElement.innerHTML = ''; 
        if (savedDemos.length === 0) {
          const option = document.createElement('option');
          option.value = "-1";
          option.textContent = "No hay demos guardadas";
          demoSelectElement.appendChild(option);
          runDemoButton.disabled = true; runDemoButton.classList.add('disabled');
          deleteDemoButton.disabled = true; deleteDemoButton.classList.add('disabled'); 
        } else {
          const defaultOption = document.createElement('option');
          defaultOption.value = "-1";
          defaultOption.textContent = "Selecciona una demo...";
          demoSelectElement.appendChild(defaultOption);

          savedDemos.forEach((demo, index) => {
            const option = document.createElement('option');
            option.value = demo.id_secuencia || index;
            option.textContent = demo.name;
            demoSelectElement.appendChild(option);
          });
          
          runDemoButton.disabled = false; runDemoButton.classList.remove('disabled');
          deleteDemoButton.disabled = false; deleteDemoButton.classList.remove('disabled'); 
        }
   }


  /**
   * Renderiza la lista de movimientos en el <ul>
   * (Esta función no tiene cambios)
   */
  function renderMovesList() {
    movesListElement.innerHTML = '';

    if (currentDemoMoves.length === 0) {
      movesListElement.innerHTML = '<li class="demo-move-item empty">Añade movimientos desde el panel de control...</li>';
      return;
    }

    currentDemoMoves.forEach((move, index) => {
      const li = document.createElement('li');
      li.className = 'demo-move-item';
      
      const text = document.createElement('span');
      text.textContent = `${index + 1}. ${move.status_texto}`;
      li.appendChild(text);

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-move-btn';
      deleteButton.textContent = '×';
      deleteButton.dataset.index = index;
      
      deleteButton.addEventListener('click', () => {
        deleteMove(index);
      });

      li.appendChild(deleteButton);
      movesListElement.appendChild(li);
    });
  }

  /**
   * Añade un movimiento a la lista de la demo actual
   * (Esta función no tiene cambios)
   */
  function addMoveToDemo(command) {
    if (demoRunState !== 'stopped') return; 
    currentDemoMoves.push(command);
    renderMovesList();
  }

  /**
   * Elimina un movimiento de la lista por su índice
   * (Esta función no tiene cambios)
   */
  function deleteMove(index) {
    currentDemoMoves.splice(index, 1);
    renderMovesList();
  }

  /**
   * Guarda la demo actual llamando a la API y obtiene el ID.
   * (Esta función no tiene cambios)
   */
  async function saveDemo() {
    const demoName = demoNameInput.value.trim();
    if (!demoName || currentDemoMoves.length === 0) {
      console.warn("Nombre o movimientos faltantes.");
      return;
    }

    const moveKeys = currentDemoMoves.map(move => move.status_clave);
    const apiData = { p_nombre_secuencia: demoName, p_movimientos_json: moveKeys };

    try {
      const response = await fetch(`${apiBaseUrl}/demos/guardar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData)
      });
      const result = await response.json(); 

      if (result.success && result.id_secuencia) {
        console.log(`¡Demo "${demoName}" guardada en BD con ID: ${result.id_secuencia}!`);
        
        const newDemoData = { 
            id_secuencia: result.id_secuencia, 
            name: demoName, 
            moves: [...currentDemoMoves]
        };
        savedDemos.push(newDemoData); 
        localStorage.setItem('iotDemos', JSON.stringify(savedDemos));
        
        currentDemoMoves = [];
        demoNameInput.value = '';
        renderMovesList();
        loadSavedDemos();
      } else {
        console.error("Error al guardar demo en BD:", result.error || "No se devolvió ID.");
      }
    } catch (error) {
      console.error('Error de conexión al guardar demo:', error);
    }
  }

  /**
   * Elimina la demo seleccionada llamando a la API y luego actualiza localmente.
   * (Esta función no tiene cambios)
   */
  async function deleteSelectedDemo() {
      const selectedId = demoSelectElement.value;
      
      if (selectedId === "-1") {
        console.warn("Por favor, selecciona una demo para eliminar.");
        return;
      }

      console.log(`Intentando eliminar demo con ID: ${selectedId}`);

      try {
          const response = await fetch(`${apiBaseUrl}/demos/eliminar/${selectedId}`, { 
              method: 'DELETE' 
          });
          const result = await response.json();

          if (response.ok && result && result.length > 0 && result[0].filas_eliminadas > 0) {
              console.log(`Demo con ID ${selectedId} eliminada exitosamente de la BD.`);
              
              const realIndex = savedDemos.findIndex(demo => demo.id_secuencia == selectedId);
              if (realIndex > -1) {
                  savedDemos.splice(realIndex, 1);
                  localStorage.setItem('iotDemos', JSON.stringify(savedDemos));
                  loadSavedDemos();
                  console.log("Actualización local completada.");
              }
          } else {
              console.error("Error al eliminar demo en BD:", result ? (result.error || result) : "Respuesta vacía o no OK");
              alert("Error al eliminar la demo en la base de datos.");
          }
      } catch (error) {
          console.error('Error de conexión al eliminar demo:', error);
          alert("Error de conexión al intentar eliminar la demo.");
      }
  }


  // --- LÓGICA DE EJECUCIÓN ---

  /**
   * Actualiza la UI de los botones de control de la demo
   * (Esta función no tiene cambios)
   */
  function setDemoUI(state) {
      if (state === 'stopped') {
        demoSelectElement.style.display = 'block';
        runDemoButton.style.display = 'block';
        deleteDemoButton.style.display = 'block';
        inProgressControls.style.display = 'none';

        runDemoButton.disabled = false;
        deleteDemoButton.disabled = false;
        demoSelectElement.disabled = false;

      } else if (state === 'running') {
        demoSelectElement.style.display = 'none';
        runDemoButton.style.display = 'none';
        deleteDemoButton.style.display = 'none';
        inProgressControls.style.display = 'grid'; 

        pauseDemoButton.style.display = 'block';
        resumeDemoButton.style.display = 'none';
        stopDemoButton.style.display = 'none';

        runDemoButton.disabled = true;
        deleteDemoButton.disabled = true;
        demoSelectElement.disabled = true;

      } else if (state === 'paused') {
        inProgressControls.style.display = 'grid';
        pauseDemoButton.style.display = 'none';
        resumeDemoButton.style.display = 'block';
        stopDemoButton.style.display = 'block';
      }
  }

  /**
   * Inicia la ejecución de la demo llamando a la API con el ID correcto.
   * (Esta función no tiene cambios)
   */
  async function runDemo() {
    if (demoRunState !== 'stopped') return;

    const selectedSequenceId = demoSelectElement.value; 
    if (selectedSequenceId === "-1") {
      console.warn("Por favor, selecciona una demo para ejecutar.");
      return;
    }
    
    currentRunningDemo = savedDemos.find(demo => demo.id_secuencia == selectedSequenceId); 
    
    if (!currentRunningDemo) {
        console.error(`Demo con ID ${selectedSequenceId} no encontrada en el cache local.`);
        alert("Error: No se encontraron los detalles de la demo seleccionada. Intenta recargar la página.");
        return;
    }
     if (!currentRunningDemo.moves || currentRunningDemo.moves.length === 0) {
        console.error(`Error: La demo "${currentRunningDemo.name}" (ID: ${selectedSequenceId}) no tiene movimientos cargados.`);
        alert(`Error: No se pudieron cargar los pasos para la demo "${currentRunningDemo.name}". Revisa si se guardó correctamente.`);
        return;
     }

    console.log(`Iniciando demo: "${currentRunningDemo.name}" (ID: ${selectedSequenceId})`);
    
    const apiData = {
      p_id_secuencia: selectedSequenceId, 
      p_nombre_dispositivo: dispositivoNombre
    };

    try {
        const response = await fetch(`${apiBaseUrl}/demos/iniciar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiData)
        });
        const result = await response.json();

        if (result && result.length > 0 && result[0].id_ejecucion) {
          currentExecutionId = result[0].id_ejecucion; 
          console.log("Ejecución iniciada en BD con ID:", currentExecutionId);
          
          demoRunState = 'running';
          currentDemoIndex = 0; 
          setDemoUI('running');
          localStorage.setItem('lastCommand', `Demo iniciada: ${currentRunningDemo.name}`);
          runDemoStep(); // Comienza la ejecución de pasos
        } else {
          console.error("Error al iniciar demo en BD:", result.error || "No se devolvió ID de ejecución.");
          setDemoUI('stopped');
        }
    } catch (error) {
      console.error('Error de conexión al iniciar demo:', error);
      alert('Error de conexión al iniciar la demo. Revisa si el servidor backend está corriendo.');
      setDemoUI('stopped');
    }
  }

  // ===================================================================
  // ===== INICIO DE LA FUNCIÓN MODIFICADA (LÓGICA DE DETENER) =====
  // ===================================================================

  /**
   * (Función auxiliar) Envía un comando a la API y espera la confirmación.
   */
  async function sendDemoCommandToApi(command) {
    const apiData = {
      p_nombre_dispositivo: dispositivoNombre,
      p_status_clave: command.status_clave,
      tipo_evento: 'Operacion'
    };

    try {
      const response = await fetch(`${apiBaseUrl}/registrar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
      });
      
      if (!response.ok) throw new Error('Respuesta de red no fue OK');
      
      const data = await response.json();
      if(data.success) {
          console.log(`Paso de demo [${command.status_texto}] registrado en BD.`);
      } else {
          console.error("Error al registrar paso de demo en BD:", data.error);
      }
    } catch (error) {
      console.error('Error de conexión al registrar paso de demo:', error);
      // Opcional: detener la demo si un paso falla
      // stopDemo(); 
    }
  }

  /**
   * Ejecuta un solo paso de la demo, espera un tiempo, y LUEGO LO DETIENE.
   */
  async function runDemoStep() {
    if (demoRunState !== 'running' || !currentRunningDemo) return;

    // Verifica si la demo terminó
    if (currentDemoIndex >= currentRunningDemo.moves.length) {
      finishDemo(); 
      return;
    }

    // Obtiene el movimiento actual
    const move = currentRunningDemo.moves[currentDemoIndex]; 
    const commandString = `${move.status_texto} (${move.status_clave})`;

    // --- PASO 1: ENVIAR EL MOVIMIENTO (Ej: "Adelante") ---
    await sendDemoCommandToApi(move);

    // --- PASO 2: MOSTRAR ANIMACIÓN DEL MOVIMIENTO ---
    const button = document.querySelector(`.demo-controls-container .control-button[data-command-id="${move.status_clave}"]`);
    if (button) {
      button.classList.add('is-active');
      localStorage.setItem('lastCommand', commandString);
      
      // Actualiza logs para el monitor (sincronizado)
      const log = JSON.parse(localStorage.getItem('lastMovementsLog') || '[]');
      log.push(commandString);
      if (log.length > 10) log.shift();
      localStorage.setItem('lastMovementsLog', JSON.stringify(log));
      window.dispatchEvent(new StorageEvent('storage', { key: 'lastMovementsLog', newValue: JSON.stringify(log) }));
      
      // Esperar a que la animación termine
      await sleep(300);
      button.classList.remove('is-active');
    }
    
    // --- PASO 3: ESPERAR DURACIÓN DEL MOVIMIENTO (Tiempo Límite) ---
    // (Ajusta este valor. 2000ms = 2 segundos)
    const duracionMovimiento = 2000;
    await sleep(duracionMovimiento);

    // --- PASO 4: ENVIAR "DETENER" (A MENOS QUE EL MOVIMIENTO YA FUERA "DETENER") ---
    if (move.status_clave !== 3) { // 3 es la clave de "Detener"
      await sendDemoCommandToApi(stopCommand);

      // (Opcional: mostrar animación de "Detener")
      const stopButton = document.querySelector(`.demo-controls-container .control-button[data-command-id="3"]`);
      if (stopButton) {
        stopButton.classList.add('is-active');
        localStorage.setItem('lastCommand', "Detener (Demo)"); // Actualiza monitor
        await sleep(100);
        stopButton.classList.remove('is-active');
      }
    }

    // --- PASO 5: PAUSA CORTA ENTRE MOVIMIENTOS ---
    await sleep(500); // 0.5s de pausa antes del siguiente comando

    // --- PASO 6: IR AL SIGUIENTE PASO ---
    currentDemoIndex++; 
    if (demoRunState === 'running') {
        runDemoStep(); 
    }
  }
  
  // ===================================================================
  // ===== FIN DE LA FUNCIÓN MODIFICADA =====
  // ===================================================================


  /**
   * Se llama cuando la demo se completa con éxito (actualiza la API)
   * (MODIFICADO para enviar un "Detener" final)
   */
  async function finishDemo() {
    console.log("Demo finalizada. Enviando comando 'Detener' final.");

    // --- ¡NUEVO PASO CRÍTICO! ---
    // Asegurarse de que el robot se detenga al final.
    await sendDemoCommandToApi(stopCommand);
    
    localStorage.setItem('lastCommand', 'Demo finalizada.');
    
    if (currentExecutionId) {
        await updateDemoStatusInApi('Finalizada', currentDemoIndex);
    }

    const log = JSON.parse(localStorage.getItem('demoHistoryLog') || '[]');
    log.push(`${currentRunningDemo.name} (Finalizada)`); 
    if (log.length > 20) log.shift();
    localStorage.setItem('demoHistoryLog', JSON.stringify(log));
    window.dispatchEvent(new StorageEvent('storage', { key: 'demoHistoryLog', newValue: JSON.stringify(log) }));


    demoRunState = 'stopped';
    currentDemoIndex = 0;
    currentRunningDemo = null;
    currentExecutionId = null;
    setDemoUI('stopped');
  }

  /**
   * Pausa la demo en ejecución (actualiza la API)
   * (Esta función no tiene cambios)
   */
  async function pauseDemo() {
    if (demoRunState !== 'running' || !currentExecutionId) return;
    
    demoRunState = 'paused';
    localStorage.setItem('lastCommand', 'Demo pausada.');
    console.log("Demo pausada en el paso:", currentDemoIndex);
    
    await updateDemoStatusInApi('Pausada', currentDemoIndex); 

    setDemoUI('paused');
  }

  /**
   * Reanuda la demo pausada (actualiza la API)
   * (Esta función no tiene cambios)
   */
  async function resumeDemo() {
    if (demoRunState !== 'paused' || !currentExecutionId) return;
    
    demoRunState = 'running';
    localStorage.setItem('lastCommand', 'Demo reanudada.');
    console.log("Reanudando demo desde el paso:", currentDemoIndex);

    await updateDemoStatusInApi('Iniciada', currentDemoIndex);
    
    setDemoUI('running');
    runDemoStep();
  }

  /**
   * Finaliza (detiene) la demo actual (actualiza la API)
   * (MODIFICADO para enviar "Detener" al cancelar)
   */
  async function stopDemo() {
    if (demoRunState === 'stopped' || !currentExecutionId) return;
    
    const wasPaused = demoRunState === 'paused';
    demoRunState = 'stopped'; // Esto detendrá el bucle de runDemoStep
    localStorage.setItem('lastCommand', 'Demo detenida.');
    console.log("Demo detenida por el usuario en el paso:", currentDemoIndex);

    // --- ¡NUEVO PASO CRÍTICO! ---
    // Asegurarse de que el robot se detenga si se cancela.
    await sendDemoCommandToApi(stopCommand);

    await updateDemoStatusInApi('Cancelada', currentDemoIndex); 

    const log = JSON.parse(localStorage.getItem('demoHistoryLog') || '[]');
    const demoName = currentRunningDemo ? currentRunningDemo.name : "Demo desconocida"; 
    log.push(`${demoName} (Cancelada)`); 
    if (log.length > 20) log.shift();
    localStorage.setItem('demoHistoryLog', JSON.stringify(log));
     window.dispatchEvent(new StorageEvent('storage', { key: 'demoHistoryLog', newValue: JSON.stringify(log) }));
    
    currentDemoIndex = 0;
    currentRunningDemo = null;
    currentExecutionId = null;
    setDemoUI('stopped');
  }

  /**
   * Función auxiliar para llamar al endpoint de actualización de estado
   * (Esta función no tiene cambios)
   */
  async function updateDemoStatusInApi(status, step) {
      if (!currentExecutionId) return;
      
      const apiData = {
          p_id_ejecucion: currentExecutionId,
          p_nuevo_estatus: status,
          p_paso_actual: step
      };
      
      try {
          const response = await fetch(`${apiBaseUrl}/demos/actualizar-estado`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(apiData)
          });
          const result = await response.json();
          if (result.success) {
              console.log(`Estado de demo actualizado a "${status}" en BD.`);
          } else {
              console.error("Error al actualizar estado en BD:", result.error);
          }
      } catch (error) {
          console.error('Error de conexión al actualizar estado:', error);
      }
  }


  // --- Asignación de Eventos Inicial ---
  // (Esta sección no tiene cambios)

  allDemoButtons.forEach(button => {
    const commandId = parseInt(button.dataset.commandId, 10);
    const command = commands.find(c => c.status_clave === commandId);
    if (command) {
      button.addEventListener("click", () => addMoveToDemo(command));
    }
  });

  saveDemoButton.addEventListener("click", saveDemo);
  runDemoButton.addEventListener("click", runDemo);
  deleteDemoButton.addEventListener("click", deleteSelectedDemo);
  pauseDemoButton.addEventListener("click", pauseDemo);
  resumeDemoButton.addEventListener("click", resumeDemo);
  stopDemoButton.addEventListener("click", stopDemo);

  // --- Carga Inicial ---
  loadSavedDemos();
  renderMovesList(); 
  setDemoUI('stopped'); 
});