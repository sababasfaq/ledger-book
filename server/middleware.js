import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    if (!data.approved) return res.status(403).json({ error: "Account not approved yet" });
    req.user = data; // {id, role, approved}
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function superAdminOnly(req, res, next) {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Super Admin only" });
  next();
}
