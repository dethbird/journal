import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { createRequire } from 'node:module';
import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const source = 'finance';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const EXPIRY_SKEW_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 120 * 1000;

const latestToken = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  return [...tokens].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
};

const needsRefresh = (token) => {
  if (!token?.expiresAt) return false;
  return new Date(token.expiresAt).getTime() - EXPIRY_SKEW_MS <= Date.now();
};

const storeToken = async (connectedAccountId, tokenResponse, fallbackRefreshToken) => {
  const expiresAt =
    tokenResponse.expires_in != null
      ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
      : null;

  return prisma.oAuthToken.create({
    data: {
      connectedAccountId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken ?? null,
      tokenType: tokenResponse.token_type ?? null,
      scope: tokenResponse.scope ?? null,
      expiresAt,
      tokenJson: tokenResponse,
    },
  });
};

const refreshAccessToken = async (connectedAccount, refreshToken) => {
  if (!clientId || !clientSecret) {
    console.warn('[finance] Google refresh failed: client id/secret missing');
    return null;
  }
  if (!refreshToken) {
    console.warn(`[finance] Google refresh failed: missing refresh_token for connectedAccount=${connectedAccount.id}`);
    return null;
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[finance] Google refresh failed (${res.status}): ${body}`);
    return null;
  }

  const token = await res.json();
  return storeToken(connectedAccount.id, token, refreshToken);
};

const resolveAccessToken = async (connectedAccount) => {
  const tokenRecord = latestToken(connectedAccount.oauthTokens);
  if (!tokenRecord) return { accessToken: null, tokenRecord: null };

  if (needsRefresh(tokenRecord) && tokenRecord.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(connectedAccount, tokenRecord.refreshToken);
      if (refreshed) return { accessToken: refreshed.accessToken, tokenRecord: refreshed };
    } catch (err) {
      console.warn('[finance] Google token refresh threw:', err?.message ?? err);
    }
  }

  return { accessToken: tokenRecord.accessToken, tokenRecord };
};

/**
 * Search for a file in a Google Drive folder by name
 * Returns the most recent file matching the name
 */
const findFileInFolder = async (accessToken, folderId, fileName) => {
  const query = `'${folderId}' in parents and name='${fileName}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Drive file search failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.files?.[0] || null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Download file content from Google Drive
 */
const downloadFile = async (accessToken, fileId, asBinary = false) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Drive file download failed (${res.status}): ${body}`);
    }

    if (asBinary) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Parse American Express CSV format
 * Columns: Date, Description, Amount, Extended Details, Appears On Your Statement As, 
 *          Address, City/State, Zip Code, Country, Reference, Category
 */
const parseAmexCSV = (csvContent) => {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row) => ({
    date: row.Date,
    description: row.Description,
    amount: parseFloat(row.Amount) || 0,
    extendedDetails: row['Extended Details'],
    statementDescription: row['Appears On Your Statement As'],
    address: row.Address,
    cityState: row['City/State'],
    zipCode: row['Zip Code'],
    country: row.Country,
    reference: row.Reference?.replace(/'/g, ''), // Remove quotes from reference
    category: row.Category,
  }));
};

/**
 * Parse Chase Credit Card CSV format
 * Columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
 * Note: Chase uses negative amounts for charges, positive for payments/refunds
 */
const parseChaseCSV = (csvContent) => {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row) => {
    const amount = parseFloat(row.Amount) || 0;
    
    return {
      date: row['Transaction Date'],
      postDate: row['Post Date'],
      description: row.Description,
      amount: amount,
      category: row.Category || '',
      type: row.Type || '',
      memo: row.Memo || '',
      reference: `${row['Transaction Date']}-${amount.toFixed(2)}-${row.Description}`.substring(0, 50),
    };
  });
};

/**
 * Parse Chase Checking Account CSV format
 * Columns: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
 * Note: Chase uses negative amounts for debits, positive for credits
 */
const parseChaseCheckingCSV = (csvContent) => {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  return records.map((row) => {
    const amount = parseFloat(row.Amount) || 0;
    const postingDate = row['Posting Date'] || row['Details'];
    
    return {
      date: postingDate,
      postDate: postingDate,
      description: row.Description || '',
      amount: amount,
      category: row.Category || '',
      type: row.Type || '',
      memo: row['Check or Slip #'] || '',
      balance: row.Balance ? parseFloat(row.Balance) : null,
      reference: `${postingDate}-${amount.toFixed(2)}-${row.Description || ''}`.substring(0, 50),
    };
  });
};

/**
 * Parse Chime PDF statement format
 * Extracts transactions section between "Transactions" and "Yearly Summary"
 * Parses rows with pattern: DATE DESCRIPTION TYPE AMOUNT NET_AMOUNT DATE
 */
const parseChimePDF = async (pdfBuffer) => {
  try {
    const data = await pdfParse(pdfBuffer);
    const text = data.text;

    // Find transactions section
    const startMarker = 'Transactions';
    const endMarker = 'Yearly Summary';
    const startIdx = text.indexOf(startMarker);
    const endIdx = text.indexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
      console.log('[finance] Could not find transaction section in PDF');
      return [];
    }

    // Extract and normalize text
    let txSection = text.substring(startIdx + startMarker.length, endIdx);
    // Normalize whitespace: collapse multiple spaces/newlines into single space
    txSection = txSection.replace(/\s+/g, ' ').trim();

    // Split into rows by detecting leading date pattern MM/DD/YYYY
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
    const transactions = [];
    let match;
    const datePositions = [];

    // Find all date positions
    while ((match = datePattern.exec(txSection)) !== null) {
      datePositions.push({ index: match.index, date: match[1] });
    }

    // Parse each transaction (between consecutive dates)
    for (let i = 0; i < datePositions.length; i++) {
      const start = datePositions[i].index;
      const end = i < datePositions.length - 1 ? datePositions[i + 1].index : txSection.length;
      const rowText = txSection.substring(start, end).trim();

      // Extract dates (first and last)
      const dates = rowText.match(/\d{2}\/\d{2}\/\d{4}/g);
      if (!dates || dates.length < 1) continue;
      
      const transactionDate = dates[0];
      const settlementDate = dates.length > 1 ? dates[dates.length - 1] : dates[0];

      // Extract amounts (look for $XXX.XX patterns, can be negative)
      const amountPattern = /-?\$[\d,]+\.\d{2}/g;
      const amounts = rowText.match(amountPattern);
      if (!amounts || amounts.length < 1) {
        continue;
      }

      const amount = parseFloat(amounts[0].replace(/[$,]/g, '')) || 0;
      const netAmount = amounts.length > 1 ? parseFloat(amounts[1].replace(/[$,]/g, '')) : amount;

      // Extract description and type
      let remainder = rowText;
      dates.forEach(d => { remainder = remainder.replace(d, ''); });
      amounts.forEach(a => { remainder = remainder.replace(a, ''); });
      remainder = remainder.trim();

      // Type patterns to look for
      const typePatterns = ['Direct Debit', 'Direct Credit', 'Debit', 'Credit', 'ATM Withdrawal', 'Purchase'];
      let type = '';
      let description = remainder;

      for (const typeCandidate of typePatterns) {
        const lastIdx = remainder.lastIndexOf(typeCandidate);
        if (lastIdx !== -1) {
          type = typeCandidate;
          description = remainder.substring(0, lastIdx).trim();
          break;
        }
      }

      transactions.push({
        date: transactionDate,
        settlementDate,
        description: description || remainder,
        type,
        amount,
        netAmount,
        reference: `${transactionDate}-${amount.toFixed(2)}-${description.substring(0, 20)}`,
      });
    }

    return transactions;
  } catch (error) {
    console.error('[finance] Error parsing Chime PDF:', error);
    return [];
  }
};

/**
 * Generic CSV parser - will be used for other institution types
 */
const parseGenericCSV = (csvContent) => {
  // For now, just use the Amex parser as a fallback
  return parseAmexCSV(csvContent);
};

/**
 * Parse file content based on parser format
 * Handles both CSV and PDF formats
 */
const parseFile = async (content, parserFormat) => {
  switch (parserFormat) {
    case 'amex_csv':
      return parseAmexCSV(content);
    case 'chase_csv':
      return parseChaseCSV(content);
    case 'chase_checking_csv':
      return parseChaseCheckingCSV(content);
    case 'chime_pdf':
      return await parseChimePDF(content);
    case 'chime_csv':
    case 'generic_csv':
    default:
      return parseGenericCSV(content);
  }
};

/**
 * Generate unique external ID for a transaction
 * Format: finance:{sourceId}:{date}:{amount}:{reference}
 */
const generateExternalId = (sourceId, transaction) => {
  const parts = [
    'finance',
    sourceId,
    transaction.date,
    transaction.amount.toFixed(2),
    transaction.reference || 'no-ref',
  ];
  return parts.join(':');
};

/**
 * Parse date from MM/DD/YYYY format
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Handle MM/DD/YYYY format
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
  }
  
  // Handle YYYY-MM-DD or MM/DD/YY format
  const parts = dateStr.split(/[-\/]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      [year, month, day] = parts.map(Number);
    } else {
      // MM/DD/YY or MM/DD/YYYY
      [month, day, year] = parts.map(Number);
      if (year < 100) year += 2000; // Convert 2-digit year
    }
    
    if (month && day && year) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }
  
  return null;
};

/**
 * Collect financial data for a single account
 */
const collectForAccount = async (account, cursor) => {
  console.log(`\n[finance] Collecting for account ${account.id} (${account.provider})`);

  const { accessToken } = await resolveAccessToken(account);
  if (!accessToken) {
    console.warn(`[finance] No valid access token for account ${account.id}`);
    return { summary: { processed: 0, created: 0, error: 'No access token' } };
  }

  // Get all enabled finance sources for this account
  const sources = await prisma.googleDriveSource.findMany({
    where: {
      connectedAccountId: account.id,
      sourceType: 'finance',
      enabled: true,
    },
  });

  if (sources.length === 0) {
    console.log(`[finance] No enabled finance sources for account ${account.id}`);
    return { summary: { processed: 0, created: 0, skipped: 0 } };
  }

  console.log(`[finance] Found ${sources.length} enabled finance source(s)`);

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const financeSource of sources) {
    try {
      console.log(`\n[finance] Processing source: ${financeSource.institutionName} (${financeSource.id})`);
      console.log(`[finance]   Folder: ${financeSource.driveFolderId}`);
      console.log(`[finance]   File: ${financeSource.driveFileName}`);
      console.log(`[finance]   Parser: ${financeSource.parserFormat}`);

      // Find the file in Google Drive
      const file = await findFileInFolder(
        accessToken,
        financeSource.driveFolderId,
        financeSource.driveFileName
      );

      if (!file) {
        console.warn(`[finance] File not found: ${financeSource.driveFileName} in folder ${financeSource.driveFolderId}`);
        errors.push(`File not found: ${financeSource.driveFileName}`);
        continue;
      }

      console.log(`[finance] Found file: ${file.name} (modified: ${file.modifiedTime})`);

      // Download and parse the file (CSV or PDF)
      const isPDF = financeSource.parserFormat.includes('_pdf');
      const fileContent = await downloadFile(accessToken, file.id, isPDF);
      const transactions = await parseFile(fileContent, financeSource.parserFormat);

      console.log(`[finance] Parsed ${transactions.length} transactions`);

      // Process each transaction
      let created = 0;
      let skipped = 0;

      for (const transaction of transactions) {
        const externalId = generateExternalId(financeSource.id, transaction);
        const occurredAt = parseDate(transaction.date);

        if (!occurredAt) {
          console.warn(`[finance] Invalid date: ${transaction.date} - skipping transaction`);
          skipped++;
          continue;
        }

        // Check if event already exists
        const existing = await prisma.event.findUnique({
          where: { 
            source_externalId: {
              source,
              externalId,
            }
          },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create event
        await prisma.event.create({
          data: {
            externalId,
            source,
            eventType: 'transaction',
            occurredAt,
            userId: account.userId,
            payload: {
              ...transaction,
              sourceId: financeSource.id,
              institutionId: financeSource.institutionId,
              institutionName: financeSource.institutionName,
              nickname: financeSource.nickname,
              parserFormat: financeSource.parserFormat, // Store parser format for correct amount interpretation
            },
          },
        });

        created++;
      }

      console.log(`[finance] Created ${created} events, skipped ${skipped} duplicates`);

      totalProcessed += transactions.length;
      totalCreated += created;
      totalSkipped += skipped;

      // Update lastSyncedAt for this source
      await prisma.googleDriveSource.update({
        where: { id: financeSource.id },
        data: { lastSyncedAt: new Date() },
      });

    } catch (err) {
      const errMsg = `Source ${financeSource.id}: ${err.message}`;
      console.error(`[finance] Error processing source:`, err);
      errors.push(errMsg);
    }
  }

  const summary = {
    processed: totalProcessed,
    created: totalCreated,
    skipped: totalSkipped,
  };

  if (errors.length > 0) {
    summary.errors = errors;
  }

  console.log(`\n[finance] Collection complete:`, summary);

  return { summary };
};

registerCollector({
  source,
  collectForAccount,
});

console.log(`[finance] Collector registered for source: ${source}`);
