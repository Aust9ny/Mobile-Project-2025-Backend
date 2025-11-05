import express from "express";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {pool} from '../config/db.js';
import { authenticateToken, authenticateFirebase } from '../middleware/auth.js';

const router = express.Router();

// POST register with email/password (aligned to current schema)
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, username, first_name, last_name, phone_number } = req.body || {};

    if (!email && !username) {
      return res.status(400).json({ error: 'email or username is required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'password is required' });
    }

    // Derive names
    let fName = first_name;
    let lName = last_name;
    if ((!fName || !lName) && name) {
      const parts = String(name).trim().split(/\s+/);
      fName = fName || parts[0] || '';
      lName = lName || (parts.slice(1).join(' ') || '');
    }
    fName = fName || '';
    lName = lName || '';

    // login_identifier priority: email > username
    const login_identifier = email || username;

    // Check if user exists by email/username/login_identifier
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ? OR login_identifier = ? OR phone_number = ? LIMIT 1',
      [email || null, username || null, login_identifier, phone_number || null]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user aligned with schema
    const [result] = await pool.query(
      'INSERT INTO users (uid, first_name, last_name, login_identifier, username, password, email, phone_number, auth_provider, status) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, \"email\", \"active\")',
      [fName, lName, login_identifier, username || null, hashedPassword, email || null, phone_number || null]
    );

    // Generate tokens
    const { access, refresh } = buildTokens({ id: result.insertId, email: email || null, username: username || null, is_admin: 0 });

    res.status(201).json({
      token: access,
      refresh_token: refresh,
      user: { id: result.insertId, email: email || null, username: username || null, phone_number: phone_number || null, first_name: fName, last_name: lName, name: (fName + ' ' + lName).trim() }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Helpers for token issuance
const buildTokens = (user) => {
  const access = jwt.sign(
    { id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refresh = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: `${process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30}d` }
  );
  return { access, refresh };
};

// POST login with identifier (email or username) and password
router.post('/login', async (req, res) => {
  try {
    const { email, username, phone_number, identifier, password } = req.body || {};
    const lookup = identifier || email || username;
    if (!lookup || !password) {
      return res.status(400).json({ error: 'identifier (email or username) and password are required' });
    }

    // Find user by email/username/login_identifier
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR username = ? OR login_identifier = ? OR phone_number = ? LIMIT 1',
      [lookup, lookup, lookup, lookup]
    );
    const user = users[0];

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const { access, refresh } = buildTokens(user);

    res.json({
      token: access,
      refresh_token: refresh,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        name: ((user.first_name || '') + ' ' + (user.last_name || '')).trim(),
      }
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
    const { first_name, last_name } = req.body || {};


    console.log('[DEBUG] req.body:', req.body);
    console.log('[DEBUG] req.user:', req.user);

    // Try to find by uid or email
    let [rows] = await pool.query('SELECT * FROM users WHERE uid = ? OR email = ? LIMIT 1', [uid, email]);
    let user = rows[0];



    if (!user) {
      const [ins] = await pool.query(
        'INSERT INTO users (uid, first_name, last_name, login_identifier, username, password, email, phone_number, auth_provider, status) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, "firebase", "active")',
        [uid, first_name || '', last_name || '', email || uid, email || null]
      );
      ;[rows] = await pool.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
      user = rows[0];
    } else {
      // Ensure uid is linked
      if (!user.uid) {
        await pool.query('UPDATE users SET uid = ? WHERE id = ?', [uid, user.id]);
        user.uid = uid;
      }
      // Optionally update names if provided
      if (first_name !== undefined || last_name !== undefined) {
        await pool.query('UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE id = ?', [first_name || null, last_name || null, user.id]);
        ;[rows] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
        user = rows[0];
      }
    }
    const { access, refresh } = buildTokens(user);
    console.log('[DEBUG] JWT_SECRET:', process.env.JWT_SECRET ? 'OK' : 'MISSING!!!');

    return res.json({
      token: access,
      refresh_token: refresh,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
      }
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
      const [users] = await pool.query('SELECT * FROM users WHERE uid = ?', [req.user.uid]);
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
        username: user.username,
        phone_number: user.phone_number,
        first_name: user.first_name,
        last_name: user.last_name,
        name: ((user.first_name || '') + ' ' + (user.last_name || '')).trim(),
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

// GET user by ID (protected)
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, name, created_at, firebase_uid FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: users[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// PUT update current user profile
router.put("/me", authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    let userId;
    if (req.user.authType === 'firebase') {
      const [users] = await pool.query('SELECT id FROM users WHERE firebase_uid = ?', [req.user.uid]);
      userId = users[0]?.id;
    } else {
      userId = req.user.id;
    }
    
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(userId);
    
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const [updated] = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    res.json({ 
      message: 'Profile updated successfully',
      user: updated[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT update user by ID (protected)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(req.params.id);
    
    const [result] = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [updated] = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    
    res.json({ 
      message: 'User updated successfully',
      user: updated[0]
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT change password (protected)
router.put("/me/password", authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    if (req.user.authType === 'firebase') {
      return res.status(400).json({ error: 'Cannot change password for Firebase users' });
    }
    
    // Get user with password
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0 || !users[0].password) {
      return res.status(404).json({ error: 'User not found or no password set' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(current_password, users[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// DELETE user (protected)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    // Check if user has active borrows
    const [borrows] = await pool.query(
      'SELECT COUNT(*) as count FROM borrows WHERE user_id = ? AND status = "borrowed"',
      [req.params.id]
    );
    
    if (borrows[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user with active borrows' 
      });
    }
    
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST refresh access token using refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);

    // Make sure user still exists and status is active
    const [rows] = await pool.query('SELECT id, email, username, first_name, last_name, is_admin, status FROM users WHERE id = ? LIMIT 1', [decoded.id]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User inactive or not found' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, is_admin: !!user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({ token });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/:userId/favorites', async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    // ดึงข้อมูล favorite พร้อมรายละเอียดหนังสือ
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: { book: true },
    });

    // จัดรูปข้อมูลให้ง่ายต่อ frontend
    const formatted = favorites.map(f => ({
      id: f.book.id,
      title: f.book.title,
      author: f.book.author,
      genre: f.book.genre,
      cover: f.book.cover,
    }));

    return res.json({ favorites: formatted });
  } catch (error) {
    console.error('❌ [GET /favorites] Error:', error);
    return res.status(500).json({ error: 'Failed to load favorites' });
  }
});

/**
 * ✅ เพิ่มหรือลบหนังสือจาก Favorite
 */
router.post('/:userId/favorite', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { bookId, action } = req.body;

    if (!bookId || !action)
      return res.status(400).json({ error: 'bookId และ action จำเป็นต้องมี' });

    if (action === 'add') {
      // ตรวจสอบว่ามีอยู่แล้วหรือยัง
      const exists = await prisma.favorite.findFirst({
        where: { userId, bookId: Number(bookId) },
      });
      if (exists) return res.json({ message: 'มีอยู่แล้วในรายการโปรด' });

      // เพิ่มใหม่
      await prisma.favorite.create({
        data: { userId, bookId: Number(bookId) },
      });

      return res.json({ message: 'เพิ่มในรายการโปรดสำเร็จ' });
    }

    if (action === 'remove') {
      await prisma.favorite.deleteMany({
        where: { userId, bookId: Number(bookId) },
      });
      return res.json({ message: 'ลบออกจากรายการโปรดแล้ว' });
    }

    return res.status(400).json({ error: 'action ไม่ถูกต้อง (add/remove เท่านั้น)' });
  } catch (error) {
    console.error('❌ [POST /favorite] Error:', error);
    return res.status(500).json({ error: 'Failed to update favorites' });
  }
});

export default router;