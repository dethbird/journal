const express = require('express');
const prisma = require('../lib/prismaClient');

const router = express.Router();

// Get all atlas items for the logged-in user
router.get('/', async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const items = await prisma.atlasItem.findMany({
      where: { userId: req.session.userId },
      orderBy: { sortOrder: 'asc' },
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching atlas items:', error);
    res.status(500).json({ error: 'Failed to fetch atlas items' });
  }
});

// Create a new atlas item
router.post('/', async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { title, category, embedCode, source, notes, sortOrder } = req.body;

    if (!title || !embedCode) {
      return res.status(400).json({ error: 'Title and embedCode are required' });
    }

    const item = await prisma.atlasItem.create({
      data: {
        userId: req.session.userId,
        title,
        category: category || null,
        embedCode,
        source: source || null,
        notes: notes || null,
        sortOrder: sortOrder || 0,
      },
    });

    res.json(item);
  } catch (error) {
    console.error('Error creating atlas item:', error);
    res.status(500).json({ error: 'Failed to create atlas item' });
  }
});

// Update an atlas item
router.put('/:id', async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const { title, category, embedCode, source, notes, sortOrder, updateLastReviewed } = req.body;

    // Verify ownership
    const existing = await prisma.atlasItem.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== req.session.userId) {
      return res.status(404).json({ error: 'Atlas item not found' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (category !== undefined) updateData.category = category || null;
    if (embedCode !== undefined) updateData.embedCode = embedCode;
    if (source !== undefined) updateData.source = source || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (updateLastReviewed) updateData.lastReviewed = new Date();

    const item = await prisma.atlasItem.update({
      where: { id },
      data: updateData,
    });

    res.json(item);
  } catch (error) {
    console.error('Error updating atlas item:', error);
    res.status(500).json({ error: 'Failed to update atlas item' });
  }
});

// Delete an atlas item
router.delete('/:id', async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.atlasItem.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== req.session.userId) {
      return res.status(404).json({ error: 'Atlas item not found' });
    }

    await prisma.atlasItem.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting atlas item:', error);
    res.status(500).json({ error: 'Failed to delete atlas item' });
  }
});

module.exports = router;
