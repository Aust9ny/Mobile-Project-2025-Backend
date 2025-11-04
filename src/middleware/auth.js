import jwt from 'jsonwebtoken';
import pool from '../config/db.js';


// Initialize Firebase Admin (add your service account key to .env)
try {
  if (!admin.apps?.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('✅ Firebase Admin initialized');
  }
} catch (e) {
  console.error('❌ Firebase Admin initialization failed:', e?.message || e);
}

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Try Firebase token first
    if (token.length > 100) { // Firebase tokens are typically longer
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        authType: 'firebase'
      };
    } else {
      // Try JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        authType: 'jwt'
      };
    }
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(403).json({ error: 'Invalid token' });
  }
};

export const authenticateFirebase = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Firebase token required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      authType: 'firebase'
    };
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    res.status(403).json({ error: 'Invalid Firebase token' });
  }
};