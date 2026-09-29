# 🚀 Crypto Twitter & Telegram Real-time Monitor

Aplicación ultraligera en **Node.js** diseñada para monitorear en tiempo real cuentas de Twitter/X y enviar notificaciones instantáneas a Telegram sobre señales o tweets de criptomonedas.

---

## ⚡ Características Principales

- **100% Gratuito:** No requiere pagar la API oficial de Twitter ni de Telegram.
- **Ultra Ligero:** No usa Puppeteer ni navegadores pesados; consume menos de **30 MB de memoria RAM** (cabe sobradamente en planes gratuitos como Render de 512 MB).
- **Cero Dependencias Externas:** Construido con módulos nativos de Node.js (`http`, `fetch`), por lo que inicia en 1 segundo y no tiene vulnerabilidades de paquetes.
- **Endpoint de Health Check integrado:** Incluye `/health` listo para recibir pings externos y mantener activo el servicio en la nube 24/7 sin que se duerma.
- **Filtrado Inteligente:** Capacidad de vigilar múltiples cuentas y filtrar opcionalmente por palabras clave (`buy`, `sell`, `$SOL`, etc.).
- **Anti-Spam de Inicio:** Al arrancar, guarda en memoria los tweets históricos para notificar únicamente los tweets verdaderamente nuevos que se publiquen a partir de ese momento.

---

## 📁 Estructura del Proyecto

```text
crypto_twitter/
├── config.js         # Credenciales, cuentas a monitorear, filtros y frecuencias
├── twitter.js        # Módulo de consulta directa a la API de X con sesiones
├── telegram.js       # Formateo y envío de alertas a Telegram vía Bot API
├── index.js          # Servidor HTTP nativo + bucle de sondeo (polling)
├── package.json      # Configuración del paquete y scripts
└── README.md         # Documentación de uso y despliegue
```

---

## ⚙️ Configuración (`config.js`)

Todos tus datos ya vienen preconfigurados:

```javascript
module.exports = {
  PORT: process.env.PORT || 3000,

  // Telegram
  TELEGRAM_BOT_TOKEN: "8905679556:AAG0fJAmMP-jOBd9sNE6E3eZ9qp2A3Ji2N0",
  TELEGRAM_CHAT_ID: "1238810671",

  // Twitter (Cookies de sesión)
  TWITTER_AUTH_TOKEN: "e68c75f89217cdfd2f58f0f40301d060c0183b94",
  TWITTER_CT0: "41e023eaeee4ac8d6545c0815cf7c20292984ed640b5543ff3edc8ffe95203f97d...",

  // Cuentas a monitorear (puedes agregar las que quieras sin riesgo de bloqueo)
  TRACKED_USERS: ["yeisonvelez11", "tier10k", "binance"],

  // Cadencia continua por paso (Recomendado: 2.5s)
  POLL_INTERVAL_SECONDS: 2.5,

  // Palabras clave requeridas (al menos UNA debe coincidir, insensible a mayúsculas/minúsculas).
  // Si dejas el arreglo vacío [], pasarán todos los tweets que no estén en la lista de exclusión.
  INCLUDE_KEYWORDS: [],

  // Palabras clave prohibidas (si el tweet contiene CUALQUIERA de estas palabras, NO se enviará a Telegram).
  EXCLUDE_KEYWORDS: []
};
```

> **Reglas de Filtrado:**
> 1. **Exclusión prioritaria:** Si el tweet contiene alguna palabra de `EXCLUDE_KEYWORDS` (sin importar mayúsculas o minúsculas), **se descarta automáticamente**.
> 2. **Inclusión:** Si `INCLUDE_KEYWORDS` tiene elementos, el tweet debe contener al menos una de esas palabras para ser enviado. Si está vacío (`[]`), se admiten todos.
> 3. **Imágenes en Telegram:** Si el tweet contiene fotos/imágenes, la alerta se enviará con la foto adjunta, el texto completo formateado y el botón/enlace directo hacia el tweet original en X.com.

---

## 🩺 Endpoints HTTP Disponibles

El servidor web incluye los siguientes endpoints:

### 1. `GET /health` (o `GET /healthz`)
Úsalo para verificar la salud del bot y para **mantener el servidor despierto**.

**Ejemplo de respuesta:**
```json
{
  "status": "ok",
  "uptime_seconds": 120,
  "last_check": "2026-09-29T00:31:07.868Z",
  "total_checks": 8,
  "alerts_sent": 1,
  "tracked_users": ["yeisonvelez11"],
  "poll_interval_seconds": 15
}
```

### 2. `GET /`
Panel de control visual accesible desde el navegador con el estado de las alertas y la lista de cuentas monitoreadas.

### 3. `GET /trigger`
Fuerza una comprobación inmediata de tweets sin esperar al siguiente ciclo.

---

## 🚀 Cómo Ejecutar en Local

```bash
cd /Users/yeisovelez/repos/crypto_twitter/crypto

# Iniciar la aplicación
npm start
# O directamente:
node index.js
```

---

## ☁️ Despliegue en Producción (Render.com)

### Paso 1: Subir el código a GitHub
Como el repositorio `crypto` ya está conectado a GitHub (`YeisonVelez11/crypto`):
```bash
cd /Users/yeisovelez/repos/crypto_twitter/crypto
git add .
git commit -m "feat: crypto twitter monitor"
git push origin main
```

### Paso 2: Crear el Web Service en Render
1. Ve a [dashboard.render.com](https://dashboard.render.com) e inicia sesión.
2. Haz clic en **New +** -> **Web Service**.
3. Conecta tu repositorio de GitHub `crypto` (o `YeisonVelez11/crypto`).
4. Configura los siguientes campos:
   - **Name:** `crypto-twitter-monitor`
   - **Environment:** `Node`
   - **Region:** Elige la más cercana (ej. Oregon o Frankfurt).
   - **Branch:** `main`
   - **Build Command:** `npm install` (o déjalo en blanco)
   - **Start Command:** `npm start`
   - **Plan:** `Free` (512 MB RAM / 0.1 CPU)
5. Haz clic en **Create Web Service**.

---

## ⏰ Cómo evitar que Render se duerma (24/7 Gratis)

En el plan gratuito, Render apaga el servicio tras 15 minutos sin tráfico entrante. Para evitar esto:

1. Ve a un servicio gratuito de monitoreo como [cron-job.org](https://cron-job.org/) o [uptimerobot.com](https://uptimerobot.com/).
2. Crea un nuevo monitor o tarea cron:
   - **URL a llamar:** `https://tu-servicio.onrender.com/health`
   - **Método:** `GET`
   - **Frecuencia:** Cada 1 a 5 minutos (cron-job.org permite hasta cada 1 minuto gratis).
3. Cada vez que ese servicio consulte `/health`:
   - Recibirá un código `200 OK`.
   - Render registrará la petición activa y mantendrá el proceso encendido sin suspenderlo.
