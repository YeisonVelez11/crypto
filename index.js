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
 * Normaliza TRACKED_USERS a un mapa de objetos { [username]: { include_keywords, exclude_keywords } }
 */
function getTrackedUsersMap() {
  if (Array.isArray(config.TRACKED_USERS)) {
    const map = {};
    for (const u of config.TRACKED_USERS) {
      map[u] = {
        include_keywords: config.INCLUDE_KEYWORDS || [],
        exclude_keywords: config.EXCLUDE_KEYWORDS || []
      };
    }
    return map;
  }
  return config.TRACKED_USERS || {};
}

function getTrackedUsernames() {
  return Object.keys(getTrackedUsersMap());
}

function getUserFilters(username) {
  const map = getTrackedUsersMap();
  return map[username] || { include_keywords: [], exclude_keywords: [] };
}

/**
 * Evalúa si un tweet pasa los filtros individuales del usuario
 * @param {string} tweetText
 * @param {object} userFilters { include_keywords, exclude_keywords }
 * @returns {{ pass: boolean, reason?: string }}
 */
function evaluateFilters(tweetText, userFilters = {}) {
  const textLower = (tweetText || "").toLowerCase();
  const excludeList = userFilters.exclude_keywords || userFilters.exclude_words || [];
  const includeList = userFilters.include_keywords || userFilters.include_words || [];

  // 1. Filtro de exclusión: Si contiene CUALQUIER palabra prohibida, se descarta de inmediato
  if (excludeList.length > 0) {
    for (const forbidden of excludeList) {
      if (forbidden && textLower.includes(forbidden.toLowerCase())) {
        return { pass: false, reason: `Contiene palabra excluida "${forbidden}"` };
      }
    }
  }

  // 2. Filtro de inclusión: Si se definieron palabras clave, al menos UNA debe coincidir
  if (includeList.length > 0) {
    const hasIncludedWord = includeList.some((kw) =>
      kw && textLower.includes(kw.toLowerCase())
    );
    if (!hasIncludedWord) {
      return { pass: false, reason: "No contiene ninguna de las palabras requeridas" };
    }
  }

  // Si ambos arrays están vacíos [] (o pasaron los filtros), el tweet se acepta
  return { pass: true };
}

let currentUserIndex = 0;

/**
 * Fase de calentamiento: Carga tweets iniciales en memoria con espaciado seguro
 */
async function warmup() {
  const usernames = getTrackedUsernames();
  console.log(`[Calentamiento] Inicializando ${usernames.length} cuenta(s)...`);

  for (const username of usernames) {
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

  const usersSummary = usernames.map(u => {
    const f = getUserFilters(u);
    const inc = (f.include_keywords || f.include_words || []);
    const exc = (f.exclude_keywords || f.exclude_words || []);
    let desc = "";
    if (inc.length === 0 && exc.length === 0) {
      desc = "<i>(Todos los tweets)</i>";
    } else {
      desc = `[+${inc.length} / -${exc.length}]`;
    }
    return `• @${u} ${desc}`;
  }).join("\n");

  await sendTelegramAlert(
    `🚀 <b>Crypto Twitter Monitor en Línea</b>\n\n` +
    `👤 <b>Cuentas monitoreadas (${usernames.length}):</b>\n` +
    `${usersSummary}\n\n` +
    `⚡ <b>Modo:</b> Filtros Individuales por Usuario\n` +
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
  const usernames = getTrackedUsernames();
  if (usernames.length === 0) {
    return 3000;
  }

  const username = usernames[currentUserIndex];
  currentUserIndex = (currentUserIndex + 1) % usernames.length;
  const userFilters = getUserFilters(username);

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

          const filterResult = evaluateFilters(t.text, userFilters);
          if (filterResult.pass) {
            console.log(`[NUEVO TWEET ACEPTADO] @${t.screen_name}: ${t.text.substring(0, 80)}...`);
            if (t.images && t.images.length > 0) {
              console.log(`  └─ Incluye ${t.images.length} imagen(es): ${t.images[0]}`);
            }
            await notifyNewTweet(t);
            totalAlertsSent++;
          } else {
            console.log(`[Tweet descartado por filtro @${t.screen_name}]: ${filterResult.reason}`);
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
  const usersMap = getTrackedUsersMap();
  const usernames = Object.keys(usersMap);

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
      tracked_users_count: usernames.length,
      tracked_users: usersMap,
      poll_interval_seconds: config.POLL_INTERVAL_SECONDS
    }, null, 2));
  }

  // Endpoint para forzar una verificación manual de inmediato
  if (url === "/trigger") {
    checkNextUser();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Sondeo manual ejecutado" }));
  }

  // Generar lista HTML de usuarios y sus filtros
  const usersHtmlList = usernames.map(u => {
    const f = usersMap[u] || {};
    const inc = f.include_keywords || f.include_words || [];
    const exc = f.exclude_keywords || f.exclude_words || [];
    let incHtml = inc.length > 0 ? inc.map(k => `<code>${k}</code>`).join(", ") : "<i>Todos permitidos</i>";
    let excHtml = exc.length > 0 ? exc.map(k => `<code>${k}</code>`).join(", ") : "<i>Ninguno</i>";

    return `
      <li style="margin-bottom: 12px; padding: 10px; background: #0f172a; border-radius: 8px;">
        <b style="color: #38bdf8;">@${u}</b>
        <div style="font-size: 13px; margin-top: 4px;">✅ <b>Incluir:</b> ${incHtml}</div>
        <div style="font-size: 13px; margin-top: 2px;">🚫 <b>Excluir:</b> ${excHtml}</div>
      </li>
    `;
  }).join("");

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
        .card { background: #1e293b; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #334155; }
        h1 { color: #38bdf8; font-size: 24px; margin-top: 0; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #10b981; color: white; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
        ul { list-style: none; padding: 0; }
        code { background: #1e293b; padding: 2px 6px; border-radius: 4px; color: #38bdf8; border: 1px solid #334155; }
        a { color: #38bdf8; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="status">● OPERACIONAL</span>
        <h1>Crypto Twitter Monitor</h1>
        <p>Sistema de señales cripto en tiempo real con <b>filtros individuales por usuario</b> y alertas a Telegram.</p>
        
        <h3 style="margin-bottom: 8px; color: #e2e8f0;">Cuentas Monitoreadas (${usernames.length})</h3>
        <ul>
          ${usersHtmlList}
        </ul>

        <ul style="border-top: 1px solid #334155; padding-top: 15px; margin-top: 20px;">
          <li style="padding: 4px 0;"><b>Cadencia por comprobación:</b> ${config.POLL_INTERVAL_SECONDS} segundos</li>
          <li style="padding: 4px 0;"><b>Alertas enviadas a Telegram:</b> ${totalAlertsSent}</li>
          <li style="padding: 4px 0;"><b>Total de verificaciones:</b> ${totalChecks}</li>
          <li style="padding: 4px 0;"><b>Health Check Endpoint:</b> <a href="/health"><code>/health</code></a></li>
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
  const usernames = getTrackedUsernames();
  console.log(`===============================================`);
  console.log(`🌐 Servidor Web escuchando en el puerto ${config.PORT}`);
  console.log(`🩺 Health check disponible en: http://localhost:${config.PORT}/health`);
  console.log(`📡 Cuentas a monitorear (${usernames.length}): ${usernames.join(", ")}`);
  console.log(`⚡ Modo: Filtros individuales por cuenta (1 petición cada ${config.POLL_INTERVAL_SECONDS}s)`);
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
