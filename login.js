const axios = require('axios');
const readline = require('readline');
const fs = require('fs');

const client = axios.create({
  baseURL: 'https://vrchat.com/api/1/',
  withCredentials: true,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  },
});
const AUTH_FILE = './vrchat_auth_cookie.json';
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve =>
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

let tempAuthCookie = null;

async function checkAuth() {
  try {
    const res = await client.get('/auth/user');
    console.log('認証済み:', res.data.displayName);
    return res.data;
  } catch (e) {
    if (e.response?.status === 401) {
      console.log('未認証: Missing Credentials');
      return null;
    }
    throw e;
  }
}

async function loginBasic(username, password) {
  const authString = Buffer.from(
    encodeURIComponent(username) + ':' + encodeURIComponent(password),
  ).toString('base64'); 
  const res = await client.get('/auth/user', {
    headers: { Authorization: `Basic ${authString}` },
  });
  console.log('loginBasic status:', res.status, res.data);
  const setCookie = res.headers['set-cookie'] || [];
  for (const c of setCookie) {
    if (c.startsWith('auth=')) {
      tempAuthCookie = c.split(';')[0]; 
      console.log('tempAuthCookie(from /auth/user) =', tempAuthCookie);
    }
  }
  return res.data.requiresTwoFactorAuth || null;
}
async function verifyEmailOtp(code) {
  if (!tempAuthCookie) {
    throw new Error(`tempAuthCookieがなぜか取得できなかったから2FA verifyできない`);
  }

  console.log('OTP send:', code);
  const res = await client.post(
    '/auth/twofactorauth/emailotp/verify',
    { code },
    {
      headers: {
        Cookie: tempAuthCookie, 
      },
    },
  ); 
  console.log('verify status:', res.status, res.data);
  const setCookie = res.headers['set-cookie'] || [];
  for (const c of setCookie) {
    if (c.startsWith('auth=')) {
      tempAuthCookie = c.split(';')[0];
      console.log('final auth cookie =', tempAuthCookie);
    }
  }
  if (res.data.verified) {
    console.log('✅2FA');
    fs.writeFileSync(
      AUTH_FILE,
      JSON.stringify({ authCookie: tempAuthCookie }, null, 2),
      'utf-8',
    );
    console.log('auth cookie saved ->', AUTH_FILE);
    return true;
  }
  throw new Error('✖ OTP');
}
async function getUserInfoWithCookie() {
  if (!tempAuthCookie) {
    throw new Error('認証keyがない');
  }

  const [user, perms, config] = await Promise.all([
    client.get('/auth/user', { headers: { Cookie: tempAuthCookie } }),
    client.get('/auth/permissions', { headers: { Cookie: tempAuthCookie } }),
    client.get('/config', { headers: { Cookie: tempAuthCookie } }),
  ]);

  console.log('ユーザー:', user.data.displayName);
  console.log('権限数:', perms.data.length);
  console.log('キャンペーン:', config.data.CampaignStatus);
}
async function main() {
  await checkAuth();

  const email = await ask('maill(=ユーザー名): ');
  const password = await ask('password: ');

  const requires = await loginBasic(email, password);

  const needsEmailOtp = Array.isArray(requires)
    ? requires.includes('emailOtp')
    : requires === 'emailOtp';

  if (needsEmailOtp) {
    const otp = await ask('maill OTP: ');
    await verifyEmailOtp(otp);
  } else {
    if (tempAuthCookie) {
      fs.writeFileSync(
        AUTH_FILE,
        JSON.stringify({ authCookie: tempAuthCookie }, null, 2),
        'utf-8',
      );
      console.log('✅auth cookie saved ->', AUTH_FILE);
      console.log("これでd.jsを起動して");
    }
  }

  await getUserInfoWithCookie();
}

main().catch(err => {
  console.error('Error:', err.response?.status, err.response?.data || err.message);
});
