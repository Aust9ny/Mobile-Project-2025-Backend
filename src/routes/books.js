import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ---------------------- Mock Library Core ----------------------

// ดึงหนังสือทั้งหมด
router.get("/mock/all", (req, res) => {
  res.json({ books: MOCK_LIBRARY });
});

// ดึงหนังสือตาม ID
router.get("/mock/:id", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id); // string ID
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

// Log การดูหนังสือ
const bookViews = {};
router.post("/mock/:id/view", (req, res) => {
  const book = MOCK_LIBRARY.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  bookViews[book.id] = (bookViews[book.id] || 0) + 1;
  console.log(`📖 [VIEW] Book: "${book.title}" (ID: ${book.id})`);
  console.log(`   Total views: ${bookViews[book.id]}`);

  res.json({
    message: "View logged",
    book: { ...book, views: bookViews[book.id] },
  });
});

// ค้นหาหนังสือแบบ autocomplete
router.get("/mock/search", (req, res) => {
  const query = req.query.q?.toLowerCase() || "";

  if (!query) return res.json({ books: MOCK_LIBRARY });

  const startsWithTitle = [];
  const includesTitle = [];
  const includesAuthor = [];

  MOCK_LIBRARY.forEach((b) => {
    const title = b.title.toLowerCase();
    const author = b.author.toLowerCase();

    if (title.startsWith(query)) {
      startsWithTitle.push(b);
    } else if (title.includes(query)) {
      includesTitle.push(b);
    } else if (author.includes(query)) {
      includesAuthor.push(b);
    }
  });

  const sortedBooks = [...startsWithTitle, ...includesTitle, ...includesAuthor];

  res.json({ books: sortedBooks });
});

export default router;
