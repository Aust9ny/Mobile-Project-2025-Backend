import mysql from "mysql2/promise";
import dotenv from "dotenv";
// FIX 1: Change to import * as admin to correctly load the module functions (credential, apps, etc.)
import admin from "firebase-admin";

// ⭐️ FIX 2: Load .env file AT THE VERY TOP (before any code runs)
// (This is the most important fix for ES Modules)
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


// 1. ⭐️⭐️ BULLETPROOF FIREBASE ADMIN INITIALIZATION ⭐️⭐️
try {
  // FIX 3: Check for the required .env variable FIRST
  if (process.env.FIREBASE_PRIVATE_KEY) {

    // FIX 4: Check if 'admin.apps' exists AND is empty
    // (We only initialize if it's not already done)
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
      console.log("✅ Firebase Admin SDK Initialized.");
    } else {
      // This happens on hot-reloads (nodemon restarts)
      console.log("✅ Firebase Admin SDK already initialized.");
    }

  } else {
    // This is the error you were missing before
    console.error(
      "❌ FIREBASE_PRIVATE_KEY is missing in .env. Admin SDK not initialized."
    );
  }
} catch (error) {
  // This catches any other weird errors (like permission issues)
  console.error("❌ Firebase Admin SDK initialization failed:", error.message);
}
// ----------------------------------------------------


// Export the app for use in your main server file
export { pool, admin };
