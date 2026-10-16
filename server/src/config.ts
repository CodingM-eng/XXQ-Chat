import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  INITIAL_ADMIN_EMAIL: z.string().email().default('codingdevelopia@gmail.com'),
  WHITELIST_MODE_DEFAULT: z
    .string()
    .transform((val) => val.toLowerCase() === 'true' || val === '1')
    .default('true'),
  DB_DRIVER: z.enum(['sqlite', 'firestore', 'auto']).default('auto'),
  DB_PATH: z.string().default('./data/xxq-chat.db'),
  JWT_DEV_SECRET: z.string().min(16).default('dev-xxq-chat-secret-key-change-in-production-min-32-chars'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_DRIVE_REDIRECT_URI: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  SERVER_BASE_URL: z.string().default('http://localhost:4000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
