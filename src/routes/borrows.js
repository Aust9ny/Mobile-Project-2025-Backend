import express from "express";
import { pool } from "../config/db.js";

const router = express.Router();

// ---------------------- Helper Functions ----------------------
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

// ---------------------- User Borrows ----------------------

// ✅ ดึงรายการหนังสือที่ user กำลังยืมอยู่
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const [borrows] = await pool.query(
      `SELECT 
        br.*,
        b.title,
        b.author,
        b.cover,
        b.genre
      FROM borrows br
      JOIN books b ON br.book_id = b.id
      WHERE br.user_id = ? AND br.status = "borrowed"
      ORDER BY br.due_date ASC`,
      [userId]
    );

    console.log(`\n📚 [User Borrows] User: ${userId} → ${borrows.length} รายการ`);

    res.json({ borrows, totalItems: borrows.length });
  } catch (error) {
    console.error('Error fetching user borrows:', error);
    res.status(500).json({ error: 'Failed to fetch borrows' });
  }
});

// ---------------------- Book Stats ----------------------

// ✅ ดึงสถิติหนังสือ (คงเหลือ/ยืมแล้ว)
router.get("/mock/:id/stats", async (req, res) => {
  const { id } = req.params;
  
  try {
    const [books] = await pool.query('SELECT * FROM books WHERE id = ?', [id]);
    
    if (books.length === 0) {
      console.log(`\nไม่พบหนังสือ ID: ${id}`);
      return res.status(404).json({ error: "Book not found" });
    }

    const book = books[0];
    const borrowed = book.total - book.available;
    const available = book.available;

    const timestamp = formatThaiDateTime(new Date().toISOString());

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
  } catch (error) {
    console.error('Error fetching book stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------------------- Borrow Book ----------------------

// ✅ ยืมหนังสือ
router.post("/mock/:id/borrow", async (req, res) => {
  const { id } = req.params;
  const { userId, action } = req.body;

  console.log(`\nได้รับคำขอยืมหนังสือ - User: ${userId}, Book ID: ${id}, Action: ${action}`);

  if (!userId) {
    console.log(`ยืมไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  if (action !== "borrow") {
    return res.status(400).json({ error: "Invalid action" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบหนังสือ (lock row)
    const [books] = await connection.query(
      'SELECT * FROM books WHERE id = ? FOR UPDATE',
      [id]
    );

    if (books.length === 0) {
      await connection.rollback();
      console.log(`ยืมไม่สำเร็จ: ไม่พบหนังสือ ID ${id}`);
      return res.status(404).json({ error: "Book not found" });
    }

    const book = books[0];

    // ตรวจสอบว่า user ยืมอยู่แล้วหรือไม่
    const [existingBorrow] = await connection.query(
      'SELECT id FROM borrows WHERE book_id = ? AND user_id = ? AND status = "borrowed"',
      [id, userId]
    );

    if (existingBorrow.length > 0) {
      await connection.rollback();
      console.log(`\nยืมไม่สำเร็จ: ผู้ใช้ "${userId}" ยืมหนังสือ "${book.title}" อยู่แล้ว`);
      return res.status(400).json({ error: "คุณยืมหนังสือเล่มนี้อยู่แล้ว" });
    }

    // ตรวจสอบว่ามีหนังสือเหลือหรือไม่
    if (book.available <= 0) {
      await connection.rollback();
      console.log(`\nยืมไม่สำเร็จ: หนังสือ "${book.title}" หมดแล้ว`);
      return res.status(400).json({ error: "หนังสือหมด" });
    }

    // คำนวณวันครบกำหนด (7 วัน)
    const now = new Date();
    const dueDate = new Date(now.getTime() + 7*24*60*60*1000);

    // บันทึกการยืม
    await connection.query(
      'INSERT INTO borrows (book_id, user_id, borrow_date, due_date, status) VALUES (?, ?, ?, ?, "borrowed")',
      [id, userId, now, dueDate]
    );

    // ลดจำนวนหนังสือที่ available
    await connection.query(
      'UPDATE books SET available = available - 1 WHERE id = ?',
      [id]
    );

    // ดึงข้อมูลใหม่
    const [updatedBooks] = await connection.query('SELECT * FROM books WHERE id = ?', [id]);
    const updatedBook = updatedBooks[0];

    await connection.commit();

    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  ยืมหนังสือสำเร็จ`);
    console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  หนังสือ: "${book.title}"`);
    console.log(`║  ผู้ยืม: ${userId}`);
    console.log(`║  วันที่ยืม: ${formatThaiDateTime(now.toISOString())}`);
    console.log(`║  กำหนดคืน: ${formatThaiDateTime(dueDate.toISOString())}`);
    console.log(`║  ระยะเวลา: 7 วัน`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

    return res.json({ 
      success: true,
      dueDate: dueDate.toISOString(),
      book: updatedBook,
      updatedStats: {
        total: updatedBook.total,
        borrowed: updatedBook.total - updatedBook.available,
        available: updatedBook.available
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error borrowing book:', error);
    res.status(500).json({ error: 'Failed to borrow book' });
  } finally {
    connection.release();
  }
});

// ---------------------- Return Book ----------------------

// ✅ คืนหนังสือ
router.post("/mock/:id/return", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  console.log(`\nได้รับคำขอคืนหนังสือ - User: ${userId}, Book ID: ${id}`);

  if (!userId) {
    console.log(`คืนไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // หาการยืมที่ active
    const [borrows] = await connection.query(
      'SELECT * FROM borrows WHERE book_id = ? AND user_id = ? AND status = "borrowed" FOR UPDATE',
      [id, userId]
    );

    if (borrows.length === 0) {
      await connection.rollback();
      console.log(`\nคืนไม่สำเร็จ: ผู้ใช้ "${userId}" ไม่เคยยืมหนังสือ ID ${id}`);
      return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
    }

    const borrow = borrows[0];
    const now = new Date();
    const dueDate = new Date(borrow.due_date);
    const daysLate = Math.ceil((now.getTime() - dueDate.getTime()) / (1000*60*60*24));
    const isLate = daysLate > 0;

    // อัปเดตสถานะการยืม
    await connection.query(
      'UPDATE borrows SET status = "returned", return_date = ? WHERE id = ?',
      [now, borrow.id]
    );

    // เพิ่มจำนวนหนังสือที่ available
    await connection.query(
      'UPDATE books SET available = available + 1 WHERE id = ?',
      [id]
    );

    // ดึงข้อมูลหนังสือใหม่
    const [books] = await connection.query('SELECT * FROM books WHERE id = ?', [id]);
    const book = books[0];

    await connection.commit();

    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  คืนหนังสือสำเร็จ`);
    console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  หนังสือ: "${book.title}"`);
    console.log(`║  ผู้คืน: ${userId}`);
    console.log(`║  วันที่ยืม: ${formatThaiDateTime(borrow.borrow_date)}`);
    console.log(`║  กำหนดคืน: ${formatThaiDateTime(borrow.due_date)}`);
    console.log(`║  วันที่คืนจริง: ${formatThaiDateTime(now.toISOString())}`);
    
    if (isLate) {
      console.log(`║  สถานะ: คืนเกินกำหนด ${daysLate} วัน`);
    } else {
      console.log(`║  สถานะ: คืนตรงเวลา`);
    }
    
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

    return res.json({ 
      success: true,
      isLate,
      daysLate: isLate ? daysLate : 0,
      book,
      updatedStats: {
        total: book.total,
        borrowed: book.total - book.available,
        available: book.available
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error returning book:', error);
    res.status(500).json({ error: 'Failed to return book' });
  } finally {
    connection.release();
  }
});

// ---------------------- Extend Borrow ----------------------

// ✅ ยืมต่อหนังสือ
router.post("/mock/:id/extend", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  console.log(`\nได้รับคำขอยืมต่อหนังสือ - User: ${userId}, Book ID: ${id}`);

  if (!userId) {
    console.log(`ยืมต่อไม่สำเร็จ: ไม่พบ userId`);
    return res.status(400).json({ error: "Missing userId" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // หาการยืมที่ active
    const [borrows] = await connection.query(
      'SELECT * FROM borrows WHERE book_id = ? AND user_id = ? AND status = "borrowed" FOR UPDATE',
      [id, userId]
    );

    if (borrows.length === 0) {
      await connection.rollback();
      console.log(`\nยืมต่อไม่สำเร็จ: ผู้ใช้ "${userId}" ไม่เคยยืมหนังสือ ID ${id}`);
      return res.status(400).json({ error: "คุณไม่ได้ยืมหนังสือเล่มนี้" });
    }

    const borrow = borrows[0];

    if (borrow.extended) {
      await connection.rollback();
      console.log(`\nยืมต่อไม่สำเร็จ: ผู้ใช้ "${userId}" ยืมต่อหนังสือแล้ว`);
      return res.status(400).json({ error: "คุณยืมต่อหนังสือเล่มนี้ไปแล้ว" });
    }

    const now = new Date();
    const dueDate = new Date(borrow.due_date);
    const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000*60*60*24));

    if (daysLeft > 3) {
      await connection.rollback();
      console.log(`\nยืมต่อไม่สำเร็จ: ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน (เหลือ ${daysLeft} วัน)`);
      return res.status(400).json({ error: "ยืมต่อได้เมื่อเหลือเวลาไม่เกิน 3 วัน" });
    }

    if (daysLeft < 0) {
      await connection.rollback();
      console.log(`\nยืมต่อไม่สำเร็จ: หนังสือเกินกำหนดคืนแล้ว ${Math.abs(daysLeft)} วัน`);
      return res.status(400).json({ error: "หนังสือเกินกำหนดคืนแล้ว กรุณาคืนก่อน" });
    }

    // คำนวณวันครบกำหนดใหม่ (เพิ่ม 7 วัน)
    const newDueDate = new Date(dueDate.getTime() + 7*24*60*60*1000);

    // อัปเดตการยืม
    await connection.query(
      'UPDATE borrows SET due_date = ?, extended = TRUE WHERE id = ?',
      [newDueDate, borrow.id]
    );

    // ดึงข้อมูลหนังสือ
    const [books] = await connection.query('SELECT * FROM books WHERE id = ?', [id]);
    const book = books[0];

    await connection.commit();

    console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  ยืมต่อหนังสือสำเร็จ`);
    console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  หนังสือ: "${book.title}"`);
    console.log(`║  ผู้ยืมต่อ: ${userId}`);
    console.log(`║  วันที่ยืมต่อ: ${formatThaiDateTime(now.toISOString())}`);
    console.log(`║  กำหนดคืนเดิม: ${formatThaiDateTime(borrow.due_date)}`);
    console.log(`║  กำหนดคืนใหม่: ${formatThaiDateTime(newDueDate.toISOString())}`);
    console.log(`║  ขยายเวลาเพิ่มอีก 7 วัน`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

    return res.json({ 
      success: true,
      newDueDate: newDueDate.toISOString(),
      book,
      updatedStats: {
        total: book.total,
        borrowed: book.total - book.available,
        available: book.available
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error extending borrow:', error);
    res.status(500).json({ error: 'Failed to extend borrow' });
  } finally {
    connection.release();
  }
});

// ---------------------- Favorites (เพิ่มใหม่) ----------------------

// ✅ ดึงรายการโปรดของ user
router.get('/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // หา user_id จาก temp_user_id หรือใช้ตรงๆ
    const [favorites] = await pool.query(
      `SELECT b.* 
       FROM user_favorites uf
       JOIN books b ON uf.book_id = b.id
       WHERE uf.user_id = ?
       ORDER BY uf.created_at DESC`,
      [userId]
    );

    console.log(`\n❤️ [Favorites] User: ${userId} → ${favorites.length} รายการ`);

    return res.json({ favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return res.status(500).json({ error: 'Failed to load favorites' });
  }
});

// ✅ เพิ่ม/ลบหนังสือจาก Favorites
router.post('/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { bookId, action } = req.body;

    if (!bookId || !action) {
      return res.status(400).json({ error: 'bookId และ action จำเป็นต้องมี' });
    }

    if (action === 'add') {
      // ตรวจสอบว่ามีอยู่แล้วหรือยัง
      const [exists] = await pool.query(
        'SELECT id FROM user_favorites WHERE user_id = ? AND book_id = ?',
        [userId, bookId]
      );

      if (exists.length > 0) {
        return res.json({ message: 'มีอยู่แล้วในรายการโปรด' });
      }

      // เพิ่มใหม่
      await pool.query(
        'INSERT INTO user_favorites (user_id, book_id) VALUES (?, ?)',
        [userId, bookId]
      );

      console.log(`❤️ [Add Favorite] User: ${userId} → Book: ${bookId}`);
      return res.json({ message: 'เพิ่มในรายการโปรดสำเร็จ' });
    }

    if (action === 'remove') {
      await pool.query(
        'DELETE FROM user_favorites WHERE user_id = ? AND book_id = ?',
        [userId, bookId]
      );

      console.log(`💔 [Remove Favorite] User: ${userId} → Book: ${bookId}`);
      return res.json({ message: 'ลบออกจากรายการโปรดแล้ว' });
    }

    return res.status(400).json({ error: 'action ไม่ถูกต้อง (add/remove เท่านั้น)' });
  } catch (error) {
    console.error('Error updating favorites:', error);
    return res.status(500).json({ error: 'Failed to update favorites' });
  }
});

export default router;