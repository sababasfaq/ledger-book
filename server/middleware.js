import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "./db.js";
dotenv.config();

export function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    const user = db
      .prepare(
        "SELECT id,name,email,role,approved,token_version FROM users WHERE id=?",
      )
      .get(data.id);
    if (!user || (data.tokenVersion ?? 0) !== user.token_version)
      return res
        .status(401)
        .json({ error: "Session expired. Please log in again." });
    if (!user.approved)
      return res.status(403).json({ error: "Account not approved yet" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function superAdminOnly(req, res, next) {
  if (req.user?.role !== "super_admin")
    return res.status(403).json({ error: "Super Admin only" });
  next();
}
