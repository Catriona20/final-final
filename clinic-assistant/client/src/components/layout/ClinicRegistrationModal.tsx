import React, { useState } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Clock,
  CheckCircle2,
  Sparkles,
  X,
  Layers,
  Plus
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext.js';

interface ClinicRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEMO_ASSISTANTS = [
  { name: 'Sheryl Thomas', email: 'assistant01@demo.medlink.test', otp: '300001', clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental & Medical Clinic (Mylapore)', staffId: 'STAFF-MDC-01', initials: 'ST' },
  { name: 'Rahul Joseph', email: 'assistant02@demo.medlink.test', otp: '300002', clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre (Anna Nagar)', staffId: 'STAFF-AFC-02', initials: 'RJ' },
  { name: 'Nisha Kumar', email: 'assistant03@demo.medlink.test', otp: '300003', clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic (Kilpauk)", staffId: 'STAFF-GLW-03', initials: 'NK' },
  { name: 'Ravi Shankar', email: 'assistant04@demo.medlink.test', otp: '300004', clinicId: 'c-demo-heart-04', clinicName: 'Chennai Heart & Vascular Centre (Nungambakkam)', staffId: 'STAFF-CHV-04', initials: 'RS' },
  { name: 'Deepak Raj', email: 'assistant05@demo.medlink.test', otp: '300005', clinicId: 'c-demo-vision-05', clinicName: 'VisionPlus Eye Centre (T. Nagar)', staffId: 'STAFF-VPE-05', initials: 'DR' },
  { name: 'Lavanya S', email: 'assistant06@demo.medlink.test', otp: '300006', clinicId: 'c-demo-ortho-06', clinicName: 'OrthoCare Chennai (Guindy)', staffId: 'STAFF-OCC-06', initials: 'LS' },
  { name: 'Joseph Mathew', email: 'assistant07@demo.medlink.test', otp: '300007', clinicId: 'c-demo-skin-07', clinicName: 'SkinSphere Dermatology (Adyar)', staffId: 'STAFF-SSD-07', initials: 'JM' },
  { name: 'Priyanka Das', email: 'assistant08@demo.medlink.test', otp: '300008', clinicId: 'c-demo-neuro-08', clinicName: 'NeuroBridge Care Clinic (Velachery)', staffId: 'STAFF-NBC-08', initials: 'PD' },
  { name: 'Karthik V', email: 'assistant09@demo.medlink.test', otp: '300009', clinicId: 'c-demo-perambur-19', clinicName: 'Perambur Multi-Specialty Clinic (Perambur)', staffId: 'STAFF-PMS-09', initials: 'KV' },
  { name: 'Divya Raj', email: 'assistant10@demo.medlink.test', otp: '300010', clinicId: 'c-demo-smile-10', clinicName: 'Smile & Child Pediatric Centre (Porur)', staffId: 'STAFF-SCP-10', initials: 'DR' },
  { name: 'Suresh Nair', email: 'assistant11@demo.medlink.test', otp: '300011', clinicId: 'c-demo-ramapuram-11', clinicName: 'Ramapuram Family Medical Centre (Ramapuram)', staffId: 'STAFF-RFM-11', initials: 'SN' },
  { name: 'Meenakshi R', email: 'assistant12@demo.medlink.test', otp: '300012', clinicId: 'c-demo-omr-12', clinicName: 'OMR Health City Clinic (Thoraipakkam)', staffId: 'STAFF-OMR-12', initials: 'MR' },
  { name: 'Anand K', email: 'assistant13@demo.medlink.test', otp: '300013', clinicId: 'c-demo-sholinganallur-13', clinicName: 'Sholinganallur Family Healthcare (Sholinganallur)', staffId: 'STAFF-SFH-13', initials: 'AK' },
  { name: 'Shalini G', email: 'assistant14@demo.medlink.test', otp: '300014', clinicId: 'c-demo-tambaram-14', clinicName: 'Tambaram Prime Healthcare (Tambaram)', staffId: 'STAFF-TPH-14', initials: 'SG' },
  { name: 'Vignesh B', email: 'assistant15@demo.medlink.test', otp: '300015', clinicId: 'c-demo-chromepet-15', clinicName: 'Chromepet Medical Pavilion (Chromepet)', staffId: 'STAFF-CMP-15', initials: 'VB' },
  { name: 'Reshma T', email: 'assistant16@demo.medlink.test', otp: '300016', clinicId: 'c-demo-pallavaram-16', clinicName: 'Pallavaram Prime Health Clinic (Pallavaram)', staffId: 'STAFF-PPH-16', initials: 'RT' },
  { name: 'Arjun P', email: 'assistant17@demo.medlink.test', otp: '300017', clinicId: 'c-demo-ambattur-17', clinicName: 'Ambattur Industrial Care Clinic (Ambattur)', staffId: 'STAFF-AIC-17', initials: 'AP' },
  { name: 'Pooja M', email: 'assistant18@demo.medlink.test', otp: '300018', clinicId: 'c-demo-besant-18', clinicName: 'Besant Nagar Coastal Health Care (Besant Nagar)', staffId: 'STAFF-BNC-18', initials: 'PM' },
  { name: 'Manoj S', email: 'assistant19@demo.medlink.test', otp: '300019', clinicId: 'c-demo-avadi-18', clinicName: 'Avadi Central Care Hospital (Avadi)', staffId: 'STAFF-ACC-19', initials: 'MS' },
  { name: 'Kavitha R', email: 'assistant20@demo.medlink.test', otp: '300020', clinicId: 'c-demo-royapuram-20', clinicName: 'Royapuram Community Health Clinic (Royapuram)', staffId: 'STAFF-RCH-20', initials: 'KR' },
  { name: 'Moon Dental Assistant', email: 'assistant2773@demo.medlink.test', otp: '302773', clinicId: 'c-moon-dental-villivakkam-2773', clinicName: 'Moon Dental Clinic (Villivakkam - 2773)', staffId: 'STAFF-MDC-2773', initials: 'MD' },
];

export const ClinicRegistrationModal: React.FC<ClinicRegistrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { clinics, activeClinicId, setActiveClinicId, registerNewClinic, setOperator, addToast } = useClinic();
  const [activeTab, setActiveTab] = useState<'register' | 'switch' | 'assistants'>('switch');

  // Form Fields
  const [clinicName, setClinicName] = useState('Moon Dental Clinic');
  const [address, setAddress] = useState('Villivakkam, Chennai');
  const [phone, setPhone] = useState('909090909');
  const [emergencyHotline, setEmergencyHotline] = useState('909090909');
  const [operatorName, setOperatorName] = useState('');
  const [email, setEmail] = useState('contact@moondental.test');
  const [category, setCategory] = useState('Dentistry');
  const [department, setDepartment] = useState('Dentistry');
  const [openHours, setOpenHours] = useState('10:00 AM - 06:00 PM');
  const [consultationFee, setConsultationFee] = useState('₹400');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName.trim() || !address.trim()) {
      addToast('error', 'Validation Error', 'Clinic Name and Address are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerNewClinic({
        name: clinicName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        emergencyHotline: emergencyHotline.trim(),
        email: email.trim(),
        category: category.trim(),
        departments: [department.trim()],
        openHours: openHours.trim(),
        consultationFee: consultationFee.trim(),
        operatorName: operatorName.trim() || undefined,
      });

      if (res.success) {
        addToast(
          'success',
          'Clinic Registered & Connected',
          `Created "${res.clinic?.name || clinicName}". Clinic Assistant is now managing this facility.`
        );
        onClose();
      } else {
        addToast('error', 'Registration Failed', res.message || 'Could not register clinic.');
      }
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to register clinic');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchClinic = (id: string, name: string) => {
    setActiveClinicId(id);
    addToast('info', 'Clinic Switched', `Now managing ${name} (ID: ${id})`);
    onClose();
  };

  const handleSelectAssistant = (ast: typeof DEMO_ASSISTANTS[0]) => {
    setActiveClinicId(ast.clinicId);
    setOperator({
      name: ast.name,
      role: 'CLINIC_ADMIN',
      station: 'Station 01 — Front Desk',
      shift: 'Day Shift (08:00 AM – 04:00 PM)',
      staffId: ast.staffId,
      initials: ast.initials,
    });
    addToast('success', 'Assistant Active', `Logged in as ${ast.name} managing ${ast.clinicName}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
              <Building2 className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Clinic Assistant Facility Setup</h3>
              <p className="text-xs text-slate-500">Multi-Clinic Registration & Demo Assistant Switcher</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 text-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-4 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveTab('switch')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'switch'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>My Clinics ({clinics.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('assistants')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'assistants'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Demo Assistants ({DEMO_ASSISTANTS.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Clinic</span>
          </button>
        </div>

        {activeTab === 'assistants' ? (
          /* DEMO ASSISTANTS TAB */
          <div className="space-y-3 mt-4">
            <p className="text-xs text-slate-500">
              Select one of the {DEMO_ASSISTANTS.length} pre-seeded Demo Clinic Assistants to auto-switch facility and operator credentials:
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {DEMO_ASSISTANTS.map((ast) => {
                const isActive = ast.clinicId === activeClinicId;
                return (
                  <div
                    key={ast.email}
                    onClick={() => handleSelectAssistant(ast)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-teal-50 border-teal-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{ast.name}</h4>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 rounded">
                          {ast.staffId}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-600 text-white">
                            Current Operator
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">{ast.clinicName}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <code>{ast.email}</code>
                        <span>•</span>
                        <span className="font-mono text-amber-700 bg-amber-50 px-1 rounded">OTP: {ast.otp}</span>
                      </div>
                    </div>
                    <button className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-600 hover:text-white rounded-lg border border-teal-200 transition-colors">
                      Switch
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'register' ? (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegisterSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clinic Name *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="e.g. MedLink Dental Care — Demo Clinic"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clinic Address & City *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Anna Nagar, Chennai, Tamil Nadu"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 44 2621 1111"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Official Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@moondental.test"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Emergency Hotline
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-rose-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={emergencyHotline}
                    onChange={(e) => setEmergencyHotline(e.target.value)}
                    placeholder="909090909"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Front Desk Lead Operator
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="e.g. Lead Receptionist"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Primary Specialization
                </label>
                <select
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setCategory(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="Dentistry">Dentistry</option>
                  <option value="General Medicine">General Medicine</option>
                  <option value="Ophthalmology">Ophthalmology</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Dermatology">Dermatology</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Orthopedics">Orthopedics</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Operating Hours
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={openHours}
                    onChange={(e) => setOpenHours(e.target.value)}
                    placeholder="09:00 AM - 05:00 PM"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-teal-50 rounded-xl border border-teal-100 flex items-start gap-2 text-xs text-teal-800">
              <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
              <span>
                <strong>PostgreSQL Persistence:</strong> Once registered, this clinic becomes immediately discoverable in Patient App and select-able in Doctor App.
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : 'Register & Connect Clinic'}
              </button>
            </div>
          </form>
        ) : (
          /* SWITCH CLINIC LIST */
          <div className="space-y-3 mt-4">
            <p className="text-xs text-slate-500">
              Select a facility to manage appointments, live queue, doctor roster, and walk-ins:
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {clinics.map((clinic) => {
                const isActive = clinic.id === activeClinicId;
                return (
                  <div
                    key={clinic.id}
                    onClick={() => handleSwitchClinic(clinic.id, clinic.name)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-teal-50/80 border-teal-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{clinic.name}</h4>
                        {isActive && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-600 text-white">
                            Active Facility
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{clinic.address}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>ID: <code className="text-slate-600">{clinic.id}</code></span>
                        <span>•</span>
                        <span>{clinic.category || 'Specialty Clinic'}</span>
                      </div>
                    </div>
                    {isActive ? (
                      <CheckCircle2 className="w-5 h-5 text-teal-600" />
                    ) : (
                      <button className="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-teal-600 hover:text-white rounded-lg transition-colors">
                        Select
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
