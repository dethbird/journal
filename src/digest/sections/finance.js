import { registerDigest } from '../registry.js';

const source = 'finance';

/**
 * Build finance digest section from transaction events
 * Returns individual sections per source (institution account)
 */
export const buildFinanceSection = (events) => {
  if (!events?.length) return null;

  // Group transactions by sourceId (individual finance source/account)
  const bySource = new Map();
  
  for (const evt of events) {
    const payload = evt.payload || {};
    const sourceId = payload.sourceId || 'unknown';
    const institutionName = payload.institutionName || 'Unknown';
    const nickname = payload.nickname || null;
    const amount = payload.amount || 0;
    
    if (!bySource.has(sourceId)) {
      bySource.set(sourceId, {
        sourceId,
        name: nickname ? `${institutionName} - ${nickname}` : institutionName,
        transactions: [],
        debits: 0,   // positive amounts (money spent)
        credits: 0,  // negative amounts (payments/refunds)
        count: 0,
      });
    }

    const source = bySource.get(sourceId);
    source.transactions.push({
      date: payload.date,
      description: payload.description,
      amount,
      category: payload.category,
      reference: payload.reference,
      occurredAt: evt.occurredAt,
    });

    if (amount < 0) {
      // Negative amount = payment/credit
      source.credits += Math.abs(amount);
    } else {
      // Positive amount = charge/debit
      source.debits += amount;
    }

    source.count++;
  }

  // Sort transactions within each source by date (newest first)
  for (const source of bySource.values()) {
    source.transactions.sort((a, b) => {
      const dateA = new Date(a.occurredAt || a.date);
      const dateB = new Date(b.occurredAt || b.date);
      return dateB - dateA;
    });
  }

  // Convert to array - keep original order or sort by name
  const sources = Array.from(bySource.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    kind: 'finance',
    sources,  // Array of individual source objects
  };
};

registerDigest({
  source,
  build: buildFinanceSection,
});

console.log(`[finance] Digest registered for source: ${source}`);

export default buildFinanceSection;
