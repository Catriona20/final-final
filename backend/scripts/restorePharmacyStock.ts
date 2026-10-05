import fs from 'fs';
import path from 'path';

interface PharmacyItem {
  id: string;
  clinic_id: string;
  sku: string;
  name: string;
  generic_name: string;
  category: string;
  dosage_form: string;
  strength: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  min_stock_level: number;
  reorder_quantity: number;
  unit_price: number;
  created_at: string;
  updated_at: string;
}

const CANONICAL_MOON_DENTAL_BATCHES: PharmacyItem[] = [
  {
    id: 'rx-item-dolo-01',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-ATC-N02BE',
    name: 'Paracetamol 650mg (Dolo)',
    generic_name: 'Paracetamol',
    category: 'Analgesics',
    dosage_form: 'Tablet',
    strength: '650mg',
    batch_number: 'BATCH-DOLO-2026A',
    expiry_date: '2026-11-30',
    quantity: 50,
    min_stock_level: 20,
    reorder_quantity: 100,
    unit_price: 3.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: 'rx-item-dolo-02',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-ATC-N02BE',
    name: 'Paracetamol 650mg (Dolo)',
    generic_name: 'Paracetamol',
    category: 'Analgesics',
    dosage_form: 'Tablet',
    strength: '650mg',
    batch_number: 'BATCH-DOLO-2027B',
    expiry_date: '2027-12-31',
    quantity: 100,
    min_stock_level: 20,
    reorder_quantity: 100,
    unit_price: 3.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: 'rx-item-amox-01',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-AMOX-500',
    name: 'Amoxicillin 500mg',
    generic_name: 'Amoxicillin',
    category: 'Antibiotics',
    dosage_form: 'Capsule',
    strength: '500mg',
    batch_number: 'BATCH-AMOX-2027A',
    expiry_date: '2027-06-30',
    quantity: 5,
    min_stock_level: 15,
    reorder_quantity: 50,
    unit_price: 8.0,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: 'rx-item-amxclv-01',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-ATC-J01CR',
    name: 'Amoxicillin & Potassium Clavulanate 625 mg',
    generic_name: 'Amoxicillin + Potassium Clavulanate',
    category: 'Antibiotics',
    dosage_form: 'Tablet',
    strength: '625 mg',
    batch_number: 'BATCH-AMXCLV-2026A',
    expiry_date: '2026-11-30',
    quantity: 50,
    min_stock_level: 20,
    reorder_quantity: 100,
    unit_price: 22.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: 'rx-item-amxclv-02',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-ATC-J01CR',
    name: 'Amoxicillin & Potassium Clavulanate 625 mg',
    generic_name: 'Amoxicillin + Potassium Clavulanate',
    category: 'Antibiotics',
    dosage_form: 'Tablet',
    strength: '625 mg',
    batch_number: 'BATCH-AMXCLV-2027B',
    expiry_date: '2027-10-31',
    quantity: 100,
    min_stock_level: 20,
    reorder_quantity: 100,
    unit_price: 22.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: 'rx-item-cet-01',
    clinic_id: 'c-demo-moon-01',
    sku: 'MED-ATC-R06',
    name: 'Cetirizine 10mg',
    generic_name: 'Cetirizine',
    category: 'Antihistamines',
    dosage_form: 'Tablet',
    strength: '10mg',
    batch_number: 'BATCH-CET-2027A',
    expiry_date: '2027-09-30',
    quantity: 60,
    min_stock_level: 20,
    reorder_quantity: 50,
    unit_price: 4.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
  },
];

export function restorePharmacyStockOnly(): {
  restoredCount: number;
  preservedOtherClinicsCount: number;
  clinicId: string;
} {
  const statePath = path.resolve(__dirname, '../data/medlink_state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`State file not found at ${statePath}`);
  }

  const raw = fs.readFileSync(statePath, 'utf-8');
  const state = JSON.parse(raw);

  const inventoryEntries: [string, any][] = state.pharmacy_inventory || [];

  // Filter out any entries for c-demo-moon-01 while strictly preserving other clinics
  const otherClinicsEntries = inventoryEntries.filter(([_id, item]) => {
    return item.clinic_id !== 'c-demo-moon-01';
  });

  // Build restored c-demo-moon-01 entries
  const restoredMoonEntries: [string, PharmacyItem][] = CANONICAL_MOON_DENTAL_BATCHES.map((batch) => [
    batch.id,
    batch,
  ]);

  state.pharmacy_inventory = [...otherClinicsEntries, ...restoredMoonEntries];

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

  console.log(`✅ Idempotently restored ${restoredMoonEntries.length} canonical batches for c-demo-moon-01`);
  console.log(`✅ Preserved ${otherClinicsEntries.length} batches for other clinics`);

  return {
    restoredCount: restoredMoonEntries.length,
    preservedOtherClinicsCount: otherClinicsEntries.length,
    clinicId: 'c-demo-moon-01',
  };
}

if (require.main === module) {
  restorePharmacyStockOnly();
}
