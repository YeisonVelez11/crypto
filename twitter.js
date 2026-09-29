const config = require("./config");

const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const headers = {
  "authorization": `Bearer ${BEARER_TOKEN}`,
  "x-csrf-token": config.TWITTER_CT0,
  "x-twitter-active-user": "yes",
  "x-twitter-auth-type": "OAuth2Session",
  "x-twitter-client-language": "en",
  "cookie": `auth_token=${config.TWITTER_AUTH_TOKEN}; ct0=${config.TWITTER_CT0};`,
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "content-type": "application/json"
};

// Cache para almacenar rest_id de cada usuario y no gastar llamadas
const userIdCache = new Map();

/**
 * Obtiene el rest_id numérico de un usuario por su @username
 */
async function getUserId(screenName) {
  const cleanScreenName = screenName.replace(/^@/, "");
  if (userIdCache.has(cleanScreenName)) {
    return userIdCache.get(cleanScreenName);
  }

  const queryId = "sLVLhk0bGj3MVFEKTdax1w";
  const variables = JSON.stringify({
    screen_name: cleanScreenName,
    withSafetyModeUserFields: true
  });
  const features = JSON.stringify({
    hidden_profile_subscriptions_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true
  });

  const url = `https://x.com/i/api/graphql/${queryId}/UserByScreenName?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;
  
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[Twitter] Error obteniendo ID de @${cleanScreenName}: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const restId = data.data?.user?.result?.rest_id;
    if (restId) {
      userIdCache.set(cleanScreenName, restId);
      console.log(`[Twitter] Usuario @${cleanScreenName} identificado con ID: ${restId}`);
      return restId;
    } else {
      console.warn(`[Twitter] No se encontró el usuario @${cleanScreenName}`);
      return null;
    }
  } catch (err) {
    console.error(`[Twitter] Error en petición de usuario:`, err.message);
    return null;
  }
}

/**
 * Obtiene los tweets más recientes del usuario
 */
async function fetchUserTweets(screenName) {
  const cleanScreenName = screenName.replace(/^@/, "");
  const userId = await getUserId(cleanScreenName);
  if (!userId) return [];

  const queryId = "V7H0Ap3_Hh2FyS75OCDO3Q";
  const variables = JSON.stringify({
    userId: userId,
    count: 5,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    withV2Timeline: true
  });
  const features = JSON.stringify({
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    rweb_video_timestamps_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false
  });

  const url = `https://x.com/i/api/graphql/${queryId}/UserTweets?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;

  try {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const resetUnix = res.headers.get("x-rate-limit-reset");
      let waitSeconds = 60;
      if (resetUnix) {
        waitSeconds = Math.max(5, Math.ceil(parseInt(resetUnix) - Date.now() / 1000) + 2);
      }
      console.warn(`[Twitter 429] Límite de 50 req/15min alcanzado. Twitter restablecerá el acceso en ${waitSeconds} segundos.`);
      const empty = [];
      empty.rateLimited = true;
      empty.waitSeconds = waitSeconds;
      return empty;
    }
    if (!res.ok) {
      console.error(`[Twitter] Error obteniendo tweets de @${cleanScreenName}: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const instructions = data.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

    const tweets = [];
    for (const instr of instructions) {
      if (instr.type === "TimelineAddEntries") {
        for (const entry of instr.entries || []) {
          if (entry.entryId && entry.entryId.startsWith("tweet-")) {
            const itemContent = entry.content?.itemContent;
            const tweetResult = itemContent?.tweet_results?.result;
            const tweetLegacy = tweetResult?.legacy || tweetResult?.tweet?.legacy;
            
            if (tweetLegacy && tweetLegacy.id_str) {
              // Extraer imágenes o contenido multimedia si existe
              let mediaEntities = tweetLegacy.extended_entities?.media || tweetLegacy.entities?.media || [];
              if (mediaEntities.length === 0 && tweetLegacy.retweeted_status_result) {
                const origLegacy = tweetLegacy.retweeted_status_result?.result?.legacy;
                if (origLegacy) {
                  mediaEntities = origLegacy.extended_entities?.media || origLegacy.entities?.media || [];
                }
              }

              const images = [];
              for (const m of mediaEntities) {
                if (m.media_url_https) {
                  images.push(m.media_url_https);
                }
              }

              tweets.push({
                id: tweetLegacy.id_str,
                text: tweetLegacy.full_text || "",
                created_at: tweetLegacy.created_at,
                screen_name: cleanScreenName,
                images: images
              });
            }
          }
        }
      }
    }

    return tweets;
  } catch (err) {
    console.error(`[Twitter] Error consultando timeline de @${cleanScreenName}:`, err.message);
    return [];
  }
}

module.exports = {
  getUserId,
  fetchUserTweets
};
