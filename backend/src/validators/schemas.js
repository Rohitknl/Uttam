import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const userCreateSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  fullName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  role: z.enum(['ROLE_ADMIN', 'ROLE_DEALER', 'ROLE_VIEWER']),
  active: z.boolean().optional().default(true),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
});

export const herbCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const herbCodeWriteSchema = herbCodeSchema.extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const herbCodeUpdateWriteSchema = herbCodeSchema.partial().extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const herbCodeDeleteSchema = z.object({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
});

export const medicineCodeWriteSchema = medicineCodeSchema.extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineCodeUpdateWriteSchema = medicineCodeSchema.partial().extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineCodeDeleteSchema = z.object({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const herbSchema = z.object({
  name: z.string().min(1, 'Herb name is required'),
  herbCodeId: z.number().int({ message: 'Herb code is required' }),
  supplierName: z.string().optional().nullable(),
  supplierContact: z.string().optional().nullable(),
  unitOfMeasure: z.enum(['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES']),
  currentStock: z.number({ required_error: 'Total stock is required' }),
  costPerUnit: z.number({ required_error: 'Latest rate is required' }),
  minimumStockAlert: z.number({ required_error: 'Minimum stock/alert is required' }),
  storeNumber: z.string().min(1, 'Store number is required'),
  kanasterBora: z.string().min(1, 'Kanaster/Bora/Drum is required'),
  kanasterBoraNumber: z.string().min(1, 'Kanaster/Bora/Drum number is required'),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const herbWriteSchema = herbSchema.extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const herbUpdateWriteSchema = herbSchema.partial().extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const herbDeleteSchema = z.object({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineSchema = z.object({
  name: z.string().min(1),
  medicineCodeId: z.number().int(),
  type: z.enum(['VATI', 'CHURNA', 'ARISHTA', 'SYRUP', 'TAILA', 'GHRITA', 'BHASMA', 'LEHYA', 'KWATH', 'TABLET', 'CAPSULE', 'OTHER']).optional(),
  unit: z.string().optional(),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  stockLocation: z.string().optional().nullable(),
  rackCode: z.string().optional().nullable(),
  currentStock: z.number().optional(),
  pricePerUnit: z.number().optional(),
  minimumStockAlert: z.number().min(0).optional(),
  expiryDate: z.union([z.string().min(1), z.null()]).optional(),
  active: z.boolean().optional(),
});

export const medicineWriteSchema = medicineSchema.extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineUpdateWriteSchema = medicineSchema.partial().omit({ medicineCodeId: true }).extend({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const medicineDeleteSchema = z.object({
  crudPassword: z.string().min(1, 'Password is required'),
});

export const billLineSchema = z.object({
  herbCodeId: z.number().int(),
  herbCode: z.string().optional(),
  herbName: z.string().min(1),
  quantity: z.number().positive(),
  rate: z.number().min(0),
  amount: z.number().min(0).optional(),
  unit: z.string().optional(),
});

export const billCreateSchema = z.object({
  billNumber: z.string().min(1),
  supplierName: z.string().min(1),
  supplierContact: z.string().optional().nullable(),
  supplierEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  supplierAddress: z.string().optional().nullable(),
  consigneeName: z.string().optional().nullable(),
  consigneeAddress: z.string().optional().nullable(),
  billDate: z.string(),
  taxType: z.enum(['NONE', 'GST', 'IGST', 'BOTH']).optional().default('NONE'),
  taxPercent: z.number().min(0).max(100).optional().default(0),
  gstPercent: z.number().min(0).max(100).optional(),
  igstPercent: z.number().min(0).max(100).optional().default(0),
  applyGst: z.boolean().optional(),
  applyIgst: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  lines: z.array(billLineSchema).min(1, 'At least one line item is required'),
});

export const billUpdateSchema = billCreateSchema.extend({
  lines: z.array(billLineSchema.extend({ id: z.number().int().optional() })).min(1),
});

export const billLineUpdateSchema = z.object({
  herbName: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  rate: z.number().min(0).optional(),
  amount: z.number().min(0).optional(),
  unit: z.string().optional(),
});

export const recipeItemSchema = z.object({
  herbId: z.number().int(),
  quantity: z.number().positive(),
  unit: z.enum(['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES']).optional().default('KG'),
});

export const formulaValidateSchema = z.object({
  medicineCodeId: z.number().int(),
  batchSize: z.number().positive(),
});

export const formulaGenerateSchema = z.object({
  medicineCodeId: z.number().int(),
  batchSize: z.number().positive(),
});

export const formulaSaveSchema = z.object({
  medicineCodeId: z.number().int(),
  batchSize: z.number().positive(),
  items: z.array(z.object({
    herbId: z.number().int(),
    scaledQuantity: z.number().positive(),
  })),
});

export const formulaConsumeSchema = z.object({
  medicineCodeId: z.number().int(),
  batchSize: z.number().positive(),
});

export const productionStartSchema = z.object({
  medicineId: z.number().int(),
  quantity: z.number().positive(),
});

export const productionCompleteSchema = z.object({
  batchNumber: z.string().min(1),
  expiryDate: z.string(),
  stockLocation: z.string().optional().nullable(),
  rackCode: z.string().optional().nullable(),
  pricePerUnit: z.number().min(0),
  minimumStockAlert: z.number().min(0).optional(),
});

export const orderCreateSchema = z.object({
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    medicineId: z.number().int(),
    quantity: z.number().positive(),
  })).min(1),
});

export const orderRejectSchema = z.object({
  reason: z.string().min(1),
});

export function validate(schema) {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        const error = new Error(message);
        error.status = 400;
        return next(error);
      }
      next(err);
    }
  };
}
