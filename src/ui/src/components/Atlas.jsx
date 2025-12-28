import React, { useState, useEffect } from 'react';

function Atlas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    embedCode: '',
    source: '',
    notes: '',
    sortOrder: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/atlas', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch atlas items');
      const data = await res.json();
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      category: '',
      embedCode: '',
      source: '',
      notes: '',
      sortOrder: items.length > 0 ? Math.max(...items.map(i => i.sortOrder)) + 1 : 0,
    });
    setShowForm(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      category: item.category || '',
      embedCode: item.embedCode,
      source: item.source || '',
      notes: item.notes || '',
      sortOrder: item.sortOrder,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({
      title: '',
      category: '',
      embedCode: '',
      source: '',
      notes: '',
      sortOrder: 0,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editingItem ? `/api/atlas/${editingItem.id}` : '/api/atlas';
      const method = editingItem ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save atlas item');
      }

      await loadItems();
      handleCancel();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this atlas item?')) return;

    try {
      const res = await fetch(`/api/atlas/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete atlas item');
      }

      await loadItems();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="box">
          <p>Loading atlas items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 className="title">Atlas</h1>
            <p className="subtitle">Your embedded visualizations and dashboards</p>
          </div>
          <button className="button is-primary" onClick={handleAdd}>
            <span className="icon">
              <i className="fa-solid fa-plus" />
            </span>
            <span>Add Item</span>
          </button>
        </div>

        {error && (
          <div className="notification is-danger">
            <button className="delete" onClick={() => setError(null)}></button>
            {error}
          </div>
        )}

        {showForm && (
          <div className="box" style={{ backgroundColor: '#f5f5f5', marginBottom: '1.5rem' }}>
            <h2 className="title is-5">{editingItem ? 'Edit Atlas Item' : 'New Atlas Item'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="label">Title *</label>
                <div className="control">
                  <input
                    className="input"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    placeholder="Career arc 2025-2030"
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Category / Domain</label>
                <div className="control">
                  <input
                    className="input"
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="career, art, money, health, etc."
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Embed Code / URL *</label>
                <div className="control">
                  <textarea
                    className="textarea"
                    value={formData.embedCode}
                    onChange={(e) => setFormData({ ...formData, embedCode: e.target.value })}
                    required
                    placeholder="<iframe src='...' width='100%' height='600'></iframe>"
                    rows="3"
                  />
                </div>
                <p className="help">Paste an iframe embed code or a URL</p>
              </div>

              <div className="field">
                <label className="label">Source</label>
                <div className="control">
                  <input
                    className="input"
                    type="text"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    placeholder="Miro, Whimsical, FigJam, Obsidian Publish, etc."
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Notes</label>
                <div className="control">
                  <input
                    className="input"
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Short note (one sentence max)"
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Sort Order</label>
                <div className="control">
                  <input
                    className="input"
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="field is-grouped">
                <div className="control">
                  <button type="submit" className={`button is-primary${submitting ? ' is-loading' : ''}`} disabled={submitting}>
                    {editingItem ? 'Save Changes' : 'Create Item'}
                  </button>
                </div>
                <div className="control">
                  <button type="button" className="button is-light" onClick={handleCancel} disabled={submitting}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {items.length === 0 && !showForm ? (
          <div className="notification is-info is-light">
            No atlas items yet. Click "Add Item" to create your first one.
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <div key={item.id} className="box" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <h3 className="title is-5" style={{ marginBottom: '0.25rem' }}>
                      {item.title}
                    </h3>
                    <div className="tags" style={{ marginBottom: '0.5rem' }}>
                      {item.category && <span className="tag">{item.category}</span>}
                      {item.source && <span className="tag is-light">{item.source}</span>}
                    </div>
                  </div>
                  <div className="buttons">
                    <button className="button is-small is-light" onClick={() => handleEdit(item)} title="Edit">
                      <span className="icon">
                        <i className="fa-solid fa-pen" />
                      </span>
                    </button>
                    <button className="button is-small is-danger is-light" onClick={() => handleDelete(item.id)} title="Delete">
                      <span className="icon">
                        <i className="fa-solid fa-trash" />
                      </span>
                    </button>
                  </div>
                </div>
                {item.notes && <p className="is-size-7 has-text-grey" style={{ marginBottom: '0.5rem' }}>{item.notes}</p>}
                {item.lastReviewed && (
                  <p className="is-size-7 has-text-grey" style={{ marginBottom: '0.5rem' }}>
                    Last reviewed: {new Date(item.lastReviewed).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Atlas;
