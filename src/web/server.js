import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyCookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import prisma from '../lib/prismaClient.js';

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

    await prisma.oAuthToken.deleteMany({ where: { connectedAccountId: existing.id } });
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
