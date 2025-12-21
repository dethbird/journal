const MAX_BOARDS_DISPLAY = Number(process.env.DIGEST_TRELLO_MAX_BOARDS ?? 6);
const MAX_CARDS_PER_BOARD = Number(process.env.DIGEST_TRELLO_MAX_CARDS ?? 5);

/**
 * Build the Trello digest section from collected events.
 * Groups actions by board and shows cards moved into tracked lists.
 */
export const buildTrelloSection = (events) => {
  if (!events?.length) return null;

  // Group events by board
  const boardGroups = new Map();

  for (const evt of events) {
    const payload = evt.payload ?? {};
    const boardId = payload.board?.id;
    const boardName = payload.board?.name ?? 'Unknown Board';

    if (!boardId) continue;

    if (!boardGroups.has(boardId)) {
      boardGroups.set(boardId, {
        id: boardId,
        name: boardName,
        cards: [],
        actionCount: 0,
      });
    }

    const group = boardGroups.get(boardId);
    group.actionCount++;

    // For updateCard events (list moves), track the card
    if (evt.eventType === 'updateCard' && payload.listAfter?.name) {
      const card = payload.card ?? {};
      group.cards.push({
        id: card.id,
        name: card.name,
        url: card.url,
        listName: payload.listAfter.name,
        listBefore: payload.listBefore?.name ?? null,
        occurredAt: evt.occurredAt instanceof Date ? evt.occurredAt.toISOString() : evt.occurredAt,
        member: payload.member?.fullName ?? payload.member?.username ?? null,
      });
    }

    // For createCard events
    if (evt.eventType === 'createCard') {
      const card = payload.card ?? {};
      const list = payload.list ?? {};
      group.cards.push({
        id: card.id,
        name: card.name,
        url: card.url,
        listName: list.name ?? 'Unknown List',
        listBefore: null,
        occurredAt: evt.occurredAt instanceof Date ? evt.occurredAt.toISOString() : evt.occurredAt,
        member: payload.member?.fullName ?? payload.member?.username ?? null,
        isNew: true,
      });
    }
  }

  // Sort boards by action count (most active first)
  const sortedBoards = [...boardGroups.values()]
    .sort((a, b) => b.actionCount - a.actionCount)
    .slice(0, MAX_BOARDS_DISPLAY);

  // Sort cards within each board by time (most recent first) and limit
  for (const board of sortedBoards) {
    board.cards = board.cards
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, MAX_CARDS_PER_BOARD);
  }

  // Calculate summary stats
  const totalActions = events.length;
  const totalCardsMoved = events.filter((e) => e.eventType === 'updateCard').length;
  const totalCardsCreated = events.filter((e) => e.eventType === 'createCard').length;

  return {
    kind: 'trello',
    summary: {
      totalActions,
      totalCardsMoved,
      totalCardsCreated,
      boardCount: boardGroups.size,
    },
    boards: sortedBoards.map((board) => ({
      id: board.id,
      name: board.name,
      actionCount: board.actionCount,
      cards: board.cards,
    })),
  };
};

export default buildTrelloSection;
