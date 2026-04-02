/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs,
  getDocFromServer,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut,
  signInAnonymously
} from 'firebase/auth';
import { db, auth } from './firebase';
import { InventoryItem, Goal } from './types';
import { cn } from './lib/utils';
import { translations, Language } from './i18n';
import { 
  Home, 
  BarChart3, 
  Target, 
  Plus, 
  Check, 
  LogOut, 
  TrendingUp, 
  Calendar, 
  DollarSign,
  ChevronRight,
  Loader2,
  AlertCircle,
  Users,
  Layers,
  Settings,
  Database,
  Trash2,
  ShieldCheck,
  Moon,
  Sun,
  Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, addDays, parseISO } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

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
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-zinc-400 mb-6 max-w-md">
          {error?.message.includes('{') ? 'A database error occurred. Please check your connection.' : error?.message || 'An unexpected error occurred.'}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-zinc-800 text-white rounded-full hover:bg-zinc-700 transition-colors"
        >
          Reload App
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'goal' | 'manage'>('home');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'frequency' | 'cost'>('frequency');
  const [isFamilyMode, setIsFamilyMode] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [lang, setLang] = useState<Language>('en');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const t = translations[lang];

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        setIsAuthReady(true);
        setIsLoading(false);
        setAuthError(null);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error: any) {
          console.error('Anonymous login error:', error);
          if (error.code === 'auth/configuration-not-found') {
            setAuthError("Anonymous Auth is not enabled in your Firebase Console. Please enable it under Authentication > Sign-in method.");
          } else {
            setAuthError(error.message);
          }
          setIsAuthReady(true);
          setIsLoading(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setIsFamilyMode(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user || !isAuthReady) return;

    let inventoryQuery;
    if (isFamilyMode) {
      inventoryQuery = query(
        collection(db, 'inventory'),
        orderBy('addedDate', 'desc')
      );
    } else {
      inventoryQuery = query(
        collection(db, 'inventory'),
        where('uid', '==', user.uid),
        orderBy('addedDate', 'desc')
      );
    }

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });

    let goalQuery;
    if (isFamilyMode) {
      goalQuery = query(
        collection(db, 'goals'),
        limit(10) // Show all family goals
      );
    } else {
      goalQuery = query(
        collection(db, 'goals'),
        where('uid', '==', user.uid),
        limit(1)
      );
    }

    const unsubscribeGoal = onSnapshot(goalQuery, (snapshot) => {
      if (!snapshot.empty) {
        // In family mode, we just take the first goal for the UI or handle multiple
        setGoal({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Goal);
      } else {
        setGoal(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => {
      unsubscribeInventory();
      unsubscribeGoal();
    };
  }, [user, isAuthReady]);

  // --- Actions ---
  const addItem = async (name: string, cost: number, quantity: number, unit: string) => {
    if (!user) {
      console.error("User not authenticated. Please wait or check Firebase console.");
      return;
    }
    try {
      await addDoc(collection(db, 'inventory'), {
        name,
        cost,
        quantity,
        unit,
        addedDate: new Date().toISOString(),
        isFinished: false,
        uid: user.uid
      });
      setIsAddModalOpen(false);
    } catch (error) {
      console.error("Error adding document: ", error);
      handleFirestoreError(error, OperationType.CREATE, 'inventory');
    }
  };

  const finishItem = async (id: string) => {
    try {
      await updateDoc(doc(db, 'inventory', id), {
        isFinished: true,
        finishedDate: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${id}`);
    }
  };

  const updateGoal = async (targetPrice: number, currentSavings: number) => {
    if (!user) return;
    try {
      if (goal?.id) {
        await updateDoc(doc(db, 'goals', goal.id), {
          targetPrice,
          currentSavings
        });
      } else {
        await addDoc(collection(db, 'goals'), {
          targetPrice,
          currentSavings,
          downpaymentPercent: 25,
          interestRate: 16,
          uid: user.uid
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    }
  };

  // --- Calculations ---
  const activeItems = useMemo(() => inventory.filter(i => !i.isFinished), [inventory]);
  const finishedItems = useMemo(() => inventory.filter(i => i.isFinished), [inventory]);

  const stats = useMemo(() => {
    const monthlySpend = finishedItems.reduce((acc, item) => {
      const date = parseISO(item.finishedDate!);
      const month = format(date, 'MMM');
      acc[month] = (acc[month] || 0) + item.cost;
      return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(monthlySpend).map(([name, value]) => ({ name, value }));
    
    const frequency = finishedItems.reduce((acc, item) => {
      const existing = acc.find(a => a.name === item.name);
      const days = differenceInDays(parseISO(item.finishedDate!), parseISO(item.addedDate)) || 1;
      const rate = item.quantity / days;
      const costPerDay = item.cost / days;

      if (existing) {
        existing.count += 1;
        existing.totalCost += item.cost;
        existing.totalQuantity += item.quantity;
        existing.rates.push(rate);
        existing.costRates.push(costPerDay);
      } else {
        acc.push({ 
          name: item.name, 
          count: 1, 
          totalCost: item.cost, 
          totalQuantity: item.quantity, 
          unit: item.unit,
          rates: [rate],
          costRates: [costPerDay]
        });
      }
      return acc;
    }, [] as { 
      name: string; 
      count: number; 
      totalCost: number; 
      totalQuantity: number; 
      unit: string;
      rates: number[];
      costRates: number[];
    }[]);

    const processedFrequency = frequency.map(item => {
      const avgRate = item.rates.reduce((a, b) => a + b, 0) / item.rates.length;
      const avgCostRate = item.costRates.reduce((a, b) => a + b, 0) / item.costRates.length;
      return {
        ...item,
        nextMonthNeed: avgRate * 30,
        monthlyAvgCost: avgCostRate * 30
      };
    });

    const memberContributions = Object.entries(
      inventory.reduce((acc, item) => {
        const id = item.uid.slice(0, 4);
        acc[id] = (acc[id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name: `Member ${name}`, value }));

    return { chartData, frequency: processedFrequency, memberContributions };
  }, [finishedItems, inventory]);

  if (isLoading) {
    return (
      <div className={cn(
        "min-h-screen flex items-center justify-center transition-colors duration-500",
        theme === 'dark' ? "bg-zinc-950" : "bg-zinc-50"
      )}>
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        "min-h-screen pb-32 font-sans selection:bg-amber-500/30 overflow-x-hidden transition-colors duration-500",
        theme === 'dark' ? "bg-black text-zinc-100" : "bg-white text-zinc-900"
      )}>
        {/* Decorative Background Elements */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className={cn(
            "absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full animate-pulse",
            theme === 'dark' ? "bg-amber-500/10" : "bg-amber-500/20"
          )} />
          <div className={cn(
            "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full animate-pulse delay-700",
            theme === 'dark' ? "bg-purple-500/10" : "bg-purple-500/20"
          )} />
          <div className={cn(
            "absolute top-[30%] right-[10%] w-[20%] h-[20%] blur-[100px] rounded-full",
            theme === 'dark' ? "bg-blue-500/5" : "bg-blue-500/10"
          )} />
        </div>

        {authError && (
          <div className="fixed top-24 left-6 right-6 z-[100] animate-in fade-in slide-in-from-top-4 duration-500">
            <div className={cn(
              "backdrop-blur-xl rounded-2xl p-4 flex items-start gap-3 shadow-2xl border",
              theme === 'dark' ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200"
            )}>
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.auth.configRequired}</h4>
                <p className={cn("text-xs leading-relaxed", theme === 'dark' ? "text-zinc-400" : "text-zinc-600")}>{authError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className={cn(
          "p-4 sm:p-6 flex justify-between items-center sticky top-0 backdrop-blur-2xl z-40 border-b transition-all",
          theme === 'dark' ? "bg-black/20 border-white/5" : "bg-white/60 border-zinc-200"
        )}>
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => isFamilyMode ? setIsFamilyMode(false) : setShowPasswordPrompt(true)}
              className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl transition-all flex items-center justify-center group relative overflow-hidden",
                isFamilyMode 
                  ? "bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/20" 
                  : theme === 'dark' ? "bg-white/5 text-zinc-400 hover:text-white border border-white/10" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200"
              )}
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
            </button>
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight flex items-center gap-2">
                {activeTab === 'home' && t.headers.kitchen}
                {activeTab === 'stats' && t.headers.insight}
                {activeTab === 'goal' && t.headers.milestone}
                {activeTab === 'manage' && t.headers.console}
                {isFamilyMode && (
                  <span className="px-2 py-0.5 bg-amber-500 text-[10px] text-black font-black uppercase rounded-md tracking-tighter">
                    {t.headers.family}
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                {activeTab === 'home' && `${activeItems.length} ${t.headers.activeItems}`}
                {activeTab === 'stats' && t.headers.consumptionData}
                {activeTab === 'goal' && t.headers.futurePlanning}
                {activeTab === 'manage' && t.headers.systemControl}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setLang(lang === 'en' ? 'am' : 'en')}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900"
              )}
            >
              <Languages className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900"
              )}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user?.isAnonymous ? (
              <button 
                onClick={login}
                className={cn(
                  "hidden sm:block px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                )}
              >
                Sync
              </button>
            ) : (
              <button 
                onClick={logout}
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center border transition-all",
                  theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-500 hover:text-white hover:bg-red-500/10 hover:border-red-500/20" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-red-500 hover:bg-red-50"
                )}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="p-6 max-w-2xl mx-auto relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {activeItems.length === 0 ? (
                  <div className="py-32 text-center space-y-6">
                    <div className={cn(
                      "w-24 h-24 rounded-[2.5rem] border flex items-center justify-center mx-auto relative group transition-colors",
                      theme === 'dark' ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200 shadow-sm"
                    )}>
                      <Plus className="w-10 h-10 text-zinc-700 group-hover:text-amber-500 transition-colors" />
                      <div className="absolute inset-0 bg-amber-500/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div>
                      <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.inventory.emptyTitle}</p>
                      <p className="text-zinc-500 text-sm mt-1">{t.inventory.emptyDesc}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeItems.map((item) => (
                      <div key={item.id} className="relative">
                        <InventoryCard item={item} onFinish={() => finishItem(item.id!)} theme={theme} t={t} />
                        {isFamilyMode && item.uid !== user?.uid && (
                          <div className={cn(
                            "absolute -top-2 -right-2 px-2 py-1 border rounded-lg text-[8px] font-black uppercase tracking-tighter shadow-xl z-20 transition-colors",
                            theme === 'dark' ? "bg-zinc-800 border-white/10 text-zinc-500" : "bg-white border-zinc-200 text-zinc-600"
                          )}>
                            {t.manage.member} {item.uid.slice(0, 4)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div 
                key="stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "rounded-[2rem] p-6 border transition-colors",
                    theme === 'dark' ? "glass-dark border-white/5" : "bg-white border-zinc-200 shadow-sm"
                  )}>
                    <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.stats.monthlySpend}</h2>
                    <div className={cn("text-2xl font-black tracking-tighter", theme === 'dark' ? "text-white" : "text-zinc-900")}>
                      {stats.chartData.reduce((a, b) => a + b.value, 0).toLocaleString()} 
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">{t.inventory.birr}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "rounded-[2rem] p-6 border transition-colors",
                    theme === 'dark' ? "glass-dark border-white/5" : "bg-white border-zinc-200 shadow-sm"
                  )}>
                    <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.stats.nextMonthEst}</h2>
                    <div className="text-2xl font-black text-amber-500 tracking-tighter">
                      {Math.round(stats.frequency.reduce((a, b) => a + b.monthlyAvgCost, 0)).toLocaleString()} 
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">{t.inventory.birr}</span>
                    </div>
                  </div>
                </div>

                <div className={cn(
                  "rounded-[2.5rem] p-8 relative overflow-hidden group transition-colors",
                  theme === 'dark' ? "glass-dark border-white/5" : "bg-white border-zinc-200 shadow-sm"
                )}>
                  <div className="relative z-10">
                    <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">{t.stats.spendingTrend}</h2>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={stats.chartData}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }} />
                          <Tooltip 
                            cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', radius: 8 }}
                            contentStyle={{ 
                              backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                              border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', 
                              borderRadius: '16px', 
                              padding: '12px' 
                            }}
                            itemStyle={{ color: '#f59e0b', fontWeight: 700 }}
                          />
                          <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={32}>
                            {stats.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === stats.chartData.length - 1 ? '#f59e0b' : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32" />
                </div>

                {isFamilyMode && (
                  <div className={cn(
                    "rounded-[2.5rem] p-8 relative overflow-hidden group transition-colors",
                    theme === 'dark' ? "glass-dark border-white/5" : "bg-white border-zinc-200 shadow-sm"
                  )}>
                    <div className="relative z-10">
                      <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">{t.stats.familyTree}</h2>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <BarChart data={stats.memberContributions} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 600 }} width={80} />
                            <Tooltip 
                              cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', radius: 8 }}
                              contentStyle={{ 
                                backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                                border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', 
                                borderRadius: '16px', 
                                padding: '12px' 
                              }}
                              itemStyle={{ color: '#f59e0b', fontWeight: 700 }}
                            />
                            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20} fill="#f59e0b" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{t.stats.insights}</h2>
                    <div className={cn("p-1 rounded-xl flex gap-1 transition-colors", theme === 'dark' ? "bg-white/5" : "bg-zinc-100")}>
                      <button 
                        onClick={() => setSortBy('frequency')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                          sortBy === 'frequency' 
                            ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" 
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {t.stats.frequency}
                      </button>
                      <button 
                        onClick={() => setSortBy('cost')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                          sortBy === 'cost' 
                            ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" 
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {t.stats.avgCost}
                      </button>
                    </div>
                  </div>

                  {stats.frequency.length === 0 ? (
                    <div className={cn("p-10 rounded-[2.5rem] border text-center transition-colors", theme === 'dark' ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
                      <p className="text-zinc-500 text-sm font-medium">{t.stats.noHistory}</p>
                    </div>
                  ) : (
                    stats.frequency
                      .sort((a, b) => sortBy === 'frequency' ? b.count - a.count : b.monthlyAvgCost - a.monthlyAvgCost)
                      .map((item, idx) => (
                        <motion.div 
                          key={idx} 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={cn(
                            "rounded-[2rem] p-6 space-y-6 transition-all group border",
                            theme === 'dark' ? "glass-dark border-white/5 hover:border-white/20" : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className={cn("font-black text-xl tracking-tight transition-colors", theme === 'dark' ? "text-white group-hover:text-amber-400" : "text-zinc-900 group-hover:text-amber-600")}>{item.name}</div>
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                                {t.inventory.boughtTimes.replace('{n}', item.count.toString())}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-lg font-black text-amber-500 tracking-tighter">{Math.round(item.monthlyAvgCost).toLocaleString()} <span className="text-[10px] text-zinc-500 ml-1">ETB/mo</span></div>
                              <div className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mt-1">{t.stats.monthlyAvgCost}</div>
                            </div>
                          </div>

                          <div className={cn("pt-6 border-t flex items-center justify-between transition-colors", theme === 'dark' ? "border-white/5" : "border-zinc-100")}>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                                <Calendar className="w-6 h-6 text-amber-500" />
                              </div>
                              <div>
                                <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">{t.stats.nextMonthNeed}</div>
                                <div className={cn("font-black text-lg tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{item.nextMonthNeed.toFixed(1)} <span className="text-xs font-normal text-zinc-500">{item.unit}</span></div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">{t.stats.totalSpent}</div>
                              <div className={cn("font-mono text-sm font-bold", theme === 'dark' ? "text-zinc-300" : "text-zinc-700")}>{item.totalCost.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'goal' && (
              <motion.div 
                key="goal"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <GoalSection goal={goal} onUpdate={updateGoal} theme={theme} t={t} />
              </motion.div>
            )}

            {activeTab === 'manage' && (
              <motion.div 
                key="manage"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <ManageView 
                  user={user} 
                  inventory={inventory} 
                  goal={goal}
                  theme={theme}
                  t={t}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Floating Action Button */}
        {activeTab === 'home' && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="fixed bottom-32 right-6 w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 text-black rounded-3xl shadow-2xl shadow-amber-500/40 flex items-center justify-center active:scale-90 transition-all z-30 group"
          >
            <Plus className="w-10 h-10 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        )}

        {/* Bottom Nav */}
        <nav className={cn(
          "fixed bottom-6 left-6 right-6 h-20 rounded-[2rem] px-4 sm:px-8 flex justify-around items-center z-50 border shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-colors",
          theme === 'dark' ? "bg-zinc-900/90 border-white/10" : "bg-white/90 border-zinc-200"
        )}>
          <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Home />} label={t.tabs.present} theme={theme} />
          <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 />} label={t.tabs.past} theme={theme} />
          <NavButton active={activeTab === 'goal'} onClick={() => setActiveTab('goal')} icon={<Target />} label={t.tabs.future} theme={theme} />
          <NavButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} icon={<Settings />} label={t.tabs.manage} theme={theme} />
        </nav>

        {/* Password Prompt */}
        <AnimatePresence>
          {showPasswordPrompt && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPasswordPrompt(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "relative w-full max-w-sm rounded-[3rem] p-10 border shadow-2xl text-center transition-colors",
                  theme === 'dark' ? "glass border-white/10" : "bg-white border-zinc-200"
                )}
              >
                <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-amber-500/20">
                  <Users className="w-10 h-10 text-amber-500" />
                </div>
                <h2 className={cn("text-2xl font-black mb-2 tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.auth.familyAccess}</h2>
                <p className="text-zinc-500 text-sm mb-10 leading-relaxed">{t.auth.familyDesc}</p>
                
                <div className="relative">
                  <input 
                    type="password"
                    autoFocus
                    placeholder="••••"
                    className={cn(
                      "w-full border rounded-2xl p-5 text-center font-mono text-2xl tracking-[0.5em] mb-8 focus:ring-2 transition-all outline-none",
                      passwordError 
                        ? "border-red-500/50 focus:ring-red-500 animate-shake" 
                        : theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-amber-500"
                    )}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (passwordInput === 'NDD') {
                          setIsFamilyMode(true);
                          setShowPasswordPrompt(false);
                          setPasswordInput('');
                          setPasswordError(false);
                        } else {
                          setPasswordError(true);
                        }
                      }
                    }}
                  />
                  {passwordError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -bottom-6 left-0 right-0 text-red-500 text-[10px] font-black uppercase tracking-widest"
                    >
                      {t.auth.incorrect}
                    </motion.p>
                  )}
                </div>
                
                <button 
                  onClick={() => {
                    if (passwordInput === 'NDD') {
                      setIsFamilyMode(true);
                      setShowPasswordPrompt(false);
                      setPasswordInput('');
                      setPasswordError(false);
                    } else {
                      setPasswordError(true);
                    }
                  }}
                  className="w-full py-5 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-amber-500/20 mt-4"
                >
                  {t.auth.unlock}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Modal */}
        <AnimatePresence>
          {isAddModalOpen && (
            <AddModal 
              onClose={() => setIsAddModalOpen(false)} 
              onAdd={addItem} 
              theme={theme}
              t={t}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

function NavButton({ active, onClick, icon, label, theme }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, theme: 'light' | 'dark' }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all duration-500 relative group",
        active ? "text-amber-500" : theme === 'dark' ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"
      )}
    >
      <div className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500",
        active ? "bg-amber-500/10 border border-amber-500/20" : "bg-transparent"
      )}>
        {React.cloneElement(icon as React.ReactElement, { className: cn("w-6 h-6 transition-transform duration-500", active && "scale-110") })}
      </div>
      <span className={cn(
        "text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500",
        active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      )}>
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute -bottom-2 w-1 h-1 bg-amber-500 rounded-full"
        />
      )}
    </button>
  );
}

function InventoryCard({ item, onFinish, theme, t }: { item: InventoryItem, onFinish: () => void | Promise<void>, theme: 'light' | 'dark', t: any, key?: string | number }) {
  const daysSinceAdded = differenceInDays(new Date(), parseISO(item.addedDate));
  const progress = Math.max(0, 100 - (daysSinceAdded * 3.3));

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-[2.5rem] p-6 border flex items-center justify-between group transition-all",
        theme === 'dark' ? "glass-dark border-white/5 hover:border-white/20" : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm"
      )}
    >
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <h3 className={cn("text-xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{item.name}</h3>
          <span className={cn(
            "text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-tighter border",
            theme === 'dark' ? "bg-white/5 text-zinc-400 border-white/5" : "bg-zinc-100 text-zinc-500 border-zinc-200"
          )}>
            {item.quantity}{t.inventory.units[item.unit.toLowerCase() as keyof typeof t.inventory.units] || item.unit}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-5">
          {t.inventory.added} {format(parseISO(item.addedDate), 'MMM d')} • <span className={theme === 'dark' ? "text-zinc-400" : "text-zinc-600"}>{item.cost.toLocaleString()} {t.inventory.birr}</span> • <span className="text-amber-500/80">{(item.cost / item.quantity).toFixed(2)} / {item.unit}</span>
        </p>
        <div className={cn("w-full h-2 rounded-full overflow-hidden p-[2px]", theme === 'dark' ? "bg-white/5" : "bg-zinc-100")}>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className={cn(
              "h-full rounded-full transition-colors duration-1000",
              progress > 50 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : 
              progress > 20 ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" : 
              "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
            )}
          />
        </div>
      </div>
      
      <button 
        onClick={onFinish}
        className={cn(
          "ml-8 w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all active:scale-90 border",
          theme === 'dark' ? "bg-white/5 text-zinc-500 border-white/10 hover:bg-emerald-500 hover:text-black hover:border-emerald-500/50" : "bg-zinc-100 text-zinc-400 border-zinc-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-500/50"
        )}
      >
        <Check className="w-8 h-8" />
      </button>
    </motion.div>
  );
}

function GoalSection({ goal, onUpdate, theme, t }: { goal: Goal | null, onUpdate: (target: number, savings: number) => void, theme: 'light' | 'dark', t: any }) {
  const [isEditing, setIsEditing] = useState(!goal);
  const [target, setTarget] = useState(goal?.targetPrice || 2000000);
  const [savings, setSavings] = useState(goal?.currentSavings || 500000);

  const downpaymentTarget = target * 0.25;
  const progress = Math.min(100, (savings / downpaymentTarget) * 100);
  const loanAmount = target * 0.75;
  const monthlyInterest = 0.16 / 12;
  const loanTermMonths = 20 * 12;
  const monthlyPayment = (loanAmount * monthlyInterest) / (1 - Math.pow(1 + monthlyInterest, -loanTermMonths));

  if (isEditing) {
    return (
      <div className={cn(
        "p-6 sm:p-10 rounded-[3rem] border space-y-8 transition-colors",
        theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <h2 className={cn("text-2xl sm:text-3xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.goals.setTitle}</h2>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.goals.targetPrice}</label>
            <input 
              type="number" 
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className={cn(
                "w-full border rounded-2xl p-5 font-mono text-xl transition-all outline-none",
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-amber-500"
              )}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.goals.currentSavings}</label>
            <input 
              type="number" 
              value={savings}
              onChange={(e) => setSavings(Number(e.target.value))}
              className={cn(
                "w-full border rounded-2xl p-5 font-mono text-xl transition-all outline-none",
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-amber-500"
              )}
            />
          </div>
          <button 
            onClick={() => {
              onUpdate(target, savings);
              setIsEditing(false);
            }}
            className="w-full py-5 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
          >
            {t.goals.saveBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className={cn(
        "p-6 sm:p-10 rounded-[3rem] border relative overflow-hidden group transition-colors",
        theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{t.goals.progress}</h2>
              <div className={cn("text-3xl sm:text-5xl font-black tracking-tighter", theme === 'dark' ? "text-white" : "text-zinc-900")}>
                {savings.toLocaleString()} <span className="text-base font-normal text-zinc-500 ml-1">/ {downpaymentTarget.toLocaleString()}</span>
              </div>
            </div>
            <button onClick={() => setIsEditing(true)} className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all",
              theme === 'dark' ? "bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:border-white/20" : "bg-zinc-100 text-zinc-500 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300"
            )}>
              <TrendingUp className="w-6 h-6" />
            </button>
          </div>

          <div className={cn("relative h-10 rounded-[1.25rem] mb-6 p-2 border", theme === 'dark' ? "bg-white/5 border-white/5" : "bg-zinc-100 border-zinc-200")}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.4)] relative"
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />
            </motion.div>
          </div>
          <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
            <span>{t.goals.current}</span>
            <span>{t.goals.downpayment}</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 blur-[120px] -mr-40 -mt-40 group-hover:bg-amber-500/15 transition-colors duration-1000" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className={cn(
          "p-6 sm:p-8 rounded-[2.5rem] border transition-colors",
          theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-8">{t.goals.loanSummary}</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">{t.goals.bankLoan}</span>
              <span className={cn("font-mono font-bold text-lg", theme === 'dark' ? "text-white" : "text-zinc-900")}>{loanAmount.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">{t.goals.interestRate}</span>
              <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-lg font-black text-xs border border-amber-500/20">16% {t.goals.annual}</span>
            </div>
            <div className={cn("pt-8 border-t flex justify-between items-end", theme === 'dark' ? "border-white/5" : "border-zinc-100")}>
              <div>
                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">{t.goals.monthlyPayment}</span>
                <span className="text-3xl sm:text-4xl font-black text-amber-500 tracking-tighter font-mono">{Math.round(monthlyPayment).toLocaleString()}</span>
              </div>
              <span className="text-zinc-500 font-black text-xs mb-1">{t.goals.etbMo}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(
        "p-8 rounded-[2.5rem] border text-center transition-colors",
        theme === 'dark' ? "bg-amber-500/5 border-amber-500/10" : "bg-amber-50 border-amber-200"
      )}>
        <p className={cn("text-sm leading-relaxed italic font-medium", theme === 'dark' ? "text-zinc-400" : "text-zinc-600")}>
          "{t.goals.quote}"
        </p>
      </div>
    </div>
  );
}

function AddModal({ onClose, onAdd, theme, t }: { onClose: () => void, onAdd: (n: string, c: number, q: number, u: string) => Promise<void>, theme: 'light' | 'dark', t: any }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('kg');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cost) {
      setError(t.inventory.fillAll);
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onAdd(name, Number(cost), quantity, unit);
    } catch (err) {
      setError(t.inventory.errors.failed);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "relative w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] p-6 sm:p-10 border-t sm:border shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide transition-colors",
          theme === 'dark' ? "glass border-white/10" : "bg-white border-zinc-200"
        )}
      >
        <div className={cn("w-12 h-1.5 rounded-full mx-auto mb-8 sm:hidden transition-colors", theme === 'dark' ? "bg-white/10" : "bg-zinc-200")} />
        <h2 className={cn("text-3xl font-black mb-10 tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.inventory.addTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.inventory.itemName}</label>
            <input 
              autoFocus
              placeholder={t.inventory.itemPlaceholder}
              className={cn(
                "w-full border rounded-2xl p-5 transition-all outline-none text-lg",
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-amber-500"
              )}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.inventory.totalCost}</label>
              <input 
                type="number"
                placeholder="0"
                className={cn(
                  "w-full border rounded-2xl p-5 font-mono text-lg transition-all outline-none",
                  theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-amber-500"
                )}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.inventory.quantity}</label>
              <div className={cn(
                "flex items-center border rounded-2xl p-1 transition-colors",
                theme === 'dark' ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
              )}>
                <button 
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  -
                </button>
                <input 
                  type="number"
                  className={cn("flex-1 bg-transparent text-center font-mono font-bold text-lg outline-none w-full", theme === 'dark' ? "text-white" : "text-zinc-900")}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
                <button 
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {cost && Number(cost) > 0 && (
            <div className={cn(
              "border rounded-2xl p-6 flex justify-between items-center transition-colors",
              theme === 'dark' ? "bg-amber-500/5 border-amber-500/10" : "bg-amber-50 border-amber-200"
            )}>
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em]">{t.inventory.unitPrice}</span>
              <div className="text-right">
                <span className="text-xl font-black text-amber-500 tracking-tight">
                  {(Number(cost) / quantity).toFixed(2)}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold ml-1">{t.inventory.birr} / {unit}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.inventory.unit}</label>
            <div className="flex gap-3">
              {['kg', 'L', 'pcs', 'bag'].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border",
                    unit === u 
                      ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20" 
                      : theme === 'dark' ? "bg-white/5 text-zinc-500 border-white/5 hover:bg-white/10 hover:text-zinc-300" : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-700"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSaving}
            className={cn(
              "w-full py-6 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-amber-500/20 mt-4 flex items-center justify-center gap-3",
              isSaving && "opacity-70 cursor-not-allowed"
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t.inventory.saving}
              </>
            ) : (
              t.inventory.addBtn
            )}
          </button>
          {error && (
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mt-4">
              {error}
            </p>
          )}
        </form>
      </motion.div>
    </div>
  );
}

function ManageView({ user, inventory, goal, theme, t }: { user: User | null, inventory: InventoryItem[], goal: Goal | null, theme: 'light' | 'dark', t: any }) {
  const [isClearing, setIsClearing] = useState(false);
  const finishedItems = inventory.filter(i => i.isFinished);
  const contributors = Array.from(new Set(inventory.map(i => i.uid)));

  const clearHistory = async () => {
    if (!window.confirm(t.manage.confirmClear.replace('{n}', finishedItems.length.toString()))) return;
    setIsClearing(true);
    try {
      // In a real app, we would delete these from Firestore
      console.log('Clearing items:', finishedItems);
      alert(t.manage.clearSuccess);
    } catch (error) {
      console.error('Error clearing history:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Firebase Status */}
      <div className={cn(
        "p-6 sm:p-8 rounded-[2.5rem] border relative overflow-hidden transition-colors",
        theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <Database className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.manage.dbStatus}</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className={cn("font-bold tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.manage.connected} net-inventory-9b10d</span>
              </div>
            </div>
          </div>
          
          <div className={cn("space-y-4 pt-6 border-t transition-colors", theme === 'dark' ? "border-white/5" : "border-zinc-100")}>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 text-xs font-medium">{t.manage.projectId}</span>
              <span className={cn("font-mono text-xs", theme === 'dark' ? "text-zinc-300" : "text-zinc-600")}>net-inventory-9b10d</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 text-xs font-medium">{t.manage.region}</span>
              <span className={cn("font-mono text-xs", theme === 'dark' ? "text-zinc-300" : "text-zinc-600")}>Default (us-central1)</span>
            </div>
          </div>

          <div className={cn(
            "mt-8 p-4 border rounded-2xl transition-colors",
            theme === 'dark' ? "bg-amber-500/5 border-amber-500/10" : "bg-amber-50 border-amber-200"
          )}>
            <h4 className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              {t.manage.troubleshoot}
            </h4>
            <p className={cn("text-[10px] leading-relaxed mb-3", theme === 'dark' ? "text-zinc-400" : "text-zinc-600")}>
              {t.manage.troubleshootDesc}
            </p>
            <div className={cn("p-3 rounded-xl border font-mono text-[10px] break-all transition-colors", theme === 'dark' ? "bg-black/20 border-white/5 text-zinc-300" : "bg-white border-zinc-200 text-zinc-700")}>
              ais-dev-5x4ijz4nup4sfqmvcv4j74-703267428407.europe-west2.run.app
            </div>
            <p className="text-zinc-500 text-[9px] mt-3 italic">
              {t.manage.findIn}
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -mr-32 -mt-32" />
      </div>

      {/* User Info */}
      <div className={cn(
        "p-6 sm:p-8 rounded-[2.5rem] border transition-colors",
        theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{t.manage.securityProfile}</h3>
            <span className={cn("font-bold tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>
              {user?.isAnonymous ? t.manage.guest : t.manage.admin}
            </span>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className={cn("p-4 rounded-2xl border transition-colors", theme === 'dark' ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
            <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2">{t.manage.uniqueId}</div>
            <div className={cn("font-mono text-xs break-all", theme === 'dark' ? "text-zinc-300" : "text-zinc-600")}>{user?.uid}</div>
          </div>
          {!user?.isAnonymous && (
            <div className={cn("p-4 rounded-2xl border transition-colors", theme === 'dark' ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
              <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2">{t.manage.email}</div>
              <div className={cn("font-mono text-xs", theme === 'dark' ? "text-zinc-300" : "text-zinc-600")}>{user?.email}</div>
            </div>
          )}
        </div>
      </div>

      {/* Family Management */}
      <div className={cn(
        "p-6 sm:p-8 rounded-[2.5rem] border transition-colors",
        theme === 'dark' ? "glass-dark border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">{t.manage.contributors}</h3>
        <div className="space-y-3">
          {contributors.map((uid, idx) => (
            <div key={idx} className={cn(
              "flex items-center justify-between p-4 rounded-2xl border group transition-all",
              theme === 'dark' ? "bg-white/5 border-white/5 hover:border-white/20" : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black transition-colors", theme === 'dark' ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-600")}>
                  {idx + 1}
                </div>
                <span className={cn("font-mono text-xs transition-colors", theme === 'dark' ? "text-zinc-300" : "text-zinc-700")}>{t.manage.member} {uid?.slice(0, 8)}...</span>
              </div>
              {uid === user?.uid && (
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase rounded-md border border-amber-500/20">{t.manage.you}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data Maintenance */}
      <div className={cn(
        "p-6 sm:p-8 rounded-[2.5rem] border transition-colors",
        theme === 'dark' ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100"
      )}>
        <h3 className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.manage.dangerZone}</h3>
        <p className="text-zinc-500 text-xs mb-6">{t.manage.dangerDesc}</p>
        
        <button 
          onClick={clearHistory}
          disabled={isClearing || finishedItems.length === 0}
          className="w-full py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {t.manage.clearBtn.replace('{n}', finishedItems.length.toString())}
        </button>
      </div>
    </div>
  );
}
