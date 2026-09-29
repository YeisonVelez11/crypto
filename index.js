const http = require("http");
const config = require("./config");
const { fetchUserTweets } = require("./twitter");
const { sendTelegramAlert, notifyNewTweet } = require("./telegram");

// Estado de la aplicación
const startTime = Date.now();
let lastCheckTime = null;
let totalChecks = 0;
let totalAlertsSent = 0;
let isInitialRun = true;

// Registro en memoria de tweets ya vistos
const seenTweetIds = new Set();

/**
 * Evalúa si un tweet pasa los filtros de inclusión y exclusión de palabras clave
 * @param {string} tweetText
 * @returns {{ pass: boolean, reason?: string }}
 */
function evaluateFilters(tweetText) {
  const textLower = (tweetText || "").toLowerCase();

  // 1. Filtro de exclusión: Si contiene CUALQUIER palabra prohibida, se descarta de inmediato
  if (config.EXCLUDE_KEYWORDS && config.EXCLUDE_KEYWORDS.length > 0) {
    for (const forbidden of config.EXCLUDE_KEYWORDS) {
      if (forbidden && textLower.includes(forbidden.toLowerCase())) {
        return { pass: false, reason: `Contiene palabra excluida "${forbidden}"` };
      }
    }
  }

  // 2. Filtro de inclusión: Si se definieron palabras clave, al menos UNA debe coincidir
  if (config.INCLUDE_KEYWORDS && config.INCLUDE_KEYWORDS.length > 0) {
    const hasIncludedWord = config.INCLUDE_KEYWORDS.some((kw) =>
      kw && textLower.includes(kw.toLowerCase())
    );
    if (!hasIncludedWord) {
      return { pass: false, reason: "No contiene ninguna de las palabras requeridas" };
    }
  }

  return { pass: true };
}

let currentUserIndex = 0;

/**
 * Fase de calentamiento: Carga tweets iniciales en memoria con espaciado seguro
 */
async function warmup() {
  console.log(`[Calentamiento] Inicializando ${config.TRACKED_USERS.length} cuenta(s)...`);
  for (const username of config.TRACKED_USERS) {
    try {
      const tweets = await fetchUserTweets(username);
      if (Array.isArray(tweets)) {
        for (const t of tweets) {
          seenTweetIds.add(t.id);
        }
        console.log(`  └─ @${username}: ${tweets.length} tweets históricos cargados en memoria.`);
      }
    } catch (e) {
      console.error(`  └─ Error inicializando @${username}:`, e.message);
    }
    // Pausa breve entre cuentas en el arranque para evitar picos
    await new Promise((r) => setTimeout(r, 1000));
  }

  isInitialRun = false;
  console.log(`\n🚀 Monitor Round-Robin activo. 1 comprobación cada ${config.POLL_INTERVAL_SECONDS}s.`);

  await sendTelegramAlert(
    `🚀 <b>Crypto Twitter Monitor en Línea</b>\n\n` +
    `👤 <b>Cuentas monitoreadas (${config.TRACKED_USERS.length}):</b>\n` +
    `${config.TRACKED_USERS.map(u => "• @" + u).join("\n")}\n\n` +
    `⚡ <b>Modo:</b> Round-Robin Cadenciado (Anti-Ban)\n` +
    `⏱ <b>Cadencia:</b> 1 petición cada ${config.POLL_INTERVAL_SECONDS}s\n` +
    `🕒 <b>Hora inicio (COL):</b> ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}\n` +
    `🟢 <b>Health Check:</b> <code>/health</code>`
  );
}

/**
 * Comprueba el siguiente usuario en la lista (Round-Robin suave)
 * Devuelve el tiempo en ms que debe esperar antes de la próxima consulta.
 */
async function checkNextUser() {
  if (!config.TRACKED_USERS || config.TRACKED_USERS.length === 0) {
    return 3000;
  }

  const username = config.TRACKED_USERS[currentUserIndex];
  currentUserIndex = (currentUserIndex + 1) % config.TRACKED_USERS.length;

  lastCheckTime = new Date().toISOString();
  totalChecks++;

  try {
    const tweets = await fetchUserTweets(username);

    // Si Twitter reportó 429, activamos pausa preventiva exacta
    if (tweets && tweets.rateLimited) {
      const waitMs = (tweets.waitSeconds || 60) * 1000;
      console.warn(`[Anti-Ban] ⚠️ Esperando ${tweets.waitSeconds || 60}s hasta que Twitter reinicie la cuota...`);
      return waitMs;
    }

    if (Array.isArray(tweets)) {
      for (const t of tweets) {
        if (!seenTweetIds.has(t.id)) {
          seenTweetIds.add(t.id);

          const filterResult = evaluateFilters(t.text);
          if (filterResult.pass) {
            console.log(`[NUEVO TWEET ACEPTADO] @${t.screen_name}: ${t.text.substring(0, 80)}...`);
            if (t.images && t.images.length > 0) {
              console.log(`  └─ Incluye ${t.images.length} imagen(es): ${t.images[0]}`);
            }
            await notifyNewTweet(t);
            totalAlertsSent++;
          } else {
            console.log(`[Tweet descartado por filtro] @${t.screen_name}: ${filterResult.reason}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Error sondeo @${username}]:`, err.message);
  }

  return config.POLL_INTERVAL_SECONDS * 1000;
}

/**
 * Servidor HTTP nativo para Render / Health Check
 */
const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  // Endpoint de salud para que Render o cualquier servicio externo mantenga despierto el servidor
  if (url === "/health" || url === "/healthz" || url === "/ping") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });
    if (req.method === "HEAD") {
      return res.end();
    }
    return res.end(JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      last_check: lastCheckTime,
      total_checks: totalChecks,
      alerts_sent: totalAlertsSent,
      tracked_users: config.TRACKED_USERS,
      poll_interval_seconds: config.POLL_INTERVAL_SECONDS,
      include_keywords: config.INCLUDE_KEYWORDS,
      exclude_keywords: config.EXCLUDE_KEYWORDS
    }, null, 2));
  }

  // Endpoint para forzar una verificación manual de inmediato
  if (url === "/trigger") {
    checkNextUser();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Sondeo manual ejecutado" }));
  }

  // Página de inicio básica con información del estado
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Crypto Twitter Monitor</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .card { background: #1e293b; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #334155; }
        h1 { color: #38bdf8; font-size: 24px; margin-top: 0; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #10b981; color: white; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #334155; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
        a { color: #38bdf8; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="status">● OPERACIONAL</span>
        <h1>Crypto Twitter Monitor</h1>
        <p>Sistema ligero de escucha en tiempo real para señales cripto con alertas vía Telegram.</p>
        <ul>
          <li><b>Cuentas en seguimiento:</b> ${config.TRACKED_USERS.map(u => `<code>@${u}</code>`).join(", ")}</li>
          <li><b>Filtro de inclusión:</b> ${config.INCLUDE_KEYWORDS.length > 0 ? config.INCLUDE_KEYWORDS.map(k => `<code>${k}</code>`).join(", ") : "<i>Ninguno (pasan todos)</i>"}</li>
          <li><b>Filtro de exclusión:</b> ${config.EXCLUDE_KEYWORDS.length > 0 ? config.EXCLUDE_KEYWORDS.map(k => `<code>${k}</code>`).join(", ") : "<i>Ninguno</i>"}</li>
          <li><b>Intervalo de chequeo:</b> ${config.POLL_INTERVAL_SECONDS} segundos</li>
          <li><b>Alertas enviadas:</b> ${totalAlertsSent}</li>
          <li><b>Total de verificaciones:</b> ${totalChecks}</li>
          <li><b>Health Check Endpoint:</b> <a href="/health"><code>/health</code></a></li>
        </ul>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
          Configura un servicio gratuito como <b>cron-job.org</b> o <b>UptimeRobot</b> haciendo peticiones GET a <code>/health</code> para mantener el servidor activo en Render 24/7.
        </p>
      </div>
    </body>
    </html>
  `);
});

// Iniciar servidor web
server.listen(config.PORT, async () => {
  console.log(`===============================================`);
  console.log(`🌐 Servidor Web escuchando en el puerto ${config.PORT}`);
  console.log(`🩺 Health check disponible en: http://localhost:${config.PORT}/health`);
  console.log(`📡 Cuentas a monitorear: ${config.TRACKED_USERS.join(", ")}`);
  console.log(`⚡ Modo: Round-Robin Anti-Ban (1 petición cada ${config.POLL_INTERVAL_SECONDS}s)`);
  console.log(`===============================================\n`);

  // Bucle de sondeo secuencial de alta velocidad con backoff dinámico
  async function pollLoop() {
    let nextDelay = config.POLL_INTERVAL_SECONDS * 1000;
    try {
      nextDelay = await checkNextUser();
    } catch (e) {
      console.error("[Poll Error]:", e.message);
    } finally {
      setTimeout(pollLoop, nextDelay);
    }
  }

  // 1. Carga previa segura de tweets
  await warmup();

  // 2. Inicia el ciclo permanente
  pollLoop();
});

// Manejo seguro de terminación de proceso
process.on("SIGINT", () => {
  console.log("\nDeteniendo servidor limpiamente...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("\nDeteniendo servidor limpiamente...");
  server.close(() => process.exit(0));
});
