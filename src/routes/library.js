import express from 'express';
// Import the pool and middleware from your configuration file
import { pool, checkAuth } from '../config/db.js'; 

const router = express.Router();

/**
 * Helper function to retrieve the internal database ID (MySQL Primary Key) 
 * using the Firebase UID (unique identifier).
 */
async function getInternalUserId(firebaseUid) {
    const [rows] = await pool.execute(
        'SELECT id FROM users WHERE uid = ?',
        [firebaseUid]
    );
    // Returns the internal MySQL user ID, or undefined/null if not found
    return rows[0] ? rows[0].id : null;
}

// -------------------------------------------------------------
// 1. BOOK CATALOG ROUTES
// -------------------------------------------------------------

/**
 * GET /api/books
 * Retrieves all books, optionally filtered by search term or genre.
 */
router.get('/books', async (req, res) => {
    const { search, genre } = req.query;
    let sql = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    if (search) {
        sql += ' AND (title LIKE ? OR author LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
    }

    if (genre) {
        sql += ' AND genre = ?';
        params.push(genre);
    }

    try {
        const [rows] = await pool.execute(sql, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching book catalog:', error);
        res.status(500).json({ message: 'Error fetching books.' });
    }
});

/**
 * GET /api/books/:bookId
 * Retrieves a single book by its internal ID.
 */
router.get('/books/:bookId', async (req, res) => {
    const { bookId } = req.params;
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM books WHERE id = ?',
            [bookId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Book not found.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching single book:', error);
        res.status(500).json({ message: 'Error fetching book details.' });
    }
});

// -------------------------------------------------------------
// 2. FAVORITES ROUTES (Requires Authentication)
// -------------------------------------------------------------

/**
 * GET /api/favorites
 * Retrieves all books the authenticated user has favorited.
 */
router.get('/favorites', checkAuth, async (req, res) => {
    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });

        const sql = `
            SELECT b.*, uf.created_at AS favorited_at
            FROM user_favorites uf
            JOIN books b ON uf.book_id = b.id
            WHERE uf.user_id = ?
        `;
        const [rows] = await pool.execute(sql, [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ message: 'Error retrieving user favorites.' });
    }
});

/**
 * POST /api/favorites/:bookId
 * Adds a book to the authenticated user's favorites.
 */
router.post('/favorites/:bookId', checkAuth, async (req, res) => {
    const { bookId } = req.params;
    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });
        
        // 1. Check if the book exists
        const [bookCheck] = await pool.execute('SELECT id FROM books WHERE id = ?', [bookId]);
        if (bookCheck.length === 0) {
            return res.status(404).json({ message: 'Book not found.' });
        }

        // 2. Insert into user_favorites (ON DUPLICATE KEY IGNORE to prevent error if already exists)
        const sql = `
            INSERT IGNORE INTO user_favorites (user_id, book_id)
            VALUES (?, ?)
        `;
        await pool.execute(sql, [userId, bookId]);
        
        res.status(201).json({ message: 'Book added to favorites.' });
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ message: 'Error adding book to favorites.' });
    }
});

/**
 * DELETE /api/favorites/:bookId
 * Removes a book from the authenticated user's favorites.
 */
router.delete('/favorites/:bookId', checkAuth, async (req, res) => {
    const { bookId } = req.params;
    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });

        const [result] = await pool.execute(
            'DELETE FROM user_favorites WHERE user_id = ? AND book_id = ?',
            [userId, bookId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Favorite not found for this user.' });
        }
        
        res.status(200).json({ message: 'Book removed from favorites.' });
    } catch (error) {
        console.error('Error removing favorite:', error);
        res.status(500).json({ message: 'Error removing book from favorites.' });
    }
});

// -------------------------------------------------------------
// 3. BORROWING ROUTES (Requires Authentication)
// -------------------------------------------------------------

/**
 * GET /api/borrows/current
 * Retrieves all currently borrowed books for the authenticated user.
 */
router.get('/borrows/current', checkAuth, async (req, res) => {
    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });

        const sql = `
            SELECT b.*, br.borrow_date, br.due_date, br.status
            FROM borrows br
            JOIN books b ON br.book_id = b.id
            WHERE br.user_id = ? AND br.status IN ('borrowed', 'renewed', 'overdue')
            ORDER BY br.due_date ASC
        `;
        const [rows] = await pool.execute(sql, [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching current borrows:', error);
        res.status(500).json({ message: 'Error retrieving borrowed books.' });
    }
});

/**
 * POST /api/borrows/:bookId
 * Borrows a specific book (creates a 'borrowed' record).
 * NOTE: This is a transaction because it updates two tables (borrows and books).
 */
router.post('/borrows/:bookId', checkAuth, async (req, res) => {
    const { bookId } = req.params;
    const connection = await pool.getConnection();

    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });

        await connection.beginTransaction();

        // 1. Check if the book is available (available_copies > 0)
        const [bookRows] = await connection.execute(
            'SELECT available_copies FROM books WHERE id = ? FOR UPDATE', // Lock the row
            [bookId]
        );

        if (bookRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Book not found.' });
        }
        if (bookRows[0].available_copies <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'No available copies of this book.' });
        }
        
        // (Optional: You could check if the user already has a borrowed copy here)

        // 2. Calculate the due date (e.g., 30 days from now)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // Simple 30-day loan period
        const dueDateString = dueDate.toISOString().split('T')[0];

        // 3. Create the borrow record
        const [borrowResult] = await connection.execute(
            `INSERT INTO borrows (user_id, book_id, due_date, status) VALUES (?, ?, ?, 'borrowed')`,
            [userId, bookId, dueDateString]
        );

        // 4. Decrement available copies
        await connection.execute(
            'UPDATE books SET available_copies = available_copies - 1 WHERE id = ?',
            [bookId]
        );

        await connection.commit();
        connection.release();

        res.status(201).json({ 
            message: 'Book successfully borrowed.', 
            borrowId: borrowResult.insertId,
            dueDate: dueDateString
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Transaction error during borrowing:', error);
        res.status(500).json({ message: 'Failed to borrow book due to a system error.' });
    }
});

/**
 * POST /api/borrows/return/:borrowId
 * Marks a borrowed book as returned.
 * NOTE: This is also a transaction.
 */
router.post('/borrows/return/:borrowId', checkAuth, async (req, res) => {
    const { borrowId } = req.params;
    const connection = await pool.getConnection();

    try {
        const userId = await getInternalUserId(req.user.uid);
        if (!userId) return res.status(404).json({ message: 'User profile not found.' });

        await connection.beginTransaction();

        // 1. Get the borrow record and book_id, ensure it belongs to the user and is still borrowed
        const [borrowRows] = await connection.execute(
            'SELECT book_id FROM borrows WHERE id = ? AND user_id = ? AND status IN ("borrowed", "renewed", "overdue") FOR UPDATE',
            [borrowId, userId]
        );

        if (borrowRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Active borrow record not found or does not belong to user.' });
        }
        const bookId = borrowRows[0].book_id;

        // 2. Update the borrow record status and return date
        const [updateResult] = await connection.execute(
            'UPDATE borrows SET status = "returned", return_date = CURDATE() WHERE id = ?',
            [borrowId]
        );

        // 3. Increment available copies in the books table
        await connection.execute(
            'UPDATE books SET available_copies = available_copies + 1 WHERE id = ?',
            [bookId]
        );

        await connection.commit();
        connection.release();

        res.status(200).json({ message: 'Book successfully returned.' });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Transaction error during return:', error);
        res.status(500).json({ message: 'Failed to return book due to a system error.' });
    }
});

// -------------------------------------------------------------
// 4. USER PROFILE ROUTES (Requires Authentication)
// -------------------------------------------------------------

/**
 * GET /api/profile
 * Retrieves the user's detailed profile from the 'users' table.
 */
router.get('/profile', checkAuth, async (req, res) => {
    try {
        // Use the Firebase UID to fetch the user's profile
        const [rows] = await pool.execute(
            'SELECT id, uid, first_name, last_name, email, phone_number, is_admin, status, profile_image_url, last_login, created_at FROM users WHERE uid = ?',
            [req.user.uid]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User profile not found. Please sync the user first.' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Error retrieving profile.' });
    }
});

export default router;