/**
 * Configuración de la aplicación
 * Contiene credenciales preconfiguradas y opciones de monitoreo.
 */
module.exports = {
  // Servidor Web
  PORT: process.env.PORT || 3000,

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "8905679556:AAG0fJAmMP-jOBd9sNE6E3eZ9qp2A3Ji2N0",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "1238810671",

  // Twitter / X (Cookies de sesión)
  TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN || "e68c75f89217cdfd2f58f0f40301d060c0183b94",
  TWITTER_CT0: process.env.TWITTER_CT0 || "41e023eaeee4ac8d6545c0815cf7c20292984ed640b5543ff3edc8ffe95203f97d0059a17c137ac426323bbfacf2378a5deb29cd397267937689cd0f70c6b12a4166ccc0a661e9a8e6712511580fe184",

  // Usuarios de Twitter a monitorear (puedes agregar más aquí)
  TRACKED_USERS: [
    "yeisonvelez11"
  ],

  // Intervalo de sondeo en segundos (18s = 50 req/15min, 100% sostenible 24/7 sin bloqueos)
  POLL_INTERVAL_SECONDS: 18,

  // Palabras clave requeridas (al menos UNA debe coincidir, insensible a mayúsculas/minúsculas).
  // Si dejas el arreglo vacío [], coincidirá con cualquier tweet.
  // Ejemplo: ["buy", "sell", "pump", "crypto", "$"]
  INCLUDE_KEYWORDS: ["adding"],

  // Palabras clave excluidas / prohibidas (si el tweet contiene CUALQUIERA de estas palabras, NO se enviará).
  // Ejemplo: ["airdrop", "giveaway", "scam", "sponsor"]
  EXCLUDE_KEYWORDS: ["not"],
};
