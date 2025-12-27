/**
 * Finance source configurations
 * Defines supported financial institutions and their parser formats
 */

export const FINANCE_INSTITUTIONS = [
  {
    id: 'chase',
    name: 'Chase Bank (Credit Card)',
    parserFormat: 'chase_csv',
    description: 'Chase credit card CSV export',
    defaultFilename: 'activity.csv',
  },
  {
    id: 'chase_checking',
    name: 'Chase Bank (Checking)',
    parserFormat: 'chase_checking_csv',
    description: 'Chase checking account CSV export',
    defaultFilename: 'activity.csv',
  },
  {
    id: 'chime',
    name: 'Chime',
    parserFormat: 'chime_csv',
    description: 'Chime CSV export format',
    defaultFilename: 'activity.csv',
  },
  {
    id: 'amex',
    name: 'American Express',
    parserFormat: 'amex_csv',
    description: 'American Express CSV export format',
    defaultFilename: 'activity.csv',
  },
  {
    id: 'generic_csv',
    name: 'Generic CSV',
    parserFormat: 'generic_csv',
    description: 'Generic CSV format (date, description, amount)',
    defaultFilename: 'activity.csv',
  },
  {
    id: 'generic_xls',
    name: 'Generic Excel',
    parserFormat: 'generic_xls',
    description: 'Generic Excel format (.xls or .xlsx)',
    defaultFilename: 'activity.xls',
  },
];

/**
 * Get institution config by ID
 */
export const getInstitutionById = (id) => {
  return FINANCE_INSTITUTIONS.find((inst) => inst.id === id);
};

/**
 * Get default filename for institution
 */
export const getDefaultFilename = (institutionId) => {
  const inst = getInstitutionById(institutionId);
  return inst?.defaultFilename || 'activity.csv';
};
