/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { 
  Users, 
  Clock, 
  Wallet, 
  Settings, 
  MessageSquare, 
  Activity,
  Plus,
  Trash2,
  Trash,
  ChevronRight,
  Calculator,
  LayoutDashboard,
  LogOut,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  Download,
  QrCode,
  Camera
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  setDoc,
  deleteDoc, 
  onSnapshot, 
  serverTimestamp,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { GoogleGenAI } from "@google/genai";
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { db, auth } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';

// --- Types ---
interface Employee {
  id: string;
  nom: string;
}

interface Pointage {
  id: string;
  employe_id: string;
  heures: number;
  date: any;
  nom_employe?: string;
}

interface Config {
  taux_horaire: number;
  deduction: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// --- Constants ---
const MODELS = {
  COMPLEX: 'gemini-3.1-pro-preview',
  GENERAL: 'gemini-3-flash-preview',
  FAST: 'gemini-3.1-flash-lite-preview',
  IMAGE: 'gemini-3-pro-image-preview'
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 text-center">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100 space-y-4">
            <Activity className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-neutral-900">Oups ! Une erreur est survenue.</h2>
            <p className="text-neutral-500 text-sm">
              L'application a rencontré un problème technique.
            </p>
            <pre className="text-[10px] bg-neutral-50 p-3 rounded-lg overflow-x-auto text-left opacity-60">
              {(this as any).state.error?.message}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-neutral-900 text-white py-3 rounded-xl font-medium"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'salary' | 'settings' | 'chat' | 'art' | 'dashboard'>('dashboard');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [config, setConfig] = useState<Config>({ taux_horaire: 0, deduction: 0 });

  // --- Auth & Initial Load ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        testConnection();
      }
    });
    return () => unsubscribe();
  }, []);

  async function testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  }

  // --- Real-time Listeners ---
  useEffect(() => {
    if (!user) return;

    const unsubEmps = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'employees'));

    const unsubPointages = onSnapshot(collection(db, 'pointages'), (snap) => {
      setPointages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pointage)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pointages'));

    const unsubConfig = onSnapshot(doc(db, 'settings', 'config'), (snap) => {
      if (snap.exists()) {
        setConfig(snap.data() as Config);
      } else {
        // Init config if missing - use setDoc since it might not exist yet
        setDoc(doc(db, 'settings', 'config'), { taux_horaire: 2500, deduction: 0.1 })
          .catch(error => handleFirestoreError(error, OperationType.WRITE, 'settings/config'));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'settings/config'));

    return () => {
      unsubEmps();
      unsubPointages();
      unsubConfig();
    };
  }, [user]);

  // --- Login ---
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50">
      <RefreshCw className="w-8 h-8 animate-spin text-neutral-400" />
    </div>
  );

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50 p-4 transition-all animate-in fade-in zoom-in-95">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-neutral-100 text-center space-y-6">
        <div className="w-16 h-16 bg-neutral-900 mx-auto rounded-2xl flex items-center justify-center shadow-lg">
          <Wallet className="w-8 h-8 text-white" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Pointage & Salaire PRO</h1>
          <p className="text-neutral-500 text-sm">Connectez-vous pour gérer votre entreprise.</p>
        </div>
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-neutral-900 text-white py-3 px-6 rounded-2xl font-medium hover:bg-neutral-800 transition-all shadow-sm"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
          Se connecter avec Google
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col md:flex-row h-screen">
      {/* Sidebar - Desktop */}
      <nav className="hidden md:flex w-72 flex-col bg-white border-r border-neutral-200 p-6 space-y-8 h-full">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Gestion PRO</span>
        </div>

        <div className="space-y-1">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={LayoutDashboard} label="Tableau de Bord" />
          <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={Clock} label="Pointages" />
          <NavButton active={activeTab === 'salary'} onClick={() => setActiveTab('salary')} icon={Wallet} label="Salaires" />
          <NavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={MessageSquare} label="IA Assistant" />
          <NavButton active={activeTab === 'art'} onClick={() => setActiveTab('art')} icon={Sparkles} label="Performance Art" />
          <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings} label="Paramètres" />
        </div>

        <div className="mt-auto pt-6 border-t border-neutral-100 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <img 
              src={user.photoURL || "https://picsum.photos/seed/user/100/100"} 
              className="w-10 h-10 rounded-full border border-neutral-200" 
              alt="Profile" 
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <button 
                onClick={handleLogout}
                className="text-xs text-neutral-500 hover:text-red-500 flex items-center gap-1 transition-colors"
              >
                <LogOut className="w-3 h-3" /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10">
          {activeTab === 'dashboard' && <DashboardPage employees={employees} pointages={pointages} config={config} />}
          {activeTab === 'home' && <PointagePage employees={employees} pointages={pointages} />}
          {activeTab === 'salary' && <SalaryPage employees={employees} pointages={pointages} config={config} />}
          {activeTab === 'settings' && <SettingsPage employees={employees} config={config} />}
          {activeTab === 'chat' && <AIChatPage config={config} employees={employees} pointages={pointages} />}
          {activeTab === 'art' && <PerformanceArtPage pointages={pointages} />}
        </div>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden flex h-20 bg-white border-t border-neutral-200 justify-around items-center px-4 shrink-0 pb-safe">
        <MobileNavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={LayoutDashboard} />
        <MobileNavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={Clock} />
        <MobileNavButton active={activeTab === 'salary'} onClick={() => setActiveTab('salary')} icon={Wallet} />
        <MobileNavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={MessageSquare} />
        <MobileNavButton active={activeTab === 'art'} onClick={() => setActiveTab('art')} icon={Sparkles} />
        <MobileNavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings} />
      </nav>
    </div>
  );
}

// --- Page Components ---

function NavButton({ active, label, icon: Icon, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
        active 
          ? "bg-neutral-900 text-white shadow-md" 
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      )}
    >
      <Icon className={cn("w-5 h-5 transition-transform", active ? "" : "group-hover:scale-110")} />
      {label}
    </button>
  );
}

function MobileNavButton({ active, icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className={cn("p-2 rounded-2xl transition-all", active ? "bg-neutral-900 text-white shadow-lg" : "text-neutral-400")}>
      <Icon className="w-6 h-6" />
    </button>
  );
}

// --- Dashboard Section ---
function DashboardPage({ employees, pointages, config }: { employees: Employee[], pointages: Pointage[], config: Config }) {
  // Process data for charts
  const hoursPerEmployee = employees.map(emp => {
    const hours = pointages.filter(p => p.employe_id === emp.id).reduce((sum, p) => sum + p.heures, 0);
    return { name: emp.nom, hours: parseFloat(hours.toFixed(1)) };
  });

  const salaryDistribution = employees.map(emp => {
    const hours = pointages.filter(p => p.employe_id === emp.id).reduce((sum, p) => sum + p.heures, 0);
    const net = hours * config.taux_horaire * (1 - config.deduction);
    return { name: emp.nom, value: net };
  }).filter(d => d.value > 0);

  // Financial health metrics
  const totalHours = pointages.reduce((sum, p) => sum + p.heures, 0);
  const totalBrut = totalHours * config.taux_horaire;
  const totalNet = totalBrut * (1 - config.deduction);
  const averageHoursPerEmp = employees.length > 0 ? totalHours / employees.length : 0;

  const COLORS = ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Tableau de Bord</h2>
        <p className="text-neutral-500">Visualisez la santé financière et la performance de votre équipe.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Heures Totales" value={`${totalHours.toFixed(1)}h`} icon={Clock} detail="Mois en cours" />
        <KPICard title="Masse Salariale Net" value={formatCurrency(totalNet)} icon={Wallet} detail="Estimation actuelle" />
        <KPICard title="Moyenne / Employé" value={`${averageHoursPerEmp.toFixed(1)}h`} icon={Users} detail="Heures de travail" />
        <KPICard title="Effectif" value={employees.length.toString()} icon={Activity} detail="Employés actifs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
        {/* Hours Distribution Chart */}
        <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-neutral-900">Distribution des Heures</h3>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Par Employé</p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hoursPerEmployee}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                <Tooltip 
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="hours" fill="#171717" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Financial Distribution Chart */}
        <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-neutral-900">Masse Salariale Net</h3>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Répartition</p>
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            {salaryDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salaryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {salaryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-neutral-400 py-20">
                <Calculator className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>Pas de données de salaire</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon: Icon, detail }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-neutral-50 rounded-xl">
          <Icon className="w-5 h-5 text-neutral-900" />
        </div>
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none">{detail}</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-500">{title}</p>
        <p className="text-2xl font-black text-neutral-900 tracking-tight">{value}</p>
      </div>
    </div>
  );
}

// --- Pointage Section ---
function QRScanner({ onScan, onClose }: { onScan: (id: string) => void, onClose: () => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    scanner.render((decodedText) => {
      onScan(decodedText);
      scanner.clear();
      onClose();
    }, (error) => {
      // Quietly ignore scan errors
    });

    return () => {
      scanner.clear().catch(e => console.error("Scanner cleanup error", e));
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Camera className="w-5 h-5" /> Scannez le Badge
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors">
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>
        <div id="reader" className="w-full rounded-2xl overflow-hidden border-4 border-neutral-100"></div>
        <p className="text-center text-sm text-neutral-500">Placez le QR code de l'employé au centre du cadre.</p>
      </div>
    </div>
  );
}

function PointagePage({ employees, pointages }: { employees: Employee[], pointages: Pointage[] }) {
  const [empId, setEmpId] = useState('');
  const [hours, setHours] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [filterEmpId, setFilterEmpId] = useState('all');

  const addPointage = async () => {
    if (!empId || !hours) return;
    try {
      await addDoc(collection(db, 'pointages'), {
        employe_id: empId,
        heures: parseFloat(hours),
        date: serverTimestamp()
      });
      setEmpId('');
      setHours('');
      setIsAdding(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'pointages');
    }
  };

  const onQRScan = (scannedId: string) => {
    const employee = employees.find(e => e.id === scannedId);
    if (employee) {
      setEmpId(scannedId);
      setIsAdding(true);
    } else {
      alert("Employé non reconnu.");
    }
  };

  const deletePointage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'pointages', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `pointages/${id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Pointages</h2>
          <p className="text-neutral-500">Enregistrez les heures travaillées par vos employés.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsScanning(true)}
            className="flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-900 py-2.5 px-5 rounded-2xl font-medium hover:bg-neutral-50 transition-all shadow-sm"
          >
            <QrCode className="w-4 h-4" /> Scanner QR
          </button>
          <select 
            value={filterEmpId} 
            onChange={e => setFilterEmpId(e.target.value)}
            className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-200 transition-all shadow-sm"
          >
            <option value="all">Tous les employés</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center justify-center gap-2 bg-neutral-900 text-white py-2.5 px-5 rounded-2xl font-medium hover:bg-neutral-800 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" /> Nouveau pointage
          </button>
        </div>
      </header>

      {isScanning && <QRScanner onScan={onQRScan} onClose={() => setIsScanning(false)} />}

      {isAdding && (
        <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">Employé</label>
              <select 
                value={empId} 
                onChange={e => setEmpId(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
              >
                <option value="">Sélectionner...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">Heures</label>
              <input 
                type="number" 
                value={hours} 
                onChange={e => setHours(e.target.value)}
                placeholder="0.0"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
              />
            </div>
            <div className="flex items-end">
              <button 
                onClick={addPointage}
                className="w-full bg-neutral-900 text-white py-2.5 rounded-xl font-medium hover:bg-neutral-800 transition-all"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden h-fit">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="p-4 text-xs font-semibold uppercase text-neutral-400 tracking-wider">Employé</th>
                <th className="p-4 text-xs font-semibold uppercase text-neutral-400 tracking-wider">Date</th>
                <th className="p-4 text-xs font-semibold uppercase text-neutral-400 tracking-wider">Heures</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {[...pointages]
                .filter(p => filterEmpId === 'all' || p.employe_id === filterEmpId)
                .sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
                .map(p => {
                const emp = employees.find(e => e.id === p.employe_id);
                const dateStr = p.date ? format((p.date as Timestamp).toDate(), "d MMMM yyyy HH:mm", { locale: fr }) : "En attente...";
                return (
                  <tr key={p.id} className="hover:bg-neutral-50/50 transition-colors group">
                    <td className="p-4 font-medium">{emp?.nom || "Employé inconnu"}</td>
                    <td className="p-4 text-sm text-neutral-500 uppercase tracking-tight">{dateStr}</td>
                    <td className="p-4 font-mono font-medium">{p.heures.toFixed(1)} h</td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => deletePointage(p.id)}
                        className="p-2 text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pointages.filter(p => filterEmpId === 'all' || p.employe_id === filterEmpId).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center space-y-2">
                    <Clock className="w-8 h-8 text-neutral-200 mx-auto" />
                    <p className="text-neutral-400">Aucun pointage trouvé pour cette sélection.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Salary Section ---
function SalaryPage({ employees, pointages, config }: { employees: Employee[], pointages: Pointage[], config: Config }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Calcul des Salaires</h2>
        <p className="text-neutral-500">Vue d'ensemble des montants à payer ce mois-ci.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
        {employees.map(emp => {
          const empPointages = pointages.filter(p => p.employe_id === emp.id);
          const totalHours = empPointages.reduce((acc, p) => acc + p.heures, 0);
          const brut = totalHours * config.taux_horaire;
          const net = brut * (1 - config.deduction);

          return (
            <div key={emp.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 space-y-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-neutral-900">{emp.nom}</h3>
                  <p className="text-sm text-neutral-500 italic">{empPointages.length} pointages enregistrés</p>
                </div>
                <div className="bg-neutral-100 p-2 rounded-xl">
                  <Users className="w-5 h-5 text-neutral-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Heures Totales</p>
                  <p className="text-xl font-mono font-bold">{totalHours.toFixed(1)} h</p>
                </div>
                <div className="bg-neutral-50 p-4 rounded-2xl text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Activité</p>
                  <div className="flex justify-end gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < empPointages.length / 2 ? "bg-neutral-900" : "bg-neutral-200")} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Base ({formatCurrency(config.taux_horaire)}/h)</span>
                  <span className="font-medium">{formatCurrency(brut)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Déd. ({(config.deduction * 100).toFixed(0)}%)</span>
                  <span className="text-red-500">-{formatCurrency(brut * config.deduction)}</span>
                </div>
                <div className="pt-3 border-t border-neutral-100 flex justify-between items-center">
                  <span className="font-bold uppercase tracking-wide text-xs">Net à payer</span>
                  <span className="text-2xl font-black text-neutral-900">{formatCurrency(net)}</span>
                </div>
              </div>
            </div>
          );
        })}
        {employees.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <Users className="w-12 h-12 text-neutral-200 mx-auto" />
            <p className="text-neutral-400">Aucun employé configuré.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Settings Section ---
function SettingsPage({ employees, config }: { employees: Employee[], config: Config }) {
  const [taux, setTaux] = useState(config.taux_horaire.toString());
  const [deduc, setDeduc] = useState((config.deduction * 100).toString());
  const [newEmpNom, setNewEmpNom] = useState('');

  const saveConfig = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'config'), {
        taux_horaire: parseFloat(taux) || 0,
        deduction: (parseFloat(deduc) || 0) / 100
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'settings/config');
    }
  };

  const addEmployee = async () => {
    if (!newEmpNom) return;
    try {
      await addDoc(collection(db, 'employees'), { nom: newEmpNom });
      setNewEmpNom('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'employees');
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `employees/${id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Paramètres</h2>
        <p className="text-neutral-500">Configurez votre entreprise et vos employés.</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Payroll Config */}
        <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-neutral-400" />
            <h3 className="font-bold text-xl uppercase tracking-tight">Configuration</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">Taux Horaire (FCFA)</label>
              <input 
                type="number" 
                value={taux} 
                onChange={e => setTaux(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-neutral-200 focus:outline-none" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-neutral-400 tracking-wider">Déduction (%)</label>
              <input 
                type="number" 
                value={deduc} 
                onChange={e => setDeduc(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-neutral-200 focus:outline-none" 
              />
            </div>
            <button 
              onClick={saveConfig}
              className="w-full bg-neutral-900 text-white py-3 rounded-2xl font-medium hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
            >
              Enregistrer
            </button>
          </div>
        </div>

        {/* Employees Manage */}
        <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm space-y-6 flex flex-col">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-neutral-400" />
            <h3 className="font-bold text-xl uppercase tracking-tight">Liste des Employés</h3>
          </div>
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="flex gap-2">
              <input 
                value={newEmpNom} 
                onChange={e => setNewEmpNom(e.target.value)}
                placeholder="Nouveau nom..."
                className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-neutral-200" 
              />
              <button 
                onClick={addEmployee}
                className="bg-neutral-900 text-white p-2.5 rounded-xl hover:bg-neutral-800 shadow-sm"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 flex-1 max-h-[500px] overflow-y-auto pr-1">
              {employees.map(e => (
                <div key={e.id} className="flex flex-col p-4 bg-neutral-50 rounded-2xl group transition-all hover:bg-neutral-100 gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900">{e.nom}</span>
                    <button 
                      onClick={() => deleteEmployee(e.id)}
                      className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Supprimer l'employé"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-inner">
                    <QRCodeSVG value={e.id} size={80} level="H" />
                    <div className="text-[10px] space-y-1">
                      <p className="font-black uppercase tracking-widest text-neutral-400">Badge Employé</p>
                      <p className="text-neutral-500 font-mono">{e.id}</p>
                      <button 
                        onClick={() => window.print()} 
                        className="text-indigo-500 font-bold hover:underline"
                      >
                        Imprimer le Badge
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// --- Gemini AI Chat ---
function AIChatPage({ config, employees, pointages }: { config: Config, employees: Employee[], pointages: Pointage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg: ChatMessage = { role: 'user', parts: [{ text: input }] };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const chat = ai.chats.create({
        model: MODELS.COMPLEX,
        config: {
          systemInstruction: `Tu es un Expert en Analyse Financière et RH pour une entreprise. 
          Données actuelles de l'entreprise:
          - Taux horaire CONFIGURÉ: ${config.taux_horaire} FCFA
          - Déduction CONFIGURÉ: ${(config.deduction * 100).toFixed(0)}%
          - Liste des employés: ${employees.map(e => e.nom).join(', ')}
          - Nombre total de pointages: ${pointages.length}
          - Total heures enregistrées: ${pointages.reduce((a,p)=>a+p.heures,0).toFixed(1)}h

          Tes objectifs:
          1. Analyser la rentabilité et les coûts.
          2. Répondre aux questions sur les salaires.
          3. Suggérer des améliorations RH.
          Réponds de manière professionnelle, concise et précise.`
        },
        history: messages
      });

      const response = await chat.sendMessage({ message: input });
      if (response && response.text) {
        setMessages(prev => [...prev, { role: 'model', parts: [{ text: response.text }] }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "Désolé, j'ai rencontré une erreur temporaire dans mon module d'analyse." }] }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-full space-y-4">
      <header className="px-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-900 p-2.5 rounded-2xl shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Assistant Stratégique</h2>
            <p className="text-xs text-neutral-500 font-medium tracking-tight uppercase tracking-widest">Data Analyst by Gemini Pro</p>
          </div>
        </div>
      </header>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 space-y-6 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-16 h-16 bg-neutral-50 rounded-3xl flex items-center justify-center shadow-inner">
              <MessageSquare className="w-8 h-8 text-neutral-300" />
            </div>
            <div className="space-y-1">
              <p className="text-neutral-900 font-semibold">Prêt à analyser vos données</p>
              <p className="text-neutral-400 text-sm max-w-[240px] mx-auto">Posez des questions sur vos coûts salariaux ou demandez une projection mensuelle.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              <button 
                onClick={() => setInput("Analyse mon coût salarial total")}
                className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-full text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:bg-neutral-100 transition-all"
              >
                Analyse Coûts
              </button>
              <button 
                onClick={() => setInput("Qui a travaillé le plus ce mois-ci ?")}
                className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-full text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:bg-neutral-100 transition-all"
              >
                Activité
              </button>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex animate-in fade-in slide-in-from-bottom-2", m.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] px-5 py-3.5 rounded-2xl shadow-sm",
              m.role === 'user' ? "bg-neutral-900 text-white rounded-tr-none" : "bg-neutral-100 text-neutral-800 rounded-tl-none"
            )}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.parts[0].text}</p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 px-4 py-3 rounded-2xl flex gap-1 animate-pulse">
              <div className="w-2 h-2 bg-neutral-300 rounded-full" />
              <div className="w-2 h-2 bg-neutral-300 rounded-full" />
              <div className="w-2 h-2 bg-neutral-300 rounded-full" />
            </div>
          </div>
        )}
      </div>

      <div className="relative group pb-4">
        <input 
          value={input}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          onChange={e => setInput(e.target.value)}
          placeholder="Décrivez votre besoin d'analyse..."
          className="w-full bg-white border border-neutral-200 rounded-2xl px-6 py-5 pr-16 shadow-xl focus:outline-none focus:ring-4 focus:ring-neutral-200/50 transition-all placeholder:text-neutral-400"
        />
        <button 
          onClick={sendMessage}
          disabled={!input.trim() || isTyping}
          className="absolute right-3 top-3 p-3 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition-all shadow-md active:scale-90"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

// --- Performance Art Generator (Gemini Image) ---
function PerformanceArtPage({ pointages }: { pointages: Pointage[] }) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [prompt, setPrompt] = useState('A cubist architectural landscape representing data flow, wealth, and professional momentum, warm lighting, gold and blue tones');

  const generateArt = async () => {
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: { parts: [{ text: `${prompt}. Professional artistic visualization, surrealist elements, clean sharp edges, 8k resolution.` }] },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: size
          }
        }
      });
      
      if (response && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      alert("Erreur de génération. Assurez-vous d'avoir configuré votre clé API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col pb-12">
       <header className="flex justify-between items-center">
         <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Arts de Performance</h2>
          <p className="text-neutral-500">Générez une visualisation abstraite de votre réussite professionnelle.</p>
         </div>
         <div className="p-3 bg-indigo-50 rounded-2xl">
          <Sparkles className="w-6 h-6 text-indigo-500" />
         </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="aspect-video bg-neutral-100 rounded-[2.5rem] overflow-hidden border border-neutral-100 shadow-2xl group relative ring-8 ring-white">
            {image ? (
              <>
                <img src={image} className="w-full h-full object-cover" alt="Generated Art" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <a href={image} download="entreprise-performance.png" className="p-6 bg-white rounded-full text-neutral-900 hover:scale-110 active:scale-95 transition-all shadow-2xl flex items-center gap-2 font-bold">
                    <Download className="w-6 h-6" />
                    Télécharger
                  </a>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300 space-y-6 text-center">
                <div className="w-24 h-24 bg-neutral-50 rounded-[2rem] flex items-center justify-center shadow-inner">
                  <ImageIcon className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-bold text-neutral-400">Visualisation IA</p>
                  <p className="text-sm max-w-xs px-12">Utilisez Gemini Pro Vision pour transformer vos données en art surréaliste.</p>
                </div>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-xl flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 border-t-4 border-neutral-900 border-solid rounded-full animate-spin" />
                </div>
                <div className="text-center space-y-1">
                   <p className="text-lg font-bold text-neutral-900 animate-pulse">Gemini génère votre art...</p>
                   <p className="text-xs font-medium text-neutral-500 uppercase tracking-widest">High Quality Render Mode</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Direction Artistique</label>
              <textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-4 min-h-[140px] focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all text-sm leading-relaxed"
                placeholder="Décrivez votre vision..."
              />
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Résolution</label>
                <div className="flex gap-2">
                  {(['1K', '2K', '4K'] as const).map(s => (
                    <button 
                    key={s}
                    onClick={() => setSize(s)}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-black transition-all border",
                      size === s 
                        ? "bg-neutral-900 text-white border-neutral-900 shadow-lg" 
                        : "bg-white text-neutral-400 border-neutral-200 hover:bg-neutral-50"
                    )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={generateArt}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-neutral-900 text-white py-5 rounded-[1.5rem] font-bold text-lg hover:bg-neutral-800 disabled:opacity-50 transition-all shadow-xl active:scale-95 group"
              >
                {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6 group-hover:animate-pulse" />}
                Générer l'Image
              </button>
            </div>
          </div>

          <div className="bg-neutral-900 p-6 rounded-3xl text-white space-y-4 overflow-hidden relative shadow-2xl">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
            <div className="relative z-10 space-y-3">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Performance Update</div>
              <h4 className="font-bold text-xl italic leading-none whitespace-pre-wrap">"L'art au service de la donnée."</h4>
              <p className="text-xs text-white/60 leading-relaxed">Transformez chaque heure travaillée en une impulsion visuelle unique.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
