import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRoutes from "./routes/users.js";
import booksRoutes from "./routes/books.js";
import borrowsRoutes from "./routes/borrows.js";


dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Routes

app.use("/api/users", usersRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/borrows", borrowsRoutes);

app.get("/", (req, res) => {
  res.send("📚 Library API is running...");
});

import pool from "./config/db.js";

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS now");
    res.json({ success: true, time: rows[0].now });
    console.log("DB Connection now is :", rows[0].now);
  } catch (err) {
    console.error("DB Connection failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
