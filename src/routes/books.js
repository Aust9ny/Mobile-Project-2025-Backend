import express from "express";
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET all books with optional filters
router.get("/", async (req, res) => {
  try {
    const { search, category, available, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM books WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (available !== undefined) {
      query += ' AND available = ?';
      params.push(available === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [books] = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM books WHERE 1=1';
    const countParams = [];
    
    if (search) {
      countQuery += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }
    
    if (available !== undefined) {
      countQuery += ' AND available = ?';
      countParams.push(available === 'true' ? 1 : 0);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    res.json({ 
      books,
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Failed to get books' });
  }
});

// GET book by ID
router.get("/:id", async (req, res) => {
  try {
    const [books] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    
    if (books.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json({ book: books[0] });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ error: 'Failed to get book' });
  }
});

// GET books by category
router.get("/category/:category", async (req, res) => {
  try {
    const [books] = await pool.query(
      'SELECT * FROM books WHERE category = ? ORDER BY title',
      [req.params.category]
    );
    res.json({ books });
  } catch (error) {
    console.error('Get books by category error:', error);
    res.status(500).json({ error: 'Failed to get books by category' });
  }
});

// GET available books only
router.get("/status/available", async (req, res) => {
  try {
    const [books] = await pool.query(
      'SELECT * FROM books WHERE available = 1 ORDER BY title'
    );
    res.json({ books });
  } catch (error) {
    console.error('Get available books error:', error);
    res.status(500).json({ error: 'Failed to get available books' });
  }
});

// POST create book (protected)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      author, 
      isbn, 
      category, 
      description, 
      cover_image, 
      publisher, 
      publication_year,
      total_copies = 1
    } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author are required' });
    }
    
    const [result] = await pool.query(
      `INSERT INTO books (title, author, isbn, category, description, cover_image, 
       publisher, publication_year, total_copies, available_copies) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, author, isbn, category, description, cover_image, publisher, 
       publication_year, total_copies, total_copies]
    );
    
    res.status(201).json({ 
      message: 'Book created successfully',
      book: { 
        id: result.insertId, 
        title, 
        author, 
        isbn,
        category,
        total_copies,
        available_copies: total_copies
      }
    });
  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// PUT update book (protected)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      author, 
      isbn, 
      category, 
      description, 
      cover_image, 
      publisher, 
      publication_year,
      total_copies,
      available_copies
    } = req.body;
    
    // Check if book exists
    const [existing] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const updates = [];
    const params = [];
    
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (author !== undefined) { updates.push('author = ?'); params.push(author); }
    if (isbn !== undefined) { updates.push('isbn = ?'); params.push(isbn); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
    if (publisher !== undefined) { updates.push('publisher = ?'); params.push(publisher); }
    if (publication_year !== undefined) { updates.push('publication_year = ?'); params.push(publication_year); }
    if (total_copies !== undefined) { updates.push('total_copies = ?'); params.push(total_copies); }
    if (available_copies !== undefined) { updates.push('available_copies = ?'); params.push(available_copies); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(req.params.id);
    
    await pool.query(
      `UPDATE books SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const [updated] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    
    res.json({ 
      message: 'Book updated successfully',
      book: updated[0]
    });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// DELETE book (protected)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    // Check if book has active borrows
    const [borrows] = await pool.query(
      'SELECT COUNT(*) as count FROM borrows WHERE book_id = ? AND status = "borrowed"',
      [req.params.id]
    );
    
    if (borrows[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete book with active borrows' 
      });
    }
    
    const [result] = await pool.query('DELETE FROM books WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

export default router;
