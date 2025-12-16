const collectors = new Map();

export const registerCollector = ({ source, collect }) => {
  if (!source || typeof collect !== 'function') {
    throw new Error('Collector registration requires a source and collect(cursor) function');
  }
  if (collectors.has(source)) {
    throw new Error(`Collector for source "${source}" already registered`);
  }
  collectors.set(source, collect);
};

export const listCollectors = () => [...collectors.entries()].map(([source, collect]) => ({ source, collect }));
