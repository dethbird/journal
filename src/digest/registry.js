const digestBuilders = new Map();

export const registerDigest = ({ source, build }) => {
  if (!source || typeof build !== 'function') {
    throw new Error('Digest registration requires a source and build(events) function');
  }
  if (digestBuilders.has(source)) {
    throw new Error(`Digest for source "${source}" already registered`);
  }
  digestBuilders.set(source, build);
};

export const getDigestBuilder = (source) => digestBuilders.get(source) ?? null;

export const listRegisteredSources = () => [...digestBuilders.keys()];
