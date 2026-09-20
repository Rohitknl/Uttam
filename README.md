# Uttam Laboratory — SQLite Edition

Clone of the Ayurvedic inventory app with **SQLite** instead of MySQL (for local / future desktop packaging).

| Folder | Stack | Port |
|--------|-------|------|
| `backend/` | Node.js, Express, Prisma, **SQLite** | 5000 |
| `frontend/` | React 19, Vite, Tailwind CSS 4 | 5173 |

The original MySQL project remains at `../ayurveda-inventory/`.

## Prerequisites

- **Node.js** 20+
- **npm**
- No MySQL install required

## Quick Start

### 1. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run db:setup
npm run dev
```

SQLite file is created at `backend/prisma/dev.db`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://127.0.0.1:5173/

## Default Users

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | ROLE_ADMIN |
| viewer | viewer123 | ROLE_VIEWER |
| dealer1 | dealer123 | ROLE_DEALER |
| dealer2 | dealer123 | ROLE_DEALER |

CRUD password (edit/delete where required): `UttamLab@27`

## Environment

`DATABASE_URL="file:./dev.db"` (relative to `backend/prisma/`)

## Backup & Restore (Admin)

Open **Backup & Restore** in the sidebar:

1. **Data Backup** — choose a drive/folder (C:\\UttamLaboratory\\Backups, Documents, Desktop, or D: if present) and save a full `.db` snapshot.
2. **Data Install** — choose the same folder, pick a backup from the dropdown, and restore it (current DB is safety-copied first under `_pre_restore`).
