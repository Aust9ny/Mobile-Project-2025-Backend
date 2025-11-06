import express from "express";
import cors from "cors";
import usersRoutes from "./routes/users.js";
import booksRoutes from "./routes/books.js";
import borrowsRoutes from "./routes/borrows.js";
import library from "./routes/library.js";
import { authenticateToken } from "./middleware/auth.js";
import { pool, admin } from "./config/db.js";

const app = express();

// ✅ CORS Configuration - อนุญาตให้ทุก origin เข้าถึง API
app.use(cors({
  origin: '*', // หรือระบุ origin ที่แน่นอน เช่น 'http://localhost:8081'
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ Request Logger Middleware
app.use((req, res, next) => {
  try {
    const fullForwardedIp = req.headers['x-forwarded-for'];
    const socketIp = req.socket.remoteAddress;
    const clientIp = (fullForwardedIp && fullForwardedIp.split(',')[0].trim()) || socketIp;

    console.log('\n--- 🔵 NEW REQUEST ---');
    console.log(`[${new Date().toLocaleTimeString('th-TH')}] ${req.method} ${req.path}`);
    console.log(`[IP] ${clientIp}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`[Body]`, req.body);
    }
    
    req.clientIp = clientIp;
  } catch (err) {
    console.error("Error in request logger:", err);
  }
  
  next();
});

// --- Routes ---
app.use("/api/users", usersRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/borrows", borrowsRoutes);
app.use("/api/library", authenticateToken, library);

// Root
app.get("/", (req, res) => {
  res.send("📚 Library API is running...");
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ------------------------
// Test Routes
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
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, deletedCount: result.affectedRows });
  } catch (err) {
    console.error("DB Delete failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/test-books", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM books");
    res.json({ success: true, books: rows });
  } catch (err) {
    console.error("DB Query failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ 404 Handler
app.use((req, res) => {
  console.log(`⚠️ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ✅ Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

export default app;