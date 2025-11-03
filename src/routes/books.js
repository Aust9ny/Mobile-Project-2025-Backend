// routes/books.js
import express from "express";
<<<<<<< HEAD
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ตัวแปรเก็บข้อมูลภายในเซิร์ฟเวอร์
const bookViews = {};
const borrowHistories = {}; // { bookId: [{ userId, borrowDate, dueDate, extended }] }

// Initialize borrowHistories จาก mock data (สร้าง dummy users สำหรับยอด borrowed)
MOCK_LIBRARY.forEach(book => {
  if (book.borrowed > 0) {
    borrowHistories[book.id] = [];
    // สร้าง dummy borrow records ตามจำนวน borrowed
    for (let i = 0; i < book.borrowed; i++) {
      const borrowDate = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000); // ยืมไปแล้ว i+1 วัน
      const dueDate = new Date(borrowDate.getTime() + 7 * 24 * 60 * 60 * 1000); // ครบกำหนด 7 วัน
      borrowHistories[book.id].push({
        userId: `dummy-user-${i + 1}`,
        borrowDate: borrowDate.toISOString(),
        dueDate: dueDate.toISOString(),
        extended: false
      });
    }
  }
});

console.log('\n📚 [INIT] Library initialized with borrowed books from mock data:');
MOCK_LIBRARY.forEach(book => {
  if (book.borrowed > 0) {
    console.log(`   "${book.title}": ${book.available}/${book.total} available | ${book.borrowed} borrowed`);
  }
});

// ฟังก์ชันคำนวณ stock ตามข้อมูลจริง
const getBookStock = (bookId) => {
  const book = MOCK_LIBRARY.find(b => b.id === bookId);
  if (!book) return null;
  
  const borrowed = borrowHistories[bookId]?.length || 0;
  const available = book.total - borrowed;
  
  return { borrowed, available, total: book.total };
};

// ---------------------- ของเดิม ----------------------

router.get("/", (req, res) => {
  res.json({ message: "Get all books" });
});

router.get("/:id", (req, res) => {
  res.json({ message: `Get book ${req.params.id}` });
});

router.post("/", (req, res) => {
  res.json({ message: "Create book", data: req.body });
});

router.put("/:id", (req, res) => {
  res.json({ message: `Update book ${req.params.id}`, data: req.body });
});

router.delete("/:id", (req, res) => {
  res.json({ message: `Delete book ${req.params.id}` });
});

// ---------------------- Mock Library API ----------------------

// ดึงหนังสือทั้งหมด
router.get("/mock/all", (req, res) => {
  const booksWithRealtime = MOCK_LIBRARY.map(book => {
    const stock = getBookStock(book.id);
    return { ...book, ...stock };
  });
  res.json({ books: booksWithRealtime });
});

// ดึงหนังสือตาม ID
router.get("/mock/:id", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  
  const stock = getBookStock(book.id);
  res.json({ ...book, ...stock });
});

// Log การดูหนังสือ
router.post("/mock/:id/view", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  bookViews[book.id] = (bookViews[book.id] || 0) + 1;
  const stock = getBookStock(book.id);
  
  console.log(`\n📖 [VIEW] Book: "${book.title}" (ID: ${book.id})`);
  console.log(`   Total views: ${bookViews[book.id]}`);

  res.json({ 
    message: "View logged", 
    book: { ...book, ...stock, views: bookViews[book.id] } 
  });
});

// ยืมหนังสือ
router.post("/mock/:id/borrow", (req, res) => {
  const { id } = req.params;
  const { userId, action } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find(b => b.userId === userId);

  if (action === 'borrow') {
    // ตรวจสอบว่ายืมอยู่แล้วหรือไม่
    if (userHistory) {
      console.log(`\n❌ [BORROW FAILED] User "${userId}" already borrowed "${book.title}"`);
      return res.status(400).json({ error: "คุณยืมหนังสือเล่มนี้อยู่แล้ว" });
    }

    // ตรวจสอบจำนวนหนังสือคงเหลือ
    const currentStock = getBookStock(book.id);
    
    if (currentStock.available <= 0) {
      console.log(`\n❌ [BORROW FAILED] "${book.title}" out of stock`);
      console.log(`   📊 Stock: ${currentStock.available}/${currentStock.total} available | ${currentStock.borrowed} borrowed`);
      return res.status(400).json({ error: "หนังสือหมด" });
    }

    // บันทึกการยืม (7 วัน)
    const now = new Date();
    const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    borrowHistories[book.id].push({ 
      userId, 
      borrowDate: now.toISOString(), 
      dueDate: dueDate.toISOString(),
      extended: false 
    });

    // คำนวณ stock ใหม่
    const newStock = getBookStock(book.id);

    console.log(`\n✅ [BORROW SUCCESS]`);
    console.log(`   User: ${userId}`);
    console.log(`   Book: "${book.title}" (ID: ${book.id})`);
    console.log(`   Borrow Date: ${now.toLocaleString('th-TH')}`);
    console.log(`   Due Date: ${dueDate.toLocaleString('th-TH')} (7 days)`);
    console.log(`   📊 Stock: ${newStock.available}/${newStock.total} available | ${newStock.borrowed} borrowed`);

    return res.json({ 
      success: true, 
      book: { ...book, ...newStock }
    });
  }

  return res.status(400).json({ error: "Invalid action" });
});

// คืนหนังสือ
router.post("/mock/:id/return", (req, res) => {
  const { id } = req.params;
  const { userId, borrowDate, dueDate } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  let userHistory = borrowHistories[book.id].find(b => b.userId === userId);

  if (!userHistory && borrowDate && dueDate) {
    userHistory = { userId, borrowDate, dueDate, extended: false };
    borrowHistories[book.id].push(userHistory);
  }

  if (!userHistory) return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });

  // ลบการยืม
  borrowHistories[book.id] = borrowHistories[book.id].filter(b => b.userId !== userId);

  const newStock = getBookStock(book.id);
  const returnDate = new Date();
  const dueDateObj = new Date(userHistory.dueDate);
  const wasOverdue = returnDate > dueDateObj;

  // เพิ่มจำนวนวันที่เกินกำหนด
  const overdueDays = wasOverdue
    ? Math.ceil((returnDate.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  console.log(`\n↩️  [RETURN SUCCESS]`);
  console.log(`   User: ${userId}`);
  console.log(`   Book: "${book.title}" (ID: ${book.id})`);
  console.log(`   Return Date: ${returnDate.toLocaleString('th-TH')}`);
  console.log(`   Original Due Date: ${dueDateObj.toLocaleString('th-TH')}`);
  console.log(`   Status: ${wasOverdue ? `⚠️ OVERDUE (${overdueDays} วัน)` : '✓ ON TIME'}`);
  if (userHistory.extended) console.log(`   Extended: Yes`);
  console.log(`   📊 Stock: ${newStock.available}/${newStock.total} available | ${newStock.borrowed} borrowed`);

  return res.json({ 
    success: true, 
    book: { ...book, ...newStock }
  });
});


// ยืมต่อหนังสือ (เพิ่ม 7 วัน)
router.post("/mock/:id/extend", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find(b => b.userId === userId);

  if (!userHistory) {
    console.log(`\n❌ [EXTEND FAILED] User "${userId}" did not borrow "${book.title}"`);
    return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
  }

  if (userHistory.extended) {
    console.log(`\n❌ [EXTEND FAILED] Book "${book.title}" already extended by "${userId}"`);
    return res.status(400).json({ error: "คุณยืมต่อหนังสือเล่มนี้ไปแล้ว" });
  }

  // ตรวจสอบว่าเหลือเวลาไม่เกิน 3 วัน
  const now = new Date();
  const dueDate = new Date(userHistory.dueDate);
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft > 3) {
    console.log(`\n❌ [EXTEND FAILED] Too early to extend "${book.title}" (${daysLeft} days left)`);
    return res.status(400).json({ error: "ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน" });
  }

  if (daysLeft < 0) {
    console.log(`\n❌ [EXTEND FAILED] Book "${book.title}" is overdue (${Math.abs(daysLeft)} days)`);
    return res.status(400).json({ error: "หนังสือเกินกำหนดคืนแล้ว กรุณาคืนก่อน" });
  }

  // ยืมต่อ 7 วัน
  const oldDueDate = new Date(userHistory.dueDate);
  const newDueDate = new Date(oldDueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  userHistory.dueDate = newDueDate.toISOString();
  userHistory.extended = true;

  const stock = getBookStock(book.id);

  console.log(`\n🔄 [EXTEND SUCCESS]`);
  console.log(`   User: ${userId}`);
  console.log(`   Book: "${book.title}" (ID: ${book.id})`);
  console.log(`   Old Due Date: ${oldDueDate.toLocaleString('th-TH')}`);
  console.log(`   New Due Date: ${newDueDate.toLocaleString('th-TH')} (+7 days)`);
  console.log(`   Days Left Before Extend: ${daysLeft} days`);
  console.log(`   📊 Stock: ${stock.available}/${stock.total} available | ${stock.borrowed} borrowed`);

  return res.json({ 
    success: true, 
    book: { ...book, ...stock }
  });
})

export default router;
=======
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
>>>>>>> 39491a17f26c110c5312d5547264aa6a7d4dd5ae
