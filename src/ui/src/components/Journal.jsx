import React, { useEffect, useState, useRef } from 'react';

/**
 * Parse frontmatter from markdown content.
 * Returns { frontmatter: { key: value, ... }, body: "rest of content" }
 */
const parseFrontmatter = (content) => {
  if (!content || !content.startsWith('---')) {
    return { frontmatter: {}, body: content || '' };
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: content };
  }
  const fmBlock = content.slice(4, endIdx); // skip opening ---\n
  const body = content.slice(endIdx + 4).replace(/^\n/, ''); // skip closing ---\n

  const frontmatter = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      // Parse arrays like [tag1, tag2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      }
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
};

/**
 * Build frontmatter block from object.
 */
const buildFrontmatter = (fm) => {
  const lines = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  if (!lines.length) return '';
  return `---\n${lines.join('\n')}\n---\n`;
};

export default function Journal({ date, dateLabel }) {
  const [state, setState] = useState({ loading: true, error: null, entry: null });
  const [content, setContent] = useState('');
  const [goals, setGoals] = useState('');
  const [saveState, setSaveState] = useState({ saving: false, message: null, error: null });
  const [mood, setMood] = useState('');
  const [energy, setEnergy] = useState('');
  const [tags, setTags] = useState('');
  const autoSaveTimer = useRef(null);
  const lastSavedContent = useRef('');
  const lastSavedGoals = useRef('');

  // Load entry when date changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ loading: true, error: null, entry: null });
      try {
        const res = await fetch(`/api/journal?date=${date}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          const entryContent = data.entry?.content || '';
          setState({ loading: false, error: null, entry: data.entry });

          // Parse frontmatter
          const { frontmatter, body } = parseFrontmatter(entryContent);
          setContent(body);
          setGoals(data.entry?.goals || '');
          setMood(frontmatter.mood || '');
          setEnergy(frontmatter.energy || '');
          setTags(Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : (frontmatter.tags || ''));
          lastSavedContent.current = entryContent;
          lastSavedGoals.current = data.entry?.goals || '';
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message, entry: null });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Build full content with frontmatter
  const buildFullContent = () => {
    const fm = {};
    if (mood) fm.mood = mood;
    if (energy) fm.energy = energy;
    if (tags) fm.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const fmStr = buildFrontmatter(fm);
    return fmStr + content;
  };

  // Save entry
  const save = async () => {
    const fullContent = buildFullContent();
    if (fullContent === lastSavedContent.current && goals === lastSavedGoals.current) return; // No changes

    setSaveState({ saving: true, message: null, error: null });
    try {
      const res = await fetch('/api/journal', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content: fullContent, goals }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      lastSavedContent.current = fullContent;
      lastSavedGoals.current = goals;
      setSaveState({ saving: false, message: 'Saved', error: null });
      setTimeout(() => setSaveState((s) => ({ ...s, message: null })), 1500);
    } catch (err) {
      setSaveState({ saving: false, message: null, error: err.message });
    }
  };

  // Auto-save on content change (debounced)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!state.loading) save();
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [content, mood, energy, tags, goals]);

  if (state.loading) {
    return (
      <div className="box">
        <p className="subtitle is-6">Loading journal…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="box">
        <p className="subtitle is-6 has-text-danger">{state.error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="box">
        <div className="is-flex is-align-items-center is-justify-content-space-between mb-4">
          <h2 className="title is-4 mb-0">Journal — {dateLabel}</h2>
          <div className="is-flex is-align-items-center">
            {saveState.saving ? (
              <span className="has-text-grey is-size-7">Saving…</span>
            ) : saveState.message ? (
              <span className="has-text-success is-size-7">{saveState.message}</span>
            ) : saveState.error ? (
              <span className="has-text-danger is-size-7">{saveState.error}</span>
            ) : null}
            <button
              className={`button is-small is-info ml-3${saveState.saving ? ' is-loading' : ''}`}
              onClick={save}
              disabled={saveState.saving}
            >
              <span className="icon">
                <i className="fa-solid fa-floppy-disk" />
              </span>
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="field mb-3">
          <label className="label is-small">Goals (morning)</label>
          <div className="control">
            <textarea
              className="textarea is-small"
              rows={4}
              placeholder="Your goals for the day (Markdown supported)"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              onBlur={save}
            />
          </div>
          <p className="help has-text-grey">Saved separately from the main journal content.</p>
        </div>

        <div className="field">
          <div className="control">
            <textarea
              className="textarea"
              rows={12}
              placeholder="Write your journal entry here… (Markdown supported)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={save}
            />
          </div>
          <p className="help has-text-grey">Auto-saves after 1.5 seconds of inactivity</p>
        </div>

        <div className="columns mb-3">
          <div className="column is-4">
            <div className="field">
              <label className="label is-small">Mood</label>
              <div className="control">
                <input
                  className="input is-small"
                  type="text"
                  placeholder="e.g. happy, stressed, calm"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="column is-4">
            <div className="field">
              <label className="label is-small">Energy</label>
              <div className="control">
                <input
                  className="input is-small"
                  type="text"
                  placeholder="e.g. high, low, moderate"
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="column is-4">
            <div className="field">
              <label className="label is-small">Tags</label>
              <div className="control">
                <input
                  className="input is-small"
                  type="text"
                  placeholder="e.g. work, travel, family"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
