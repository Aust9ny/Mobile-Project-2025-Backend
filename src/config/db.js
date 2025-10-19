// src/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "11102546bA@",
  database: process.env.DB_NAME || "LendMe",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection on startup
pool.getConnection()
  .then(connection => {
    console.log('✅ Connected to MySQL database:', process.env.DB_HOST || 'localhost');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

export default pool;
