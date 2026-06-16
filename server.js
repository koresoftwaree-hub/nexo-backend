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

app.get('/', (req, res) => {
    res.status(200).send("Servidor Nexo Cafe Activo y Despierto");
});
app.use(cors());
app.use(express.json());

// --- RUTA PARA EL LOGIN DE ADMIN ---
app.post('/api/admin/login', (req, res) => {
    const { pinIngresado } = req.body;
    const pinCorrectoAdmin = process.env.PIN_ADMIN || "7777";

    if (pinIngresado === pinCorrectoAdmin) {
        res.status(200).json({ success: true, message: "Acceso concedido" });
    } else {
        res.status(401).json({ success: false, error: "PIN de administrador incorrecto" });
    }
});

// --- NUEVO: RUTA DE CACHÉ PARA ESTADÍSTICAS DEL DUEÑO ---
let cacheDashboard = null;
let ultimaActualizacionCache = 0;

app.post('/api/admin/dashboard-data', async (req, res) => {
    const { pinIngresado } = req.body;
    const pinCorrectoAdmin = process.env.PIN_ADMIN || "7777";

    if (pinIngresado !== pinCorrectoAdmin) {
        return res.status(401).json({ error: "PIN de administrador incorrecto" });
    }

    const ahora = Date.now();
    // Si el caché tiene menos de 10 minutos (600,000 milisegundos), enviamos la copia en memoria
    if (cacheDashboard && (ahora - ultimaActualizacionCache < 600000)) {
        console.log("Enviando panel desde Caché (Ahorrando lecturas de Firebase)");
        return res.json({ success: true, fromCache: true, data: cacheDashboard });
    }

    // Si no hay caché o expiró, hacemos UNA sola lectura global
    try {
        console.log("Leyendo Firebase para actualizar el caché del Dashboard...");
        const querySnapshot = await db.collection("clientes").get();
        const clientes = [];
        
        querySnapshot.forEach(doc => {
            const d = doc.data();
            clientes.push({
                telefono: doc.id,
                nombre: d.nombre || "Sin Nombre",
                puntos: d.puntos || 0,
                premios: d.totalPremiosCanjeados || 0,
                totalSellos: (d.puntos || 0) + ((d.totalPremiosCanjeados || 0) * 8),
                fecha: d.fechaRegistro || d.ultimaVisita || '',
                desc3Usado: d.desc3Usado || false,
                desc5Usado: d.desc5Usado || false
            });
        });

        // Memorizamos los datos para las próximas peticiones
        cacheDashboard = clientes;
        ultimaActualizacionCache = ahora;

        res.json({ success: true, fromCache: false, data: cacheDashboard });
    } catch (error) {
        console.error("Error cargando dashboard:", error);
        res.status(500).json({ error: "Error interno cargando las estadísticas" });
    }
});

// --- RUTAS DE LA CAJA --- //
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
        
        // Magia: Forzamos a que el servidor olvide el caché, así la próxima vez que 
        // el dueño abra la app, verá el número actualizado que acabamos de guardar.
        cacheDashboard = null; 
        ultimaActualizacionCache = 0;

        res.status(200).json({ success: true, message: "Operación exitosa" });

    } catch (error) {
        console.error("Error en BD:", error);
        res.status(500).json({ error: "Error interno del servidor" });
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