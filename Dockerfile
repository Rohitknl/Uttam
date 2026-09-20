# Multi-stage Dockerfile for Uttam Laboratory

# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Install Backend Dependencies & Generate Prisma Client
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
RUN npx prisma generate

# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0 \
    DATABASE_URL="file:./dev.db" \
    STATIC_DIR="/app/frontend/dist"

# Copy built frontend assets
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy backend application
COPY --from=backend-builder /app/backend /app/backend

WORKDIR /app/backend

EXPOSE 5000

# Push schema changes to SQLite dev.db on container start, then start backend server
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/index.js"]
