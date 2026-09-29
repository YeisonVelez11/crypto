/**
 * Configuración de la aplicación
 * Contiene credenciales preconfiguradas y opciones de monitoreo por usuario.
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

  // Intervalo de sondeo en segundos (18s = 50 req/15min, 100% sostenible 24/7 sin bloqueos)
  POLL_INTERVAL_SECONDS: 18,

  /**
   * Usuarios a monitorear y sus reglas de filtrado individuales:
   * 
   * - include_keywords: Lista de palabras que DEBE contener (al menos una).
   * - exclude_keywords: Lista de palabras que NO debe contener (si tiene alguna, se descarta).
   * - Si ambos arrays están vacíos [], se envían TODOS los tweets de ese usuario sin filtro.
   */
  TRACKED_USERS: {
    "yeisonvelez11": {
      include_keywords: ["adding"],
      exclude_keywords: ["not"]
    },
    "Sangita_gems ": {
      include_keywords: ["bought", "buy", "quick", "breakout"],
      exclude_keywords: []
    },
    "CryptoShillz06": {
      include_keywords: ["add", "buying"],
      exclude_keywords: ["#Binancealpha"]
    },
    "Najam76400935": {
      include_keywords: [],
      exclude_keywords: []
    },
    "Allice_Crypto":{
      include_keywords: [],
      exclude_keywords: []
    }
    
    
    // Ejemplo de más usuarios:
    // "binance": {
    //   include_keywords: ["listing", "launchpool"],
    //   exclude_keywords: ["maintenance", "system"]
    // },
    // "elonmusk": {
    //   include_keywords: [], // Vacío = deja pasar todo de él
    //   exclude_keywords: []
    // }
  }
};
