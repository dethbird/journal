import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';

const source = 'trello';
const apiKey = process.env.TRELLO_API_KEY;
const apiToken = process.env.TRELLO_TOKEN;

// Action types we care about for tracking card movements and updates
const TRACKED_ACTION_TYPES = [
  'updateCard',           // Card moved between lists, updated, etc.
  'createCard',           // New card created
  'commentCard',          // Comment added
  'addChecklistToCard',   // Checklist added
  'updateCheckItemStateOnCard', // Checklist item toggled
];

const TRELLO_API_BASE = 'https://api.trello.com/1';

/**
 * Fetch actions for a specific board since a given action ID or timestamp
 */
const fetchBoardActions = async (boardId, since = null) => {
  const params = new URLSearchParams({
    key: apiKey,
    token: apiToken,
    filter: TRACKED_ACTION_TYPES.join(','),
    limit: '100', // Max per request
  });

  if (since) {
    params.set('since', since);
  }

  const url = `${TRELLO_API_BASE}/boards/${boardId}/actions?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello API error for board ${boardId}: ${res.status} ${text}`);
  }

  return res.json();
};

/**
 * Check if an action represents a card being moved into a tracked list
 */
const isTrackedListMove = (action, trackedListNames) => {
  if (action.type !== 'updateCard') return false;

  const listAfter = action.data?.listAfter;
  if (!listAfter?.name) return false;

  // Check if the list name matches any of our tracked list names (case-insensitive)
  return trackedListNames.some(
    (tracked) => listAfter.name.toLowerCase() === tracked.toLowerCase()
  );
};

/**
 * Map a Trello action to our event format
 */
const mapAction = (action, userId, boardName) => {
  const card = action.data?.card ?? {};
  const list = action.data?.list ?? action.data?.listAfter ?? {};
  const board = action.data?.board ?? {};

  const payload = {
    actionType: action.type,
    card: {
      id: card.id,
      name: card.name,
      shortLink: card.shortLink,
      url: card.shortLink ? `https://trello.com/c/${card.shortLink}` : null,
    },
    list: {
      id: list.id,
      name: list.name,
    },
    board: {
      id: board.id ?? action.data?.board?.id,
      name: boardName || board.name,
    },
    member: action.memberCreator
      ? {
          id: action.memberCreator.id,
          username: action.memberCreator.username,
          fullName: action.memberCreator.fullName,
        }
      : null,
    // For updateCard, include what changed
    listBefore: action.data?.listBefore
      ? { id: action.data.listBefore.id, name: action.data.listBefore.name }
      : null,
    listAfter: action.data?.listAfter
      ? { id: action.data.listAfter.id, name: action.data.listAfter.name }
      : null,
    // For comments
    text: action.data?.text ?? null,
    // For checklist items
    checkItem: action.data?.checkItem
      ? { name: action.data.checkItem.name, state: action.data.checkItem.state }
      : null,
  };

  return {
    eventType: action.type,
    occurredAt: action.date,
    externalId: action.id,
    payload,
    userId,
  };
};

/**
 * Collect Trello actions for all users with Trello settings configured
 */
const collect = async () => {
  if (!apiKey || !apiToken) {
    console.warn('[trello] Collector disabled: TRELLO_API_KEY or TRELLO_TOKEN not set');
    return { items: [], nextCursor: null };
  }

  // Find all users with Trello settings enabled
  const settings = await prisma.trelloSettings.findMany({
    where: { enabled: true },
  });

  if (settings.length === 0) {
    console.log('[trello] No users have Trello settings configured');
    return { items: [], nextCursor: null };
  }

  const allItems = [];

  for (const userSettings of settings) {
    const { userId, trackedBoardIds, trackedListNames } = userSettings;

    if (!trackedBoardIds?.length) {
      console.log(`[trello] User ${userId} has no tracked boards configured`);
      continue;
    }

    // Get or create cursor for this user (use global cursor since we're not using connected accounts)
    let cursorRecord = await prisma.cursor.findFirst({ where: { source, connectedAccountId: null } });
    if (!cursorRecord) {
      cursorRecord = await prisma.cursor.create({ data: { source, connectedAccountId: null, cursor: JSON.stringify({}) } });
    }

    // We'll use a per-user cursor stored in the cursor string as JSON
    let userCursors = {};
    try {
      userCursors = cursorRecord.cursor ? JSON.parse(cursorRecord.cursor) : {};
    } catch {
      userCursors = {};
    }

    // Fetch board names for better context
    const boardNames = new Map();
    try {
      const boardsRes = await fetch(
        `${TRELLO_API_BASE}/members/me/boards?fields=id,name&key=${apiKey}&token=${apiToken}`
      );
      if (boardsRes.ok) {
        const boards = await boardsRes.json();
        for (const board of boards) {
          boardNames.set(board.id, board.name);
        }
      }
    } catch (err) {
      console.warn('[trello] Failed to fetch board names:', err?.message);
    }

    for (const boardId of trackedBoardIds) {
      const boardName = boardNames.get(boardId) || 'Unknown Board';
      const sinceCursor = userCursors[boardId] ?? null;

      try {
        console.log(`[trello] Fetching actions for board ${boardName} (${boardId}) since ${sinceCursor ?? 'beginning'}`);
        const actions = await fetchBoardActions(boardId, sinceCursor);

        if (!actions.length) {
          console.log(`[trello] No new actions for board ${boardName}`);
          continue;
        }

        // Actions come in newest-first order
        let newestActionId = null;
        let trackedCount = 0;

        for (const action of actions) {
          if (!newestActionId) {
            newestActionId = action.id;
          }

          // Skip if we've already processed this action (cursor is inclusive)
          if (action.id === sinceCursor) {
            break;
          }

          // For updateCard actions, only include if it's a move to a tracked list
          // For other action types, include all
          if (action.type === 'updateCard') {
            if (!isTrackedListMove(action, trackedListNames)) {
              continue;
            }
          }

          allItems.push(mapAction(action, userId, boardName));
          trackedCount++;
        }

        console.log(`[trello] Found ${trackedCount} tracked actions for board ${boardName}`);

        // Update cursor for this board
        if (newestActionId) {
          userCursors[boardId] = newestActionId;
        }
      } catch (err) {
        console.error(`[trello] Error fetching board ${boardId}:`, err?.message ?? err);
      }
    }

    // Save updated cursors (update by id to avoid unique-null where clause issues)
    await prisma.cursor.update({ where: { id: cursorRecord.id }, data: { cursor: JSON.stringify(userCursors) } });
  }

  console.log(`[trello] Collected ${allItems.length} total events`);
  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect });

export default collect;
