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
  const [saveState, setSaveState] = useState({ saving: false, message: null, error: null });
  const [mood, setMood] = useState('');
  const [energy, setEnergy] = useState('');
  const [tags, setTags] = useState('');
  const autoSaveTimer = useRef(null);
  const lastSavedContent = useRef('');

  // Goals state
  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [newGoalText, setNewGoalText] = useState('');

  // Load entry when date changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ loading: true, error: null, entry: null });
      setGoalsLoading(true);
      try {
        // Fetch journal entry and goals in parallel
        const [entryRes, goalsRes] = await Promise.all([
          fetch(`/api/journal?date=${date}`, { credentials: 'include' }),
          fetch(`/api/goals?date=${date}`, { credentials: 'include' }),
        ]);

        if (!entryRes.ok) throw new Error(`Failed to load journal (${entryRes.status})`);
        const entryData = await entryRes.json();

        let goalsData = [];
        if (goalsRes.ok) {
          const gd = await goalsRes.json();
          goalsData = gd.goals || [];
        }

        if (!cancelled) {
          const entryContent = entryData.entry?.content || '';
          setState({ loading: false, error: null, entry: entryData.entry });

          // Parse frontmatter
          const { frontmatter, body } = parseFrontmatter(entryContent);
          setContent(body);
          setMood(frontmatter.mood || '');
          setEnergy(frontmatter.energy || '');
          setTags(Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : (frontmatter.tags || ''));
          lastSavedContent.current = entryContent;

          setGoals(goalsData);
          setGoalsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err.message, entry: null });
          setGoalsLoading(false);
        }
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
    if (fullContent === lastSavedContent.current) return; // No changes

    setSaveState({ saving: true, message: null, error: null });
    try {
      const res = await fetch('/api/journal', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content: fullContent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      lastSavedContent.current = fullContent;
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
  }, [content, mood, energy, tags]);

  // Goal actions
  const addGoal = async () => {
    if (!newGoalText.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text: newGoalText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add goal');
      const data = await res.json();
      setGoals((prev) => [...prev, data.goal]);
      setNewGoalText('');
    } catch (err) {
      console.error('Add goal error:', err);
    }
  };

  const toggleGoal = async (goalId, completed) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      if (!res.ok) throw new Error('Failed to toggle goal');
      const data = await res.json();
      setGoals((prev) => prev.map((g) => (g.id === goalId ? data.goal : g)));
    } catch (err) {
      console.error('Toggle goal error:', err);
    }
  };

  const deleteGoal = async (goalId) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete goal');
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch (err) {
      console.error('Delete goal error:', err);
    }
  };

  const handleNewGoalKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGoal();
    }
  };

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

        {/* Goals section */}
        <div className="field mb-4">
          <label className="label is-small">Goals for the day</label>
          {goalsLoading ? (
            <p className="has-text-grey is-size-7">Loading goals…</p>
          ) : (
            <div className="goals-list">
              {goals.length === 0 && (
                <p className="has-text-grey is-size-7 mb-2">No goals yet. Add one below.</p>
              )}
              {goals.map((goal) => (
                <div key={goal.id} className="is-flex is-align-items-center mb-2 goal-item">
                  <label className="checkbox is-flex is-align-items-center" style={{ flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={goal.completed}
                      onChange={() => toggleGoal(goal.id, goal.completed)}
                      className="mr-2"
                    />
                    <span className={goal.completed ? 'has-text-grey-light' : ''} style={goal.completed ? { textDecoration: 'line-through' } : {}}>
                      {goal.text}
                    </span>
                  </label>
                  <button
                    className="button is-small is-light is-danger ml-2"
                    onClick={() => deleteGoal(goal.id)}
                    title="Delete goal"
                  >
                    <span className="icon is-small">
                      <i className="fa-solid fa-trash" />
                    </span>
                  </button>
                </div>
              ))}
              <div className="is-flex is-align-items-center mt-2">
                <input
                  className="input is-small"
                  type="text"
                  placeholder="Add a new goal…"
                  value={newGoalText}
                  onChange={(e) => setNewGoalText(e.target.value)}
                  onKeyDown={handleNewGoalKeyDown}
                  style={{ flex: 1 }}
                />
                <button
                  className="button is-small is-success ml-2"
                  onClick={addGoal}
                  disabled={!newGoalText.trim()}
                >
                  <span className="icon is-small">
                    <i className="fa-solid fa-plus" />
                  </span>
                  <span>Add</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label className="label is-small">Journal Entry</label>
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
