/**
 * 本地认证模块 - 替换 Manus OAuth
 * 使用用户名/密码 + JWT 实现独立认证
 */
import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";

export type SessionPayload = {
  openId: string;
  name: string;
};

function getSessionSecret() {
  const secret = ENV.cookieSecret || "default-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(
  openId: string,
  name: string,
  expiresInMs = ONE_YEAR_MS
): Promise<string> {
  const secretKey = getSessionSecret();
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || !openId) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User> {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const sessionCookie = cookies[COOKIE_NAME];
  const session = await verifySessionToken(sessionCookie);
  if (!session) throw ForbiddenError("Invalid session");

  const user = await db.getUserByOpenId(session.openId);
  if (!user) throw ForbiddenError("User not found");

  return user;
}

/**
 * 注册本地认证 API 路由
 * POST /api/auth/login  - 登录
 * POST /api/auth/logout - 登出
 * POST /api/auth/change-password - 修改密码（需登录）
 */
export function registerLocalAuthRoutes(app: Express) {
  // 登录
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "用户名和密码不能为空" });
      return;
    }
    try {
      // 用 openId = username 查找用户
      const user = await db.getUserByOpenId(username);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "用户名或密码错误" });
        return;
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "用户名或密码错误" });
        return;
      }
      // 更新最后登录时间
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const token = await createSessionToken(user.openId, user.name || username);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Login failed:", error);
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  // 登出
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // 修改密码（需登录）
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: "请提供旧密码和新密码" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "新密码至少 6 位" });
      return;
    }
    try {
      const user = await authenticateRequest(req);
      if (!user.passwordHash) {
        res.status(400).json({ error: "该账号未设置密码" });
        return;
      }
      const valid = await verifyPassword(oldPassword, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "旧密码错误" });
        return;
      }
      const newHash = await hashPassword(newPassword);
      await db.upsertUser({ openId: user.openId, passwordHash: newHash } as any);
      res.json({ success: true });
    } catch {
      res.status(401).json({ error: "未登录或登录已过期" });
    }
  });
}
