import express from "express";
import { pool } from "../config/db.js";

const router = express.Router();

const DEFAULT_BOOK_COVER = "https://via.placeholder.com/150x200/386156/FFFFFF?text=No+Cover";

// ---------------------- Helper Functions ----------------------
const ensureBookCover = (book) => {
  if (!book) return null;
  
  if (!book.cover || book.cover.trim() === "") {
    return { ...book, cover: DEFAULT_BOOK_COVER };
  }
  if (book.cover.startsWith("/")) {
    return { ...book, cover: `http://10.0.2.2:4000${book.cover}` };
  }
  if (!/^https?:\/\//i.test(book.cover)) {
    return { ...book, cover: `http://10.0.2.2:4000/${book.cover}` };
  }
  return book;
};

// ---------------------- Book Catalog Routes ----------------------

// ✅ ดึงหนังสือทั้งหมด
router.get("/mock/all", async (req, res) => {
  try {
    const [books] = await pool.query('SELECT * FROM books ORDER BY created_at DESC');
    const booksWithCover = books.map(ensureBookCover);
    res.json({ books: booksWithCover });
  } catch (error) {
    console.error('Error fetching all books:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// ✅ ดึงหนังสือตาม ID
router.get("/mock/:id", async (req, res) => {
  try {
    const [books] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
    
    if (books.length === 0) {
      return res.status(404).json({ error: "Book not found" });
    }
    
    res.json(ensureBookCover(books[0]));
  } catch (error) {
    console.error('Error fetching book by ID:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// ✅ ค้นหาหนังสือ (สำหรับ SearchScreen)
router.get("/search", async (req, res) => {
  try {
    const query = (req.query.q || "").toLowerCase().trim();
    let sql = 'SELECT * FROM books';
    const params = [];

    if (query !== "") {
      sql += ' WHERE LOWER(title) LIKE ? OR LOWER(author) LIKE ?';
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' ORDER BY created_at DESC';

    const [books] = await pool.query(sql, params);
    const results = books.map(ensureBookCover);

    console.log(`\n🔍 [Search] Query: "${req.query.q || ''}" → ${results.length} ผลลัพธ์`);
    
    res.json({ books: results });
  } catch (error) {
    console.error('Error searching books:', error);
    res.status(500).json({ error: 'Failed to search books' });
  }
});

// ---------------------- View Tracking System ----------------------

// ✅ Log การดูหนังสือ
router.post("/mock/:id/view", async (req, res) => {
  const { id: bookId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    // ตรวจสอบว่าหนังสือมีอยู่จริง
    const [books] = await pool.query('SELECT * FROM books WHERE id = ?', [bookId]);
    
    if (books.length === 0) {
      return res.status(404).json({ error: "Book not found" });
    }

    const book = books[0];

    // บันทึกประวัติการดู
    await pool.query(
      'INSERT INTO book_views (book_id, user_id) VALUES (?, ?)',
      [bookId, userId]
    );

    // นับจำนวน view ทั้งหมดของหนังสือเล่มนี้
    const [viewCount] = await pool.query(
      'SELECT COUNT(*) as total FROM book_views WHERE book_id = ?',
      [bookId]
    );

    // นับจำนวน view ของ user คนนี้
    const [userViewCount] = await pool.query(
      'SELECT COUNT(*) as total FROM book_views WHERE book_id = ? AND user_id = ?',
      [bookId, userId]
    );

    const timestamp = new Date().toLocaleString('th-TH', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });

    console.log(
      `📖 [${timestamp}] ${userId.substring(0, 15)}... → "${book.title}" ` +
      `(ครั้งที่ ${userViewCount[0].total} | รวม ${viewCount[0].total})`
    );

    res.json({
      message: "View logged successfully",
      data: {
        book: ensureBookCover(book),
        userViewCount: userViewCount[0].total,
        totalViews: viewCount[0].total,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error logging view:', error);
    res.status(500).json({ error: 'Failed to log view' });
  }
});

// ✅ ดึงประวัติการดูหนังสือของ user
router.get("/mock/history/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const [history] = await pool.query(
      `SELECT 
        bv.id,
        bv.book_id as bookId,
        bv.viewed_at as viewedAt,
        b.*,
        COUNT(*) OVER (PARTITION BY bv.book_id) as viewCount
      FROM book_views bv
      JOIN books b ON bv.book_id = b.id
      WHERE bv.user_id = ?
      ORDER BY bv.viewed_at DESC`,
      [userId]
    );

    const formattedHistory = history.map(item => ({
      bookId: item.bookId,
      book: ensureBookCover(item),
      viewedAt: item.viewedAt,
      viewCount: item.viewCount
    }));

    console.log(`\n📜 [History] User: ${userId.substring(0, 20)}... → ${formattedHistory.length} รายการ`);

    res.json({ 
      userId, 
      history: formattedHistory, 
      totalItems: formattedHistory.length 
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ✅ ดึงสถิติการดูหนังสือทั้งหมด
router.get("/mock/stats/all", async (req, res) => {
  try {
    const [stats] = await pool.query(
      `SELECT 
        b.*,
        COUNT(bv.id) as views
      FROM books b
      LEFT JOIN book_views bv ON b.id = bv.book_id
      GROUP BY b.id
      ORDER BY views DESC
      LIMIT 20`
    );

    const topBooks = stats.map(item => ({
      bookId: item.id,
      book: ensureBookCover(item),
      views: item.views
    }));

    console.log("\n📊 [Global Stats] Top Books:");
    topBooks.slice(0, 5).forEach((item, idx) => {
      console.log(`   ${idx + 1}. "${item.book?.title}" → ${item.views} views`);
    });

    res.json({ 
      topBooks, 
      totalTrackedBooks: topBooks.length 
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ✅ ดึงสถิติการดูของ user
router.get("/mock/stats/user/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const [stats] = await pool.query(
      `SELECT 
        b.*,
        COUNT(bv.id) as views
      FROM book_views bv
      JOIN books b ON bv.book_id = b.id
      WHERE bv.user_id = ?
      GROUP BY b.id
      ORDER BY views DESC
      LIMIT 20`,
      [userId]
    );

    const topBooks = stats.map(item => ({
      bookId: item.id,
      book: ensureBookCover(item),
      views: item.views
    }));

    console.log(`\n📊 [User Stats] ${userId.substring(0, 20)}... Top Books:`);
    topBooks.slice(0, 5).forEach((item, idx) => {
      console.log(`   ${idx + 1}. "${item.book?.title}" → ${item.views} views`);
    });

    res.json({ 
      userId, 
      topBooks, 
      totalBooksViewed: topBooks.length 
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// ✅ ลบประวัติทั้งหมดของ user
router.delete("/mock/history/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM book_views WHERE user_id = ?',
      [userId]
    );

    const hadHistory = result.affectedRows > 0;

    console.log(`🗑️ [Clear] User: ${userId.substring(0, 20)}... history cleared (${result.affectedRows} records)`);

    res.json({ 
      message: "History cleared successfully", 
      userId, 
      hadHistory,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

export default router;