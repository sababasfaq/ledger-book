import jwt from "jsonwebtoken";
import { db } from "./db.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export const maskEmail = (email) => {
  const [n,d] = email.split("@"); return `${n.slice(0,2)}****@${d}`;
};

export const createToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, approved: !!user.approved }, JWT_SECRET, { expiresIn: "12h" });

export async function hashPassword(p) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(p, salt);
}
export async function verifyPassword(p, hash) {
  return bcrypt.compare(p, hash);
}

export const saveOtp = (email, code, ttlSeconds = 600) => {
  const expires = Date.now() + ttlSeconds*1000;
  db.prepare(`insert into otps (email,code,expires_at) values (?,?,?)`).run(email, code, expires);
};
export const checkOtp = (email, code) => {
  const rec = db.prepare(`select * from otps where email=? order by expires_at desc`).get(email);
  if (!rec) return false;
  if (rec.code !== code) return false;
  if (Date.now() > rec.expires_at) return false;
  db.prepare(`delete from otps where email=?`).run(email);
  return true;
};
