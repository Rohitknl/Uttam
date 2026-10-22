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

## Full Agent Permissions & Autonomous Execution Policy (STRICT)

> [!IMPORTANT]
> **All AI agents working on this project possess full, unconditional, and pre-approved permissions across the entire codebase and execution environment.**
>
> 1. **Zero Approval Gates**: Agents must **NEVER** pause or ask the user for permission or approval before reading files, editing code, creating files, deleting obsolete files, installing packages, executing terminal commands, pushing schema updates, running test suites, or building the application.
> 2. **Proactive & Autonomous Execution**: Whenever a user gives a request or identifies a bug/feature, the agent must directly plan, implement, verify, and document the solution end-to-end without waiting for confirmation.
> 3. **Full System Scope**: This universal permission applies to all layers of the stack: Frontend (React/Vite), Backend (Node.js/Express), Database (Prisma/SQLite), Electron (Desktop process), scripts, dependencies, and configurations.

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

### 2026-10-19: Formula Deletion & Discrepancy Resolution (Freeze-Safe)

#### Problem Summary
1. **Delete Formula Tab Empty / Missing Formulas**: Users navigating to the "Delete Formula" tab saw no formulas available in the selection dropdown or the overview table ("No medicine formulas are currently defined"), making it impossible to delete or view formulas.
2. **Formula Discrepancy & Validation Block**: Saving formulas failed with rigid unit mismatch and sum discrepancy errors (`Element unit KG cannot be matched to medicine unit PIECES` and `Element total is less/more than medicine quantity`). This prevented saving any formulas for count-based medicines (`PIECES`) or real-world herbal proportions, leaving `hasRecipe` false across all codes.
3. **Delete State Trapping**: Upon deleting a formula, `selectedMedicineCodeId` remained set to the deleted code ID, immediately displaying an alert ("No formula defined... There are no formula ingredients to delete") and hiding the remaining table without returning to the list.
4. **Stock Unit Discrepancy in Production Completion**: Deductions during production completion subtracted raw recipe quantities directly from stock without converting recipe unit to stock unit (e.g. grams vs. kg).

#### Root Causes Identified
1. **Rigid Unit Family & Strict Sum Constraints (`backend/src/services/recipeService.js` & `frontend/src/pages/admin/FormulaPage.jsx`)**:
   - `updateRecipeByMedicineCodeId` threw `AppError` if `UNIT_FAMILY[item.unit] !== UNIT_FAMILY[medUnit]` or if `herbTotal !== medQty`. Because medicine codes default to `PIECES` (`count`) while raw herbs use `KG`/`GRAMS` (`mass`), saving was completely blocked.
   - In the frontend `FormulaPage.jsx`, `sumHerbQuantityInUnit` returned a blocking error string for mismatched unit families and `handleSave` blocked submission with discrepancy errors.
2. **Over-Filtering in Delete Tab Dropdown & Table (`frontend/src/pages/admin/FormulaPage.jsx`)**:
   - The dropdown and table strictly filtered by `m.hasRecipe`. If no formulas were yet defined, the dropdown and table rendered completely empty without options or actions to define formulas.
3. **Missing State Reset After Deletion (`frontend/src/pages/admin/FormulaPage.jsx`)**:
   - `executeDeleteFormula` set `hasRecipe: false` but left `selectedMedicineCodeId` truthy, keeping the detail branch mounted and blocking the overview table.
4. **Missing Stock Unit Conversion in Production Deductions (`backend/src/services/productionService.js` & `backend/src/services/formulaService.js`)**:
   - `completeProduction` deducted `req.requiredQuantity` directly instead of converting to `req.requiredInStockUnit`.

#### Changes Made

| File | Changes Made |
|------|--------------|
| `backend/src/services/recipeService.js` | • Removed rigid `UNIT_FAMILY[item.unit] !== UNIT_FAMILY[medUnit]` restriction and strict `herbTotal === medQty` check.<br>• Allowed saving formulas for `PIECES` and any manufacturing Bill of Materials (BOM) ratio.<br>• Preserved individual element unit integrity (`UNIT_FAMILY[item.unit] === UNIT_FAMILY[herbUnit]`). |
| `backend/src/services/formulaService.js` | • Added `requiredInStockUnit` to requirement objects returned by `previewProduction`. |
| `backend/src/services/productionService.js` | • Updated `completeProduction` to deduct stock using `req.requiredInStockUnit ?? req.requiredQuantity`. |
| `frontend/src/pages/admin/FormulaPage.jsx` | • Updated `sumHerbQuantityInUnit` to calculate total element weight/volume flexibly without throwing errors for `PIECES` or mixed unit types.<br>• Replaced rigid blocking discrepancy checks in `handleSave` with element presence and positive quantity validations.<br>• Updated formula proportion banners on View and Add/Edit tabs to display informative ratios without blocking red error alerts.<br>• Updated Delete Formula dropdown to list all medicine codes with their formula configuration status (`Configured` vs `No formula configured`).<br>• Updated Delete Formula overview table to display all medicine codes with quick action buttons (`Select to Delete` for configured, `Define Formula` for unconfigured).<br>• Added automatic selection reset (`setSelectedMedicineCodeId('')`) and clear success banner after formula deletion.<br>• Added direct "Delete Formula" action buttons for admins on the View tab (both table and detail header) and Add/Edit tab. |

#### Verification & Benchmarks
- **Automated Integration Test**: Verified saving non-equal mass formulas (0.25 KG Tulsi for 1 KG medicine), saving count-based formulas (100 PIECES with 2.5 KG Tulsi), recipe deletion, and recipe count verification in SQLite database.
- **Frontend Production Build**: `npm run build` completed in **15.28s** (2,280 modules transformed, exit code 0).
- **Desktop Packaging Pipeline**: `node scripts/prepare-desktop.mjs` completed with exit code 0 (clean build, template db push, 0-row verification).

### 2026-10-22: Remove Available Qty Column from Print Formula

#### Problem Summary
Users requested the removal of the available stock / quantity column from the generated formula sheet and print preview to simplify printouts and batch preparation sheets, focusing strictly on required recipe quantities, rates, and amounts.

#### Changes Made

| File | Changes Made |
|------|--------------|
| `frontend/src/pages/admin/FormulaPage.jsx` | • Removed `Available Stock` table header and data cells from `buildGeneratedFormulaHtml` for printed formula sheets and print preview.<br>• Removed extraneous trailing `<td></td>` cell from `<tfoot>` to keep table column count perfectly aligned (6 columns: #, Element Code, Element, Required Qty, Rate / Unit, Amount).<br>• Removed `availableStock` column definition from `generateColumns` on the on-screen Print Formula table. |

#### Verification & Benchmarks
- **Table Alignment Verification**: Verified column symmetry across `<thead>` (6 columns), `<tbody>` (6 columns), and `<tfoot>` (colspan 3 + 3 columns = 6 columns).
- **Frontend Production Build**: `npm run build` verified cleanly with 0 errors.

### 2026-10-22: Firm Name Dropdown for Medicine Formulas

#### Problem Summary
Users requested displaying a selectable Firm Name dropdown (which was previously added as an input field) when adding or editing formulas for medicines, allowing quick selection of known firms (such as "Uttam Laboratories" and existing firms/suppliers) without requiring repetitive manual text entry.

#### Changes Made

| File | Changes Made |
|------|--------------|
| `frontend/src/pages/admin/FormulaPage.jsx` | • Replaced text `<Input>` for Firm Name with searchable `<Combobox>` dropdown suggestions on both the "Add/Edit Formula" tab and "Print Formula" tab.<br>• Implemented dynamic aggregation of `firmOptions` combining default firm ("Uttam Laboratories"), medicine code configured formula firms, element supplier names, and purchase invoice parties (`billsApi`).<br>• Preserved free-text entry so users can still type custom firm names or pick from suggestions with 1-click. |

#### Verification & Benchmarks
- **Dropdown Suggestions & Fallback**: Verified that "Uttam Laboratories" is default/first option, and all existing firms from medicine options, herbs, and bills are included and sorted.
- **Frontend Production Build**: `npm run build` verified cleanly with 0 errors.
