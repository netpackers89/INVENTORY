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
  signOut 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { InventoryItem, Goal } from './types';
import { cn } from './lib/utils';
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
  Layers
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
  const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'goal'>('home');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'frequency' | 'cost'>('frequency');
  const [isFamilyMode, setIsFamilyMode] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      setIsLoading(false);
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
    if (!user) return;
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mb-8 mx-auto">
            <Home className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Home-to-Goal</h1>
          <p className="text-zinc-400 mb-12 max-w-sm mx-auto leading-relaxed">
            Track your household inventory, understand your spending, and reach your home ownership goal.
          </p>
          <button 
            onClick={login}
            className="w-full max-w-xs py-4 bg-amber-500 text-black font-bold rounded-2xl hover:bg-amber-400 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen text-zinc-100 pb-32 font-sans selection:bg-amber-500/30 overflow-x-hidden">
        {/* Decorative Background Elements */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
          <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-blue-500/5 blur-[100px] rounded-full" />
        </div>

        {/* Header */}
        <header className="p-6 flex justify-between items-center sticky top-0 bg-black/20 backdrop-blur-2xl z-40 border-b border-white/5">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => isFamilyMode ? setIsFamilyMode(false) : setShowPasswordPrompt(true)}
              className={cn(
                "w-12 h-12 rounded-2xl transition-all flex items-center justify-center group relative overflow-hidden",
                isFamilyMode 
                  ? "bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/20" 
                  : "bg-white/5 text-zinc-400 hover:text-white border border-white/10"
              )}
            >
              <Users className="w-6 h-6 relative z-10" />
              {!isFamilyMode && <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                {activeTab === 'home' && 'Kitchen'}
                {activeTab === 'stats' && 'Insight'}
                {activeTab === 'goal' && 'Milestone'}
                {isFamilyMode && (
                  <span className="px-2 py-0.5 bg-amber-500 text-[10px] text-black font-black uppercase rounded-md tracking-tighter">
                    Family
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                {activeTab === 'home' && `${activeItems.length} Active Items`}
                {activeTab === 'stats' && 'Consumption Data'}
                {activeTab === 'goal' && 'Future Planning'}
              </p>
            </div>
          </div>
          <button onClick={logout} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-all hover:bg-red-500/10 hover:border-red-500/20">
            <LogOut className="w-4 h-4" />
          </button>
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
                    <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] border border-white/10 flex items-center justify-center mx-auto relative group">
                      <Plus className="w-10 h-10 text-zinc-700 group-hover:text-amber-500 transition-colors" />
                      <div className="absolute inset-0 bg-amber-500/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white">Your kitchen is empty</p>
                      <p className="text-zinc-500 text-sm mt-1">Time to stock up and start tracking.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeItems.map((item) => (
                      <div key={item.id} className="relative">
                        <InventoryCard item={item} onFinish={() => finishItem(item.id!)} />
                        {isFamilyMode && item.uid !== user?.uid && (
                          <div className="absolute -top-2 -right-2 px-2 py-1 bg-zinc-800 border border-white/10 rounded-lg text-[8px] font-black uppercase text-zinc-500 tracking-tighter shadow-xl">
                            Member {item.uid.slice(0, 4)}
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
                  <div className="glass-dark rounded-[2rem] p-6 border border-white/5">
                    <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">Monthly Spend</h2>
                    <div className="text-2xl font-black text-white tracking-tighter">
                      {stats.chartData.reduce((a, b) => a + b.value, 0).toLocaleString()} 
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">Birr</span>
                    </div>
                  </div>
                  <div className="glass-dark rounded-[2rem] p-6 border border-white/5">
                    <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">Next Month Est.</h2>
                    <div className="text-2xl font-black text-amber-500 tracking-tighter">
                      {Math.round(stats.frequency.reduce((a, b) => a + b.monthlyAvgCost, 0)).toLocaleString()} 
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">Birr</span>
                    </div>
                  </div>
                </div>

                <div className="glass-dark rounded-[2.5rem] p-8 relative overflow-hidden group">
                  <div className="relative z-10">
                    <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Spending Trend</h2>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={stats.chartData}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }} />
                          <Tooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px' }}
                            itemStyle={{ color: '#f59e0b', fontWeight: 700 }}
                          />
                          <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={32}>
                            {stats.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === stats.chartData.length - 1 ? '#f59e0b' : 'rgba(255,255,255,0.1)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32" />
                </div>

                {isFamilyMode && (
                  <div className="glass-dark rounded-[2.5rem] p-8 relative overflow-hidden group">
                    <div className="relative z-10">
                      <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Family Tree (Contributions)</h2>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <BarChart data={stats.memberContributions} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 600 }} width={80} />
                            <Tooltip 
                              cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                              contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px' }}
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
                    <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em]">Insights</h3>
                    <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1.5 backdrop-blur-md">
                      <button 
                        onClick={() => setSortBy('frequency')}
                        className={cn(
                          "px-4 py-2 text-[10px] font-black uppercase tracking-tighter rounded-xl transition-all", 
                          sortBy === 'frequency' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Frequency
                      </button>
                      <button 
                        onClick={() => setSortBy('cost')}
                        className={cn(
                          "px-4 py-2 text-[10px] font-black uppercase tracking-tighter rounded-xl transition-all", 
                          sortBy === 'cost' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Avg Cost
                      </button>
                    </div>
                  </div>

                  {stats.frequency.length === 0 ? (
                    <p className="text-zinc-500 text-center py-20 font-medium">No history yet.</p>
                  ) : (
                    stats.frequency
                      .sort((a, b) => sortBy === 'frequency' ? b.count - a.count : b.monthlyAvgCost - a.monthlyAvgCost)
                      .map((item, idx) => (
                        <motion.div 
                          key={idx} 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="glass-dark rounded-[2rem] p-6 space-y-6 hover:border-white/20 transition-all group"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-black text-xl tracking-tight group-hover:text-amber-400 transition-colors">{item.name}</div>
                              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Bought {item.count} times</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-lg font-black text-amber-500 tracking-tighter">{Math.round(item.monthlyAvgCost).toLocaleString()} <span className="text-[10px] text-zinc-500 ml-1">ETB/mo</span></div>
                              <div className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mt-1">Monthly Avg Cost</div>
                            </div>
                          </div>

                          <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                                <Calendar className="w-6 h-6 text-amber-500" />
                              </div>
                              <div>
                                <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">Next Month Need</div>
                                <div className="font-black text-lg tracking-tight">{item.nextMonthNeed.toFixed(1)} <span className="text-xs font-normal text-zinc-500">{item.unit}</span></div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">Total Spent</div>
                              <div className="font-mono text-sm font-bold">{item.totalCost.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></div>
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
                <GoalSection goal={goal} onUpdate={updateGoal} />
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
        <nav className="fixed bottom-6 left-6 right-6 h-20 glass-dark rounded-[2rem] px-8 flex justify-around items-center z-50 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Home />} label="Present" />
          <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 />} label="Past" />
          <NavButton active={activeTab === 'goal'} onClick={() => setActiveTab('goal')} icon={<Target />} label="Future" />
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
                className="relative w-full max-w-sm glass rounded-[3rem] p-10 border border-white/10 shadow-2xl text-center"
              >
                <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-amber-500/20">
                  <Users className="w-10 h-10 text-amber-500" />
                </div>
                <h2 className="text-2xl font-black mb-2 tracking-tight">Family Access</h2>
                <p className="text-zinc-500 text-sm mb-10 leading-relaxed">Enter the family password to unlock the shared consumption tree.</p>
                
                <div className="relative">
                  <input 
                    type="password"
                    autoFocus
                    placeholder="••••"
                    className={cn(
                      "w-full bg-white/5 border rounded-2xl p-5 text-white text-center font-mono text-2xl tracking-[0.5em] mb-8 focus:ring-2 transition-all outline-none",
                      passwordError 
                        ? "border-red-500/50 focus:ring-red-500 animate-shake" 
                        : "border-white/10 focus:ring-amber-500"
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
                      Incorrect Password
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
                  Unlock View
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Modal */}
        <AnimatePresence>
          {isAddModalOpen && (
            <AddModal onClose={() => setIsAddModalOpen(false)} onAdd={addItem} />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all duration-500 relative group",
        active ? "text-amber-500" : "text-zinc-600 hover:text-zinc-400"
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

function InventoryCard({ item, onFinish }: { item: InventoryItem, onFinish: () => void | Promise<void>, key?: string | number }) {
  const daysSinceAdded = differenceInDays(new Date(), parseISO(item.addedDate));
  const progress = Math.max(0, 100 - (daysSinceAdded * 3.3));

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-dark rounded-[2.5rem] p-6 border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all"
    >
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-xl font-black text-white tracking-tight">{item.name}</h3>
          <span className="text-[10px] px-3 py-1 bg-white/5 text-zinc-400 rounded-full font-black uppercase tracking-tighter border border-white/5">
            {item.quantity}{item.unit}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-5">
          Added {format(parseISO(item.addedDate), 'MMM d')} • <span className="text-zinc-400">{item.cost.toLocaleString()} Birr</span> • <span className="text-amber-500/80">{(item.cost / item.quantity).toFixed(2)} / {item.unit}</span>
        </p>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden p-[2px]">
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
        className="ml-8 w-16 h-16 bg-white/5 text-zinc-500 rounded-[2rem] flex items-center justify-center hover:bg-emerald-500 hover:text-black transition-all active:scale-90 border border-white/10 group-hover:border-emerald-500/50"
      >
        <Check className="w-8 h-8" />
      </button>
    </motion.div>
  );
}

function GoalSection({ goal, onUpdate }: { goal: Goal | null, onUpdate: (target: number, savings: number) => void }) {
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
      <div className="glass-dark p-10 rounded-[3rem] border border-white/10 space-y-8">
        <h2 className="text-3xl font-black tracking-tight">Set Your Goal</h2>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Target House Price (ETB)</label>
            <input 
              type="number" 
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white font-mono text-xl focus:ring-2 focus:ring-amber-500 transition-all outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Current Savings (ETB)</label>
            <input 
              type="number" 
              value={savings}
              onChange={(e) => setSavings(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white font-mono text-xl focus:ring-2 focus:ring-amber-500 transition-all outline-none"
            />
          </div>
          <button 
            onClick={() => {
              onUpdate(target, savings);
              setIsEditing(false);
            }}
            className="w-full py-5 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
          >
            Save Milestone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="glass-dark p-10 rounded-[3rem] border border-white/10 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Savings Progress</h2>
              <div className="text-5xl font-black text-white tracking-tighter">
                {savings.toLocaleString()} <span className="text-base font-normal text-zinc-500 ml-1">/ {downpaymentTarget.toLocaleString()}</span>
              </div>
            </div>
            <button onClick={() => setIsEditing(true)} className="w-12 h-12 bg-white/5 rounded-2xl text-zinc-400 hover:text-white flex items-center justify-center border border-white/10 hover:border-white/20 transition-all">
              <TrendingUp className="w-6 h-6" />
            </button>
          </div>

          <div className="relative h-10 bg-white/5 rounded-[1.25rem] mb-6 p-2 border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.4)] relative"
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />
            </motion.div>
          </div>
          <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
            <span>Current</span>
            <span>25% Downpayment</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 blur-[120px] -mr-40 -mt-40 group-hover:bg-amber-500/15 transition-colors duration-1000" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="glass-dark p-8 rounded-[2.5rem] border border-white/10">
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-8">Loan Summary (75%)</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">Bank Loan</span>
              <span className="font-mono font-bold text-lg">{loanAmount.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">Interest Rate</span>
              <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-lg font-black text-xs border border-amber-500/20">16% Annual</span>
            </div>
            <div className="pt-8 border-t border-white/5 flex justify-between items-end">
              <div>
                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Monthly Payment</span>
                <span className="text-4xl font-black text-amber-500 tracking-tighter font-mono">{Math.round(monthlyPayment).toLocaleString()}</span>
              </div>
              <span className="text-zinc-500 font-black text-xs mb-1">ETB / mo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 bg-amber-500/5 rounded-[2.5rem] border border-amber-500/10 text-center">
        <p className="text-sm text-zinc-400 leading-relaxed italic font-medium">
          "The distance between your dream and reality is called action. Keep tracking, keep saving."
        </p>
      </div>
    </div>
  );
}

function AddModal({ onClose, onAdd }: { onClose: () => void, onAdd: (n: string, c: number, q: number, u: string) => void }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('kg');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cost) return;
    onAdd(name, Number(cost), quantity, unit);
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
        className="relative w-full max-w-lg glass rounded-t-[3rem] sm:rounded-[3rem] p-10 border-t sm:border border-white/10 shadow-2xl"
      >
        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 sm:hidden" />
        <h2 className="text-3xl font-black mb-10 tracking-tight">Add to Kitchen</h2>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Item Name</label>
            <input 
              autoFocus
              placeholder="e.g. Teff, Garlic, Onions"
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white focus:ring-2 focus:ring-amber-500 transition-all outline-none text-lg"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Total Cost (Birr)</label>
              <input 
                type="number"
                placeholder="0"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white font-mono text-lg focus:ring-2 focus:ring-amber-500 transition-all outline-none"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Quantity</label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1">
                <button 
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  -
                </button>
                <input 
                  type="number"
                  className="flex-1 bg-transparent text-center font-mono font-bold text-lg outline-none w-full"
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
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6 flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em]">Unit Price</span>
              <div className="text-right">
                <span className="text-xl font-black text-amber-500 tracking-tight">
                  {(Number(cost) / quantity).toFixed(2)}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold ml-1">Birr / {unit}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">Unit</label>
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
                      : "bg-white/5 text-zinc-500 border-white/5 hover:bg-white/10 hover:text-zinc-300"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-6 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-amber-500/20 mt-4"
          >
            Add to Inventory
          </button>
        </form>
      </motion.div>
    </div>
  );
}
