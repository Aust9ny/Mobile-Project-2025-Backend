import mysql from "mysql2/promise";
import dotenv from "dotenv";
// FIX 1: Change to import * as admin to correctly load the module functions (credential, apps, etc.)
import * as admin from "firebase-admin";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test connection on startup
pool
  .getConnection()
  .then((connection) => {
    console.log(
      "✅ Connected to MySQL database:",
      process.env.DB_HOST || "localhost"
    );
    connection.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
  });


// 1. INITIALIZE FIREBASE ADMIN
// You get this file from your Firebase project settings
if (admin && admin.apps && admin.apps.length === 0) {
  // FIX 2: Added a check for the private key being set before attempting .replace()
  if (process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The regex replacement is correct, but only runs if the variable exists
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin SDK Initialized.");
  } else {
    console.error(
      "❌ FIREBASE_PRIVATE_KEY is missing. Admin SDK not initialized."
    );
  }
}

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    // Try Firebase token first
    if (token.length > 100) {
      // Firebase tokens are typically longer
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        authType: "firebase",
      };
    } else {
      // Try JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        authType: "jwt",
      };
    }
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(403).json({ error: "Invalid token" });
  }
}

// Export the app for use in your main server file
export { pool, admin , checkAuth};
