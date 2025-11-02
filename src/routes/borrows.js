import express from "express";
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET all borrows with optional filters (protected)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { user_id, book_id, status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        borrows.*,
        users.name as user_name,
        users.email as user_email,
        books.title as book_title,
        books.author as book_author,
        books.cover_image as book_cover
      FROM borrows
      JOIN users ON borrows.user_id = users.id
      JOIN books ON borrows.book_id = books.id
      WHERE 1=1
    `;
    const params = [];
    
    if (user_id) {
      query += ' AND borrows.user_id = ?';
      params.push(user_id);
    }
    
    if (book_id) {
      query += ' AND borrows.book_id = ?';
      params.push(book_id);
    }
    
    if (status) {
      query += ' AND borrows.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY borrows.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [borrows] = await pool.query(query, params);
    
    res.json({ borrows });
  } catch (error) {
    console.error('Get borrows error:', error);
    res.status(500).json({ error: 'Failed to get borrows' });
  }
});

// GET borrow by ID (protected)
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const [borrows] = await pool.query(
      `SELECT 
        borrows.*,
        users.name as user_name,
        users.email as user_email,
        books.title as book_title,
        books.author as book_author,
        books.isbn as book_isbn,
        books.cover_image as book_cover
      FROM borrows
      JOIN users ON borrows.user_id = users.id
      JOIN books ON borrows.book_id = books.id
      WHERE borrows.id = ?`,
      [req.params.id]
    );
    
    if (borrows.length === 0) {
      return res.status(404).json({ error: 'Borrow record not found' });
    }
    
    res.json({ borrow: borrows[0] });
  } catch (error) {
    console.error('Get borrow error:', error);
    res.status(500).json({ error: 'Failed to get borrow' });
  }
});

// GET user's borrow history (protected)
router.get("/user/:user_id", authenticateToken, async (req, res) => {
  try {
    const [borrows] = await pool.query(
      `SELECT 
        borrows.*,
        books.title as book_title,
        books.author as book_author,
        books.cover_image as book_cover
      FROM borrows
      JOIN books ON borrows.book_id = books.id
      WHERE borrows.user_id = ?
      ORDER BY borrows.created_at DESC`,
      [req.params.user_id]
    );
    
    res.json({ borrows });
  } catch (error) {
    console.error('Get user borrows error:', error);
    res.status(500).json({ error: 'Failed to get user borrows' });
  }
});

// GET active borrows for a user (protected)
router.get("/user/:user_id/active", authenticateToken, async (req, res) => {
  try {
    const [borrows] = await pool.query(
      `SELECT 
        borrows.*,
        books.title as book_title,
        books.author as book_author,
        books.cover_image as book_cover
      FROM borrows
      JOIN books ON borrows.book_id = books.id
      WHERE borrows.user_id = ? AND borrows.status = 'borrowed'
      ORDER BY borrows.due_date ASC`,
      [req.params.user_id]
    );
    
    res.json({ borrows });
  } catch (error) {
    console.error('Get active borrows error:', error);
    res.status(500).json({ error: 'Failed to get active borrows' });
  }
});

// GET overdue borrows (protected)
router.get("/status/overdue", authenticateToken, async (req, res) => {
  try {
    const [borrows] = await pool.query(
      `SELECT 
        borrows.*,
        users.name as user_name,
        users.email as user_email,
        books.title as book_title,
        books.author as book_author
      FROM borrows
      JOIN users ON borrows.user_id = users.id
      JOIN books ON borrows.book_id = books.id
      WHERE borrows.status = 'borrowed' AND borrows.due_date < NOW()
      ORDER BY borrows.due_date ASC`
    );
    
    res.json({ borrows });
  } catch (error) {
    console.error('Get overdue borrows error:', error);
    res.status(500).json({ error: 'Failed to get overdue borrows' });
  }
});

// POST create borrow (protected)
router.post("/", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let { user_id, book_id, due_date } = req.body;
    
    // Derive user_id from authenticated user if not provided
    if (!user_id) {
      if (req.user?.authType === 'firebase') {
        const [users] = await connection.query(
          'SELECT id FROM users WHERE firebase_uid = ?',
          [req.user.uid]
        );
        user_id = users[0]?.id;
      } else if (req.user?.id) {
        user_id = req.user.id;
      }
    }
    
    if (!user_id || !book_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'User ID and Book ID are required' });
    }
    
    // Check if book is available
    const [books] = await connection.query(
      'SELECT available_copies FROM books WHERE id = ?',
      [book_id]
    );
    
    if (books.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Book not found' });
    }
    
    if (books[0].available_copies <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Book is not available' });
    }
    
    // Check if user already has this book borrowed
    const [existingBorrow] = await connection.query(
      'SELECT id FROM borrows WHERE user_id = ? AND book_id = ? AND status = "borrowed"',
      [user_id, book_id]
    );
    
    if (existingBorrow.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'User already borrowed this book' });
    }
    
    // Create borrow record
    const borrowDate = new Date();
    const dueDate = due_date ? new Date(due_date) : new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days default
    
    const [result] = await connection.query(
      'INSERT INTO borrows (user_id, book_id, borrow_date, due_date, status) VALUES (?, ?, ?, ?, "borrowed")',
      [user_id, book_id, borrowDate, dueDate]
    );
    
    // Decrease available copies
    await connection.query(
      'UPDATE books SET available_copies = available_copies - 1 WHERE id = ?',
      [book_id]
    );
    
    await connection.commit();
    
    res.status(201).json({ 
      message: 'Book borrowed successfully',
      borrow: {
        id: result.insertId,
        user_id,
        book_id,
        borrow_date: borrowDate,
        due_date: dueDate,
        status: 'borrowed'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create borrow error:', error);
    res.status(500).json({ error: 'Failed to create borrow' });
  } finally {
    connection.release();
  }
});

// PUT return book (protected)
router.put("/:id/return", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get borrow record
    const [borrows] = await connection.query(
      'SELECT * FROM borrows WHERE id = ?',
      [req.params.id]
    );
    
    if (borrows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Borrow record not found' });
    }
    
    const borrow = borrows[0];
    
    if (borrow.status === 'returned') {
      await connection.rollback();
      return res.status(400).json({ error: 'Book already returned' });
    }
    
    // Update borrow record
    const returnDate = new Date();
    await connection.query(
      'UPDATE borrows SET status = "returned", return_date = ? WHERE id = ?',
      [returnDate, req.params.id]
    );
    
    // Increase available copies
    await connection.query(
      'UPDATE books SET available_copies = available_copies + 1 WHERE id = ?',
      [borrow.book_id]
    );
    
    await connection.commit();
    
    res.json({ 
      message: 'Book returned successfully',
      borrow: {
        ...borrow,
        status: 'returned',
        return_date: returnDate
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Return book error:', error);
    res.status(500).json({ error: 'Failed to return book' });
  } finally {
    connection.release();
  }
});

// PUT extend due date (protected)
router.put("/:id/extend", authenticateToken, async (req, res) => {
  try {
    const { new_due_date } = req.body;
    
    if (!new_due_date) {
      return res.status(400).json({ error: 'New due date is required' });
    }
    
    const [borrows] = await pool.query(
      'SELECT * FROM borrows WHERE id = ?',
      [req.params.id]
    );
    
    if (borrows.length === 0) {
      return res.status(404).json({ error: 'Borrow record not found' });
    }
    
    if (borrows[0].status !== 'borrowed') {
      return res.status(400).json({ error: 'Can only extend active borrows' });
    }
    
    await pool.query(
      'UPDATE borrows SET due_date = ? WHERE id = ?',
      [new_due_date, req.params.id]
    );
    
    const [updated] = await pool.query('SELECT * FROM borrows WHERE id = ?', [req.params.id]);
    
    res.json({ 
      message: 'Due date extended successfully',
      borrow: updated[0]
    });
  } catch (error) {
    console.error('Extend due date error:', error);
    res.status(500).json({ error: 'Failed to extend due date' });
  }
});

// DELETE borrow (protected - admin only, use with caution)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM borrows WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Borrow record not found' });
    }
    
    res.json({ message: 'Borrow record deleted successfully' });
  } catch (error) {
    console.error('Delete borrow error:', error);
    res.status(500).json({ error: 'Failed to delete borrow' });
  }
});

export default router;
