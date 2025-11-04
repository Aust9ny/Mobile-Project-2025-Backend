// routes/books.js
import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ตัวแปรเก็บข้อมูลภายในเซิร์ฟเวอร์
const bookViews = {};

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

// Log การดูหนังสือ
router.post("/mock/:id/view", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  bookViews[book.id] = (bookViews[book.id] || 0) + 1;

  console.log(`\n📖 [VIEW] Book: "${book.title}" (ID: ${book.id})`);
  console.log(`   Total views: ${bookViews[book.id]}`);

  res.json({
    message: "View logged",
    book: { ...book, views: bookViews[book.id] },
  });
});

export default router;
