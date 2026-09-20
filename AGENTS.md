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
