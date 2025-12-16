import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { registerCollector } from '../registry.js';
import { enrichLink } from '../enrichers/readabilityOg.js';

const withTimeout = (promise, ms, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
};

const source = 'email_bookmarks';

const configFromEnv = () => {
  const host = process.env.EMAIL_BOOKMARK_IMAP_HOST || 'mail.dethbird.com';
  const port = Number(process.env.EMAIL_BOOKMARK_IMAP_PORT || 993);
  const secure = process.env.EMAIL_BOOKMARK_IMAP_SECURE ? process.env.EMAIL_BOOKMARK_IMAP_SECURE === 'true' : true;
  const user = process.env.EMAIL_BOOKMARK_USERNAME;
  const pass = process.env.EMAIL_BOOKMARK_PASSWORD;
  const mailbox = process.env.EMAIL_BOOKMARK_MAILBOX || 'INBOX';
  const processedMailbox = process.env.EMAIL_BOOKMARK_PROCESSED_MAILBOX || 'INBOX/Processed';

  if (!user || !pass) {
    throw new Error('EMAIL_BOOKMARK_USERNAME and EMAIL_BOOKMARK_PASSWORD are required for email bookmarks collector');
  }

  return { host, port, secure, user, pass, mailbox, processedMailbox };
};

const extractLinks = (text) => {
  if (!text) return [];
  const links = [];
  const regex = /https?:\/\/[^\s<>"']+/gi;
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

const collect = async (cursor) => {
  const cfg = configFromEnv();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    socketTimeout: Number(process.env.EMAIL_BOOKMARK_IMAP_SOCKET_TIMEOUT_MS || 15000),
  });

  client.on('error', (err) => {
    console.warn('imap client error', err?.message ?? err);
  });

  await client.connect();

  try {
    await ensureMailboxOpen(client, cfg.mailbox);

    const processedMailboxName = cfg.processedMailbox.replace(/\//g, '.');
    await ensureMailboxExists(client, processedMailboxName);

    const searchQuery = cursor ? { uid: `${Number(cursor) + 1}:*` } : { seen: false };
    const uids = await client.search(searchQuery, { uid: true });
    const sortedUids = [...uids].sort((a, b) => a - b);

    const items = [];
    let maxUid = cursor ? Number(cursor) : null;

    for (const uid of sortedUids) {
      const fetchResult = client.fetch({ uid }, { source: true, envelope: true, internalDate: true });
      // eslint-disable-next-line no-await-in-loop
      try {
        for await (const msg of fetchResult) {
        const { subject, from, to, messageId, date, links, snippet } = await parseMessage(msg.source);
        const occurredAt = msg.internalDate || date || new Date();
        const payload = {
          mailbox: cfg.mailbox,
          uid,
          messageId,
          from,
          to,
          subject,
          receivedAt: (date || occurredAt).toISOString(),
          links,
          raw: { snippet },
        };

        const externalId = `imap:${cfg.mailbox}:${uid}`;

        let enrichment = null;
        if (Array.isArray(links) && links.length > 0) {
          const firstLink = links[0]?.url || links[0];
          try {
            const preview = await withTimeout(enrichLink(firstLink), Number(process.env.LINK_PREVIEW_TIMEOUT_MS || 15000), 'enrichLink');
            enrichment = { enrichmentType: 'readability_v1', data: preview };
          } catch (err) {
            enrichment = { enrichmentType: 'readability_v1', data: { status: 'error', error: err?.message ?? String(err) } };
          }
        }

        items.push({
          eventType: 'BookmarkEvent',
          occurredAt,
          externalId,
          payload,
          ...(enrichment ? { enrichment } : {}),
        });

        try {
          await withTimeout(
            client.messageMove(uid, processedMailboxName, { uid: true }),
            Number(process.env.EMAIL_BOOKMARK_IMAP_MOVE_TIMEOUT_MS || 5000),
            'messageMove',
          );
        } catch (err) {
          console.warn(`Failed to move message UID ${uid} to ${processedMailboxName}:`, err?.message ?? err);
          // Option 3: best-effort move; do not mark seen or retry here.
        }

        if (!maxUid || uid > maxUid) {
          maxUid = uid;
        }
        }
      } catch (err) {
        console.warn(`Failed to fetch/process UID ${uid}:`, err?.message ?? err);
        // try to continue with next UID
        continue;
      }
    }

    return { items, nextCursor: maxUid != null ? String(maxUid) : cursor };
  } finally {
    try {
      await withTimeout(client.logout(), Number(process.env.EMAIL_BOOKMARK_IMAP_LOGOUT_TIMEOUT_MS || 2000), 'logout');
    } catch (err) {
      console.warn('imap client logout fallback close:', err?.message ?? err);
      await client.close().catch(() => {});
    }
  }
};

registerCollector({ source, collect });

export default collect;
