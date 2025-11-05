// routes/borrows.js
import express from "express";
import { MOCK_LIBRARY } from "../data/mockBooks.js";
const router = express.Router();

const borrowHistories = {};

const formatThaiDateTime = (dateString) => {
  const date = new Date(dateString);
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  const dayName = thaiDays[date.getDay()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `วัน${dayName}ที่ ${day} ${month} ${year} เวลา ${hours}:${minutes}:${seconds} น.`;
};

const formatThaiDate = (dateString) => {
  const date = new Date(dateString);
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  
  return `${day} ${month} ${year}`;
};

const logBorrowHistory = (bookId, action = '') => {
  const book = MOCK_LIBRARY.find(b => b.id === bookId);
  const history = borrowHistories[bookId] || [];

  const border = '═'.repeat(70);
  const line = '─'.repeat(70);

  console.log(`\n╔${border}╗`);
  console.log(`║  ประวัติการยืม - ${action}`.padEnd(72) + '║');
  console.log(`╠${border}╣`);
  console.log(`║  หนังสือ: "${book?.title}"`.padEnd(72) + '║');
  console.log(`║  ID: ${bookId}`.padEnd(72) + '║');
  console.log(`║  สถิติ: ทั้งหมด ${book?.total} เล่ม | ยืมไป ${history.length} เล่ม | เหลือ ${book?.total - history.length} เล่ม`.padEnd(72) + '║');
  console.log(`╠${border}╣`);

  if (history.length === 0) {
    console.log(`║  ไม่มีผู้ใช้อยู่ในระบบยืมตอนนี้`.padEnd(72) + '║');
  } else {
    history.forEach((h, index) => {
      const now = new Date();
      const borrowDate = new Date(h.borrowDate);
      const dueDate = new Date(h.dueDate);
      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000*60*60*24));
      const status = h.extended ? "ยืมต่อแล้ว" : "ยังไม่ยืมต่อ";
      
      let timeStatus;
      if (daysLeft < 0) {
        timeStatus = `เกินกำหนด ${Math.abs(daysLeft)} วัน`;
      } else if (daysLeft <= 3) {
        timeStatus = `เหลือ ${daysLeft} วัน (ใกล้ครบกำหนด)`;
      } else {
        timeStatus = `เหลือ ${daysLeft} วัน`;
      }

      console.log(`║`.padEnd(72) + '║');
      console.log(`║  ผู้ยืมคนที่ ${index + 1}:`.padEnd(72) + '║');
      console.log(`║     User ID    : ${h.userId}`.padEnd(72) + '║');
      console.log(`║     วันที่ยืม : ${formatThaiDateTime(h.borrowDate)}`.padEnd(72) + '║');
      console.log(`║     กำหนดคืน : ${formatThaiDateTime(h.dueDate)}`.padEnd(72) + '║');
      console.log(`║     สถานะ    : ${status}`.padEnd(72) + '║');
      console.log(`║     เวลาคงเหลือ: ${timeStatus}`.padEnd(72) + '║');
      
      if (index < history.length - 1) {
        console.log(`║  ${line}`.padEnd(72) + '║');
      }
    });
  }
  
  console.log(`╚${border}╝\n`);
};

router.get("/mock/:id/stats", (req, res) => {
  const { id } = req.params;
  
  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) {
    console.log(`\nไม่พบหนังสือ ID: ${id}`);
    return res.status(404).json({ error: "Book not found" });
  }

  const borrowed = borrowHistories[book.id]?.length || 0;
  const available = book.total - borrowed;

  const now = new Date();
  const timestamp = formatThaiDateTime(now.toISOString());

  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ดึงสถิติหนังสือ`);
  console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
  console.log(`║  หนังสือ: "${book.title}"`);
  console.log(`║  เวลา: ${timestamp}`);
  console.log(`║  ทั้งหมด: ${book.total} เล่ม | ยืมแล้ว: ${borrowed} เล่ม | คงเหลือ: ${available} เล่ม`);
  console.log(`╚═══════════════════════════════════════════════════════════════════╝\n`);

  return res.json({
    bookId: book.id,
    title: book.title,
    total: book.total,
    borrowed: borrowed,
    available: available
  });
});

router.post("/mock/:id/borrow", (req, res) => {
  const { id } = req.params;
  const { userId, action } = req.body;

  console.log(`\nได้รับคำขอยืมหนังสือ - User: ${userId}, Book ID: ${id}, Action: ${action}`);

  if (!userId) {
    console.log(`ยืมไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) {
    console.log(`ยืมไม่สำเร็จ: ไม่พบหนังสือ ID ${id}`);
    return res.status(404).json({ error: "Book not found" });
  }

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find((b) => b.userId === userId);

  if (action === "borrow") {
    if (userHistory) {
      console.log(`\nยืมไม่สำเร็จ: ผู้ใช้ "${userId}" ยืมหนังสือ "${book.title}" อยู่แล้ว`);
      console.log(`   เวลา: ${formatThaiDateTime(new Date().toISOString())}\n`);
      logBorrowHistory(book.id, 'ยืมไม่สำเร็จ (ยืมซ้ำ)');
      return res.status(400).json({ error: "คุณยืมหนังสือเล่มนี้อยู่แล้ว" });
    }

    const borrowed = borrowHistories[book.id].length;
    if (borrowed >= book.total) {
      console.log(`\nยืมไม่สำเร็จ: หนังสือ "${book.title}" หมดแล้ว`);
      console.log(`   เวลา: ${formatThaiDateTime(new Date().toISOString())}\n`);
      logBorrowHistory(book.id, 'ยืมไม่สำเร็จ (หนังสือหมด)');
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

    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  ยืมหนังสือสำเร็จ`);
    console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  หนังสือ: "${book.title}"`);
    console.log(`║  ผู้ยืม: ${userId}`);
    console.log(`║  วันที่ยืม: ${formatThaiDateTime(now.toISOString())}`);
    console.log(`║  กำหนดคืน: ${formatThaiDateTime(dueDate.toISOString())}`);
    console.log(`║  ระยะเวลา: 7 วัน`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

    logBorrowHistory(book.id, 'ยืมสำเร็จ');

    return res.json({ 
      success: true,
      dueDate: dueDate.toISOString(),
      book: { 
        ...book, 
        borrowed: borrowHistories[book.id].length, 
        available: book.total - borrowHistories[book.id].length, 
        total: book.total 
      },
      updatedStats: { // ✅ เพิ่มส่วนนี้
        total: book.total,
        borrowed: borrowHistories[book.id].length,
        available: book.total - borrowHistories[book.id].length
      }
    });
  }

  console.log(`Invalid action: ${action}`);
  return res.status(400).json({ error: "Invalid action" });
});

router.post("/mock/:id/return", (req, res) => {
  const { id } = req.params;
  const { userId, borrowDate, dueDate } = req.body;

  console.log(`\nได้รับคำขอคืนหนังสือ - User: ${userId}, Book ID: ${id}`);

  if (!userId) {
    console.log(`คืนไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) {
    console.log(`คืนไม่สำเร็จ: ไม่พบหนังสือ ID ${id}`);
    return res.status(404).json({ error: "Book not found" });
  }

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  let userHistory = borrowHistories[book.id].find((b) => b.userId === userId);
  if (!userHistory && borrowDate && dueDate) {
    userHistory = { userId, borrowDate, dueDate, extended: false };
    borrowHistories[book.id].push(userHistory);
  }

  if (!userHistory) {
    console.log(`\nคืนไม่สำเร็จ: ผู้ใช้ "${userId}" ไม่เคยยืมหนังสือ "${book.title}"`);
    console.log(`   เวลา: ${formatThaiDateTime(new Date().toISOString())}\n`);
    logBorrowHistory(book.id, 'คืนไม่สำเร็จ (ไม่มีประวัติยืม)');
    return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
  }

  const now = new Date();
  const originalDueDate = new Date(userHistory.dueDate);
  const daysLate = Math.ceil((now.getTime() - originalDueDate.getTime()) / (1000*60*60*24));
  const isLate = daysLate > 0;

  borrowHistories[book.id] = borrowHistories[book.id].filter(b => b.userId !== userId);

  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  คืนหนังสือสำเร็จ`);
  console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
  console.log(`║  หนังสือ: "${book.title}"`);
  console.log(`║  ผู้คืน: ${userId}`);
  console.log(`║  วันที่ยืม: ${formatThaiDateTime(userHistory.borrowDate)}`);
  console.log(`║  กำหนดคืน: ${formatThaiDateTime(userHistory.dueDate)}`);
  console.log(`║  วันที่คืนจริง: ${formatThaiDateTime(now.toISOString())}`);
  
  if (isLate) {
    console.log(`║  สถานะ: คืนเกินกำหนด ${daysLate} วัน`);
  } else {
    console.log(`║  สถานะ: คืนตรงเวลา`);
  }
  
  console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

  logBorrowHistory(book.id, 'คืนสำเร็จ');

  return res.json({ 
    success: true,
    isLate,
    daysLate: isLate ? daysLate : 0,
    book: { 
      ...book, 
      borrowed: borrowHistories[book.id].length, 
      available: book.total - borrowHistories[book.id].length, 
      total: book.total 
    },
    updatedStats: { // ✅ เพิ่มส่วนนี้
      total: book.total,
      borrowed: borrowHistories[book.id].length,
      available: book.total - borrowHistories[book.id].length
    }
  });
});

router.post("/mock/:id/extend", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  console.log(`\nได้รับคำขอยืมต่อหนังสือ - User: ${userId}, Book ID: ${id}`);

  if (!userId) {
    console.log(`ยืมต่อไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  const book = MOCK_LIBRARY.find((b) => b.id === id);
  if (!book) {
    console.log(`ยืมต่อไม่สำเร็จ: ไม่พบหนังสือ ID ${id}`);
    return res.status(404).json({ error: "Book not found" });
  }

  if (!borrowHistories[book.id]) borrowHistories[book.id] = [];

  const userHistory = borrowHistories[book.id].find((b) => b.userId === userId);
  if (!userHistory) {
    console.log(`\nยืมต่อไม่สำเร็จ: ผู้ใช้ "${userId}" ไม่เคยยืมหนังสือ "${book.title}"`);
    console.log(`   เวลา: ${formatThaiDateTime(new Date().toISOString())}\n`);
    logBorrowHistory(book.id, 'ยืมต่อไม่สำเร็จ (ไม่มีประวัติยืม)');
    return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
  }

  if (userHistory.extended) {
    console.log(`\nยืมต่อไม่สำเร็จ: ผู้ใช้ "${userId}" ยืมต่อหนังสือ "${book.title}" ไปแล้ว`);
    console.log(`   เวลา: ${formatThaiDateTime(new Date().toISOString())}\n`);
    logBorrowHistory(book.id, 'ยืมต่อไม่สำเร็จ (ยืมต่อแล้ว)');
    return res.status(400).json({ error: "คุณยืมต่อหนังสือเล่มนี้ไปแล้ว" });
  }

  const now = new Date();
  const dueDate = new Date(userHistory.dueDate);
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000*60*60*24));

  if (daysLeft > 3) {
    console.log(`\nยืมต่อไม่สำเร็จ: ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน (เหลือ ${daysLeft} วัน)`);
    console.log(`   เวลา: ${formatThaiDateTime(now.toISOString())}\n`);
    logBorrowHistory(book.id, 'ยืมต่อไม่สำเร็จ (ยังไม่ถึงเวลา)');
    return res.status(400).json({ error: "ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน" });
  }

  if (daysLeft < 0) {
    console.log(`\nยืมต่อไม่สำเร็จ: หนังสือเกินกำหนดคืนแล้ว ${Math.abs(daysLeft)} วัน`);
    console.log(`   เวลา: ${formatThaiDateTime(now.toISOString())}\n`);
    logBorrowHistory(book.id, 'ยืมต่อไม่สำเร็จ (เกินกำหนด)');
    return res.status(400).json({ error: "หนังสือเกินกำหนดคืนแล้ว กรุณาคืนก่อน" });
  }

  const oldDueDate = new Date(userHistory.dueDate);
  const newDueDate = new Date(dueDate.getTime() + 7*24*60*60*1000);
  userHistory.dueDate = newDueDate.toISOString();
  userHistory.extended = true;

  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ยืมต่อหนังสือสำเร็จ`);
  console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
  console.log(`║  หนังสือ: "${book.title}"`);
  console.log(`║  ผู้ยืมต่อ: ${userId}`);
  console.log(`║  วันที่ยืมต่อ: ${formatThaiDateTime(now.toISOString())}`);
  console.log(`║  กำหนดคืนเดิม: ${formatThaiDateTime(oldDueDate.toISOString())}`);
  console.log(`║  กำหนดคืนใหม่: ${formatThaiDateTime(newDueDate.toISOString())}`);
  console.log(`║  ขยายเวลาเพิ่มอีก 7 วัน`);
  console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

  logBorrowHistory(book.id, 'ยืมต่อสำเร็จ');

  return res.json({ 
    success: true,
    newDueDate: newDueDate.toISOString(),
    book: { 
      ...book, 
      borrowed: borrowHistories[book.id].length, 
      available: book.total - borrowHistories[book.id].length, 
      total: book.total 
    },
    updatedStats: { // ✅ เพิ่มส่วนนี้
      total: book.total,
      borrowed: borrowHistories[book.id].length,
      available: book.total - borrowHistories[book.id].length
    }
  });
});

export default router;
