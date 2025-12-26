import { registerDigest } from '../registry.js';

const source = 'finance';

/**
 * Build finance digest section from transaction events
 */
export const buildFinanceSection = (events) => {
  if (!events?.length) return null;

  // Group transactions by institution
  const byInstitution = new Map();
  
  let totalSpent = 0;
  let totalCredits = 0;
  let transactionCount = 0;

  for (const evt of events) {
    const payload = evt.payload || {};
    const institutionName = payload.institutionName || 'Unknown';
    const nickname = payload.nickname || null;
    const institutionKey = nickname ? `${institutionName} - ${nickname}` : institutionName;
    const amount = payload.amount || 0;
    
    if (!byInstitution.has(institutionKey)) {
      byInstitution.set(institutionKey, {
        name: institutionKey,
        transactions: [],
        spent: 0,
        credits: 0,
        count: 0,
      });
    }

    const institution = byInstitution.get(institutionKey);
    institution.transactions.push({
      date: payload.date,
      description: payload.description,
      amount,
      category: payload.category,
      reference: payload.reference,
      occurredAt: evt.occurredAt,
    });

    if (amount < 0) {
      // Negative amount = payment/credit
      institution.credits += Math.abs(amount);
      totalCredits += Math.abs(amount);
    } else {
      // Positive amount = charge/debit
      institution.spent += amount;
      totalSpent += amount;
    }

    institution.count++;
    transactionCount++;
  }

  // Sort transactions within each institution by date (newest first)
  for (const institution of byInstitution.values()) {
    institution.transactions.sort((a, b) => {
      const dateA = new Date(a.occurredAt || a.date);
      const dateB = new Date(b.occurredAt || b.date);
      return dateB - dateA;
    });
  }

  // Convert to array and sort by total spent (highest first)
  const institutions = Array.from(byInstitution.values()).sort((a, b) => b.spent - a.spent);

  return {
    kind: 'finance',
    institutions,
    summary: {
      totalSpent,
      totalCredits,
      netSpent: totalSpent - totalCredits,
      transactionCount,
      institutionCount: institutions.length,
    },
  };
};

registerDigest({
  source,
  build: buildFinanceSection,
});

console.log(`[finance] Digest registered for source: ${source}`);

export default buildFinanceSection;
