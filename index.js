const fs = require('fs');
const axios = require('axios').default;
const { CookieJar, Cookie } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { Client, RichPresence, CustomStatus } = require('discord.js-selfbot-v13');


// ======== 設定 ========
//変えるな
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const DISCORD_TOKEN = config.token;
const DISCORD_ASSET_APP_ID = '367827983903490050';
const DISCORD_PRESENCE_APP_ID = '367827983903490050';
const VRC_API_BASE = 'https://vrchat.com/api/1';
const VRC_AUTH_FILE = './vrchat_auth_cookie.json';
const POLL_INTERVAL = 5000;
//ここは好きなやつに↓
const OFFLINE_THUMB_URL = 'https://document.necco.xyz/20251111_214934.jpg';


// ======== VRChat axios ========

let vrcClient;
let VRC_USER_ID = null; 
function initVrcClient() {
  const authJson = JSON.parse(fs.readFileSync(VRC_AUTH_FILE, 'utf-8'));
  const authCookieStr = authJson.authCookie;

  if (!authCookieStr) {
    throw new Error('node login.js 実行して認証keyとってから起動して');
  }

  const jar = new CookieJar();
  const cookie = Cookie.parse(authCookieStr);
  cookie.domain = 'vrchat.com';
  cookie.path = '/';
  jar.setCookieSync(cookie, 'https://vrchat.com/');

  vrcClient = wrapper(
    axios.create({
      baseURL: VRC_API_BASE,
      jar,
      withCredentials: true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
    }),
  );
  console.log('✅VRChat api client initialized');
}
async function initCurrentUserId() {
  const res = await vrcClient.get('/auth/user');
  VRC_USER_ID = res.data.id;
  console.log('✅ VRChat you are id:', VRC_USER_ID);
}


// ======== Discord selfbot ========

const client = new Client();
let discordReady = false;

client.on('ready', async () => {
  discordReady = true;
  console.log(`Discord selfbot logged in as ${client.user.tag}`);

  initVrcClient();
  await initCurrentUserId();

  await fetchUserState();
  setInterval(fetchUserState, POLL_INTERVAL);
});

client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);

client.login(DISCORD_TOKEN);




function parseLocationFull(location) {
  if (
    !location ||
    location === 'offline' ||
    location.startsWith('traveling')
  ) {
    return null;
  }

  if (location === 'private') {
    return { worldId: null, instanceIdFull: 'private' };
  }

  const [worldId, instanceIdFull] = location.split(':');
  if (!worldId || !instanceIdFull) return null;
  return { worldId, instanceIdFull };
}

function detectInstancePrivacy(instanceIdFull) {
  if (!instanceIdFull) return 'unknown';

  if (instanceIdFull.includes('~public')) return 'public';
  if (instanceIdFull.includes('~hidden')) return 'friends+';
  if (instanceIdFull.includes('~friends')) return 'friends';

  if (instanceIdFull.includes('~private(')) {
    if (instanceIdFull.includes('~canRequestInvite')) return 'invite+';
    return 'invite';
  }

  return 'public';
}


// ======== 初期化 ========

let lastLocationFull = null;
let lastOkWorldName = null;
let lastOkThumbUrl = null;
let lastKnownPlayers = null;
let lastKnownCapacity = null;
let lastStartTimestamp = null;
let lastState = null;


// ======== RPC更新 ========

async function updateStatus(
  client,
  imageUrl,
  userState,
  locationFull,
  worldName,
  instanceInfo,
  errorInfo,
  locationParsed = null,
  resetTimestamp = false, 
) {
  try {
    if (!discordReady) {
      console.log('updateStatus: discord not ready, skip');
      return;
    }

    if (!lastStartTimestamp || resetTimestamp) {
      lastStartTimestamp = Date.now();
    }

    console.log('updateStatus called with:', {
      imageUrl,
      userState,
      locationFull,
      worldName,
      instanceInfo,
      errorInfo,
      locationParsed,
      resetTimestamp,
      lastStartTimestamp,
    });

    const getExtendURL = await RichPresence.getExternal(
      client,
      DISCORD_ASSET_APP_ID,
      imageUrl || 'https://logos-world.net/wp-content/uploads/2021/04/VRChat-Emblem.png',
    );
    const agetExtendURL = await RichPresence.getExternal(
      client,
      DISCORD_ASSET_APP_ID,
      'https://logos-world.net/wp-content/uploads/2021/04/VRChat-Emblem.png',
    );

    const status = new RichPresence(client)
      .setApplicationId(DISCORD_PRESENCE_APP_ID)
      .setType(0)
      .setName('VRChat.status');
    if (userState === 'offline') {
      status.setDetails('VRChat: offline');
    } else if (userState === 'active') {
      status.setDetails('VRChat (Web/他)');
    } else if (userState === 'online') {
      status.setDetails(worldName ? `World: ${worldName}` : 'VRChat: インスタンス内');
    } else if (userState === 'error') {
      const codeText = errorInfo?.statusCode
        ? `VRChat API Error ${errorInfo.statusCode}`
        : 'VRChat API Error';
      status.setDetails(codeText);
    } else {
      status.setDetails('VRChat');
    }
    let stateText = '';
    let players = null;
    let capacity = null;

    if (userState === 'error') {
      if (errorInfo?.message) {
        const msg = String(errorInfo.message);
        stateText = msg.length > 120 ? msg.slice(0, 117) + '...' : msg;
      } else {
        stateText = 'ステータス更新に失敗しました';
      }
    } else if (locationFull === 'private') {
      stateText = 'プライベートインスタンス';
    } else if (locationFull && locationFull.startsWith('traveling')) {
      stateText = 'インスタンス移動中...';
    } else if (instanceInfo && userState !== 'offline') {
      if (instanceInfo.type === 'error') {
        stateText = 'ステータス更新に失敗しました';
      } else {
        const typeLabel = instanceInfo.type || 'public';
        const region = instanceInfo.region || 'unknown';
        players = typeof instanceInfo.userCount === 'number' ? instanceInfo.userCount : null;
        capacity = typeof instanceInfo.capacity === 'number' ? instanceInfo.capacity : null;
        stateText = `${typeLabel} | ${region.toUpperCase()} ${
          players != null && capacity != null ? `| ${players}/${capacity}` : ''
        }`;
      }
    } else if (locationFull && locationFull.startsWith('wrld_')) {
      stateText = locationFull;
    } else if (userState === 'offline') {
      stateText = 'developer by necco.xyz';
    }

    if (stateText) status.setState(stateText);
    if (players != null && capacity != null) {
    }

    if (locationParsed?.worldId && locationParsed?.instanceIdFull && userState !== 'offline') {
      const launchUrl = `https://vrchat.com/home/launch?worldId=${locationParsed.worldId}&instanceId=${locationParsed.instanceIdFull}`;
      console.log('[DEBUG] addButton Join World ->', launchUrl);
      status.addButton('Join World', launchUrl);
    }

    status
      .setStartTimestamp(lastStartTimestamp) 
      .setAssetsLargeImage(getExtendURL[0].external_asset_path)
      .setAssetsLargeText(worldName || 'VRChat World')
      .setAssetsSmallImage(agetExtendURL[0].external_asset_path)
      .setAssetsSmallText('VRChat Presence');

    const custom = new CustomStatus(client).setState('VRChat Presence Bridge');

    await client.user.setPresence({ activities: [status, custom], status: 'online' });
    console.log('setPresence done (ts =', lastStartTimestamp, ')');
  } catch (e) {
    console.error('updateStatus error:', e);
  }
}


async function fetchUserState() {
  try {
    if (!VRC_USER_ID) {
      console.log('VRC_USER_ID not initialized yet, skip fetchUserState');
      return;
    }
    const res = await vrcClient.get(`/users/${VRC_USER_ID}`);
    const body = res.data;
    const state = body.state;
    const location = body.location;
    const travelingToLocation = body.travelingToLocation;
    const locForParse = travelingToLocation || location;
    const wasOffline = lastState === 'offline';
    const isNowOnline = state === 'online';

    if (wasOffline && isNowOnline) {
      console.log('🔄 state: offline → online [Until the location is confirmed...]');
      lastState = state;
      return;
    }
    lastState = state;
    console.log(`state: ${state}`);
    console.log(`location: ${location}`);
    console.log(`travelingToLocation: ${travelingToLocation}`);
    const parsed = parseLocationFull(locForParse);
    if (!parsed) {
      if (locForParse && locForParse.startsWith('traveling')) {
        console.log('traveling detected');
        lastLocationFull = locForParse;
        return;
      }
      if (state === 'offline' || locForParse === 'offline') {
        console.log('VRChat offline detected');
        if (lastLocationFull === 'offline' && lastState === 'offline') {

          return;
        }
        await updateStatus(
          client,
          OFFLINE_THUMB_URL,
          'offline',
          'offline',
          'VRChat: オフライン',
          {
            type: 'offline',
            userCount: null,
            capacity: null,
            region: '',
          },
          null,
          null,
          true, 
        );

        lastKnownPlayers = null;
        lastKnownCapacity = null;
        lastLocationFull = 'offline';
        lastOkWorldName = 'VRChat: オフライン';
        lastOkThumbUrl = OFFLINE_THUMB_URL;
        return;
      }

      console.log(
        `state=${state}, location=${locForParse} (wrldでもtravelingでもofflineでもない) -> Presence変更なし`,
      );
      return;
    }
    if (parsed.instanceIdFull === 'private') {
      await updateStatus(
        client,
        OFFLINE_THUMB_URL,
        state,
        'private',
        'VRChat: Private World',
        {
          type: 'invite',
          userCount: null,
          capacity: null,
          region: '',
        },
        null,
        null,
        true,
      );
      lastLocationFull = locForParse;
      lastOkWorldName = 'VRChat: Private World';
      lastOkThumbUrl = OFFLINE_THUMB_URL;
      lastKnownPlayers = null;
      lastKnownCapacity = null;
      return;
    }
    const { worldId, instanceIdFull } = parsed;
    console.log('worldId:', worldId);
    console.log('instanceIdFull:', instanceIdFull);
    let instRes;
    try {
      instRes = await vrcClient.get(`/instances/${worldId}:${instanceIdFull}`);
    } catch {
      console.warn('×GET /instances failed, /worlds/{worldId}/{instanceIdFull}');
      instRes = await vrcClient.get(`/worlds/${worldId}/${instanceIdFull}`);
    }
    const inst = instRes.data;
    const players = inst.userCount ?? inst.n_users;
    const capacity = inst.capacity ?? inst.world?.capacity;
    const region = inst.region;
    const worldName = inst.world?.name;
    const thumbUrl = inst.world?.thumbnailImageUrl || inst.world?.imageUrl || null;
    const privacy = detectInstancePrivacy(instanceIdFull);
    console.log('=== INSTANCE ===');
    console.log('worldName:', worldName);
    console.log('privacy:', privacy);
    console.log('players:', players, '/', capacity);
    console.log('region:', region);
    console.log('thumbUrl:', thumbUrl);

    const isFirstInstance = lastLocationFull === null || lastLocationFull === 'offline';
    const isLocationChanged = isFirstInstance || lastLocationFull !== locForParse;

    const isPlayersChanged =
      lastKnownPlayers !== null &&
      lastKnownCapacity !== null &&
      (players !== lastKnownPlayers || capacity !== lastKnownCapacity);

    if (!isLocationChanged && !isPlayersChanged) {
      return;
    }

    const prevPlayers = lastKnownPlayers;
    const prevCapacity = lastKnownCapacity;

    lastLocationFull = locForParse;
    lastOkWorldName = worldName;
    lastOkThumbUrl = thumbUrl;
    lastKnownPlayers = players;
    lastKnownCapacity = capacity;

    if (isLocationChanged) {
      console.log(' ✅instance changed detected');
    } else if (isPlayersChanged) {
      console.log(
        ` ${prevPlayers}/${prevCapacity} → ${players}/${capacity} `,
      );
    }

    await updateStatus(
      client,
      thumbUrl,
      state,
      locForParse,
      worldName,
      {
        type: privacy,
        userCount: players,
        capacity,
        region,
      },
      null,
      { worldId, instanceIdFull },
      isLocationChanged, 
    );
  } catch (error) {
    const statusCode = error.response?.status;
    const message = error.message || 'Unknown error';
    console.error('VRChat API error:', statusCode, message);
    await updateStatus(
      client,
      lastOkThumbUrl || OFFLINE_THUMB_URL,
      'error',
      null,
      lastOkWorldName || 'VRChat API Error',
      {
        type: 'error',
        userCount: lastKnownPlayers,
        capacity: lastKnownCapacity,
        region: '',
      },
      {
        statusCode,
        message,
      },
      null,
      true,
    );
  }
}

// ======== END ========
        