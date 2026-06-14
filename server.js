require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { procesarMensajesDormidos } = require('./whatsapp');

// 1. Inicializar Firebase Admin (SINTAXIS NUEVA v12+)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-serviceAccount.json');

initializeApp({
  credential: cert(serviceAccount)
});

// Iniciamos la base de datos
const db = getFirestore();

const app = express();
app.use(cors());
app.use(express.json());

// --- RUTAS DE LA CAJA --- //

// Ruta para sumar/restar puntos y canjear premios
app.post('/api/caja/operacion', async (req, res) => {
    const { pinIngresado, telefono, cantidad, operacion } = req.body;

    // SEGURIDAD: Verificamos el PIN desde el servidor
    if (pinIngresado !== process.env.PIN_CAJA) {
        return res.status(401).json({ error: "PIN de caja incorrecto" });
    }

    try {
        const clienteRef = db.collection('clientes').doc(telefono);
        
        // Actualizamos la visita siempre
        const updates = {
            ultimaVisita: new Date().toISOString() 
        };

        // Usamos el nuevo FieldValue modular
        if (operacion === 'sumar_restar') {
            updates.puntos = FieldValue.increment(cantidad);
        } else if (operacion === 'canje_3') {
            updates.desc3Usado = true;
        } else if (operacion === 'canje_5') {
            updates.desc5Usado = true;
        } else if (operacion === 'canje_final') {
            updates.puntos = 0;
            updates.desc3Usado = false;
            updates.desc5Usado = false;
            updates.ultimoPremio = new Date().toISOString();
            updates.totalPremiosCanjeados = FieldValue.increment(1);
        }

        await clienteRef.update(updates);
        res.status(200).json({ success: true, message: "Operación exitosa" });

    } catch (error) {
        console.error("Error en BD:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});




// Ruta secreta para probar Green API
app.get('/api/test-wa/:numero', async (req, res) => {
    const numero = req.params.numero;
    const axios = require('axios');
    const url = `${process.env.GREEN_API_URL}/waInstance${process.env.GREEN_API_ID_INSTANCE}/sendMessage/${process.env.GREEN_API_API_TOKEN}`;
    
    try {
        await axios.post(url, {
            chatId: `${numero}@c.us`,
            message: "¡Hola! Este es un mensaje de prueba desde el cerebro de Nexo Cafe ☕🚀"
        });
        res.send(`¡Éxito! Mensaje enviado a ${numero}`);
    } catch (error) {
        console.error("Error Green API:", error.response?.data || error.message);
        res.status(500).send("Falló el envío. Revisa la consola de Render.");
    }
});



// --- CRON JOBS (Automatización) --- //
// Se ejecuta todos los días a las 11:30 AM
cron.schedule('30 11 * * *', async () => {
    console.log("Iniciando revisión de clientes dormidos...");
    await procesarMensajesDormidos(db);
});

// Levantar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Nexo Backend corriendo en el puerto ${PORT} 🚀`);
});