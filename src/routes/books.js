import express from "express";

const router = express.Router();

// GET all books
router.get("/", (req, res) => {
  res.json({ message: "Get all books" });
});

// GET book by ID
router.get("/:id", (req, res) => {
  res.json({ message: `Get book ${req.params.id}` });
});

// POST create book
router.post("/", (req, res) => {
  res.json({ message: "Create book", data: req.body });
});

// PUT update book
router.put("/:id", (req, res) => {
  res.json({ message: `Update book ${req.params.id}`, data: req.body });
});

// DELETE book
router.delete("/:id", (req, res) => {
  res.json({ message: `Delete book ${req.params.id}` });
});

export default router;