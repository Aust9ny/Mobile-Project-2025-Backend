import express from "express";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateToken, authenticateFirebase } from '../middleware/auth.js';

const router = express.Router();

// POST register with email/password
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const [result] = await pool.query(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name]
    );
    
    // Generate JWT
    const token = jwt.sign(
      { id: result.insertId, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({ 
      token,
      user: { id: result.insertId, email, name }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST login with email/password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST Firebase login
router.post('/firebase-login', authenticateFirebase, async (req, res) => {
  try {
    const { uid, email } = req.user;
    const { name } = req.body;
    
    // Check if user exists, create if not
    let [users] = await pool.query('SELECT * FROM users WHERE firebase_uid = ? OR email = ?', [uid, email]);
    let user = users[0];
    
    if (!user) {
      // Create new user
      const [result] = await pool.query(
        'INSERT INTO users (firebase_uid, email, name) VALUES (?, ?, ?)',
        [uid, email, name || email.split('@')[0]]
      );
      user = { id: result.insertId, firebase_uid: uid, email, name: name || email.split('@')[0] };
    } else if (!user.firebase_uid) {
      // Link existing email user to Firebase
      await pool.query('UPDATE users SET firebase_uid = ? WHERE id = ?', [uid, user.id]);
      user.firebase_uid = uid;
    }
    
    res.json({ 
      user: { id: user.id, email: user.email, name: user.name, firebase_uid: user.firebase_uid }
    });
  } catch (error) {
    console.error('Firebase login error:', error);
    res.status(500).json({ error: 'Firebase login failed' });
  }
});

// GET current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    let user;
    
    if (req.user.authType === 'firebase') {
      const [users] = await pool.query('SELECT * FROM users WHERE firebase_uid = ?', [req.user.uid]);
      user = users[0];
    } else {
      const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      user = users[0];
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        firebase_uid: user.firebase_uid 
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET all users (protected)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, name, created_at FROM users');
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// GET user by ID
router.get("/:id", (req, res) => {
  res.json({ message: `Get user ${req.params.id}` });
});

// POST create user
router.post("/", (req, res) => {
  res.json({ message: "Create user", data: req.body });
});

// PUT update user
router.put("/:id", (req, res) => {
  res.json({ message: `Update user ${req.params.id}`, data: req.body });
});

// DELETE user
router.delete("/:id", (req, res) => {
  res.json({ message: `Delete user ${req.params.id}` });
});

export default router;