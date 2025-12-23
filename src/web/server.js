import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyCookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { spawn } from 'node:child_process';

import prisma from '../lib/prismaClient.js';
import buildDigestViewModel from '../digest/viewModel.js';
import { renderEmailHtml } from '../digest/renderers/email.js';
import { renderTextDigest } from '../digest/renderers/text.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

const distPath = path.join(__dirname, '..', 'ui', 'dist');
const indexHtmlPath = path.join(distPath, 'index.html');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;
const defaultUserEmail = process.env.DEFAULT_USER_EMAIL || 'demo@example.com';

const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  callbackUrl: process.env.SPOTIFY_CALLBACK_URL || 'http://localhost:3000/api/oauth/spotify/callback',
  scopes: (process.env.SPOTIFY_SCOPES || 'user-read-email').split(/\s+/).filter(Boolean),
};

const githubConfig = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/oauth/github/callback',
  scopes: (process.env.GITHUB_SCOPES || 'read:user user:email').split(/\s+/).filter(Boolean),
};

const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/oauth/google/callback',
  scopes: (process.env.GOOGLE_SCOPES || 'openid email profile https://www.googleapis.com/auth/drive.readonly').split(/\s+/).filter(Boolean),
};

const getSessionKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) return crypto.randomBytes(32);
  // support hex-encoded 32-byte key
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex');
  }
  return Buffer.from(s);
};

const signSession = (userId) => {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const payload = Buffer.from(userId, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};

const verifySession = (token) => {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch (e) {
    return null;
  }
};

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const sha256 = (str) => crypto.createHash('sha256').update(str).digest();


const parseLimit = (value) => {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const parseDateParam = (value) => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date parameter');
  }
  return date;
};

const formatDay = (day) => ({
  date: day.date.toISOString().split('T')[0],
  mood: day.mood,
  note: day.note,
  highlights: day.highlights,
  privacyLevel: day.privacyLevel,
  createdAt: day.createdAt.toISOString(),
  updatedAt: day.updatedAt.toISOString(),
  events: day.dayEvents
    .map((entry) => ({
      id: entry.event.id,
      source: entry.event.source,
      eventType: entry.event.eventType,
      occurredAt: entry.event.occurredAt.toISOString(),
      externalId: entry.event.externalId,
      payload: entry.event.payload,
    }))
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
});

const ensureDefaultUser = async () => {
  return prisma.user.upsert({
    where: { email: defaultUserEmail },
    update: {},
    create: { email: defaultUserEmail, displayName: 'Default User' },
  });
};

const findOrCreateUserFromConnectedAccount = async ({ email, displayName }) => {
  const normalizedEmail = email?.trim() || null;
  const normalizedDisplayName = displayName?.trim() || null;

  if (normalizedEmail) {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return existing;
    }
  }

  const data = {};
  if (normalizedEmail) {
    data.email = normalizedEmail;
  }
  data.displayName = normalizedDisplayName || defaultUserEmail || 'Connected Account';

  return prisma.user.create({ data });
};

const getSessionUser = async (request) => {
  const userId = verifySession(request.cookies?.journal_auth);
  if (!userId) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { connectedAccounts: { include: { oauthTokens: true } } },
  });
  return user;
};

const serializeEmailBookmarkSettings = (settings) => {
  if (!settings) return null;
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    mailbox: settings.mailbox,
    processedMailbox: settings.processedMailbox,
    username: settings.username,
    passwordPresent: !!settings.password,
  };
};

const serializeGoogleTimelineSettings = (settings) => {
  if (!settings) return null;
  return {
    driveFolderId: settings.driveFolderId || null,
    driveFileName: settings.driveFileName || 'Timeline.json',
    enabled: settings.enabled,
    lastSyncedAt: settings.lastSyncedAt,
  };
};

const serializeEmailDelivery = (delivery) => {
  if (!delivery) return null;
  return {
    provider: delivery.provider,
    fromEmail: delivery.fromEmail,
    fromName: delivery.fromName,
    host: delivery.host,
    port: delivery.port,
    secure: delivery.secure,
    username: delivery.username,
    passwordPresent: !!delivery.password,
    digestSubject: delivery.digestSubject,
    replyTo: delivery.replyTo,
    enabled: delivery.enabled,
    lastSentAt: delivery.lastSentAt,
  };
};

const getOrCreateEmailDelivery = async (userId, fallbackEmail, displayName) => {
  const existing = await prisma.userEmailDelivery.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.userEmailDelivery.create({
    data: {
      userId,
      provider: 'smtp',
      fromEmail: fallbackEmail || defaultUserEmail,
      fromName: displayName || null,
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      digestSubject: 'Your Daily Digest',
      replyTo: null,
      enabled: false,
    },
  });
};

const getSmtpTransportForDelivery = (delivery) => {
  const host = delivery.host;
  const port = Number(delivery.port || 587);
  const user = delivery.username;
  const pass = delivery.password;
  const secure = !!delivery.secure || port === 465;

  if (!host || !user || !pass) {
    throw new Error('SMTP delivery settings incomplete (host/username/password required)');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

const sendDigestEmail = async ({ user, vm, delivery }) => {
  if (delivery.provider !== 'smtp') {
    throw new Error(`Unsupported delivery provider: ${delivery.provider}`);
  }
  const transport = getSmtpTransportForDelivery(delivery);
  const html = renderEmailHtml(vm);
  const text = renderTextDigest(vm);
  const from = delivery.fromName ? `${delivery.fromName} <${delivery.fromEmail}>` : delivery.fromEmail;
  const to = delivery.replyTo || delivery.fromEmail;

  return transport.sendMail({
    from,
    to: vm.userEmail || to,
    subject: delivery.digestSubject || 'Your Daily Digest',
    text,
    html,
    replyTo: delivery.replyTo || undefined,
  });
};

const upsertConnectedAccount = async (userId, provider, providerAccountId, displayName, scopes) => {
  return prisma.connectedAccount.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId,
        provider,
        providerAccountId,
      },
    },
    update: {
      displayName,
      scopes,
    },
    create: {
      userId,
      provider,
      providerAccountId,
      displayName,
      scopes,
    },
    include: { oauthTokens: true },
  });
};

const ensureEmailBookmarkAccount = async (user, providerAccountId, displayName = 'Email Bookmarks') => {
  const existing = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: 'email_bookmarks' },
    include: { emailBookmarkSettings: true },
  });
  if (existing) return existing;

  return prisma.connectedAccount.create({
    data: {
      userId: user.id,
      provider: 'email_bookmarks',
      providerAccountId: providerAccountId || user.email || user.id,
      displayName,
    },
    include: { emailBookmarkSettings: true },
  });
};

const storeOAuthToken = async (connectedAccountId, tokenResponse) => {
  const expiresAt =
    tokenResponse.expires_in != null
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
      : null;

  return prisma.oAuthToken.create({
    data: {
      connectedAccountId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      tokenType: tokenResponse.token_type ?? null,
      scope: tokenResponse.scope ?? null,
      expiresAt,
      idToken: tokenResponse.id_token ?? null,
      tokenJson: tokenResponse,
    },
  });
};

const fetchSpotifyProfile = async (accessToken) => {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Spotify profile fetch failed (${res.status})`);
  }
  return res.json();
};

const fetchGithubProfile = async (accessToken) => {
  const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'journal-app' };
  const res = await fetch('https://api.github.com/user', { headers });
  if (!res.ok) {
    throw new Error(`GitHub profile fetch failed (${res.status})`);
  }
  const profile = await res.json();

  if (!profile.email) {
    try {
      const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
      if (emailsRes.ok) {
        const emails = await emailsRes.json();
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.primary) || emails[0];
        if (primary?.email) {
          profile.email = primary.email;
        }
      }
    } catch (e) {
      // ignore email lookup failure
    }
  }

  return profile;
};

const fetchGoogleProfile = async (accessToken) => {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google profile fetch failed (${res.status})`);
  }
  return res.json();
};

app.register(fastifyStatic, {
  root: distPath,
  prefix: '/',
});

// cookies + encrypted session for OAuth handshake (state + PKCE)
app.register(fastifyCookie);
app.register(secureSession, {
  key: getSessionKey(),
  cookieName: 'journal_ss',
  cookie: {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});

if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
  app.log.warn('Spotify OAuth not configured (SPOTIFY_CLIENT_ID/SECRET missing).');
}

app.register(fastifyOauth2, {
  name: 'spotifyOAuth2',
  scope: spotifyConfig.scopes,
  credentials: {
    client: {
      id: spotifyConfig.clientId,
      secret: spotifyConfig.clientSecret,
    },
    auth: {
      tokenHost: 'https://accounts.spotify.com',
      tokenPath: '/api/token',
      authorizePath: '/authorize',
    },
  },
  callbackUri: spotifyConfig.callbackUrl,
});

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

app.get('/api/days', async (request, reply) => {
  let startDate;
  let endDate;
  try {
    startDate = parseDateParam(request.query.startDate);
    endDate = parseDateParam(request.query.endDate);
  } catch (error) {
    request.log.warn(error, 'Invalid date in query');
    return reply.status(400).send({ error: error.message });
  }

  const where = {};
  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      where.date.gte = startDate;
    }
    if (endDate) {
      where.date.lte = endDate;
    }
  }

  const days = await prisma.day.findMany({
    where,
    orderBy: { date: 'desc' },
    take: parseLimit(request.query.limit),
    include: { dayEvents: { include: { event: true } } },
  });

  return days.map(formatDay);
});

app.get('/api/days/:date', async (request, reply) => {
  let dateParam;
  try {
    dateParam = parseDateParam(request.params.date);
  } catch (error) {
    request.log.warn(error, 'Invalid day identifier');
    return reply.status(400).send({ error: error.message });
  }

  const day = await prisma.day.findUnique({
    where: { date: dateParam },
    include: { dayEvents: { include: { event: true } } },
  });

  if (!day) {
    return reply.status(404).send({ error: 'Day not found' });
  }

  return formatDay(day);
});

app.get('/api/oauth/spotify/start', async (request, reply) => {
  if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
    return reply.status(503).send({ error: 'Spotify OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(sha256(codeVerifier));

  // store verifier keyed by state
  try {
    await request.session.set(`pkce:${state}`, codeVerifier);
    app.log.info({ state }, 'Stored PKCE code_verifier in session');
    app.log.info({ setCookie: reply.getHeader('set-cookie') }, 'PKCE set-cookie header after set');
  } catch (e) {
    request.log.warn(e, 'Failed to store PKCE verifier in session');
  }

  const params = new URLSearchParams({
    client_id: spotifyConfig.clientId,
    response_type: 'code',
    redirect_uri: spotifyConfig.callbackUrl,
    scope: spotifyConfig.scopes.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  return reply.redirect(authorizeUrl);
});

app.get('/api/oauth/github/start', async (request, reply) => {
  if (!githubConfig.clientId || !githubConfig.clientSecret) {
    return reply.status(503).send({ error: 'GitHub OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  try {
    await request.session.set(`ghstate:${state}`, true);
  } catch (e) {
    request.log.warn(e, 'Failed to store GitHub OAuth state in session');
  }

  const params = new URLSearchParams({
    client_id: githubConfig.clientId,
    redirect_uri: githubConfig.callbackUrl,
    scope: githubConfig.scopes.join(' '),
    state,
  });

  const authorizeUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return reply.redirect(authorizeUrl);
});

app.get('/api/oauth/spotify/callback', async (request, reply) => {
  if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
    return reply.status(503).send({ error: 'Spotify OAuth not configured' });
  }

  const { code, state, error } = request.query;
  if (error) {
    return reply.status(400).send({ error, state });
  }

  if (!code || !state) {
    return reply.status(400).send({ error: 'Missing code or state' });
  }

  const key = `pkce:${state}`;
  let codeVerifier;
  try {
    codeVerifier = request.session.get(key);
    // clear it
    try { request.session.delete(key); } catch (e) { /* ignore */ }
  } catch (e) {
    request.log.warn(e, 'Failed to retrieve PKCE verifier from session');
  }

  if (!codeVerifier) {
    return reply.status(400).send({ error: 'PKCE code_verifier missing or expired' });
  }

  try {
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', spotifyConfig.callbackUrl);
    params.set('code_verifier', codeVerifier);

    const basic = Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      request.log.error({ status: tokenRes.status, body }, 'Spotify token exchange failed');
      return reply.status(502).send({ error: 'Token exchange failed' });
    }

    const token = await tokenRes.json();
    if (!token?.access_token) {
      return reply.status(400).send({ error: 'Missing access token from Spotify' });
    }

    const profile = await fetchSpotifyProfile(token.access_token);
    const derivedDisplayName = profile.display_name?.trim() || profile.id || defaultUserEmail || 'Connected Account';
    const user = await findOrCreateUserFromConnectedAccount({
      email: profile.email ?? null,
      displayName: derivedDisplayName,
    });
    const connected = await upsertConnectedAccount(
      user.id,
      'spotify',
      profile.id,
      derivedDisplayName,
      token.scope || spotifyConfig.scopes.join(' ')
    );

    await storeOAuthToken(connected.id, token);

    const signed = signSession(user.id);
    reply.setCookie('journal_auth', signed, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    app.log.info({ userId: user.id, cookieSet: reply.getHeader('set-cookie') }, 'Set journal_auth cookie after OAuth');

    // Friendly redirect back to UI (could be nicer)
    return reply.redirect('/');
  } catch (err) {
    request.log.error(err, 'Spotify OAuth callback failed');
    return reply.status(500).send({ error: err?.message ?? String(err) });
  }
});

app.get('/api/oauth/github/callback', async (request, reply) => {
  if (!githubConfig.clientId || !githubConfig.clientSecret) {
    return reply.status(503).send({ error: 'GitHub OAuth not configured' });
  }

  const { code, state, error } = request.query;
  if (error) {
    return reply.status(400).send({ error, state });
  }

  if (!code || !state) {
    return reply.status(400).send({ error: 'Missing code or state' });
  }

  const key = `ghstate:${state}`;
  let stateOk = false;
  try {
    stateOk = !!request.session.get(key);
    try { request.session.delete(key); } catch (e) { /* ignore */ }
  } catch (e) {
    request.log.warn(e, 'Failed to retrieve GitHub OAuth state from session');
  }

  if (!stateOk) {
    return reply.status(400).send({ error: 'Invalid or expired state' });
  }

  try {
    const params = new URLSearchParams();
    params.set('client_id', githubConfig.clientId);
    params.set('client_secret', githubConfig.clientSecret);
    params.set('code', code);
    params.set('redirect_uri', githubConfig.callbackUrl);
    params.set('state', state);

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    let token;
    try {
      const text = await tokenRes.text();
      try {
        token = JSON.parse(text);
      } catch (parseErr) {
        request.log.error({ status: tokenRes.status, body: text }, 'GitHub token exchange returned non-JSON');
        return reply.status(502).send({ error: 'Token exchange failed (invalid response)' });
      }
    } catch (err) {
      request.log.error(err, 'Failed to read GitHub token response');
      return reply.status(502).send({ error: 'Token exchange failed' });
    }

    if (!tokenRes.ok) {
      request.log.error({ status: tokenRes.status, token }, 'GitHub token exchange failed');
      return reply.status(502).send({ error: 'Token exchange failed' });
    }
    if (!token?.access_token) {
      return reply.status(400).send({ error: 'Missing access token from GitHub' });
    }

    const profile = await fetchGithubProfile(token.access_token);
    const derivedDisplayName = profile.name?.trim() || profile.login || defaultUserEmail || 'GitHub User';
    const providerAccountId = String(profile.id || profile.login || derivedDisplayName);
    const user = await findOrCreateUserFromConnectedAccount({
      email: profile.email ?? null,
      displayName: derivedDisplayName,
    });

    const connected = await upsertConnectedAccount(
      user.id,
      'github',
      providerAccountId,
      derivedDisplayName,
      token.scope || githubConfig.scopes.join(' ')
    );

    await storeOAuthToken(connected.id, token);

    const signed = signSession(user.id);
    reply.setCookie('journal_auth', signed, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    app.log.info({ userId: user.id, cookieSet: reply.getHeader('set-cookie') }, 'Set journal_auth cookie after GitHub OAuth');

    return reply.redirect('/');
  } catch (err) {
    request.log.error(err, 'GitHub OAuth callback failed');
    return reply.status(500).send({ error: err?.message ?? String(err) });
  }
});

app.get('/api/oauth/google/start', async (request, reply) => {
  if (!googleConfig.clientId || !googleConfig.clientSecret) {
    return reply.status(503).send({ error: 'Google OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(sha256(codeVerifier));

  try {
    await request.session.set(`google_pkce:${state}`, codeVerifier);
  } catch (e) {
    request.log.warn(e, 'Failed to store Google PKCE verifier in session');
  }

  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    response_type: 'code',
    redirect_uri: googleConfig.callbackUrl,
    scope: googleConfig.scopes.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return reply.redirect(authorizeUrl);
});

app.get('/api/oauth/google/callback', async (request, reply) => {
  if (!googleConfig.clientId || !googleConfig.clientSecret) {
    return reply.status(503).send({ error: 'Google OAuth not configured' });
  }

  const { code, state, error } = request.query;
  if (error) {
    return reply.status(400).send({ error, state });
  }

  if (!code || !state) {
    return reply.status(400).send({ error: 'Missing code or state' });
  }

  const key = `google_pkce:${state}`;
  let codeVerifier;
  try {
    codeVerifier = request.session.get(key);
    try { request.session.delete(key); } catch (e) { /* ignore */ }
  } catch (e) {
    request.log.warn(e, 'Failed to retrieve Google PKCE verifier from session');
  }

  if (!codeVerifier) {
    return reply.status(400).send({ error: 'PKCE code_verifier missing or expired' });
  }

  try {
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', googleConfig.callbackUrl);
    params.set('client_id', googleConfig.clientId);
    params.set('client_secret', googleConfig.clientSecret);
    params.set('code_verifier', codeVerifier);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      request.log.error({ status: tokenRes.status, body }, 'Google token exchange failed');
      return reply.status(502).send({ error: 'Token exchange failed' });
    }

    const token = await tokenRes.json();
    if (!token?.access_token) {
      return reply.status(400).send({ error: 'Missing access token from Google' });
    }

    const profile = await fetchGoogleProfile(token.access_token);
    const derivedDisplayName = profile.name?.trim() || profile.email || defaultUserEmail || 'Google User';
    const providerAccountId = String(profile.id || profile.email || derivedDisplayName);
    const user = await findOrCreateUserFromConnectedAccount({
      email: profile.email ?? null,
      displayName: derivedDisplayName,
    });

    // Check if we already have a connected account with a refresh token
    const existingAccount = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, provider: 'google' },
      include: { oauthTokens: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const connected = await upsertConnectedAccount(
      user.id,
      'google',
      providerAccountId,
      derivedDisplayName,
      token.scope || googleConfig.scopes.join(' ')
    );

    // Don't overwrite existing refresh token with null
    const tokenToStore = { ...token };
    if (!tokenToStore.refresh_token && existingAccount?.oauthTokens?.[0]?.refreshToken) {
      tokenToStore.refresh_token = existingAccount.oauthTokens[0].refreshToken;
    }

    await storeOAuthToken(connected.id, tokenToStore);

    const signed = signSession(user.id);
    reply.setCookie('journal_auth', signed, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    app.log.info({ userId: user.id, cookieSet: reply.getHeader('set-cookie') }, 'Set journal_auth cookie after Google OAuth');

    return reply.redirect('/');
  } catch (err) {
    request.log.error(err, 'Google OAuth callback failed');
    return reply.status(500).send({ error: err?.message ?? String(err) });
  }
});

app.get('/api/digest', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  let since;
  let until;
  try {
    since = parseDateParam(request.query.since);
    until = parseDateParam(request.query.until);
  } catch (error) {
    request.log.warn(error, 'Invalid digest date range');
    return reply.status(400).send({ error: error.message });
  }

  const hours = Number(request.query.hours ?? 24);

  try {
    const vm = await buildDigestViewModel({ since, until, rangeHours: hours, userId: user.id });
    return vm;
  } catch (err) {
    request.log.error(err, 'Failed to build digest view model');
    return reply.status(500).send({ error: 'Failed to build digest' });
  }
});

app.post('/api/digest/send', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  let since;
  let until;
  try {
    since = parseDateParam(request.body?.since ?? request.query?.since);
    until = parseDateParam(request.body?.until ?? request.query?.until);
  } catch (err) {
    request.log.warn(err, 'Invalid digest date range for send');
    return reply.status(400).send({ error: err.message });
  }

  const hours = Number(request.body?.hours ?? request.query?.hours ?? 24);
  try {
    const delivery = await prisma.userEmailDelivery.findUnique({ where: { userId: user.id } });
    if (!delivery) {
      return reply.status(400).send({ error: 'Email delivery not configured' });
    }

    if (!delivery.enabled) {
      return reply.status(400).send({ error: 'Email delivery is disabled' });
    }

    // If since/until provided, build digest for that exact window; otherwise fall back to hours
    const vm = await buildDigestViewModel({ userId: user.id, since: since ?? null, until: until ?? null, rangeHours: since || until ? undefined : hours });
    // attach recipient info for renderer (use user's email if available)
    vm.userEmail = user.email || delivery.fromEmail;

    const info = await sendDigestEmail({ user, vm, delivery });

    const now = new Date();
    await prisma.userEmailDelivery.update({
      where: { userId: user.id },
      data: { lastSentAt: now },
    });

    return { ok: true, messageId: info.messageId, settings: serializeEmailDelivery({ ...delivery, lastSentAt: now }) };
  } catch (err) {
    request.log.error(err, 'Failed to send digest email');
    return reply.status(500).send({ error: err?.message || 'Failed to send digest email' });
  }
});

app.get('/api/events', async (request, reply) => {
  const filters = {};
  const { source, eventType } = request.query;

  if (source) {
    filters.source = source;
  }
  if (eventType) {
    filters.eventType = eventType;
  }

  try {
    const after = parseDateParam(request.query.after);
    const before = parseDateParam(request.query.before);
    if (after || before) {
      filters.occurredAt = {};
      if (after) {
        filters.occurredAt.gt = after;
      }
      if (before) {
        filters.occurredAt.lt = before;
      }
    }
  } catch (error) {
    request.log.warn(error, 'Invalid event date filter');
    return reply.status(400).send({ error: error.message });
  }

  const events = await prisma.event.findMany({
    where: filters,
    orderBy: { occurredAt: 'desc' },
    take: parseLimit(request.query.limit),
  });

  return events.map((event) => ({
    id: event.id,
    source: event.source,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    externalId: event.externalId,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }));
});

app.get('/api/events/date-range', async (request, reply) => {
  const userId = verifySession(request.cookies?.journal_auth);
  if (!userId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const result = await prisma.event.aggregate({
      _min: {
        occurredAt: true,
      },
      _max: {
        occurredAt: true,
      },
    });

    if (!result._min.occurredAt || !result._max.occurredAt) {
      return { minDate: null, maxDate: null };
    }

    return {
      minDate: result._min.occurredAt.toISOString(),
      maxDate: result._max.occurredAt.toISOString(),
    };
  } catch (error) {
    request.log.error(error, 'Failed to fetch date range');
    return reply.status(500).send({ error: 'Failed to fetch date range' });
  }
});

app.get('/api/me', async (request, reply) => {
  app.log.info({ cookies: request.headers.cookie, signed: request.cookies?.journal_auth }, '👀 /api/me cookies');
  const user = await getSessionUser(request);
  if (!user) {
    app.log.info('API /api/me returning 401');
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    connectedAccounts: user.connectedAccounts.map((acc) => ({
      id: acc.id,
      provider: acc.provider,
      providerAccountId: acc.providerAccountId,
      displayName: acc.displayName,
      scopes: acc.scopes,
      status: acc.status,
      oauthTokens: acc.oauthTokens.map((t) => ({
        id: t.id,
        accessToken: !!t.accessToken,
        refreshToken: !!t.refreshToken,
        expiresAt: t.expiresAt,
        tokenType: t.tokenType,
        scope: t.scope,
        createdAt: t.createdAt,
      })),
    })),
  };
});

app.get('/api/email-delivery', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const delivery = await getOrCreateEmailDelivery(user.id, user.email || defaultUserEmail, user.displayName);
  return { settings: serializeEmailDelivery(delivery) };
});

app.post('/api/email-delivery', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });
  const body = request.body ?? {};
  const fields = {
    provider: body.provider || 'smtp',
    fromEmail: (body.fromEmail || user.email || defaultUserEmail).trim(),
    fromName: body.fromName || user.displayName || null,
    digestSubject: body.digestSubject || 'Your Daily Digest',
    host: body.host || '',
    port: Number(body.port || 587),
    secure: !!body.secure,
    username: body.username || '',
    password: body.password || undefined,
    replyTo: body.replyTo || null,
    enabled: body.enabled == null ? true : !!body.enabled,
  };

  try {
    const existing = await prisma.userEmailDelivery.findUnique({ where: { userId: user.id } });
    const data = existing
      ? {
          provider: fields.provider,
          fromEmail: fields.fromEmail,
          fromName: fields.fromName,
          digestSubject: fields.digestSubject,
          host: fields.host,
          port: fields.port,
          secure: fields.secure,
          username: fields.username,
          replyTo: fields.replyTo,
          enabled: fields.enabled,
          updatedAt: new Date(),
        }
      : {
          userId: user.id,
          provider: fields.provider,
          fromEmail: fields.fromEmail,
          fromName: fields.fromName,
          digestSubject: fields.digestSubject,
          host: fields.host,
          port: fields.port,
          secure: fields.secure,
          username: fields.username,
          password: fields.password || '',
          replyTo: fields.replyTo,
          enabled: fields.enabled,
        };

    if (existing && fields.password) {
      data.password = fields.password;
    }

    const updated = existing
      ? await prisma.userEmailDelivery.update({ where: { userId: user.id }, data })
      : await prisma.userEmailDelivery.create({ data });

    return { settings: serializeEmailDelivery(updated) };
  } catch (err) {
    request.log.error(err, 'Failed to update email delivery settings');
    return reply.status(500).send({ error: 'Failed to save settings' });
  }
});

app.get('/api/email-bookmark/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: 'email_bookmarks' },
    include: { emailBookmarkSettings: true },
  });

  return { settings: serializeEmailBookmarkSettings(account?.emailBookmarkSettings) };
});

app.post('/api/email-bookmark/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const {
    host,
    port,
    secure = true,
    mailbox = 'INBOX',
    processedMailbox = 'INBOX/Processed',
    username,
    password,
  } = request.body ?? {};

  if (!host || !username) {
    return reply.status(400).send({ error: 'host and username are required' });
  }

  const portNumber = Number(port ?? 993);
  if (Number.isNaN(portNumber) || portNumber <= 0) {
    return reply.status(400).send({ error: 'port must be a positive number' });
  }

  const account = await ensureEmailBookmarkAccount(user, username, 'Email Bookmarks');

  const existing = await prisma.emailBookmarkSettings.findUnique({ where: { connectedAccountId: account.id } });

  const data = {
    host,
    port: portNumber,
    secure: !!secure,
    mailbox,
    processedMailbox,
    username,
  };

  if (password) {
    data.password = password;
  } else if (existing?.password) {
    // keep existing password if none provided
    data.password = existing.password;
  } else {
    return reply.status(400).send({ error: 'password is required' });
  }

  const settings = await prisma.emailBookmarkSettings.upsert({
    where: { connectedAccountId: account.id },
    update: data,
    create: { ...data, connectedAccountId: account.id },
  });

  return { settings: serializeEmailBookmarkSettings(settings) };
});

// Return the Google access token for use with Google Picker
app.get('/api/google/access-token', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: 'google' },
    include: { oauthTokens: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!account || !account.oauthTokens?.[0]?.accessToken) {
    return reply.status(400).send({ error: 'Google is not connected or no token available' });
  }

  return { accessToken: account.oauthTokens[0].accessToken };
});

// Return the Google client ID for use with Google Picker
app.get('/api/google/client-id', async (request, reply) => {
  if (!googleConfig.clientId) {
    return reply.status(503).send({ error: 'Google OAuth not configured' });
  }
  return { clientId: googleConfig.clientId };
});

app.get('/api/google-timeline/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: 'google' },
    include: { googleTimelineSettings: true },
  });

  if (!account) {
    return reply.status(400).send({ error: 'Google is not connected' });
  }

  const settings = serializeGoogleTimelineSettings(account.googleTimelineSettings) || { driveFolderId: null, driveFileName: 'Timeline.json' };
  return { settings };
});

app.post('/api/google-timeline/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { driveFolderId, driveFileName } = request.body || {};
  if (!driveFolderId) {
    return reply.status(400).send({ error: 'driveFolderId is required (use Google Picker to select a folder)' });
  }

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id, provider: 'google' },
    include: { googleTimelineSettings: true },
  });

  if (!account) {
    return reply.status(400).send({ error: 'Google is not connected' });
  }

  const settings = await prisma.googleTimelineSettings.upsert({
    where: { connectedAccountId: account.id },
    update: { driveFolderId, driveFileName: driveFileName || 'Timeline.json' },
    create: { connectedAccountId: account.id, driveFolderId, driveFileName: driveFileName || 'Timeline.json' },
  });

  return { settings: serializeGoogleTimelineSettings(settings) };
});

// ─────────────────────────────────────────────────────────────────────────────
// Trello Settings API
// ─────────────────────────────────────────────────────────────────────────────

const trelloConfig = {
  apiKey: process.env.TRELLO_API_KEY,
  token: process.env.TRELLO_TOKEN,
};

const serializeTrelloSettings = (settings) => {
  if (!settings) return null;
  return {
    memberId: settings.memberId,
    trackedBoardIds: settings.trackedBoardIds || [],
    trackedListNames: settings.trackedListNames || [],
    enabled: settings.enabled,
  };
};

/**
 * GET /api/trello/settings
 * Fetch Trello settings for the current user
 */
app.get('/api/trello/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const settings = await prisma.trelloSettings.findUnique({ where: { userId: user.id } });
  return {
    settings: serializeTrelloSettings(settings) || { memberId: null, trackedBoardIds: [], trackedListNames: ['Done', 'Doing', 'Applied'], enabled: true },
    configured: !!(trelloConfig.apiKey && trelloConfig.token),
  };
});

/**
 * POST /api/trello/settings
 * Update Trello settings for the current user
 */
app.post('/api/trello/settings', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { memberId, trackedBoardIds, trackedListNames, enabled } = request.body ?? {};

  const settings = await prisma.trelloSettings.upsert({
    where: { userId: user.id },
    update: {
      memberId: memberId || null,
      trackedBoardIds: trackedBoardIds || [],
      trackedListNames: trackedListNames || [],
      enabled: enabled == null ? true : !!enabled,
    },
    create: {
      userId: user.id,
      memberId: memberId || null,
      trackedBoardIds: trackedBoardIds || [],
      trackedListNames: trackedListNames || [],
      enabled: enabled == null ? true : !!enabled,
    },
  });

  return { settings: serializeTrelloSettings(settings) };
});

/**
 * GET /api/trello/boards
 * Fetch boards from Trello API for board selection
 */
app.get('/api/trello/boards', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  if (!trelloConfig.apiKey || !trelloConfig.token) {
    return reply.status(503).send({ error: 'Trello API not configured. Add TRELLO_API_KEY and TRELLO_TOKEN to .env' });
  }

  const settings = await prisma.trelloSettings.findUnique({ where: { userId: user.id } });
  const memberId = settings?.memberId || 'me';

  try {
    const res = await fetch(`https://api.trello.com/1/members/${memberId}/boards?fields=name,url,closed&key=${trelloConfig.apiKey}&token=${trelloConfig.token}`);
    if (!res.ok) {
      const text = await res.text();
      return reply.status(res.status).send({ error: `Trello API error: ${text}` });
    }
    const boards = await res.json();
    // Filter out closed boards
    const openBoards = boards.filter((b) => !b.closed);
    return { boards: openBoards };
  } catch (err) {
    request.log.error(err, 'Failed to fetch Trello boards');
    return reply.status(500).send({ error: 'Failed to fetch boards from Trello' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Journal Entry API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize date to midnight UTC for consistent storage
 */
const normalizeToMidnight = (dateStr) => {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * GET /api/journal?date=YYYY-MM-DD
 * Fetch journal entry for a specific date
 */
app.get('/api/journal', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date } = request.query;
  if (!date) return reply.status(400).send({ error: 'date query param required' });

  const normalizedDate = normalizeToMidnight(date);

  const entry = await prisma.journalEntry.findUnique({
    where: { userId_date: { userId: user.id, date: normalizedDate } },
  });

  return { entry: entry ? { id: entry.id, date: entry.date.toISOString(), content: entry.content, goals: entry.goals || null, updatedAt: entry.updatedAt.toISOString() } : null };
});

/**
 * PUT /api/journal
 * Create or update journal entry for a specific date
 * Body: { date: "YYYY-MM-DD", content: "markdown string" }
 */
app.put('/api/journal', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date, content, goals } = request.body ?? {};
  if (!date) return reply.status(400).send({ error: 'date required' });
  if (typeof content !== 'string') return reply.status(400).send({ error: 'content must be a string' });
  if (goals != null && typeof goals !== 'string') return reply.status(400).send({ error: 'goals must be a string' });

  const normalizedDate = normalizeToMidnight(date);

  const entry = await prisma.journalEntry.upsert({
    where: { userId_date: { userId: user.id, date: normalizedDate } },
    update: { content, goals: goals ?? null },
    create: { userId: user.id, date: normalizedDate, content, goals: goals ?? null },
  });

  return { entry: { id: entry.id, date: entry.date.toISOString(), content: entry.content, goals: entry.goals || null, updatedAt: entry.updatedAt.toISOString() } };
});

/**
 * DELETE /api/journal?date=YYYY-MM-DD
 * Delete journal entry for a specific date
 */
app.delete('/api/journal', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date } = request.query;
  if (!date) return reply.status(400).send({ error: 'date query param required' });

  const normalizedDate = normalizeToMidnight(date);

  try {
    await prisma.journalEntry.delete({
      where: { userId_date: { userId: user.id, date: normalizedDate } },
    });
    return { ok: true };
  } catch (err) {
    if (err.code === 'P2025') {
      return reply.status(404).send({ error: 'Entry not found' });
    }
    throw err;
  }
});

// Goals API

/**
 * GET /api/goals?date=YYYY-MM-DD
 * Fetch goals for a specific date
 */
app.get('/api/goals', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date } = request.query;
  if (!date) return reply.status(400).send({ error: 'date query param required' });

  const normalizedDate = normalizeToMidnight(date);

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, date: normalizedDate },
    orderBy: { sortOrder: 'asc' },
  });

  return { goals: goals.map((g) => ({ id: g.id, text: g.text, completed: g.completed, sortOrder: g.sortOrder })) };
});

/**
 * POST /api/goals
 * Create a new goal for a specific date
 * Body: { date: "YYYY-MM-DD", text: "goal text" }
 */
app.post('/api/goals', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date, text } = request.body ?? {};
  if (!date) return reply.status(400).send({ error: 'date required' });
  if (!text || typeof text !== 'string') return reply.status(400).send({ error: 'text required' });

  const normalizedDate = normalizeToMidnight(date);

  // Get max sortOrder for this date
  const maxOrder = await prisma.goal.aggregate({
    where: { userId: user.id, date: normalizedDate },
    _max: { sortOrder: true },
  });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const goal = await prisma.goal.create({
    data: { userId: user.id, date: normalizedDate, text: text.trim(), sortOrder: nextOrder },
  });

  return { goal: { id: goal.id, text: goal.text, completed: goal.completed, sortOrder: goal.sortOrder } };
});

/**
 * PATCH /api/goals/:id
 * Update a goal (toggle completed, change text)
 * Body: { completed?: boolean, text?: string }
 */
app.patch('/api/goals/:id', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { id } = request.params;
  const { completed, text } = request.body ?? {};

  // Verify ownership
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return reply.status(404).send({ error: 'Goal not found' });
  }

  const updateData = {};
  if (typeof completed === 'boolean') updateData.completed = completed;
  if (typeof text === 'string') updateData.text = text.trim();

  const goal = await prisma.goal.update({
    where: { id },
    data: updateData,
  });

  return { goal: { id: goal.id, text: goal.text, completed: goal.completed, sortOrder: goal.sortOrder } };
});

/**
 * DELETE /api/goals/:id
 * Delete a goal
 */
app.delete('/api/goals/:id', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { id } = request.params;

  // Verify ownership
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return reply.status(404).send({ error: 'Goal not found' });
  }

  await prisma.goal.delete({ where: { id } });
  return { ok: true };
});

// Journal Logs API

/**
 * GET /api/logs?date=YYYY-MM-DD
 * Fetch journal logs for a specific date (oldest first)
 */
app.get('/api/logs', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date } = request.query;
  if (!date) return reply.status(400).send({ error: 'date query param required' });

  const normalizedDate = normalizeToMidnight(date);

  const logs = await prisma.journalLog.findMany({
    where: { userId: user.id, date: normalizedDate },
    orderBy: { createdAt: 'asc' },
  });

  return { logs: logs.map((l) => ({ id: l.id, content: l.content, createdAt: l.createdAt.toISOString() })) };
});

/**
 * POST /api/logs
 * Create a new journal log entry for a specific date
 * Body: { date: "YYYY-MM-DD", content: "markdown string" }
 */
app.post('/api/logs', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { date, content } = request.body ?? {};
  if (!date) return reply.status(400).send({ error: 'date required' });
  if (!content || typeof content !== 'string') return reply.status(400).send({ error: 'content required' });

  const normalizedDate = normalizeToMidnight(date);

  const log = await prisma.journalLog.create({
    data: { userId: user.id, date: normalizedDate, content: content.trim() },
  });

  return { log: { id: log.id, content: log.content, createdAt: log.createdAt.toISOString() } };
});

/**
 * PATCH /api/logs/:id
 * Update a journal log entry
 * Body: { content: "markdown string" }
 */
app.patch('/api/logs/:id', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { id } = request.params;
  const { content } = request.body ?? {};

  // Verify ownership
  const existing = await prisma.journalLog.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return reply.status(404).send({ error: 'Log not found' });
  }

  if (typeof content !== 'string') {
    return reply.status(400).send({ error: 'content required' });
  }

  const log = await prisma.journalLog.update({
    where: { id },
    data: { content: content.trim() },
  });

  return { log: { id: log.id, content: log.content, createdAt: log.createdAt.toISOString() } };
});

/**
 * DELETE /api/logs/:id
 * Delete a journal log entry
 */
app.delete('/api/logs/:id', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { id } = request.params;

  // Verify ownership
  const existing = await prisma.journalLog.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return reply.status(404).send({ error: 'Log not found' });
  }

  await prisma.journalLog.delete({ where: { id } });
  return { ok: true };
});

/**
 * DELETE /api/events/:id
 * Delete an event (e.g., bookmark)
 */
app.delete('/api/events/:id', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { id } = request.params;

  // Verify ownership
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return reply.status(404).send({ error: 'Event not found' });
  }

  // Delete related enrichments and day events first (cascade should handle this, but being explicit)
  await prisma.eventEnrichment.deleteMany({ where: { eventId: id } });
  await prisma.dayEvent.deleteMany({ where: { eventId: id } });
  await prisma.event.delete({ where: { id } });
  
  return { ok: true };
});

// Collector API

/**
 * Get latest collector runs and status
 */
app.get('/api/collector/status', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const latestRuns = await prisma.collectorRun.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: 'desc' },
    take: 5
  });

  // Check if any running processes are actually still alive
  for (const run of latestRuns) {
    if (run.status === 'running' && run.pid) {
      try {
        // Send signal 0 to check if process exists
        process.kill(run.pid, 0);
      } catch (err) {
        // Process is dead, mark as failed
        await prisma.collectorRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: 'Process died unexpectedly'
          }
        });
        run.status = 'failed';
        run.finishedAt = new Date();
        run.error = 'Process died unexpectedly';
      }
    }
  }

  const currentRunning = latestRuns.find(run => run.status === 'running');
  
  return {
    currentRunning,
    recentRuns: latestRuns,
    canStart: !currentRunning
  };
});

/**
 * Start collector run
 */
app.post('/api/collector/start', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  // Check if already running
  const existingRun = await prisma.collectorRun.findFirst({
    where: {
      userId: user.id,
      status: 'running'
    }
  });

  if (existingRun) {
    return reply.status(409).send({ error: 'Collector is already running' });
  }

  // Create new run record
  const run = await prisma.collectorRun.create({
    data: {
      userId: user.id,
      status: 'running',
      triggerType: 'manual'
    }
  });

  try {
    // Spawn collector process
    const collectorPath = path.join(__dirname, '..', 'collector', 'run.js');
    const child = spawn('node', [collectorPath], {
      stdio: 'pipe',
      detached: true,
      env: { ...process.env, USER_ID: user.id }
    });

    // Update run with PID
    await prisma.collectorRun.update({
      where: { id: run.id },
      data: { pid: child.pid }
    });

    // Set up handlers for process completion
    child.on('exit', async (code) => {
      try {
        const finalStatus = code === 0 ? 'completed' : 'failed';
        const errorMsg = code !== 0 ? `Process exited with code ${code}` : null;
        
        // Count events created during this run (rough estimate)
        const eventCount = await prisma.event.count({
          where: {
            userId: user.id,
            createdAt: {
              gte: run.startedAt
            }
          }
        });

        await prisma.collectorRun.update({
          where: { id: run.id },
          data: {
            status: finalStatus,
            finishedAt: new Date(),
            eventCount,
            error: errorMsg,
            pid: null
          }
        });
      } catch (err) {
        console.error('Failed to update collector run on exit:', err);
      }
    });

    // Detach so parent process doesn't wait
    child.unref();

    return {
      runId: run.id,
      pid: child.pid,
      status: 'started'
    };
  } catch (err) {
    // Mark run as failed
    await prisma.collectorRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: err.message
      }
    });

    request.log.error(err, 'Failed to start collector');
    return reply.status(500).send({ error: 'Failed to start collector' });
  }
});

/**
 * Cancel running collector
 */
app.post('/api/collector/cancel', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const runningCollector = await prisma.collectorRun.findFirst({
    where: {
      userId: user.id,
      status: 'running'
    }
  });

  if (!runningCollector) {
    return reply.status(404).send({ error: 'No running collector found' });
  }

  if (runningCollector.pid) {
    try {
      // Try to kill the process gracefully
      process.kill(runningCollector.pid, 'SIGTERM');
      
      // Wait a bit then force kill if needed
      setTimeout(() => {
        try {
          process.kill(runningCollector.pid, 'SIGKILL');
        } catch (err) {
          // Process may have already died
        }
      }, 5000);
    } catch (err) {
      // Process may have already died
    }
  }

  // Mark as cancelled
  await prisma.collectorRun.update({
    where: { id: runningCollector.id },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
      pid: null
    }
  });

  return { ok: true };
});

app.get('/health', async () => ({ status: 'ok' }));

app.post('/api/logout', async (request, reply) => {
  try {
    // clear the client-side signed auth cookie
    reply.clearCookie('journal_auth', { path: '/' });
    // clear secure-session cookie if present
    reply.clearCookie('journal_ss', { path: '/' });
  } catch (err) {
    request.log.warn(err, 'Failed to clear cookies during logout');
  }

  return { ok: true };
});

app.post('/api/disconnect', async (request, reply) => {
  const user = await getSessionUser(request);
  if (!user) return reply.status(401).send({ error: 'Not authenticated' });

  const { provider } = request.body ?? {};
  if (!provider) return reply.status(400).send({ error: 'provider required' });

  try {
    const existing = await prisma.connectedAccount.findFirst({ where: { userId: user.id, provider } });
    if (!existing) return reply.status(404).send({ error: 'Connected account not found' });

    // Remove related records to avoid foreign-key constraint errors
    await prisma.oAuthToken.deleteMany({ where: { connectedAccountId: existing.id } });
    await prisma.cursor.deleteMany({ where: { connectedAccountId: existing.id } });
    await prisma.googleTimelineSettings.deleteMany({ where: { connectedAccountId: existing.id } });
    await prisma.emailBookmarkSettings.deleteMany({ where: { connectedAccountId: existing.id } });

    await prisma.connectedAccount.delete({ where: { id: existing.id } });

    return { ok: true };
  } catch (err) {
    request.log.error(err, 'Failed to disconnect provider');
    return reply.status(500).send({ error: 'Disconnect failed' });
  }
});

app.get('/oauth/callback', async (request, reply) => {
  const { code, state, error } = request.query;

  if (error) {
    return reply.status(400).send({ error, state });
  }

  return reply.send({
    received: {
      code,
      state,
    },
    message: 'Replace this handler with provider-specific logic.',
  });
});

app.setNotFoundHandler(async (request, reply) => {
  // Serve the SPA entrypoint for unknown GET requests (client-side routing),
  // but keep default behavior for non-GET methods.
  if (request.raw.method !== 'GET') {
    return reply.callNotFound();
  }

  if (!fs.existsSync(indexHtmlPath)) {
    request.log.error({ distPath }, 'UI build not found. Run "npm run ui:build" first.');
    return reply.status(500).send({ error: 'UI build missing. Run npm run ui:build.' });
  }

  return reply.sendFile('index.html');
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const start = async () => {
  try {
    await app.listen({ host, port });
    app.log.info({ host, port }, 'Server listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
