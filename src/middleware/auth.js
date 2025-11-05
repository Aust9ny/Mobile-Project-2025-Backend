import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import * as admin from "firebase-admin";

export const authenticateToken = async (req, res, next) => {
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
};

export const authenticateFirebase = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Firebase token required" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      authType: "firebase",
    };
    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error);
    res.status(403).json({ error: "Invalid Firebase token" });
  }
};