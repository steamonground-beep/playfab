import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';

const publicIdAlphabet = customAlphabet('0123456789ABCDEFGHJKMNPQRSTUVWXYZ', 12);
const ticketAlphabet = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generatePublicId(): string {
  return publicIdAlphabet();
}

export function generateTicketId(): string {
  return ticketAlphabet();
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateJoinCode(): string {
  return customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)();
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function signPhotonAuth(userId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(userId).digest('hex');
}
