import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import { enrichLink } from '../enrichers/readabilityOg.js';

const withTimeout = (promise, ms, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
};

const source = 'email_bookmarks';

// Helper to collect a readable stream into a buffer
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const extractLinks = (text) => {
  if (!text) return [];
  const links = [];
  const regex = /https?:\/\/[^\s<>"]+/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const url = match[0].replace(/[),.;]+$/, '');
    if (!links.includes(url)) {
      links.push(url);
    }
  }
  return links.map((url) => ({ url, text: null }));
};

const parseMessage = async (rawSource) => {
  const parsed = await simpleParser(rawSource);
  const textBody = parsed.text ?? '';
  const fallbackHtml = parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '';
  const body = textBody || fallbackHtml;
  const links = extractLinks(body);

  const snippet = body.slice(0, 200);

  return {
    subject: parsed.subject ?? null,
    from: parsed.from?.text ?? null,
    to: parsed.to?.text ?? null,
    messageId: parsed.messageId ?? null,
    date: parsed.date ?? new Date(),
    links,
    snippet,
  };
};

const ensureMailboxOpen = async (client, mailbox) => {
  try {
    await client.mailboxOpen(mailbox);
  } catch (error) {
    if (error?.response?.code === 'NONEXISTENT') {
      await client.mailboxCreate(mailbox, { subscribed: true });
      await client.mailboxOpen(mailbox);
      return;
    }
    throw error;
  }
};

const ensureMailboxExists = async (client, mailbox) => {
  try {
    await client.mailboxCreate(mailbox, { subscribed: true });
  } catch (error) {
    if (error?.response?.code === 'ALREADYEXISTS' || error?.message?.includes('exists')) {
      return;
    }
    throw error;
  }
};

const isConnectionError = (error) => {
  const message = error?.message || '';
  return message.includes('Connection not available') || message.includes('Socket timeout') || error?.code === 'NoConnection';
};

const enrichPending = async (items, pendingEnrichments) => {
  const linkEnrichTimeout = Number(process.env.LINK_PREVIEW_TIMEOUT_MS || 15000);
  for (const entry of pendingEnrichments) {
    const { index, link } = entry;
    if (!link || !items[index]) continue;

    try {
      const preview = await withTimeout(enrichLink(link), linkEnrichTimeout, 'enrichLink');
      items[index].enrichment = { enrichmentType: 'readability_v1', data: preview };
    } catch (err) {
      items[index].enrichment = {
        enrichmentType: 'readability_v1',
        data: { status: 'error', error: err?.message ?? String(err) },
      };
    }
  }
};

const collectForAccount = async (connectedAccount, cursor) => {
  const settings = connectedAccount.emailBookmarkSettings;
  if (!settings) {
    console.warn(`Skipping email_bookmarks collection: no settings for connectedAccount=${connectedAccount.id}`);
    return { items: [], nextCursor: null };
  }

  const cfg = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.username,
    pass: settings.password,
    mailbox: settings.mailbox,
    processedMailbox: settings.processedMailbox,
  };

  const processedMailboxName = cfg.processedMailbox || 'INBOX/Processed';

  // Fix A: Increased socket timeout (5 min default), disable compression for better streaming
  const socketTimeoutMs = Number(process.env.EMAIL_BOOKMARK_IMAP_SOCKET_TIMEOUT_MS || 5 * 60 * 1000);
  const fetchTimeoutMs = Number(process.env.EMAIL_BOOKMARK_FETCH_TIMEOUT_MS || 60000);

  const createClient = async () => {
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      socketTimeout: socketTimeoutMs,
      greetingTimeout: 30000,
      // Disable compression to avoid streaming issues with large messages
      disableCompression: true,
    });

    client.on('error', (err) => {
      console.warn('imap client error', err?.message ?? err);
    });

    await client.connect();
    await ensureMailboxOpen(client, cfg.mailbox);
    await ensureMailboxExists(client, processedMailboxName);
    return client;
  };

  const closeClient = async (client) => {
    if (!client) return;
    try {
      await withTimeout(client.logout(), Number(process.env.EMAIL_BOOKMARK_IMAP_LOGOUT_TIMEOUT_MS || 5000), 'logout');
    } catch (err) {
      console.warn('imap client logout fallback close:', err?.message ?? err);
      try {
        await client.close();
      } catch (e) {
        // ignore
      }
    }
  };

  const items = [];
  const pendingEnrichments = [];
  let maxUid = cursor ? Number(cursor) : null;

  let client = await createClient();

  try {
    const searchQuery = cursor ? { uid: `${Number(cursor) + 1}:*` } : { seen: false };
    const uids = await client.search(searchQuery, { uid: true });
    const sortedUids = [...uids].sort((a, b) => a - b);

    console.info(`[email_bookmarks] Found ${sortedUids.length} message(s) to process`);

    for (const uid of sortedUids) {
      let attempts = 0;
      let processed = false;

      while (!processed && attempts < 2) {
        attempts += 1;
        try {
          // Fix D: Use download() to stream message content instead of fetch({ source: true })
          // This avoids the blocking FETCH that was causing timeouts
          console.info(`[email_bookmarks] Downloading message UID ${uid}...`);
          
          // First get envelope metadata (fast, no body)
          let envelope = null;
          let internalDate = null;
          for await (const msg of client.fetch({ uid }, { envelope: true, internalDate: true })) {
            envelope = msg.envelope;
            internalDate = msg.internalDate;
          }

          // Then download the full message using streaming (handles large messages better)
          const downloadStream = await withTimeout(
            client.download(String(uid), undefined, { uid: true }),
            fetchTimeoutMs,
            `download UID ${uid}`
          );
          
          const rawSource = await withTimeout(
            streamToBuffer(downloadStream.content),
            fetchTimeoutMs,
            `stream UID ${uid}`
          );

          const { subject, from, to, messageId, date, links, snippet } = await parseMessage(rawSource);
          const occurredAt = internalDate || date || new Date();
          const payload = {
            mailbox: cfg.mailbox,
            uid,
            messageId: messageId || envelope?.messageId,
            from: from || envelope?.from?.[0]?.address,
            to: to || envelope?.to?.[0]?.address,
            subject: subject || envelope?.subject,
            receivedAt: (date || occurredAt).toISOString(),
            links,
            raw: { snippet },
          };

          const externalId = `imap:${cfg.mailbox}:${uid}`;
          const firstLink = Array.isArray(links) && links.length > 0 ? links[0]?.url || links[0] : null;

          items.push({
            eventType: 'BookmarkEvent',
            occurredAt,
            externalId,
            payload,
            userId: connectedAccount.userId,
          });

          if (firstLink) {
            pendingEnrichments.push({ index: items.length - 1, link: firstLink });
          }

          // Fix C: Move/mark message immediately after fetching, before any enrichment
          try {
            await client.messageMove(uid, processedMailboxName, { uid: true });
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          } catch (err) {
            console.warn(`Failed to move message UID ${uid} to ${processedMailboxName}:`, err?.message ?? err);
            try {
              await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            } catch (flagErr) {
              console.warn(`Failed to mark UID ${uid} as seen:`, flagErr?.message ?? flagErr);
            }
            if (err?.response?.code === 'NONEXISTENT' || err?.message?.includes('NONEXISTENT')) {
              await ensureMailboxExists(client, processedMailboxName);
              try {
                await client.messageMove(uid, processedMailboxName, { uid: true });
              } catch (nestedErr) {
                console.warn(`Retry move of UID ${uid} still failed:`, nestedErr?.message ?? nestedErr);
              }
            }
          }

          if (!maxUid || uid > maxUid) {
            maxUid = uid;
          }

          processed = true;
          console.info(`[email_bookmarks] Successfully processed UID ${uid}`);
        } catch (err) {
          const message = err?.message ?? String(err);
          console.warn(`Failed to fetch/process UID ${uid} (attempt ${attempts}):`, message);

          if (isConnectionError(err)) {
            await closeClient(client);
            client = await createClient();
            continue; // retry this UID once after reconnect
          }

          // Non-connection error; skip to next UID
          break;
        }
      }
    }
  } finally {
    await closeClient(client);
  }

  await enrichPending(items, pendingEnrichments);
  return { items, nextCursor: maxUid != null ? String(maxUid) : cursor };
};

const collect = async () => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { provider: source, status: 'active' },
    include: { emailBookmarkSettings: true },
  });

  if (accounts.length === 0) {
    console.warn('No email_bookmarks connected accounts found; skipping collection.');
    return { items: [], nextCursor: null };
  }

  const allItems = [];

  for (const account of accounts) {
    // per-account cursor
    let cursorRecord = await prisma.cursor.findFirst({ where: { source, connectedAccountId: account.id } });
    if (!cursorRecord) {
      cursorRecord = await prisma.cursor.create({ data: { source, connectedAccountId: account.id } });
    }

    const { items = [], nextCursor = null } = await collectForAccount(account, cursorRecord.cursor ?? null);
    allItems.push(...items);

    if (nextCursor && nextCursor !== cursorRecord.cursor) {
      await prisma.cursor.update({ where: { id: cursorRecord.id }, data: { cursor: nextCursor } });
    }
  }

  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect, collectForAccount });

export default collect;
