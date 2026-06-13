const axios = require('axios');

// Generador de textos dinámicos (Text Spinning)
function generarMensaje(nombre) {
    const saludos = ["¡Hola", "¡Qué tal", "Buenas", "¡Ey"];
    const intros = ["hace rato no te vemos por Nexo Cafe", "te extrañamos en la cafetería", "hace unos días no pasas a buscar tu café", "¿todo bien?"];
    const gancho = ["¿Te guardamos un lugar hoy?", "Date una vuelta, tenemos cositas ricas.", "Aprovecha a sumar tus sellos pendientes.", "Hoy tenemos un clima ideal para un café."];
    const cierres = ["¡Te esperamos!", "Un abrazo.", "Nos vemos pronto.", "¡Que tengas buen día!"];

    const sal = saludos[Math.floor(Math.random() * saludos.length)];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const gan = gancho[Math.floor(Math.random() * gancho.length)];
    const cie = cierres[Math.floor(Math.random() * cierres.length)];

    return `${sal} ${nombre}! ${intro} ☕. ${gan}\n\nResponde *"SI"* si vas a pasar así te preparamos algo especial, o *"MENU"* para ver qué hay hoy. ${cie}`;
}

// Envío a Green API
async function enviarGreenAPI(telefono, mensaje) {
    const url = `${process.env.GREEN_API_URL}/waInstance${process.env.GREEN_API_ID_INSTANCE}/sendMessage/${process.env.GREEN_API_API_TOKEN}`;
    
    // Asegurarse de que el formato sea de WhatsApp (ej: 549221... @c.us)
    const chatId = `${telefono}@c.us`; 

    try {
        await axios.post(url, {
            chatId: chatId,
            message: mensaje
        });
        console.log(`Mensaje enviado a ${telefono}`);
        return true;
    } catch (error) {
        console.error(`Error enviando a ${telefono}:`, error?.response?.data || error.message);
        return false;
    }
}

// Lógica principal: Buscar y enviar con pausas Anti-Ban
async function procesarMensajesDormidos(db) {
    const hoy = new Date();
    // Buscamos clientes que no vienen hace 10 días
    const hace10Dias = new Date(hoy.setDate(hoy.getDate() - 10)).toISOString();
    const hace11Dias = new Date(hoy.setDate(hoy.getDate() - 1)).toISOString(); // Rango de 24hs para no mandarles a todos la vida entera

    try {
        const snapshot = await db.collection('clientes')
            .where('ultimaVisita', '<=', hace10Dias)
            .where('ultimaVisita', '>=', hace11Dias)
            .where('estadoWhatsapp', '!=', 'bloqueado') // Por si algún usuario pide que no le hablen más
            .get();

        if (snapshot.empty) {
            console.log("No hay clientes para reactivar hoy.");
            return;
        }

        const clientes = [];
        snapshot.forEach(doc => clientes.push({ id: doc.id, ...doc.data() }));
        console.log(`Encontrados ${clientes.length} clientes dormidos. Iniciando envíos...`);

        // Bucle de envío pausado
        for (let i = 0; i < clientes.length; i++) {
            const cliente = clientes[i];
            const mensaje = generarMensaje(cliente.nombre);
            
            const enviado = await enviarGreenAPI(cliente.id, mensaje);

            if (enviado) {
                // Actualizamos que ya le mandamos un recordatorio para no spamear
                await db.collection('clientes').doc(cliente.id).update({
                    ultimoRecordatorioEnviado: new Date().toISOString()
                });
            }

            // ANTI-BAN: Pausa aleatoria entre 1.5 y 3.5 minutos entre CADA mensaje
            const tiempoEspera = Math.floor(Math.random() * (210000 - 90000 + 1) + 90000);
            console.log(`Pausando ${tiempoEspera / 1000} segundos antes del próximo...`);
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
            
            // ANTI-BAN: Cada 10 mensajes, hacer una pausa larga de 10 minutos
            if ((i + 1) % 10 === 0 && i < clientes.length - 1) {
                console.log("Pausa larga Anti-Ban de 10 minutos...");
                await new Promise(resolve => setTimeout(resolve, 600000));
            }
        }
        
        console.log("Ciclo de envíos terminado por hoy.");

    } catch (error) {
        console.error("Error consultando clientes dormidos:", error);
    }
}

module.exports = { procesarMensajesDormidos };