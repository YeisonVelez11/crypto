const config = require("./config");

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Envía un mensaje a Telegram usando la API oficial
 * @param {string} htmlMessage Mensaje con formato HTML
 */
async function sendTelegramAlert(htmlMessage) {
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text: htmlMessage,
        parse_mode: "HTML",
        disable_web_page_preview: false
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("[Telegram Error]", data.description);
    }
    return data;
  } catch (err) {
    console.error("[Telegram Network Error]", err.message);
    return null;
  }
}

/**
 * Formatea un tweet y lo envía como alerta (con imagen si está disponible)
 * @param {object} tweet
 */
async function notifyNewTweet(tweet) {
  const tweetUrl = `https://x.com/${tweet.screen_name}/status/${tweet.id}`;
  
  // Si el tweet incluye al menos una imagen, intentamos enviar con sendPhoto
  const hasImage = tweet.images && tweet.images.length > 0;
  const imageUrl = hasImage ? tweet.images[0] : null;

  // Límite de caption en Telegram sendPhoto es de 1024 caracteres
  let tweetText = tweet.text || "";
  if (hasImage && tweetText.length > 700) {
    tweetText = tweetText.substring(0, 700) + "... (continúa en X)";
  }

  const message = [
    `🚨 <b>NUEVA ALERTA DE TWITTER</b> 🚨`,
    ``,
    `👤 <b>Cuenta:</b> @${escapeHtml(tweet.screen_name)}`,
    `⏰ <b>Hora:</b> ${new Date().toLocaleTimeString()} (UTC ${new Date().toISOString().substring(11, 19)})`,
    ``,
    `📝 <b>Contenido:</b>`,
    `${escapeHtml(tweetText)}`,
    ``,
    `🔗 <a href="${tweetUrl}">Abrir tweet original en X.com</a>`
  ].join("\n");

  if (hasImage && imageUrl) {
    try {
      const photoUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendPhoto`;
      const res = await fetch(photoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.TELEGRAM_CHAT_ID,
          photo: imageUrl,
          caption: message,
          parse_mode: "HTML"
        })
      });

      const data = await res.json();
      if (data.ok) {
        return data;
      }
      console.warn("[Telegram sendPhoto Error, intentando con texto]:", data.description);
    } catch (err) {
      console.warn("[Telegram sendPhoto Network Error]:", err.message);
    }
  }

  // Fallback si no tiene foto o si falló sendPhoto
  return sendTelegramAlert(message);
}

module.exports = {
  sendTelegramAlert,
  notifyNewTweet,
  escapeHtml
};
