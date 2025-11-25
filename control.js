document.addEventListener("DOMContentLoaded", () => {
  
  const apiBaseUrl = 'http://98.88.1.17:5500'; 
  
  // ===== 1. AÑADIMOS NUEVOS COMANDOS DE VELOCIDAD =====
  // (Claves 21-24 para no chocar con las claves 12-16 de evasión)
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
    // --- Nuevos comandos de velocidad ---
    { status_clave: 21, status_texto: "Adelante (Baja)" },
    { status_clave: 22, status_texto: "Adelante (Alta)" },
    { status_clave: 23, status_texto: "Atrás (Baja)" },
    { status_clave: 24, status_texto: "Atrás (Alta)" },
  ];
  // ----------------------------------------------------

  // 1. Obtener el comando y el botón de "Detener"
  const stopCommand = commands.find(c => c.status_clave === 3);
  const stopButtonElement = document.querySelector(".control-button[data-command-id='3']");

  // 2. Definir qué botones son de "movimiento continuo"
  const continuousMoveIds = [1, 2, 4, 5, 6, 7];
  
  // Obtener referencias a los elementos del DOM
  const allButtons = document.querySelectorAll(".control-button[data-command-id]");
  let activeCommandTimer = null;

  // ===== 2. VARIABLE GLOBAL PARA VELOCIDAD =====
  let currentSpeedLevel = 'moderada'; // Valor inicial
  // ---------------------------------------------

  // Función para manejar el clic de un comando
  const handleCommand = (command, buttonElement) => {
    
    // ===== 3. LÓGICA DE RE-MAPEO DE COMANDO =====
    let finalCommand = command; // Empezar con el comando base (ej: Adelante)
    const baseCommandId = command.status_clave;
    
    // Solo re-mapeamos Adelante (1) y Atrás (2)
    if (currentSpeedLevel === 'baja') {
        if (baseCommandId === 1) { // Adelante
            finalCommand = commands.find(c => c.status_clave === 21); // Adelante (Baja)
        } else if (baseCommandId === 2) { // Atrás
            finalCommand = commands.find(c => c.status_clave === 23); // Atrás (Baja)
        }
    } else if (currentSpeedLevel === 'alta') {
        if (baseCommandId === 1) { // Adelante
            finalCommand = commands.find(c => c.status_clave === 22); // Adelante (Alta)
        } else if (baseCommandId === 2) { // Atrás
            finalCommand = commands.find(c => c.status_clave === 24); // Atrás (Alta)
        }
    }
    // Si la velocidad es "moderada", finalCommand sigue siendo el comando original.
    // Si es un giro (ej: ID 8), también permanece original.
    // ------------------------------------------------

    
    if (activeCommandTimer) {
      clearTimeout(activeCommandTimer);
      allButtons.forEach(btn => btn.classList.remove("is-active"));
    }

    // 1. Establecer el comando activo visualmente
    buttonElement.classList.add("is-active");

    // 2. ***** ¡MODIFICADO! Llamada a la API *****
    // (Usa finalCommand en lugar de command)
    const commandString = `${finalCommand.status_texto} (${finalCommand.status_clave})`;
    console.log("Enviando comando:", commandString);
    
    const apiData = {
        p_nombre_dispositivo: 'Robot Explorador v1',
        p_status_clave: finalCommand.status_clave, // <-- ¡USA LA CLAVE FINAL!
        tipo_evento: 'Operacion'
    };

    // Llama al backend
    fetch(`${apiBaseUrl}/registrar-evento`, { // <-- Usa la variable apiBaseUrl
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
    })
    .then(response => response.json())
    .then(data => {
        if(data.success) {
            console.log("Comando registrado en la BD.");
        } else {
            console.error("Error al registrar en BD:", data.error);
        }
    })
    .catch(error => {
        console.error('Error de conexión con la API:', error);
    });

    
    // 3. Escribir en localStorage (para que el monitor lo vea)
    localStorage.setItem('lastCommand', commandString);

    // 4. Actualizar el log de movimientos (para el monitor)
    const log = JSON.parse(localStorage.getItem('lastMovementsLog') || '[]');
    log.push(commandString); // Añade el nuevo comando
    if (log.length > 10) {
      log.shift(); // Mantiene solo los últimos 10
    }
    localStorage.setItem('lastMovementsLog', JSON.stringify(log));


    // 5. Reiniciar el estado activo después de la animación
    activeCommandTimer = setTimeout(() => {
      buttonElement.classList.remove("is-active");
      activeCommandTimer = null;
    }, 300); // 300ms
  };

  // Asignar los eventos de clic a cada botón
  allButtons.forEach(button => {
    const commandId = parseInt(button.dataset.commandId, 10);
    const command = commands.find(c => c.status_clave === commandId);
    if (!command) return;

    if (continuousMoveIds.includes(commandId)) {
      // --- Eventos de Mouse ---
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleCommand(command, button);
      });
      button.addEventListener("mouseup", (e) => {
        e.preventDefault();
        handleCommand(stopCommand, stopButtonElement);
      });
      button.addEventListener("mouseleave", (e) => {
        if (e.buttons === 1) {
          handleCommand(stopCommand, stopButtonElement);
        }
      });
      // --- Eventos Táctiles (Móvil) ---
      button.addEventListener("touchstart", (e) => {
        e.preventDefault();
        handleCommand(command, button);
      }, { passive: false });
      button.addEventListener("touchend", (e) => {
        e.preventDefault();
        handleCommand(stopCommand, stopButtonElement);
      });
    } else {
      button.addEventListener("click", () => {
        handleCommand(command, button);
      });
    }
  });

  // ===== 4. AÑADIR EVENT LISTENERS PARA BOTONES DE VELOCIDAD =====
  const speedButtons = document.querySelectorAll(".speed-button");
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Quitar 'is-active' de todos
      speedButtons.forEach(b => b.classList.remove('is-active'));
      // Añadir 'is-active' al presionado
      btn.classList.add('is-active');
      // Actualizar la variable global
      currentSpeedLevel = btn.dataset.speedLevel;
      console.log("Nivel de velocidad fijado a:", currentSpeedLevel);
    });
  });
  // --------------------------------------------------------------


});


