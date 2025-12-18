const collectors = new Map();

export const registerCollector = ({ source, collect, collectForAccount }) => {
  if (!source || (typeof collect !== 'function' && typeof collectForAccount !== 'function')) {
    throw new Error('Collector registration requires a source and either collect(cursor) or collectForAccount(account, cursor) function');
  }
  if (collectors.has(source)) {
    throw new Error(`Collector for source "${source}" already registered`);
  }
  collectors.set(source, { collect, collectForAccount });
};

export const listCollectors = () => [...collectors.entries()].map(([source, obj]) => ({ source, ...obj }));
