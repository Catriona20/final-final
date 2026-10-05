import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ListOrdered,
  Plus,
  Clock,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Stethoscope,
  PhoneCall,
  UserCheck,
  Trash2,
  Search,
  Filter,
  Activity,
  Play,
  Scale,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useClinic } from '../context/ClinicContext.js';
import { clinicApi } from '../services/api.js';
import { QueueEntry, QueuePriority, QueueStatus } from '../types/queue.js';
import { AddToQueueModal } from '../components/dashboard/AddToQueueModal.js';

interface QueuePageProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const QueuePage: React.FC<QueuePageProps> = ({
  searchQuery = '',
  setSearchQuery,
}) => {
  const {
    activeClinicId,
    queue,
    doctors,
    callNextPatient,
    markInConsultation,
    markCompleted,
    removeFromQueue,
    addToQueue,
  } = useClinic();

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ACTIVE');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('ALL');
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('ALL');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [isAddQueueOpen, setIsAddQueueOpen] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [balanceStatusMessage, setBalanceStatusMessage] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    if (!activeClinicId) return;
    const list = await clinicApi.getLoadBalanceProposals(activeClinicId);
    setProposals(list);
  }, [activeClinicId]);

  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 5000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  const handleTriggerBalancing = async () => {
    if (!activeClinicId) return;
    setIsEvaluating(true);
    try {
      const res = await clinicApi.evaluateLoadBalance(activeClinicId);
      if (res.data?.imbalanceDetails) {
        setBalanceStatusMessage(res.data.imbalanceDetails);
      }
      await fetchProposals();
    } finally {
      setIsEvaluating(false);
    }
  };

  const priorityBadges: Record<
    QueuePriority,
    { label: string; bg: string; text: string; border: string; dot: string; icon?: React.ComponentType<{ className?: string }> }
  > = {
    NORMAL: {
      label: 'Normal',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      dot: 'bg-slate-500',
    },
    URGENT: {
      label: 'Urgent',
      bg: 'bg-amber-50',
      text: 'text-amber-800 font-semibold',
      border: 'border-amber-300',
      dot: 'bg-amber-500',
      icon: AlertTriangle,
    },
    EMERGENCY: {
      label: 'Emergency',
      bg: 'bg-rose-100',
      text: 'text-rose-900 font-bold',
      border: 'border-rose-300',
      dot: 'bg-rose-600',
      icon: Flame,
    },
  };

  const priorityWeight: Record<QueuePriority, number> = {
    EMERGENCY: 3,
    URGENT: 2,
    NORMAL: 1,
  };

  const filteredQueue = useMemo(() => {
    return queue
      .filter((item) => {
        // Status filter
        if (selectedStatusFilter === 'ACTIVE') {
          if (item.status === 'COMPLETED') return false;
        } else if (selectedStatusFilter !== 'ALL' && item.status !== selectedStatusFilter) {
          return false;
        }

        // Priority filter
        if (selectedPriorityFilter !== 'ALL' && item.priority !== selectedPriorityFilter) {
          return false;
        }

        // Doctor filter
        if (selectedDoctorFilter !== 'ALL' && item.doctorName !== selectedDoctorFilter) {
          return false;
        }

        const q = (searchQuery || localSearch).toLowerCase().trim();
        if (q) {
          const match =
            item.queueNumber.toLowerCase().includes(q) ||
            item.patientName.toLowerCase().includes(q) ||
            item.doctorName.toLowerCase().includes(q) ||
            (item.reason && item.reason.toLowerCase().includes(q));
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // In consultation stays at the very top, otherwise sorted by priority weight
        if (a.status === 'IN_CONSULTATION' && b.status !== 'IN_CONSULTATION') return -1;
        if (b.status === 'IN_CONSULTATION' && a.status !== 'IN_CONSULTATION') return 1;

        if (a.status === 'WAITING' && b.status === 'WAITING') {
          return priorityWeight[b.priority] - priorityWeight[a.priority];
        }
        return 0;
      });
  }, [queue, selectedStatusFilter, selectedPriorityFilter, selectedDoctorFilter, searchQuery, localSearch]);

  const waitingCount = queue.filter((q) => q.status === 'WAITING').length;
  const inConsultCount = queue.filter((q) => q.status === 'IN_CONSULTATION').length;
  const emergencyCount = queue.filter((q) => q.priority === 'EMERGENCY' && q.status === 'WAITING').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner with Real-time metrics and Call Next Patient action */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-subtle p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/60 shadow-xs">
            <ListOrdered className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Waiting Queue Management</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                Live Dynamic Queue
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time triage prioritization (Emergency → Urgent → Normal) and consultation dispatch.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => callNextPatient()}
            disabled={waitingCount === 0}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition-all flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Call Next Patient</span>
          </button>

          <button
            onClick={() => setIsAddQueueOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add to Queue</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Waiting in Line</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{waitingCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">In Active Consultation</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{inConsultCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center font-bold">
            <Stethoscope className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Emergency / High Priority</span>
            <div className="text-2xl font-bold text-rose-600 mt-0.5">{emergencyCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold">
            <Flame className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Consent-Based Load Balancer Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-subtle p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Doctor Queue Load Balancing</h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                  Consent-Based
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Live doctor load monitoring with mandatory dual consent (patient + receiving doctor) before transfer.
              </p>
            </div>
          </div>

          <button
            onClick={handleTriggerBalancing}
            disabled={isEvaluating}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
            <span>{isEvaluating ? 'Evaluating...' : 'Check Balance'}</span>
          </button>
        </div>

        {/* Proposals List or Empty State */}
        <div className="mt-3">
          {proposals.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">
              {balanceStatusMessage || 'Active doctor queues at this clinic are balanced. No transfers pending dual consent.'}
            </p>
          ) : (
            <div className="space-y-2 mt-2">
              {proposals.slice(0, 5).map((p) => {
                const isCommitted = p.status === 'COMMITTED';
                const isDeclined = p.status === 'DECLINED';

                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-semibold text-slate-800">
                        {p.patient_name}
                        {p.procedure_name && (
                          <span className="text-slate-500 font-normal ml-1">({p.procedure_name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 font-medium">
                        <span>{p.source_doctor_name}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-500" />
                        <span className="text-indigo-700 font-bold">{p.target_doctor_name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Doctor Consent Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          p.doctor_consent === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : p.doctor_consent === 'DECLINED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        Doctor: {p.doctor_consent}
                      </span>

                      {/* Patient Consent Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          p.patient_consent === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : p.patient_consent === 'DECLINED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        Patient: {p.patient_consent}
                      </span>

                      {/* Overall Status Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          isCommitted
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isDeclined
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {isCommitted
                          ? 'Completed (Transferred)'
                          : isDeclined
                          ? 'Declined (Retained)'
                          : 'Pending Consent'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-subtle overflow-hidden">
        {/* Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter by Queue # (A001), patient name, doctor..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="ACTIVE">Active (Waiting & In Consultation)</option>
              <option value="WAITING">Waiting Only</option>
              <option value="IN_CONSULTATION">In Consultation</option>
              <option value="COMPLETED">Completed</option>
              <option value="ALL">All Entries</option>
            </select>

            <select
              value={selectedPriorityFilter}
              onChange={(e) => setSelectedPriorityFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="EMERGENCY">Emergency (Immediate)</option>
              <option value="URGENT">Urgent</option>
              <option value="NORMAL">Normal</option>
            </select>

            <select
              value={selectedDoctorFilter}
              onChange={(e) => setSelectedDoctorFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="ALL">All Doctors</option>
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.name}>
                  {doc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-5 text-center">Pos</th>
                <th className="py-3 px-5">Queue #</th>
                <th className="py-3 px-5">Patient Name</th>
                <th className="py-3 px-5">Assigned Doctor</th>
                <th className="py-3 px-5">Priority</th>
                <th className="py-3 px-5">Waiting Time</th>
                <th className="py-3 px-5">Est. Wait</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-400">
                    <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-400 mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">Queue is empty</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No patients currently waiting under this filter
                    </p>
                  </td>
                </tr>
              ) : (
                filteredQueue.map((entry, index) => {
                  const priorityInfo = priorityBadges[entry.priority] || priorityBadges.NORMAL;
                  const PriorityIcon = priorityInfo.icon;
                  const isEmergency = entry.priority === 'EMERGENCY';
                  const isInConsultation = entry.status === 'IN_CONSULTATION';
                  const isCompleted = entry.status === 'COMPLETED';

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isEmergency && entry.status === 'WAITING'
                          ? 'bg-rose-50/40 border-l-4 border-l-rose-500'
                          : isInConsultation
                          ? 'bg-purple-50/30 border-l-4 border-l-purple-500'
                          : ''
                      }`}
                    >
                      {/* Position */}
                      <td className="py-3.5 px-5 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            isInConsultation
                              ? 'bg-purple-600 text-white animate-pulse'
                              : (entry.queuePosition === 1 || (!entry.queuePosition && index === 0)) && entry.status === 'WAITING'
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isInConsultation ? '•' : (entry.queuePosition ?? (index + 1))}
                        </span>
                      </td>

                      {/* Queue # */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-xs px-2.5 py-1 rounded-md border ${
                            isEmergency
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : isInConsultation
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {entry.queueNumber}
                        </span>
                      </td>

                      {/* Patient */}
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 text-sm">
                          {entry.patientName}
                        </div>
                        {entry.reason && (
                          <div className="text-xs text-slate-400 truncate max-w-[200px]">
                            {entry.reason}
                          </div>
                        )}
                      </td>

                      {/* Doctor */}
                      <td className="py-3.5 px-5 text-slate-800 text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                          <span>{entry.doctorName}</span>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${
                            priorityInfo.bg
                          } ${priorityInfo.text} ${priorityInfo.border} ${
                            isEmergency && entry.status === 'WAITING' ? 'animate-pulse' : ''
                          }`}
                        >
                          {PriorityIcon && <PriorityIcon className="w-3.5 h-3.5" />}
                          <span>{priorityInfo.label}</span>
                        </span>
                      </td>

                      {/* Waiting Time */}
                      <td className="py-3.5 px-5 whitespace-nowrap text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{entry.waitingTime} min</span>
                        </div>
                      </td>

                      {/* Estimated Wait */}
                      <td className="py-3.5 px-5 whitespace-nowrap text-xs">
                        {isInConsultation ? (
                          <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            In Room
                          </span>
                        ) : isCompleted ? (
                          <span className="text-emerald-700 font-medium">—</span>
                        ) : entry.estimatedWait === 0 || isEmergency ? (
                          <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Immediate
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">{entry.estimatedWait} min</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            isInConsultation
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : isCompleted
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isInConsultation
                                ? 'bg-purple-600 animate-ping'
                                : isCompleted
                                ? 'bg-emerald-600'
                                : 'bg-amber-500'
                            }`}
                          />
                          {isInConsultation
                            ? 'In Consultation'
                            : isCompleted
                            ? 'Completed'
                            : 'Waiting'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {entry.status === 'WAITING' && (
                            <button
                              onClick={() => markInConsultation(entry.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
                              title="Admit to Consultation"
                            >
                              <Play className="w-3 h-3" />
                              <span>Consult</span>
                            </button>
                          )}

                          {entry.status === 'IN_CONSULTATION' && (
                            <button
                              onClick={() => markCompleted(entry.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                              title="Mark consultation completed"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Complete</span>
                            </button>
                          )}

                          <button
                            onClick={() => removeFromQueue(entry.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Showing <strong className="text-slate-800">{filteredQueue.length}</strong> active queue records
          </span>
          <span className="text-[11px] text-slate-400">
            Emergency patients automatically sorted to top position
          </span>
        </div>
      </div>

      {/* MODAL */}
      <AddToQueueModal
        isOpen={isAddQueueOpen}
        onClose={() => setIsAddQueueOpen(false)}
        doctors={doctors}
        onAddToQueue={(data) => addToQueue(data)}
      />
    </div>
  );
};
