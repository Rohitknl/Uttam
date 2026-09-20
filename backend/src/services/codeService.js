import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

function formatHerbName(name) {
  if (name == null || name === '') return name;
  return String(name).trim();
}

function formatMedicineCode(code) {
  if (code == null || code === '') return code;
  return String(code).trim().toUpperCase();
}

function formatMedicineName(name) {
  if (name == null || name === '') return name;
  return String(name).trim();
}
async function enrichCode(code, linkedHerbs) {
  const linked = linkedHerbs.find(h => h.herbCodeId === code.id);
  return {
    id: code.id,
    code: code.code,
    name: code.name,
    assigned: !!linked,
    linkedItemName: linked?.name || null,
  };
}

export async function getAllHerbCodes(search) {
  const codes = await prisma.herbCode.findMany({
    where: search ? {
      OR: [
        { code: { contains: search } },
        { name: { contains: search } },
      ],
    } : undefined,
    orderBy: { code: 'asc' },
  });
  const herbs = await prisma.herb.findMany({ where: { herbCodeId: { not: null } } });
  return Promise.all(codes.map(c => enrichCode(c, herbs)));
}

export async function getAvailableHerbCodes(search) {
  return prisma.herbCode.findMany({
    where: search ? {
      OR: [
        { code: { contains: search } },
        { name: { contains: search } },
      ],
    } : undefined,
    orderBy: { code: 'asc' },
  });
}

export async function getHerbCodeById(id) {
  const code = await prisma.herbCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Herb code not found', 404);
  const herbs = await prisma.herb.findMany({ where: { herbCodeId: id } });
  return enrichCode(code, herbs);
}

export async function createHerbCode(data) {
  const codeValue = String(data.code || '').trim().toUpperCase();
  const existing = await prisma.herbCode.findUnique({ where: { code: codeValue } });
  if (existing) throw new AppError('Herb code already exists', 400);
  const code = await prisma.herbCode.create({
    data: { code: codeValue, name: formatHerbName(data.name) },
  });
  return enrichCode(code, []);
}

export async function updateHerbCode(id, data) {
  const code = await prisma.herbCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Herb code not found', 404);
  const nextCode = data.code !== undefined ? String(data.code).trim().toUpperCase() : undefined;
  if (nextCode && nextCode !== code.code) {
    const existing = await prisma.herbCode.findUnique({ where: { code: nextCode } });
    if (existing) throw new AppError('Herb code already exists', 400);
  }
  const updated = await prisma.herbCode.update({
    where: { id },
    data: {
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(data.name !== undefined ? { name: formatHerbName(data.name) } : {}),
    },
  });
  const herbs = await prisma.herb.findMany({ where: { herbCodeId: id } });
  return enrichCode(updated, herbs);
}

export async function deleteHerbCode(id) {
  const code = await prisma.herbCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Herb code not found', 404);
  const linked = await prisma.herb.findFirst({ where: { herbCodeId: id } });
  if (linked) throw new AppError('Cannot delete herb code that is assigned to a herb', 400);
  await prisma.herbCode.delete({ where: { id } });
}

async function enrichMedicineCode(code, linkedMedicines) {
  const linked = linkedMedicines.find(m => m.medicineCodeId === code.id);
  return {
    id: code.id,
    code: code.code,
    name: code.name,
    description: code.description,
    active: code.active,
    assigned: !!linked,
    linkedItemName: linked?.name || null,
    linkedMedicineId: linked?.id || null,
    createdAt: code.createdAt,
  };
}

export async function getAllMedicineCodes(search) {
  const codes = await prisma.medicineCode.findMany({
    where: search ? {
      OR: [
        { code: { contains: search } },
        { name: { contains: search } },
      ],
    } : undefined,
    orderBy: { code: 'asc' },
  });
  const medicines = await prisma.medicine.findMany({ where: { medicineCodeId: { not: null } } });
  return Promise.all(codes.map(c => enrichMedicineCode(c, medicines)));
}

export async function getAvailableMedicineCodes() {
  const assignedIds = (await prisma.medicine.findMany({
    where: { medicineCodeId: { not: null } },
    select: { medicineCodeId: true },
  })).map(m => m.medicineCodeId);
  return prisma.medicineCode.findMany({
    where: { active: true, id: { notIn: assignedIds } },
    orderBy: { code: 'asc' },
  });
}

export async function getMedicineCodeById(id) {
  const code = await prisma.medicineCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Medicine code not found', 404);
  const medicines = await prisma.medicine.findMany({ where: { medicineCodeId: id } });
  return enrichMedicineCode(code, medicines);
}

export async function createMedicineCode(data) {
  const codeValue = formatMedicineCode(data.code);
  const existing = await prisma.medicineCode.findUnique({ where: { code: codeValue } });
  if (existing) throw new AppError('Medicine code already exists', 400);
  const code = await prisma.medicineCode.create({
    data: {
      code: codeValue,
      name: formatMedicineName(data.name),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
  return enrichMedicineCode(code, []);
}

export async function updateMedicineCode(id, data) {
  const code = await prisma.medicineCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Medicine code not found', 404);
  const nextCode = data.code !== undefined ? formatMedicineCode(data.code) : undefined;
  if (nextCode && nextCode !== code.code) {
    const existing = await prisma.medicineCode.findUnique({ where: { code: nextCode } });
    if (existing) throw new AppError('Medicine code already exists', 400);
  }
  const updated = await prisma.medicineCode.update({
    where: { id },
    data: {
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(data.name !== undefined ? { name: formatMedicineName(data.name) } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
  const medicines = await prisma.medicine.findMany({ where: { medicineCodeId: id } });
  return enrichMedicineCode(updated, medicines);
}

export async function deleteMedicineCode(id) {
  const code = await prisma.medicineCode.findUnique({ where: { id } });
  if (!code) throw new AppError('Medicine code not found', 404);
  const linked = await prisma.medicine.findFirst({ where: { medicineCodeId: id } });
  if (linked) throw new AppError('Cannot delete medicine code that is assigned to a medicine', 400);
  await prisma.medicineCode.delete({ where: { id } });
}
