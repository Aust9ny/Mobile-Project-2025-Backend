// routes/borrows.js
import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";

const router = express.Router();

// ตัวแปรเก็บข้อมูลการยืม
const borrowHistories = {}; // { bookId: [{ userId, borrowDate, dueDate, extended }] }

// ฟังก์ชัน log ประวัติยืมแบบสวย
const logBorrowHistory = (bookId) => {
  const book = MOCK_LIBRARY.find(b => b.id === bookId);
  const history = borrowHistories[bookId] || [];

  console.log(`\n==================== BORROW HISTORY ====================`);
  console.log(`📖 หนังสือ: "${book?.title}" (ID: ${bookId})`);
  if (history.length === 0) {
    console.log("   ➤ ไม่มีผู้ใช้อยู่ในระบบยืมตอนนี้");
  } else {
    history.forEach(h => {
      const now = new Date();
      const borrowDate = new Date(h.borrowDate);
      const dueDate = new Date(h.dueDate);
      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000*60*60*24));
      const status = h.extended ? "✅ ยืมต่อแล้ว" : "⏳ ยังไม่ยืมต่อ";
      const overdue = daysLeft < 0 ? `⚠️ เกิน ${Math.abs(daysLeft)} วัน` : `${daysLeft} วันเหลือ`;

      console.log(`---------------------------------------------------------`);
      console.log(`   User       : ${h.userId}`);
      console.log(`   ยืม        : ${borrowDate.toLocaleString()}`);
      console.log(`   คืน        : ${dueDate.toLocaleString()}`);
      console.log(`   สถานะ     : ${status}`);
      console.log(`   เวลาที่เหลือ: ${overdue}`);
    });
  }
  console.log(`=========================================================\n`);
};

// ---------------------- ยืมหนังสือ ----------------------
router.post("/mock/:id/borrow", (req, res) => {
  const { id } = req.params;
  const { userId, action } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find((b) => b.userId === userId);

  if (action === "borrow") {
    if (userHistory) {
      console.log(`\n❌ [BORROW FAILED] User "${userId}" already borrowed "${book.title}"`);
      logBorrowHistory(book.id);
      return res.status(400).json({ error: "คุณยืมหนังสือเล่มนี้อยู่แล้ว" });
    }

    const borrowed = borrowHistories[book.id].length;
    if (borrowed >= book.total) {
      console.log(`\n❌ [BORROW FAILED] Book "${book.title}" is out of stock`);
      logBorrowHistory(book.id);
      return res.status(400).json({ error: "หนังสือหมด" });
    }

    const now = new Date();
    const dueDate = new Date(now.getTime() + 7*24*60*60*1000);

    borrowHistories[book.id].push({
      userId,
      borrowDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      extended: false
    });

    console.log(`\n✅ [BORROW SUCCESS] "${book.title}" borrowed by ${userId}`);
    logBorrowHistory(book.id);

    return res.json({ success: true, book: { ...book, borrowed: borrowHistories[book.id].length, available: book.total - borrowHistories[book.id].length, total: book.total } });
  }

  return res.status(400).json({ error: "Invalid action" });
});

// ---------------------- คืนหนังสือ ----------------------
router.post("/mock/:id/return", (req, res) => {
  const { id } = req.params;
  const { userId, borrowDate, dueDate } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  let userHistory = borrowHistories[book.id].find((b) => b.userId === userId);
  if (!userHistory && borrowDate && dueDate) {
    userHistory = { userId, borrowDate, dueDate, extended: false };
    borrowHistories[book.id].push(userHistory);
  }

  if (!userHistory) {
    console.log(`\n❌ [RETURN FAILED] User "${userId}" never borrowed "${book.title}"`);
    logBorrowHistory(book.id);
    return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
  }

  borrowHistories[book.id] = borrowHistories[book.id].filter(b => b.userId !== userId);

  console.log(`\n↩️ [RETURN SUCCESS] "${book.title}" returned by ${userId}`);
  logBorrowHistory(book.id);

  return res.json({ success: true, book: { ...book, borrowed: borrowHistories[book.id].length, available: book.total - borrowHistories[book.id].length, total: book.total } });
});

// ---------------------- ยืมต่อ ----------------------
router.post("/mock/:id/extend", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find((b) => b.userId === userId);
  if (!userHistory) {
    console.log(`\n❌ [EXTEND FAILED] User "${userId}" never borrowed "${book.title}"`);
    logBorrowHistory(book.id);
    return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
  }

  if (userHistory.extended) {
    console.log(`\n❌ [EXTEND FAILED] User "${userId}" already extended "${book.title}"`);
    logBorrowHistory(book.id);
    return res.status(400).json({ error: "คุณยืมต่อหนังสือเล่มนี้ไปแล้ว" });
  }

  const now = new Date();
  const dueDate = new Date(userHistory.dueDate);
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000*60*60*24));

  if (daysLeft > 3) {
    console.log(`\n❌ [EXTEND FAILED] "${book.title}" cannot extend yet`);
    logBorrowHistory(book.id);
    return res.status(400).json({ error: "ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน" });
  }

  if (daysLeft < 0) {
    console.log(`\n❌ [EXTEND FAILED] "${book.title}" overdue, cannot extend`);
    logBorrowHistory(book.id);
    return res.status(400).json({ error: "หนังสือเกินกำหนดคืนแล้ว กรุณาคืนก่อน" });
  }

  const newDueDate = new Date(dueDate.getTime() + 7*24*60*60*1000);
  userHistory.dueDate = newDueDate.toISOString();
  userHistory.extended = true;

  console.log(`\n🔄 [EXTEND SUCCESS] "${book.title}" extended by ${userId}`);
  logBorrowHistory(book.id);

  return res.json({ success: true, book: { ...book, borrowed: borrowHistories[book.id].length, available: book.total - borrowHistories[book.id].length, total: book.total } });
});

export default router;
