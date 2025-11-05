import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ---------------------- In-Memory Storage ----------------------
const bookViews = {}; // { bookId: totalViews }
const userHistory = {}; // { userId: [{ bookId, timestamp, book }] }
const userBookViews = {}; // { userId: { bookId: count } }

// ---------------------- Mock Library Core ----------------------

// ดึงหนังสือทั้งหมด
router.get("/mock/all", (req, res) => {
  res.json({ books: MOCK_LIBRARY });
});

// ดึงหนังสือตาม ID
router.get("/mock/:id", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

// ---------------------- View Tracking System ----------------------

// Log การดูหนังสือ (รับ userId จาก request body)
router.post("/mock/:id/view", (req, res) => {
  const bookId = req.params.id;
  const { userId } = req.body;
  
  const book = MOCK_LIBRARY.find((b) => b.id === bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  // เพิ่มจำนวนการดูรวม
  bookViews[bookId] = (bookViews[bookId] || 0) + 1;

  // เพิ่มจำนวนการดูของ user แต่ละคน
  if (!userBookViews[userId]) {
    userBookViews[userId] = {};
  }
  userBookViews[userId][bookId] = (userBookViews[userId][bookId] || 0) + 1;

  // เพิ่มประวัติการดู
  if (!userHistory[userId]) {
    userHistory[userId] = [];
  }

  // เช็คว่าหนังสือเล่มนี้มีในประวัติแล้วหรือไม่
  const existingIndex = userHistory[userId].findIndex(h => h.bookId === bookId);
  
  const historyItem = {
    bookId,
    book: { ...book },
    viewedAt: new Date().toISOString(),
    viewCount: userBookViews[userId][bookId]
  };

  if (existingIndex !== -1) {
    // ถ้ามีแล้ว ให้ลบออกแล้วเพิ่มใหม่ที่ด้านบน (เรียงล่าสุดก่อน)
    userHistory[userId].splice(existingIndex, 1);
  }
  
  userHistory[userId].unshift(historyItem);

  // แสดง Log ใน Backend
  const timestamp = new Date().toLocaleString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  console.log(`[${timestamp}] VIEW: ${userId.substring(0, 15)}... -> "${book.title}" (ครั้งที่ ${userBookViews[userId][bookId]} | รวม ${bookViews[bookId]})`);

  res.json({
    message: "View logged successfully",
    data: {
      book,
      userViewCount: userBookViews[userId][bookId],
      totalViews: bookViews[bookId],
      timestamp: historyItem.viewedAt
    }
  });
});

// ดึงประวัติการดูหนังสือของ user
router.get("/mock/history/:userId", (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const history = userHistory[userId] || [];
  
  console.log(`\n[History] User: ${userId.substring(0, 20)}... -> ${history.length} รายการ`);

  res.json({
    userId,
    history,
    totalItems: history.length
  });
});

// ดึงสถิติการดูหนังสือทั้งหมด (สำหรับ recommend)
router.get("/mock/stats/all", (req, res) => {
  // เรียงหนังสือตามจำนวนการดู
  const sortedBooks = Object.entries(bookViews)
    .map(([bookId, views]) => {
      const book = MOCK_LIBRARY.find(b => b.id === bookId);
      return { bookId, book, views };
    })
    .sort((a, b) => b.views - a.views);

  console.log("\n[Global Stats] Top Books:");
  sortedBooks.slice(0, 5).forEach((item, index) => {
    console.log(`   ${index + 1}. "${item.book?.title}" -> ${item.views} views`);
  });
  console.log(`   (${sortedBooks.length} หนังสือทั้งหมด)\n`);

  res.json({
    topBooks: sortedBooks,
    totalTrackedBooks: sortedBooks.length
  });
});

// ดึงสถิติการดูของ user เฉพาะคน
router.get("/mock/stats/user/:userId", (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const userViews = userBookViews[userId] || {};
  const sortedUserBooks = Object.entries(userViews)
    .map(([bookId, views]) => {
      const book = MOCK_LIBRARY.find(b => b.id === bookId);
      return { bookId, book, views };
    })
    .sort((a, b) => b.views - a.views);

  console.log(`\n[User Stats] ${userId.substring(0, 20)}... Top Books:`);
  sortedUserBooks.slice(0, 5).forEach((item, index) => {
    console.log(`   ${index + 1}. "${item.book?.title}" -> ${item.views} views`);
  });
  console.log(`   (${sortedUserBooks.length} หนังสือทั้งหมด)\n`);

  res.json({
    userId,
    topBooks: sortedUserBooks,
    totalBooksViewed: sortedUserBooks.length
  });
});

// ลบประวัติทั้งหมดของ user
router.delete("/mock/history/:userId", (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const hadHistory = userHistory[userId] && userHistory[userId].length > 0;
  
  delete userHistory[userId];
  delete userBookViews[userId];

  console.log(`[Clear History] User: ${userId.substring(0, 20)}...`);

  res.json({
    message: "History cleared successfully",
    userId,
    hadHistory
  });
});

export default router;