import express from "express";

const router = express.Router();

// GET all borrows
router.get("/", (req, res) => {
  res.json({ message: "Get all borrows" });
});

// GET borrow by ID
router.get("/:id", (req, res) => {
  res.json({ message: `Get borrow ${req.params.id}` });
});

// POST create borrow
router.post("/", (req, res) => {
  res.json({ message: "Create borrow", data: req.body });
});

// PUT update borrow
router.put("/:id", (req, res) => {
  res.json({ message: `Update borrow ${req.params.id}`, data: req.body });
});

// DELETE borrow
router.delete("/:id", (req, res) => {
  res.json({ message: `Delete borrow ${req.params.id}` });
});

export default router;