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

// Envío a Green API (Ahora directo y simple)
async function enviarGreenAPI(telefono, mensaje) {
    const url = `${process.env.GREEN_API_URL}/waInstance${process.env.GREEN_API_ID_INSTANCE}/sendMessage/${process.env.GREEN_API_API_TOKEN}`;
    
    // Como el front ya manda 10 dígitos limpios, solo armamos el formato
    const chatId = `549${telefono}@c.us`; 

    try {
        await axios.post(url, {
            chatId: chatId,
            message: mensaje
        });
        console.log(`Mensaje enviado a ${chatId}`);
        return true;
    } catch (error) {
        console.error(`Error enviando a ${chatId}:`, error?.response?.data || error.message);
        return false;
    }
}

// Lógica principal
async function procesarMensajesDormidos(db) {
    const hoy = new Date();
    const hace10Dias = new Date(hoy.setDate(hoy.getDate() - 10)).toISOString();
    const hace11Dias = new Date(hoy.setDate(hoy.getDate() - 1)).toISOString();

    try {
        const snapshot = await db.collection('clientes')
            .where('ultimaVisita', '<=', hace10Dias)
            .where('ultimaVisita', '>=', hace11Dias)
            .where('aceptaPromos', '==', true) 
            .get();

        if (snapshot.empty) return;

        const clientes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if(data.estadoWhatsapp !== 'bloqueado') {
                clientes.push({ id: doc.id, ...data });
            }
        });

        for (let i = 0; i < clientes.length; i++) {
            const cliente = clientes[i];
            const mensaje = generarMensaje(cliente.nombre);
            const enviado = await enviarGreenAPI(cliente.id, mensaje);

            if (enviado) {
                await db.collection('clientes').doc(cliente.id).update({
                    ultimoRecordatorioEnviado: new Date().toISOString()
                });
            }

            const tiempoEspera = Math.floor(Math.random() * (210000 - 90000 + 1) + 90000);
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
        }
    } catch (error) {
        console.error("Error consultando clientes dormidos:", error);
    }
}

module.exports = { procesarMensajesDormidos };