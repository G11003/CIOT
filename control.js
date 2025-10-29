document.addEventListener("DOMContentLoaded", () => {
  
  // ===== ¡CORREGIDO AQUÍ! =====
  // La variable debe apuntar al puerto 5500
  const apiBaseUrl = 'http://54.161.121.152:5500'; 
  
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
  ];

  // Obtener referencias a los elementos del DOM
  const allButtons = document.querySelectorAll(".control-button[data-command-id]");
  let activeCommandTimer = null;

  // Función para manejar el clic de un comando
  const handleCommand = (command, buttonElement) => {
    
    if (activeCommandTimer) {
      clearTimeout(activeCommandTimer);
      allButtons.forEach(btn => btn.classList.remove("is-active"));
    }

    // 1. Establecer el comando activo visualmente
    buttonElement.classList.add("is-active");

    // 2. ***** ¡MODIFICADO! Llamada a la API *****
    const commandString = `${command.status_texto} (${command.status_clave})`;
    console.log("Enviando comando:", commandString);
    
    // Prepara el cuerpo de la solicitud para la API
    const apiData = {
        p_nombre_dispositivo: 'Robot Explorador v1',
        p_status_clave: command.status_clave,
        tipo_evento: 'Operacion' // Le decimos al endpoint qué SP usar
    };

    // Llama al backend
    // ===== ¡CORREGIDO AQUÍ! =====
    // Usamos la variable 'apiBaseUrl' en lugar de '127.0.0.1'
    fetch(`${apiBaseUrl}/registrar-evento`, {
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

    if (command) {
      button.addEventListener("click", () => {
        handleCommand(command, button);
      });
    }
  });

});