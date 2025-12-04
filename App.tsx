import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Users, Scissors, DollarSign, 
  LogOut, Menu, ChevronLeft, ChevronRight, 
  CheckCircle, XCircle, MessageCircle, Bell, 
  Plus, Trash2, Search, Filter, Briefcase,
  Sparkles, Copy, Share2, Loader2, Wand2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  Timestamp 
} from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'salao-beauty-default';

// Inicialização segura
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// --- CONFIGURAÇÃO GEMINI API ---
const apiKey = ""; // Injetada pelo ambiente

const callGeminiAPI = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) throw new Error('Falha na API Gemini');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível gerar o texto.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro ao conectar com a inteligência artificial. Tente novamente.";
  }
};

// --- TIPOS & INTERFACES ---
type UserRole = 'admin' | 'professional';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  color?: string; // Cor para o calendário
}

interface Service {
  id: string;
  name: string;
  duration: number; // em minutos
  price: number;
  active: boolean;
}

interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
}

interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  price: number;
  notes?: string;
}

// --- UTILS ---
const formatCurrency = (val: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getStatusColor = (status: string) => {
  switch(status) {
    case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    case 'completed': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    confirmed: 'Confirmado',
    pending: 'Pendente',
    cancelled: 'Cancelado',
    completed: 'Concluído'
  };
  return map[status] || status;
};

// --- COMPONENTES UI ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled, ...props }: any) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-pink-600 hover:bg-pink-700 text-white shadow-sm",
    secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    magic: "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-sm"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-semibold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <XCircle size={20} className="text-gray-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---

export default function BeautySalonApp() {
  // Estado Global
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile

  // Dados
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Estados de UI
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  
  // Estados AI
  const [isAiMessageModalOpen, setIsAiMessageModalOpen] = useState(false);
  const [aiSelectedAppt, setAiSelectedAppt] = useState<Appointment | null>(null);
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiContext, setAiContext] = useState('confirmation'); // confirmation, delay, promo

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // --- FIREBASE LOGIC ---

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setTimeout(() => {
            const mockRole = loginEmail.includes('admin') ? 'admin' : 'professional';
            setUserProfile({
                id: currentUser.uid,
                name: currentUser.displayName || (loginEmail.includes('admin') ? 'Administrador' : 'Profissional Demo'),
                email: currentUser.email || 'demo@beauty.com',
                role: 'admin',
                color: '#EC4899'
            });
            setLoading(false);
        }, 500);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [loginEmail]);

  // Data Fetching
  useEffect(() => {
    if (!user || !db) return;

    const unsubAppts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(data);
    });

    const unsubServices = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'services'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      setServices(data);
    });

    const unsubPros = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'professionals'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      setProfessionals(data);
    });
    
    const unsubClients = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'clients'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
    });

    return () => {
      unsubAppts();
      unsubServices();
      unsubPros();
      unsubClients();
    };
  }, [user]);

  // --- ACTIONS ---

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const serviceId = formData.get('service') as string;
    const service = services.find(s => s.id === serviceId);
    
    const newAppt: Partial<Appointment> = {
      clientName: formData.get('clientName') as string,
      clientPhone: formData.get('clientPhone') as string,
      serviceId: serviceId,
      serviceName: service?.name || 'Serviço',
      professionalId: formData.get('professional') as string,
      date: formData.get('date') as string,
      time: formData.get('time') as string,
      notes: formData.get('notes') as string,
      status: 'confirmed',
      price: service?.price || 0,
      clientId: 'temp-id'
    };

    try {
      if (editingAppointment) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', editingAppointment.id), newAppt);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), newAppt);
        showNotification(`Agendamento criado para ${newAppt.clientName}!`);
      }
      setIsAppointmentModalOpen(false);
      setEditingAppointment(null);
    } catch (error) {
      console.error("Error saving:", error);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if(!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', id), {
      status: newStatus
    });
  };

  const handleDeleteAppointment = async (id: string) => {
    if(!db || !confirm('Tem certeza que deseja cancelar e remover este agendamento?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', id));
  };

  const seedData = async () => {
    if (!db) return;
    setLoading(true);
    const servicesData = [
      { name: 'Corte Feminino', price: 80, duration: 60, active: true },
      { name: 'Corte Masculino', price: 40, duration: 30, active: true },
      { name: 'Manicure', price: 35, duration: 45, active: true },
      { name: 'Coloração', price: 150, duration: 120, active: true },
    ];
    for(const s of servicesData) await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'services'), s);

    const prosData = [
      { name: 'Ana Silva', role: 'professional', email: 'ana@salao.com', color: '#F472B6' },
      { name: 'Carlos Oliveira', role: 'professional', email: 'carlos@salao.com', color: '#60A5FA' },
    ];
    for(const p of prosData) await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'professionals'), p);

    setLoading(false);
    showNotification("Dados de exemplo gerados!");
  };

  const openAiMessageModal = (appt: Appointment) => {
    setAiSelectedAppt(appt);
    setAiGeneratedText('');
    setAiContext('confirmation');
    setIsAiMessageModalOpen(true);
  };

  const generateAiMessage = async () => {
    if (!aiSelectedAppt) return;
    setIsGeneratingAi(true);
    
    let promptContext = "";
    switch(aiContext) {
      case 'confirmation':
        promptContext = "uma mensagem amigável e profissional confirmando o agendamento";
        break;
      case 'delay':
        promptContext = "uma mensagem educada informando um pequeno atraso de 10 minutos no salão";
        break;
      case 'reschedule':
        promptContext = "uma mensagem sugerindo reagendamento de forma polida";
        break;
      case 'thanks':
        promptContext = "uma mensagem de agradecimento pós-atendimento pedindo feedback";
        break;
    }

    const prompt = `Atue como recepcionista do 'Beauty Salão'. Escreva ${promptContext} para WhatsApp.
    Cliente: ${aiSelectedAppt.clientName}.
    Serviço: ${aiSelectedAppt.serviceName}.
    Data: ${aiSelectedAppt.date.split('-').reverse().join('/')} às ${aiSelectedAppt.time}.
    Tom: Profissional, acolhedor, use emojis apropriados. Use formatação de WhatsApp (asteriscos para negrito). Em Português do Brasil.`;

    const text = await callGeminiAPI(prompt);
    setAiGeneratedText(text);
    setIsGeneratingAi(false);
  };

  const sendWhatsAppCustom = () => {
    if (!aiSelectedAppt) return;
    const cleanPhone = aiSelectedAppt.clientPhone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(aiGeneratedText)}`;
    window.open(url, '_blank');
    setIsAiMessageModalOpen(false);
  };

  const showNotification = (msg: string) => {
    alert(msg); 
  };

  // --- COMPONENTES INTERNOS DAS TELAS ---

  const LoginScreen = () => (
    <div className="min-h-screen bg-pink-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="bg-pink-100 p-4 rounded-full">
            <Scissors size={40} className="text-pink-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Beauty Salão App</h1>
        <p className="text-center text-gray-500 mb-8">Gerencie seu salão com elegância</p>
        
        <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none" 
              placeholder="admin@salao.com" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input 
              type="password" 
              value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none" 
              placeholder="******" 
            />
          </div>
          <Button className="w-full justify-center text-lg mt-4" type="submit">
            Entrar
          </Button>
        </form>
        <p className="text-xs text-center text-gray-400 mt-6">
          *Use 'admin@salao.com' para acesso total.
        </p>
      </div>
    </div>
  );

  const MarketingView = () => {
    const [selectedService, setSelectedService] = useState('');
    const [theme, setTheme] = useState('');
    const [generatedPost, setGeneratedPost] = useState('');
    const [loadingPost, setLoadingPost] = useState(false);

    const generatePost = async () => {
        if (!selectedService && !theme) return;
        setLoadingPost(true);
        const serviceName = services.find(s => s.id === selectedService)?.name || "Nossos serviços";
        const prompt = `Crie uma legenda criativa e engajadora para Instagram do 'Beauty Salão'.
        Foco: Promover o serviço '${serviceName}'.
        Tema/Contexto: ${theme || 'Geral'}.
        Inclua: 3 opções de Hashtags relevantes, Emojis, e uma Chamada para Ação (CTA) convidando para agendar.
        Tom: Inspirador e moderno. Português do Brasil.`;
        
        const text = await callGeminiAPI(prompt);
        setGeneratedPost(text);
        setLoadingPost(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="text-purple-500" /> Marketing AI Assistant
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-semibold mb-4 text-gray-700">Gerador de Conteúdo</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Serviço para Promover</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg"
                                value={selectedService}
                                onChange={(e) => setSelectedService(e.target.value)}
                            >
                                <option value="">Selecione um serviço (Opcional)...</option>
                                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Tema / Foco</label>
                            <input 
                                className="w-full p-2 border border-gray-300 rounded-lg"
                                placeholder="Ex: Verão, Dia das Mães, Dicas de Cuidado..."
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                            />
                        </div>
                        <Button 
                            variant="magic" 
                            onClick={generatePost} 
                            disabled={loadingPost}
                            className="w-full"
                        >
                            {loadingPost ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />}
                            {loadingPost ? 'Criando Mágica...' : 'Gerar Post para Instagram'}
                        </Button>
                    </div>
                </Card>

                <Card className="bg-gray-50 border-dashed border-2 border-gray-200 min-h-[300px] flex flex-col">
                    <h3 className="font-semibold mb-2 text-gray-700 flex items-center gap-2">
                        <MessageCircle size={18} /> Resultado Sugerido
                    </h3>
                    {generatedPost ? (
                        <>
                            <div className="flex-1 whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                                {generatedPost}
                            </div>
                            <div className="mt-4 flex gap-2 justify-end">
                                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(generatedPost)} className="text-xs">
                                    <Copy size={14} /> Copiar
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center p-8">
                            <Sparkles size={48} className="mb-4 opacity-20" />
                            <p>Preencha os campos ao lado e deixe a IA criar conteúdo incrível para suas redes sociais!</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
  };

  const Dashboard = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayAppts = appointments.filter(a => a.date === today);
    const revenue = todayAppts.filter(a => a.status === 'completed' || a.status === 'confirmed').reduce((acc, curr) => acc + curr.price, 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <h2 className="text-2xl font-bold text-gray-800">Painel de Controle</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex items-center gap-4 bg-gradient-to-br from-pink-500 to-pink-600 text-white border-none">
            <div className="p-3 bg-white/20 rounded-lg">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-pink-100 text-sm">Agendamentos Hoje</p>
              <h3 className="text-2xl font-bold">{todayAppts.length}</h3>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Faturamento Estimado</p>
              <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(revenue)}</h3>
            </div>
          </Card>
          <Card className="flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('marketing')}>
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <Sparkles size={24} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Assistente IA</p>
              <h3 className="text-md font-bold text-gray-800">Criar Marketing</h3>
            </div>
          </Card>
        </div>

        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Próximos Atendimentos</h3>
            <Button variant="ghost" onClick={() => setActiveTab('agenda')}>Ver Agenda Completa</Button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Horário</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Serviço</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Profissional</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appointments
                  .filter(a => a.status !== 'cancelled' && a.status !== 'completed')
                  .sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time))
                  .slice(0, 5)
                  .map(appt => (
                  <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">
                      {appt.time} <span className="text-xs text-gray-400 block">{appt.date.split('-').reverse().join('/')}</span>
                    </td>
                    <td className="p-4 text-gray-700">{appt.clientName}</td>
                    <td className="p-4 text-gray-700">{appt.serviceName}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {professionals.find(p => p.id === appt.professionalId)?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => openAiMessageModal(appt)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="IA Mensagem Mágica"
                        >
                          <Sparkles size={18} />
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(appt.id, 'confirmed')}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Confirmar"
                        >
                          <CheckCircle size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {appointments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      Nenhum agendamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const AgendaView = () => {
    const filteredAppointments = appointments.filter(a => a.date === selectedDate);
    const sortedAppointments = filteredAppointments.sort((a,b) => a.time.localeCompare(b.time));

    return (
      <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Agenda</h2>
          <div className="flex gap-2 bg-white p-1 rounded-lg border shadow-sm">
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-gray-700 font-medium outline-none px-2 py-1"
            />
          </div>
          <Button onClick={() => { setEditingAppointment(null); setIsAppointmentModalOpen(true); }}>
            <Plus size={18} /> Novo Agendamento
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
             <div className="lg:col-span-1 border-r border-gray-100 pr-4 hidden lg:block">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Profissionais</h3>
                <div className="space-y-3">
                    {professionals.map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color || '#ccc' }}></div>
                            <span className="text-sm font-medium text-gray-700">{p.name}</span>
                        </div>
                    ))}
                    {professionals.length === 0 && <p className="text-xs text-gray-400">Nenhum profissional cadastrado.</p>}
                </div>
             </div>

             <div className="lg:col-span-3">
                <div className="space-y-4">
                    {sortedAppointments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <Calendar size={48} className="mb-4 opacity-20" />
                            <p>Nenhum agendamento para este dia.</p>
                        </div>
                    ) : (
                        sortedAppointments.map(appt => (
                            <div key={appt.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-gray-100 hover:shadow-md transition-shadow bg-white relative overflow-hidden group">
                                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: professionals.find(p => p.id === appt.professionalId)?.color || 'gray' }}></div>
                                
                                <div className="flex-shrink-0 flex sm:flex-col items-center sm:justify-center gap-2 sm:w-24">
                                    <span className="text-xl font-bold text-gray-800">{appt.time}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(appt.status)}`}>
                                        {getStatusLabel(appt.status)}
                                    </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-semibold text-gray-900 truncate">{appt.clientName}</h4>
                                            <p className="text-sm text-gray-500">{appt.serviceName} • {formatCurrency(appt.price)}</p>
                                        </div>
                                    </div>
                                    {appt.notes && <p className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded italic">"{appt.notes}"</p>}
                                    <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                                        <Users size={14} />
                                        <span>{professionals.find(p => p.id === appt.professionalId)?.name || 'Profissional não encontrado'}</span>
                                    </div>
                                </div>

                                <div className="flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-4 mt-3 sm:mt-0">
                                    <button 
                                        onClick={() => openAiMessageModal(appt)}
                                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg flex items-center justify-center gap-2 transition-colors bg-purple-50 sm:bg-transparent"
                                        title="IA Mensagem Mágica"
                                    >
                                        <Sparkles size={18} /> <span className="sm:hidden text-xs font-bold">Gerar Msg</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteAppointment(appt.id)}
                                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg flex items-center justify-center gap-2"
                                        title="Cancelar"
                                    >
                                        <Trash2 size={18} /> <span className="sm:hidden text-xs font-bold">Cancelar</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const SettingsView = () => (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Configurações & Dados</h2>
        
        <Card>
            <h3 className="text-lg font-semibold mb-2">Dados de Demonstração</h3>
            <p className="text-gray-500 text-sm mb-4">Se o banco de dados estiver vazio, clique abaixo para gerar dados iniciais.</p>
            <Button onClick={seedData} variant="secondary">
                <DatabaseIcon className="w-4 h-4" /> Gerar Dados de Teste
            </Button>
        </Card>

        <Card>
            <h3 className="text-lg font-semibold mb-2">Conta</h3>
            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xl">
                    {userProfile?.name.charAt(0)}
                </div>
                <div>
                    <p className="font-medium">{userProfile?.name}</p>
                    <p className="text-sm text-gray-500">{userProfile?.email}</p>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block uppercase">{userProfile?.role}</span>
                </div>
            </div>
            <Button variant="danger" onClick={() => auth && signOut(auth)} className="w-full">
                <LogOut size={18} /> Sair do Sistema
            </Button>
        </Card>
    </div>
  );

  const DatabaseIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  );

  // --- RENDERIZADOR ---

  if (loading) return <div className="min-h-screen flex items-center justify-center text-pink-600"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div></div>;

  if (!user) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed md:relative z-30 w-64 bg-white border-r border-gray-200 h-full flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="bg-pink-600 p-2 rounded-lg text-white">
                <Scissors size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">BeautyApp</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <NavItem icon={<Calendar size={20}/>} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<Clock size={20}/>} label="Agenda" active={activeTab === 'agenda'} onClick={() => setActiveTab('agenda')} />
            <NavItem icon={<Sparkles size={20}/>} label="Marketing IA" active={activeTab === 'marketing'} onClick={() => setActiveTab('marketing')} />
            
            {userProfile?.role === 'admin' && (
                <>
                    <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Gestão</div>
                    <NavItem icon={<Users size={20}/>} label="Profissionais" active={activeTab === 'professionals'} onClick={() => showNotification('Gestão de Profissionais em breve')} />
                    <NavItem icon={<Briefcase size={20}/>} label="Serviços" active={activeTab === 'services'} onClick={() => showNotification('Gestão de Serviços em breve')} />
                </>
            )}

            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Sistema</div>
            <NavItem icon={<SettingsIcon size={20}/>} label="Configurações" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold">
                    {userProfile?.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{userProfile?.name}</p>
                    <p className="text-xs text-gray-400 truncate capitalize">{userProfile?.role}</p>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar Mobile */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
            <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600">
                <Menu size={24} />
            </button>
            <span className="font-bold text-gray-800">BeautyApp</span>
            <div className="w-6"></div> {/* Spacer */}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 relative">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'agenda' && <AgendaView />}
            {activeTab === 'marketing' && <MarketingView />}
            {activeTab === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Appointment Modal */}
      <Modal 
        isOpen={isAppointmentModalOpen} 
        onClose={() => setIsAppointmentModalOpen(false)} 
        title={editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}
      >
        <form onSubmit={handleCreateAppointment} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
                <input required name="clientName" defaultValue={editingAppointment?.clientName} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Ex: Maria Silva" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp/Telefone</label>
                <input required name="clientPhone" defaultValue={editingAppointment?.clientPhone} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Ex: 11999999999" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                    <input required type="date" name="date" defaultValue={editingAppointment?.date || selectedDate} className="w-full p-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                    <input required type="time" name="time" defaultValue={editingAppointment?.time} className="w-full p-2 border border-gray-300 rounded-lg" />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serviço</label>
                <select required name="service" defaultValue={editingAppointment?.serviceId} className="w-full p-2 border border-gray-300 rounded-lg">
                    <option value="">Selecione...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} - {formatCurrency(s.price)}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
                <select required name="professional" defaultValue={editingAppointment?.professionalId} className="w-full p-2 border border-gray-300 rounded-lg">
                    <option value="">Selecione...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
            <div className="pt-2">
                <Button type="submit" className="w-full">Salvar Agendamento</Button>
            </div>
        </form>
      </Modal>

      {/* AI Message Modal */}
      <Modal
        isOpen={isAiMessageModalOpen}
        onClose={() => setIsAiMessageModalOpen(false)}
        title="✨ Assistente de Mensagem IA"
      >
        <div className="space-y-4">
            <p className="text-sm text-gray-500">
                A IA vai gerar uma mensagem personalizada para <strong>{aiSelectedAppt?.clientName}</strong>.
            </p>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Objetivo da Mensagem</label>
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={() => setAiContext('confirmation')}
                        className={`p-2 text-sm rounded-lg border ${aiContext === 'confirmation' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        ✅ Confirmação
                    </button>
                    <button 
                        onClick={() => setAiContext('delay')}
                        className={`p-2 text-sm rounded-lg border ${aiContext === 'delay' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        ⏰ Atraso (10m)
                    </button>
                    <button 
                        onClick={() => setAiContext('reschedule')}
                        className={`p-2 text-sm rounded-lg border ${aiContext === 'reschedule' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        📅 Reagendar
                    </button>
                    <button 
                        onClick={() => setAiContext('thanks')}
                        className={`p-2 text-sm rounded-lg border ${aiContext === 'thanks' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        💖 Agradecimento
                    </button>
                </div>
            </div>

            {aiGeneratedText ? (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <textarea 
                        className="w-full bg-transparent border-none focus:ring-0 text-sm h-32"
                        value={aiGeneratedText}
                        onChange={(e) => setAiGeneratedText(e.target.value)}
                    />
                </div>
            ) : (
                <div className="h-32 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-xs text-gray-400">O texto gerado aparecerá aqui...</p>
                </div>
            )}

            <div className="flex gap-2">
                <Button variant="secondary" onClick={generateAiMessage} disabled={isGeneratingAi} className="flex-1">
                    {isGeneratingAi ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                    {aiGeneratedText ? 'Gerar Novamente' : 'Gerar Texto'}
                </Button>
                <Button variant="primary" onClick={sendWhatsAppCustom} disabled={!aiGeneratedText} className="flex-1 bg-green-600 hover:bg-green-700">
                    <MessageCircle size={16} /> Enviar WhatsApp
                </Button>
            </div>
        </div>
      </Modal>

    </div>
  );
}

// Sub-component Helper
const NavItem = ({ icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active 
        ? 'bg-pink-50 text-pink-700' 
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    {icon}
    {label}
  </button>
);

const SettingsIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);
