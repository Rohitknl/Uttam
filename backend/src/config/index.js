import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL,
  staticDir: process.env.STATIC_DIR || '',
  jwtSecret: process.env.JWT_SECRET || 'UttamLifecycleAyurvedaInventorySecretKey2024MustBeAtLeast256BitsLongForHS256',
  jwtExpirationMs: parseInt(process.env.JWT_EXPIRATION_MS || '86400000', 10),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
  herbCodeCrudPassword: process.env.HERB_CODE_CRUD_PASSWORD || 'UttamLab@27',
};
