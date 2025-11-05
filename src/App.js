import express from "express";
import cors from "cors";
import usersRoutes from "./routes/users.js";
import booksRoutes from "./routes/books.js";
import borrowsRoutes from "./routes/borrows.js";
import library from "./routes/library.js";
import { authenticateToken } from "./middleware/auth.js";
const app = express();

app.use(cors());
app.use(express.json());

import { pool, admin } from "./config/db.js";


// --- Routes ---

app.use("/api/users", usersRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/borrows", borrowsRoutes);
// Apply the checkAuth middleware to all routes in library.js
app.use("/api/library", authenticateToken, library);

// Root
app.get("/", (req, res) => {
  res.send("📚 Library API is running...");
});

app.use((req, res, next) => {
  try {
    // ดึง IP แบบเต็มๆ (อาจมีหลาย IP ถ้าผ่าน Proxy)
    const fullForwardedIp = req.headers['x-forwarded-for'];
    // ดึง IP จากการเชื่อมต่อโดยตรง
    const socketIp = req.socket.remoteAddress;

    // เลือก IP ที่จะใช้ (ถ้ามี x-forwarded-for ให้ใช้ค่าแรกสุด, ถ้าไม่ก็ใช้ socketIp)
    const clientIp = (fullForwardedIp && fullForwardedIp.split(',')[0].trim()) || socketIp;

    // Log ทุกอย่างที่เรามี เพื่อให้คุณเห็นแบบ "เต็มๆ"
    console.log('--- 🛑 NEW REQUEST 🛑 ---');
    console.log(`[Request] ${req.method} ${req.path}`);
    console.log(`[IP Info] socket.remoteAddress: ${socketIp}`);
    console.log(`[IP Info] x-forwarded-for: ${fullForwardedIp}`);
    console.log(`[IP Info] Final Client IP: ${clientIp}`);
    
    // บันทึก IP ที่เราเลือกไว้ใน req object (เผื่อใช้ภายหลัง)
    req.clientIp = clientIp;

  } catch (err) {
    console.error("Error retrieving client IP:", err);
  }
  
  // ⭐️ สำคัญ: ส่งต่อไปยัง route handler
  next();
});


// ------------------------
// Test Users Table
// ------------------------
app.get("/api/test-users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error("DB Query failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/test-delete-users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ success: false, error: "Missing id" });

    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, deletedCount: result.affectedRows });
  } catch (err) {
    console.error("DB Delete failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// Test Books Table
// ------------------------
app.get("/api/test-books", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM books");
    res.json({ success: true, books: rows });
  } catch (err) {
    console.error("DB Query failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default app;
