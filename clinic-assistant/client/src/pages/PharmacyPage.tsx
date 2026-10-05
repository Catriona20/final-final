import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Pill,
  Package,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  SlidersHorizontal,
  Layers,
  Sparkles,
  FileText,
  X
} from 'lucide-react';
import { clinicApi } from '../services/api.js';
import { useClinic } from '../context/ClinicContext.js';
import { PharmacyItem, LowStockAlert, DemandForecast } from '../types/pharmacy.js';

interface PharmacyPageProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const PharmacyPage: React.FC<PharmacyPageProps> = ({
  searchQuery = '',
  setSearchQuery,
}) => {
  const { addToast, activeClinicId } = useClinic();
  const currentClinicId = activeClinicId || 'c-demo-moon-01';

  const [inventory, setInventory] = useState<PharmacyItem[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);
  const [forecast, setForecast] = useState<DemandForecast | null>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [localSearch, setLocalSearch] = useState<string>(searchQuery);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Modals
  const [isDispenseModalOpen, setIsDispenseModalOpen] = useState<boolean>(false);
  const [isAddBatchModalOpen, setIsAddBatchModalOpen] = useState<boolean>(false);
  const [selectedItemForDispense, setSelectedItemForDispense] = useState<PharmacyItem | null>(null);

  // Form states
  const [dispenseQty, setDispenseQty] = useState<number>(5);
  const [dispensePatientName, setDispensePatientName] = useState<string>('');
  const [dispensePrescriptionId, setDispensePrescriptionId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // New Batch Form
  const [newBatchName, setNewBatchName] = useState<string>('');
  const [newGenericName, setNewGenericName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('General Medicine');
  const [newDosageForm, setNewDosageForm] = useState<string>('Tablet');
  const [newStrength, setNewStrength] = useState<string>('500mg');
  const [newBatchNumber, setNewBatchNumber] = useState<string>('');
  const [newExpiryDate, setNewExpiryDate] = useState<string>('2027-12-31');
  const [newQuantity, setNewQuantity] = useState<number>(100);
  const [newMinStock, setNewMinStock] = useState<number>(20);
  const [newUnitPrice, setNewUnitPrice] = useState<number>(10.0);

  const findMatchingInventoryItem = useCallback(
    (rxMedName: string, rxDosage: string = '', items: PharmacyItem[]): PharmacyItem | undefined => {
      if (!rxMedName || items.length === 0) return undefined;
      const normRx = rxMedName.toLowerCase().trim();

      // Rule 0: SKU match if prescription references SKU or item SKU matches
      const skuMatch = items.find((i) => i.sku && (normRx === i.sku.toLowerCase() || normRx.includes(i.sku.toLowerCase())));
      if (skuMatch) return skuMatch;

      const rxHasAmox = normRx.includes('amoxicillin');
      const rxHasClav = normRx.includes('clavulanate') || normRx.includes('potassium clavulanate');
      const rxHas625 = normRx.includes('625') || rxDosage.includes('625');

      // Rule 1: Amoxicillin 500mg must NEVER match Amoxicillin & Potassium Clavulanate 625 mg
      if (rxHasAmox && !rxHasClav && !rxHas625) {
        return items.find((i) => {
          const name = i.name.toLowerCase();
          const gen = (i.generic_name || '').toLowerCase();
          return (name.includes('amoxicillin') || gen.includes('amoxicillin')) && !name.includes('clavulanate') && !gen.includes('clavulanate');
        });
      }

      // Rule 2: Combination Amoxicillin & Clavulanate 625mg
      if (rxHasClav || (rxHasAmox && rxHas625)) {
        const combo = items.find((i) => {
          const name = i.name.toLowerCase();
          const gen = (i.generic_name || '').toLowerCase();
          return (name.includes('amoxicillin') || gen.includes('amoxicillin')) && (name.includes('clavulanate') || gen.includes('clavulanate'));
        });
        if (combo) return combo;
      }

      // Rule 3: Exact name or generic match
      const exact = items.find((i) => i.name.toLowerCase() === normRx || (i.generic_name && i.generic_name.toLowerCase() === normRx));
      if (exact) return exact;

      // Rule 4: Substring match with strict strength check
      return items.find((i) => {
        const iName = i.name.toLowerCase();
        const iGen = (i.generic_name || '').toLowerCase();
        const nameMatch = iName.includes(normRx) || normRx.includes(iName) || (iGen && (iGen.includes(normRx) || normRx.includes(iGen)));
        if (!nameMatch) return false;

        const iStrength = (i.strength || '').toLowerCase().replace(/\s+/g, '');
        const rxStr = (rxDosage || normRx).toLowerCase().replace(/\s+/g, '');
        if (iStrength && (rxStr.includes('500mg') || rxStr.includes('625mg') || rxStr.includes('650mg'))) {
          if (rxStr.includes('625') && !iStrength.includes('625') && !iName.includes('625')) return false;
          if (rxStr.includes('500') && !iStrength.includes('500') && !iName.includes('500')) return false;
          if (rxStr.includes('650') && !iStrength.includes('650') && !iName.includes('650')) return false;
        }
        return true;
      });
    },
    []
  );

  const fetchPharmacyData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [items, alerts, fc, rxList] = await Promise.all([
        clinicApi.getPharmacyInventory({ search: localSearch, category: selectedCategory, clinicId: currentClinicId }),
        clinicApi.getLowStockAlerts(currentClinicId),
        clinicApi.getPharmacyForecast(),
        clinicApi.getPendingPrescriptions(currentClinicId),
      ]);
      setInventory(items);
      setLowStockAlerts(alerts);
      setForecast(fc);
      setPrescriptions(rxList || []);
    } catch (err) {
      console.warn('Error loading pharmacy data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [localSearch, selectedCategory, currentClinicId]);

  useEffect(() => {
    fetchPharmacyData();
  }, [fetchPharmacyData]);

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    inventory.forEach((i) => {
      if (i.category) cats.add(i.category);
    });
    return Array.from(cats);
  }, [inventory]);

  const totalSKUs = inventory.length;
  const criticalCount = inventory.filter((i) => i.quantity <= i.min_stock_level).length;
  const expiringCount = inventory.filter((i) => {
    const diff = new Date(i.expiry_date).getTime() - Date.now();
    return diff <= 90 * 86400000 && diff > 0;
  }).length;

  const handleOpenDispense = (
    item?: PharmacyItem,
    rx?: any,
    targetMed?: any,
    overrideQty?: number
  ) => {
    let targetItem = item;
    if (!targetItem && targetMed) {
      targetItem = findMatchingInventoryItem(targetMed.name, targetMed.dosage, inventory);
    }
    if (!targetItem && rx && rx.medicines && rx.medicines.length > 0) {
      targetItem = findMatchingInventoryItem(rx.medicines[0].name, rx.medicines[0].dosage, inventory);
    }
    if (!targetItem && inventory.length > 0) {
      targetItem = inventory[0];
    }

    if (targetItem) {
      setSelectedItemForDispense(targetItem);
      setNewBatchName(targetItem.name);
    }

    if (rx) {
      setDispensePrescriptionId(rx.id || rx.appointment_id || '');
      setDispensePatientName(rx.patient_name || 'Patient');
    } else {
      setDispensePrescriptionId('');
      setDispensePatientName('');
    }

    if (typeof overrideQty === 'number' && overrideQty > 0) {
      setDispenseQty(overrideQty);
    } else if (targetMed?.duration) {
      const dMatch = (targetMed.duration || '').match(/(\d+)/);
      // Duration days directly as unit quantity (e.g., 5 days -> 5 units)
      // NEVER multiply by 2 or hardcode 10
      setDispenseQty(dMatch ? parseInt(dMatch[1], 10) : 5);
    } else if (rx?.medicines?.[0]?.duration) {
      const dMatch = (rx.medicines[0].duration || '').match(/(\d+)/);
      setDispenseQty(dMatch ? parseInt(dMatch[1], 10) : 5);
    } else {
      setDispenseQty(5);
    }

    setIsDispenseModalOpen(true);
  };

  const handleDispenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForDispense) return;

    const quantityToSend = Number(dispenseQty);
    if (isNaN(quantityToSend) || quantityToSend <= 0) {
      addToast('error', 'Invalid Quantity', 'Please enter a valid quantity greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await clinicApi.dispenseMedicine({
        medicineName: selectedItemForDispense.name,
        quantity: quantityToSend,
        patientName: dispensePatientName || 'Outpatient',
        prescriptionId: dispensePrescriptionId || undefined,
        dispensedBy: 'Reception Pharmacist Staff',
        clinicId: currentClinicId,
      });

      if (res.success) {
        const actualDispensed = res.totalDispensed ?? quantityToSend;
        addToast(
          'success',
          'Medicine Dispensed (FEFO)',
          `Dispensed ${actualDispensed} unit(s) of ${selectedItemForDispense.name}. Earliest batches depleted first.`
        );
        setIsDispenseModalOpen(false);
        fetchPharmacyData();
      } else {
        addToast('error', 'Dispensation Failed', res.error || 'Stock could not be dispensed.');
      }
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Dispensation error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName || !newBatchNumber || !newExpiryDate) {
      addToast('error', 'Validation Error', 'Please complete required batch details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await clinicApi.addPharmacyItem({
        clinicId: currentClinicId,
        name: newBatchName,
        genericName: newGenericName || newBatchName,
        category: newCategory,
        dosageForm: newDosageForm,
        strength: newStrength,
        batchNumber: newBatchNumber,
        expiryDate: newExpiryDate,
        quantity: Number(newQuantity),
        minStockLevel: Number(newMinStock),
        unitPrice: Number(newUnitPrice),
      });

      if (res.success) {
        addToast('success', 'Batch Added', `Batch ${newBatchNumber} of ${newBatchName} added to inventory.`);
        setIsAddBatchModalOpen(false);
        setSelectedCategory('All');
        setLocalSearch('');
        setNewBatchName('');
        setNewGenericName('');
        setNewBatchNumber('');
        fetchPharmacyData();
      } else {
        addToast('error', 'Failed', res.message || 'Failed to add batch.');
      }
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to add batch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
              <Pill className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Digital Pharmacy & FEFO Stock Engine</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time pharmaceutical inventory, First-Expiry-First-Out dispensing, and demand analytics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenDispense()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-xs transition-colors"
          >
            <Package className="w-4 h-4" />
            <span>Dispense Medicine</span>
          </button>

          <button
            onClick={() => setIsAddBatchModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Stock Batch</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total SKUs</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalSKUs}</p>
          <p className="text-xs text-slate-400 mt-1">In active pharmacy catalog</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Stock SKUs</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">{criticalCount}</p>
          <p className="text-xs text-amber-700/80 mt-1">At or below reorder point</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiring &lt;90 Days</span>
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-2">{expiringCount}</p>
          <p className="text-xs text-rose-700/80 mt-1">FEFO prioritized for dispensing</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">FEFO Protocol</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-sm font-bold text-emerald-600 mt-2">Active Enforcement</p>
          <p className="text-xs text-slate-400 mt-1">Auto-selects earliest valid batch</p>
        </div>
      </div>

      {/* Demand Forecaster Banner */}
      {forecast && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-xl bg-blue-600 text-white mt-0.5">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-900">Hospital Pharmacy Demand Forecaster</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-200 text-blue-800">
                  {forecast.status === 'forecast_available' ? 'Calculated' : 'Heuristic Mode'}
                </span>
              </div>
              <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                {forecast.message}
              </p>
              {forecast.status === 'forecast_available' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-blue-200/60">
                  <div>
                    <span className="text-[11px] text-blue-700 block">Daily Burn Rate</span>
                    <span className="text-sm font-bold text-blue-950">{forecast.dailyAverageBurnRate} units/day</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-blue-700 block">Projected 30-Day Demand</span>
                    <span className="text-sm font-bold text-blue-950">{forecast.projected30DayDemand} units</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-blue-700 block">Recommended Safety Buffer</span>
                    <span className="text-sm font-bold text-blue-950">{forecast.recommendedSafetyStock} units</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search medicine name, generic name, or batch #..."
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value);
              if (setSearchQuery) setSearchQuery(e.target.value);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => fetchPharmacyData()}
            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            title="Refresh Inventory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Doctor Prescriptions Waiting for Dispensation */}
      {prescriptions.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-teal-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Doctor Prescriptions Ready for Dispensing ({prescriptions.length})
              </h2>
            </div>
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
              Live Synchronized
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {prescriptions.map((rx) => {
              const rxMeds = rx.medicines || [];
              return (
                <div
                  key={rx.id}
                  className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {rx.patient_name || 'Patient'}
                      </span>
                      <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                        {rx.id}
                      </span>
                      {rx.created_at && (
                        <span className="text-[11px] text-slate-400">
                          {new Date(rx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Medicines List: Exact stored names, with separate inventory matching indicator and individual dispense button */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {rxMeds.map((m: any, idx: number) => {
                      const matchedItem = findMatchingInventoryItem(m.name, m.dosage, inventory);
                      const dMatch = (m.duration || '').match(/(\d+)/);
                      const defaultMedQty = dMatch ? parseInt(dMatch[1], 10) : 5;

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-600 mt-0.5 shrink-0">
                              <Pill className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {m.name}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Dose: {m.dosage || 'Standard'} • Dur: {m.duration || '5 days'} • Freq: {m.frequency || '1-0-1'}
                              </p>
                              {matchedItem ? (
                                <p className="text-[10px] text-teal-700 font-medium mt-0.5 flex items-center gap-1">
                                  <span>SKU: {matchedItem.sku || matchedItem.name}</span>
                                  <span className="text-slate-400">•</span>
                                  <span>Avail: {matchedItem.quantity}</span>
                                </p>
                              ) : (
                                <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                                  No SKU match in current inventory
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            disabled={!matchedItem || matchedItem.quantity === 0}
                            onClick={() => handleOpenDispense(matchedItem, rx, m, defaultMedQty)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                              !matchedItem || matchedItem.quantity === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                            }`}
                          >
                            Dispense ({defaultMedQty})
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pharmacy Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5">Medicine & Generic</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Batch #</th>
                <th className="px-4 py-3.5">Expiry Date</th>
                <th className="px-4 py-3.5">Stock vs Min</th>
                <th className="px-4 py-3.5">Unit Price</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No pharmacy items found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or filter.</p>
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const isCritical = item.quantity === 0;
                  const isLow = item.quantity <= item.min_stock_level;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{item.name}</span>
                          {item.sku && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium bg-slate-100 text-slate-600 rounded">
                              {item.sku}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{item.generic_name || item.name} • {item.strength}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800">
                        {item.batch_number}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <span className={`font-semibold ${item.isExpired ? 'text-rose-600' : 'text-slate-700'}`}>
                          {item.expiry_date}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isCritical ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs text-slate-400">/ min {item.min_stock_level}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        ₹{item.unit_price}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.isExpired ? (
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                            Expired
                          </span>
                        ) : isCritical ? (
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          disabled={item.quantity === 0 || item.isExpired}
                          onClick={() => handleOpenDispense(item)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            item.quantity === 0 || item.isExpired
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                          }`}
                        >
                          Dispense
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DISPENSE MODAL */}
      {isDispenseModalOpen && selectedItemForDispense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Pill className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Dispense Medicine (FEFO)</h3>
                  <p className="text-xs text-slate-500">First-Expiry-First-Out Batch Assignment</p>
                </div>
              </div>
              <button
                onClick={() => setIsDispenseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 text-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispenseSubmit} className="space-y-4 mt-4">
              {prescriptions.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Link Pending Prescription
                  </label>
                  <select
                    value={dispensePrescriptionId}
                    onChange={(e) => {
                      const selRx = prescriptions.find((p) => p.id === e.target.value);
                      if (selRx) {
                        setDispensePrescriptionId(selRx.id || '');
                        setDispensePatientName(selRx.patient_name || 'Patient');
                        if (selRx.medicines?.[0]) {
                          const match = findMatchingInventoryItem(selRx.medicines[0].name, selRx.medicines[0].dosage, inventory);
                          if (match) setSelectedItemForDispense(match);
                        }
                      } else {
                        setDispensePrescriptionId('');
                        setDispensePatientName('');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">-- Standalone Dispensation (No Prescription) --</option>
                    {prescriptions.map((rx) => (
                      <option key={rx.id} value={rx.id}>
                        {rx.patient_name || 'Patient'} - {rx.id} ({rx.medicines?.map((m: any) => m.name).join(', ') || 'Prescription'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Medicine Catalog / Inventory Item *
                </label>
                <select
                  value={selectedItemForDispense.id}
                  onChange={(e) => {
                    const match = inventory.find((i) => i.id === e.target.value);
                    if (match) setSelectedItemForDispense(match);
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium text-slate-800"
                >
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.category}) — Batch: {item.batch_number}, Exp: {item.expiry_date}, Stock: {item.quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity to Dispense *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedItemForDispense.quantity}
                    value={dispenseQty === 0 ? '' : dispenseQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setDispenseQty(isNaN(val) ? 0 : val);
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-semibold text-slate-900"
                    required
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Available: {selectedItemForDispense.quantity} units
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Prescription ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. rx-2026-001"
                    value={dispensePrescriptionId}
                    onChange={(e) => setDispensePrescriptionId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Patient Name
                </label>
                <input
                  type="text"
                  placeholder="Patient Name"
                  value={dispensePatientName}
                  onChange={(e) => setDispensePatientName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-teal-50 rounded-xl border border-teal-100 flex items-start gap-2 text-xs text-teal-800">
                <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                <span>
                  <strong>FEFO Rule:</strong> System automatically depletes batch with earliest expiry date (<code>{selectedItemForDispense.batch_number}</code>, Exp: <code>{selectedItemForDispense.expiry_date}</code>) first.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDispenseModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Dispensing...' : 'Confirm FEFO Dispensation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD BATCH MODAL */}
      {isAddBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-slate-900 text-white">
                  <Package className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add Medicine Stock Batch</h3>
                  <p className="text-xs text-slate-500">Record inbound pharmaceuticals to pharmacy stock</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddBatchModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 text-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBatchSubmit} className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Medicine Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amoxicillin 500mg"
                    value={newBatchName}
                    onChange={(e) => setNewBatchName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Generic Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amoxicillin"
                    value={newGenericName}
                    onChange={(e) => setNewGenericName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="General Medicine">General Medicine</option>
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Analgesics & Antipyretics">Analgesics</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Antidiabetic">Antidiabetic</option>
                    <option value="Respiratory & Allergy">Respiratory</option>
                    <option value="Dermatology">Dermatology</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Dosage Form
                  </label>
                  <select
                    value={newDosageForm}
                    onChange={(e) => setNewDosageForm(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drops">Drops</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Strength
                  </label>
                  <input
                    type="text"
                    value={newStrength}
                    onChange={(e) => setNewStrength(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BATCH-2027-01"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Min Alert Level
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    value={newUnitPrice}
                    onChange={(e) => setNewUnitPrice(parseFloat(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddBatchModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Save Medicine Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
