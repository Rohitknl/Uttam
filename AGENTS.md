# Uttam Laboratory — Operational Workflow

This document describes the strict business workflow that agents and users must follow when operating the Uttam Lifecycle inventory system.

## Workflow Order (STRICT)

```
Herb Codes → Bills → Herbs → Medicine Codes → Medicines → Formula → Generate Formula → Production → Orders
```

### Step 1: Herb Codes (Registry)
- Register herb codes in **Admin → Herb Codes**
- Each code is a unique identifier (e.g., `HRB-001`)
- Codes must exist before creating supplier bills
- Only **unassigned** codes appear in bill creation dropdowns

### Step 2: Supplier Bills
- Record supplier invoices in **Admin → Bills**
- Each bill line uses an unassigned herb code (unique per bill)
- Creates a new herb record with stock = line quantity
- Logs purchase history for inventory queries
- This is the primary way herb stock enters the system

### Step 3: Herbs (View Only in Normal Workflow)
- View raw material inventory in **Admin → Herbs**
- Stock is added via Bills, not manual herb creation
- Shows current stock, cost, supplier info

### Step 4: Medicine Codes (Registry)
- Register medicine codes in **Admin → Medicine Codes**
- Must exist before creating medicine master records
- Only unassigned codes appear in medicine creation dropdowns

### Step 5: Medicines (Master Data Only)
- Create finished goods in **Admin → Medicines**
- Fields: name, medicine code, type, unit, category, description, active
- **NOT on form:** batch number, expiry, stock location, rack, price, current stock, min alert
- New medicines start with `pricePerUnit=0`, `currentStock=0`, `minimumStockAlert=0`

### Step 6: Formula (BOM)
- Define per-unit herb quantities in **Admin → Formula**
- Select a medicine, add herbs with quantity per 1 medicine unit
- Cannot create formula before medicine exists

### Step 7: Generate Formula (Bulk Scale)
- Scale formula by batch size in **Admin → Generate Formula** (Admin only)
- `scaledQty = qtyPerUnit × batchSize`
- Validate stock availability
- Save divides scaled quantities by batch size before persisting
- Consume endpoint subtracts herbs (allows negative stock)

### Step 8: Production
- Run batch production in **Admin → Production** (Admin only)
- **Start:** Preview BOM, fail if insufficient herb stock, create IN_PROGRESS batch
- **Complete:** Re-check stock, deduct herbs, add to medicine stock, set inventory fields (batch, expiry, location, rack, price, min alert), create MEDICINE batch record

### Step 9: Orders
- Dealers browse catalog and place orders
- Admin approves (deducts stock) or rejects in **Admin → Orders**
- Dispatch marks order as shipped (deducts if still pending)

## Critical Data Boundaries

| Page | Allowed Fields | NOT Allowed |
|------|---------------|-------------|
| Medicines form | name, code, type, unit, category, description, active | batch, expiry, location, rack, price, stock, min alert |
| Production complete | batch, expiry, location, rack, price, min alert | — |

## Role Permissions

| Action | Admin | Viewer | Dealer |
|--------|-------|--------|--------|
| Read all admin pages | ✓ | ✓ | ✗ |
| Write (POST/PUT/DELETE) | ✓ | ✗ | ✗ |
| Bulk Formula, Production, Orders, Users | ✓ | ✗ | ✗ |
| Browse catalog, place orders | ✗ | ✗ | ✓ |
| View own orders | ✗ | ✗ | ✓ |

## Code Assignment Rules
- Each herb code → one herb (via bill or manual create)
- Each medicine code → one medicine
- Each herb code used once per bill
- Codes show `assigned=true` when linked

## Production & Order Numbers
- Production: `PRD-YYYYMMDD-XXXX`
- Orders: `ORD-YYYYMMDD-XXXX`

---

## Mandatory Documentation Rule for Future Changes (STRICT)

> [!IMPORTANT]
> **Every agent or developer making any modification, bug fix, feature addition, or refactor to this codebase MUST document the changes in this file (`AGENTS.md`) before completing the task.**
>
> Any update must include:
> 1. **Date & Scope**: Timestamp and affected components (Frontend, Backend, Electron).
> 2. **Issue Description & Root Cause**: Why the issue occurred and what mechanism triggered it.
> 3. **Files Modified**: Explicit list of files and summary of changes.
> 4. **Testing & Verification**: How the change was validated (builds, test runs, benchmarks).

---

## Changelog & Maintenance Log

### 2026-10-19: Desktop Application Freeze & Hang Resolution

#### Problem Summary
The desktop Electron application froze and became unresponsive (Windows flagged the window as *"Not Responding"*) during routine operations, particularly while typing into search fields, navigating the Formula page, and accessing backup/drive options.

#### Root Causes Identified
1. **Synchronous File System I/O in Electron Main Process (`electron/main.cjs` & `main.cjs`)**:
   - Every line of backend stdout/stderr triggered `log()`, which executed synchronous `getDataDir()` (`fs.mkdirSync`) and synchronous `fs.appendFileSync()`.
   - On the Electron main process thread (which drives the Windows UI message pump), this blocked input events and window painting, causing application hangs.
   - `stderrOutput` accumulated unbounded strings, causing continuous memory bloat.

2. **Synchronous Process Blocking in Backup Service (`backend/src/services/backupService.js`)**:
   - `getWindowsDrivesViaPowerShell()` executed `execFileSync('powershell.exe', ...)` with a 6-second timeout.
   - This blocked the Node.js event loop synchronously for 1.5–4 seconds every time drives were listed or destinations resolved, stalling all concurrent HTTP requests.

3. **Missing Keystroke Debouncing on React Input Fields**:
   - `FormulaPage.jsx`: In the Print/Generate tab, typing into `generateQuantity` fired `formulasApi.generate()` on **every keystroke** without debounce.
   - `CodesPage.jsx`, `HerbsPage.jsx`, `MedicinesPage.jsx`, `BillsPage.jsx`: Search fields fired immediate `api.getAll(search)` queries on every character typed, overwhelming SQLite's single-writer lock and causing re-render storms.
   - `FormulaPage.jsx`: `selectedMedicine` and `filteredMedicines` were recalculated on every render cycle without `useMemo`.

4. **Missing Request Timeout in Axios Client (`frontend/src/api/index.js`)**:
   - Axios lacked a request timeout, leaving the UI permanently stuck in loading/disabled states if any query stalled.

#### Changes Made

| File | Changes Made |
|------|--------------|
| `electron/main.cjs` & `main.cjs` | • Cached `getDataDir()` result in `_dataDirCache` to avoid repetitive `fs.mkdirSync`.<br>• Replaced `fs.appendFileSync` in `log()` with a non-blocking in-memory buffer (`_logBuffer`) that flushes asynchronously every 400ms via `fs.appendFile`.<br>• Capped `stderrOutput` to the last 8,000 characters to eliminate memory leaks.<br>• Added explicit `flushLogs()` on `before-quit` and `window-all-closed`. |
| `backend/src/services/backupService.js` | • Replaced synchronous `execFileSync` with asynchronous `execFileAsync` (`promisify(execFile)`).<br>• Added a 30-second in-memory drive cache (`_cachedDrives`, `_cachedDrivesTime`) to make repeated drive lookups instantaneous.<br>• Converted `getAvailableDrives`, `getBackupDestinations`, `resolveDestination`, `listBackups`, `resetDatabaseToEmpty`, and `browseDrive` to `async/await`. |
| `backend/src/routes/backup.js` | • Awaited `getBackupDestinations()` and `listBackups()` calls in route handlers. |
| `frontend/src/api/index.js` | • Added `timeout: 30000` (30 seconds) to Axios client configuration. |
| `frontend/src/pages/admin/FormulaPage.jsx` | • Added 350ms debounce with timer cleanup to the `formulasApi.generate` `useEffect`.<br>• Wrapped `selectedMedicine` and `filteredMedicines` in `useMemo`. |
| `frontend/src/pages/admin/CodesPage.jsx` | • Debounced `api.getAll(search)` by 300ms on search input changes. |
| `frontend/src/pages/admin/BillsPage.jsx` | • Debounced `billsApi.getAll(search)` by 300ms on search input changes. |
| `frontend/src/pages/admin/HerbsPage.jsx` | • Debounced `herbsApi.getAll(search)` by 300ms on search input changes. |
| `frontend/src/pages/admin/MedicinesPage.jsx` | • Debounced `medicinesApi.getAll(search)` by 300ms on search input changes. |

#### Verification & Benchmarks
- **Drive Discovery Speed**: Cold asynchronous drive discovery completed in **1.010s** (non-blocking), and cached lookups completed in **0.021ms** (previously 1.5–4.0s of total thread freeze).
- **Frontend Production Build**: `npm run build` completed cleanly (2,280 modules transformed, exit code 0).
- **Desktop Packaging Pipeline**: `node scripts/prepare-desktop.mjs` completed with exit code 0 (frontend build, Prisma client generation, SQLite template push, empty-state database verification).
