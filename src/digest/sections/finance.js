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
    const parserFormat = payload.parserFormat || 'amex_csv';
    
    // Different institutions use different sign conventions:
    // - Amex: positive = charge (debit), negative = payment (credit)
    // - Chase: negative = charge (debit), positive = payment (credit)
    const isChaseFormat = parserFormat.startsWith('chase');
    
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
    
    // Normalize amount based on institution's sign convention
    // Store as: positive = debit (out), negative = credit (in)
    let normalizedAmount;
    if (isChaseFormat) {
      // Chase: negative = debit, positive = credit
      // Flip the sign so debits are positive, credits are negative
      normalizedAmount = -amount;
    } else {
      // Amex (default): positive = debit, negative = credit
      // Keep as-is
      normalizedAmount = amount;
    }
    
    source.transactions.push({
      date: payload.date,
      description: payload.description,
      amount: normalizedAmount,
      category: payload.category,
      reference: payload.reference,
      occurredAt: evt.occurredAt,
    });

    // Apply correct sign convention based on parser format
    if (isChaseFormat) {
      // Chase: negative = debit, positive = credit
      if (amount < 0) {
        source.debits += Math.abs(amount);
      } else {
        source.credits += amount;
      }
    } else {
      // Amex (default): positive = debit, negative = credit
      if (amount < 0) {
        source.credits += Math.abs(amount);
      } else {
        source.debits += amount;
      }
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
