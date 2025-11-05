import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ---------------------- In-Memory Storage ----------------------
const bookViews = {};       // { bookId: totalViews }
const userHistory = {};     // { userId: [{ bookId, timestamp, book }] }
const userBookViews = {};   // { userId: { bookId: count } }

// Default cover if missing
const DEFAULT_BOOK_COVER = "https://via.placeholder.com/150x200/386156/FFFFFF?text=No+Cover";

// ---------------------- Helper ----------------------
const ensureBookCover = (book) => {
  if (!book) return null; // ป้องกัน book ที่เป็น null หรือ undefined
  
  if (!book.cover || book.cover.trim() === "") return { ...book, cover: DEFAULT_BOOK_COVER };
  if (book.cover.startsWith("/")) return { ...book, cover: `http://10.0.2.2:4000${book.cover}` };
  if (!/^https?:\/\//i.test(book.cover)) return { ...book, cover: `http://10.0.2.2:4000/${book.cover}` };
  return book;
};

// ---------------------- Mock Library Core ----------------------

// ดึงหนังสือทั้งหมด
router.get("/mock/all", (req, res) => {
  const booksWithCover = MOCK_LIBRARY.map(ensureBookCover);
  res.json({ books: booksWithCover });
});

// ดึงหนังสือตาม ID
router.get("/mock/:id", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(ensureBookCover(book));
});

// ⭐️ [เพิ่มใหม่] ค้นหาหนังสือ (สำหรับ SearchScreen)
router.get("/search", (req, res) => {
  // 1. ดึง query string 'q' จาก URL (เช่น /search?q=แฮร์รี่)
  const query = (req.query.q || "").toLowerCase().trim();

  let results = [];

  // 2. ถ้า query ว่าง (เหมือนตอนที่ SearchScreen โหลดครั้งแรก)
  if (query === "") {
    // ส่งหนังสือทั้งหมดกลับไป
    results = MOCK_LIBRARY.map(ensureBookCover);
  } else {
    // 3. ถ้ามี query, ค้นหาจาก title และ author
    results = MOCK_LIBRARY.filter(book =>
      (book.title && book.title.toLowerCase().includes(query)) ||
      (book.author && book.author.toLowerCase().includes(query))
    ).map(ensureBookCover);
  }

  // (Optional) Log การค้นหา
  console.log(`\n🔍 [Search] Query: "${req.query.q || ''}" → ${results.length} ผลลัพธ์`);
  
  // 4. ส่งข้อมูลกลับใน format ที่ React Native คาดหวัง
  res.json({ books: results });
});


// ---------------------- View Tracking System ----------------------

// Log การดูหนังสือ
router.post("/mock/:id/view", (req, res) => {
  const bookId = req.params.id;
  const { userId } = req.body;

  const book = MOCK_LIBRARY.find((b) => b.id === bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });
  if (!userId) return res.status(400).json({ error: "userId is required" });

  // เพิ่มจำนวน view
  bookViews[bookId] = (bookViews[bookId] || 0) + 1;

  // เพิ่มจำนวน view ของ user
  if (!userBookViews[userId]) userBookViews[userId] = {};
  userBookViews[userId][bookId] = (userBookViews[userId][bookId] || 0) + 1;

  // เพิ่มประวัติ user
  if (!userHistory[userId]) userHistory[userId] = [];
  const existingIndex = userHistory[userId].findIndex(h => h.bookId === bookId);

  const historyItem = {
    bookId,
    book: ensureBookCover(book),
    viewedAt: new Date().toISOString(),
    viewCount: userBookViews[userId][bookId],
  };

  if (existingIndex !== -1) userHistory[userId].splice(existingIndex, 1);
  userHistory[userId].unshift(historyItem);

  const timestamp = new Date().toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`📖 [${timestamp}] ${userId.substring(0, 15)}... → "${book.title}" (ครั้งที่ ${userBookViews[userId][bookId]} | รวม ${bookViews[bookId]})`);

  res.json({
    message: "View logged successfully",
    data: {
      book: ensureBookCover(book),
      userViewCount: userBookViews[userId][bookId],
      totalViews: bookViews[bookId],
      timestamp: historyItem.viewedAt,
    },
  });
});

// ดึงประวัติการดูหนังสือของ user
router.get("/mock/history/:userId", (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const history = (userHistory[userId] || []).map(h => ({
    ...h,
    book: ensureBookCover(h.book)
  })).filter(h => h.book !== null); // กรองอันที่ book เป็น null ออก

  console.log(`\n📜 [History] User: ${userId.substring(0, 20)}... → ${history.length} รายการ`);

  res.json({ userId, history, totalItems: history.length });
});

// ดึงสถิติการดูหนังสือทั้งหมด
router.get("/mock/stats/all", (req, res) => {
  const sortedBooks = Object.entries(bookViews)
    .map(([bookId, views]) => {
      const book = MOCK_LIBRARY.find(b => b.id === bookId);
      return { bookId, book: ensureBookCover(book), views };
    })
    .filter(item => item.book !== null) // กรองอันที่ book เป็น null ออก
    .sort((a, b) => b.views - a.views);

  console.log("\n📊 [Global Stats] Top Books:");
  sortedBooks.slice(0, 5).forEach((item, idx) => {
    console.log(`   ${idx + 1}. "${item.book?.title}" → ${item.views} views`);
  });

  res.json({ topBooks: sortedBooks, totalTrackedBooks: sortedBooks.length });
});

// ดึงสถิติการดูของ user
router.get("/mock/stats/user/:userId", (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const userViews = userBookViews[userId] || {};
  const sortedUserBooks = Object.entries(userViews)
    .map(([bookId, views]) => {
      const book = MOCK_LIBRARY.find(b => b.id === bookId);
      return { bookId, book: ensureBookCover(book), views };
    })
    .filter(item => item.book !== null) // กรองอันที่ book เป็น null ออก
    .sort((a, b) => b.views - a.views);

  console.log(`\n📊 [User Stats] ${userId.substring(0, 20)}... Top Books:`);
  sortedUserBooks.slice(0, 5).forEach((item, idx) => {
    console.log(`   ${idx + 1}. "${item.book?.title}" → ${item.views} views`);
  });

  res.json({ userId, topBooks: sortedUserBooks, totalBooksViewed: sortedUserBooks.length });
});

// ลบประวัติทั้งหมดของ user
router.delete("/mock/history/:userId", (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const hadHistory = userHistory[userId]?.length > 0;
  delete userHistory[userId];
  delete userBookViews[userId];

  console.log(`🗑️ [Clear] User: ${userId.substring(0, 20)}... history cleared`);

  res.json({ message: "History cleared successfully", userId, hadHistory });
});

export default router;