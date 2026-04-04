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
  setDoc,
  doc, 
  getDocs,
  getDocFromServer,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged, 
  User,
  signOut,
  updateProfile
} from 'firebase/auth';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { InventoryItem, Goal, UserProfile } from './types';
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
  ChevronLeft,
  Loader2,
  AlertCircle,
  Users,
  Layers,
  Settings,
  Database,
  Package,
  Wallet,
  Settings2,
  LayoutDashboard,

  Sun,
  Moon,
  Languages,
  Trash2,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setAuthError?: (err: string | null) => void) {
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
  if (setAuthError) {
    setAuthError(`Database error (${operationType} on ${path}): ${errInfo.error}`);
  }
}

// --- Views ---

const LoginView: React.FC<{ 
  onSignIn: (email: string, password: string) => Promise<void>; 
  onSignUp: (email: string, password: string) => Promise<void>;
  theme: string; 
  t: any 
}> = ({ onSignIn, onSignUp, theme, t }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        await onSignUp(email, password);
      } else {
        await onSignIn(email, password);
      }
    } catch (err: any) {
      const errorCode = err.code;
      if (errorCode === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up.');
      } else if (errorCode === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (errorCode === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in.');
      } else if (errorCode === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (errorCode === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else {
        setError(isSignUp ? 'Sign up failed. Please try again.' : 'Sign in failed. Please try again.');
      }
      console.error('Auth error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-4 sm:p-6 transition-colors duration-500",
      theme === 'dark' ? "bg-zinc-950" : "bg-zinc-50"
    )}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "w-full max-w-md p-6 sm:p-10 rounded-3xl sm:rounded-[3rem] border text-center space-y-6 sm:space-y-8 shadow-2xl",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
        )}
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-accent rounded-3xl sm:rounded-[2rem] flex items-center justify-center mx-auto shadow-xl shadow-accent/20">
          <Home className="w-8 h-8 sm:w-10 sm:h-10 text-black" />
        </div>
        <div>
          <h1 className={cn("text-2xl sm:text-3xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-zinc-500 mt-2 text-sm sm:text-base">
            {isSignUp ? 'Sign up to start managing your family inventory' : 'Sign in to your FamilyHub account'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-xs font-bold">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2 text-left block">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className={cn(
                "w-full rounded-2xl p-4 outline-none transition-all",
                theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent placeholder:text-zinc-600" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent placeholder:text-zinc-400"
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2 text-left block">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className={cn(
                "w-full rounded-2xl p-4 outline-none transition-all",
                theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent placeholder:text-zinc-600" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent placeholder:text-zinc-400"
              )}
            />
          </div>

          {isSignUp && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2 text-left block">Confirm Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className={cn(
                  "w-full rounded-2xl p-4 outline-none transition-all",
                  theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent placeholder:text-zinc-600" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent placeholder:text-zinc-400"
                )}
              />
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full py-4 bg-accent text-black font-black uppercase text-xs tracking-[0.2em] rounded-2xl hover:scale-[1.02] transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="pt-2">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setConfirmPassword('');
            }}
            className="text-zinc-500 text-sm hover:text-accent transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

  const ProfileSetupView: React.FC<{ user: User; onSave: (name: string, photo: string, code: string, isNewFamily: boolean, gender: 'male' | 'female') => Promise<void>; theme: string; t: any }> = ({ user, onSave, theme, t }) => {
  const [name, setName] = useState(user.displayName || '');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [photo, setPhoto] = useState(user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}&gender=male`);

  const [code, setCode] = useState('');
  const [isNewFamily, setIsNewFamily] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [error, setError] = useState('');


  // Update avatar when gender changes (only if using default avatar)
  useEffect(() => {
    if (photo.includes('dicebear')) {
      setPhoto(`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}&gender=${gender}`);
    }
  }, [gender, user.uid, photo]);

  const handleSave = async () => {
    if (!name || !photo || !code) return;
    setError('');
    setIsValidating(true);
    
    try {
      // Check if family code exists in 'families' collection
      const familyDoc = await getDocFromServer(doc(db, 'families', code));
      const exists = familyDoc.exists();
      
      if (isNewFamily && exists) {
        setError("This family code already exists. Please join it instead.");
        setIsValidating(false);
        return;
      }
      
      if (!isNewFamily && !exists) {
        setError("This family code does not exist. Check for typos or create a new family.");
        setIsValidating(false);
        return;
      }
      
      await onSave(name, photo, code, isNewFamily, gender);
    } catch (err) {
      setError("Error validating family code. Please try again.");
      console.error(err);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-6 transition-colors duration-500",
      theme === 'dark' ? "bg-zinc-950" : "bg-zinc-50"
    )}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "w-full max-w-md p-10 rounded-[3rem] border space-y-8 shadow-2xl",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
        )}
      >
        <div className="text-center">
          <h2 className={cn("text-2xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.login.setupTitle}</h2>
          <p className="text-zinc-500 mt-1">{t.login.setupDesc}</p>
          {user.isAnonymous && (
            <p className="text-accent text-[10px] font-black uppercase tracking-widest mt-4 bg-accent/10 py-2 rounded-xl border border-accent/20">
              Guest Mode: Limited Features
            </p>
          )}
        </div>

        {/* Profile Picture Preview */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-28 h-28 rounded-full border-4 border-accent p-1 overflow-hidden bg-white/10">
            <img src={photo} alt="Preview" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>

        <div className="space-y-4">
          {/* Gender Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Gender</label>
            <div className="flex gap-3">
              <button
                onClick={() => setGender('male')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-2xl border transition-all flex items-center justify-center gap-2",
                  gender === 'male'
                    ? "bg-blue-500/20 border-blue-500 text-blue-400"
                    : theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-500" : "bg-zinc-50 border-zinc-200 text-zinc-500"
                )}
              >
                <span className="text-lg">♂</span>
                <span className="text-xs font-bold uppercase">Male</span>
              </button>
              <button
                onClick={() => setGender('female')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-2xl border transition-all flex items-center justify-center gap-2",
                  gender === 'female'
                    ? "bg-pink-500/20 border-pink-500 text-pink-400"
                    : theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-500" : "bg-zinc-50 border-zinc-200 text-zinc-500"
                )}
              >
                <span className="text-lg">♀</span>
                <span className="text-xs font-bold uppercase">Female</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">{t.login.fullName}</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className={cn(
                "w-full rounded-2xl p-4 outline-none transition-all",
                theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent"
              )}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Photo URL (Optional)</label>
            <input 
              type="text" 
              value={photo} 
              onChange={(e) => setPhoto(e.target.value)}
              placeholder="Or paste an image URL"
              className={cn(
                "w-full rounded-2xl p-4 outline-none transition-all text-sm",
                theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent"
              )}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">{t.login.familyCode}</label>
            <input 
              type="text" 
              value={code} 
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. MYFAMILY123"
              className={cn(
                "w-full rounded-2xl p-4 outline-none transition-all font-mono uppercase",
                theme === 'dark' ? "bg-white/5 border border-white/10 text-white focus:border-accent" : "bg-zinc-50 border border-zinc-200 text-zinc-900 focus:border-accent"
              )}
            />
          </div>

          <button 
            onClick={() => setIsNewFamily(!isNewFamily)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full border",
              isNewFamily 
                ? "bg-accent/10 border-accent text-accent" 
                : theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-500" : "bg-zinc-50 border-zinc-200 text-zinc-500"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
              isNewFamily ? "bg-accent border-accent" : "border-zinc-500"
            )}>
              {isNewFamily && <Check className="w-4 h-4 text-black" />}
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">I'm creating a new family</span>
          </button>

          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}
        </div>

        <button 
          onClick={handleSave}
          disabled={!name || !photo || !code || isValidating}
          className="w-full py-4 bg-accent text-black font-black uppercase text-xs tracking-[0.2em] rounded-2xl hover:scale-[1.02] transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 disabled:scale-100"
        >
          {isValidating ? t.login.validating : t.login.saveBtn}
        </button>
      </motion.div>
    </div>
  );
};

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeUsers, setActiveUsers] = useState<UserProfile[]>([]);
  const [isProfileSetupOpen, setIsProfileSetupOpen] = useState(false);

  const t = translations[lang];

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        // Fetch profile
        const profileDoc = await getDocFromServer(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          const profile = profileDoc.data() as UserProfile;
          setUserProfile(profile);
        } else {
          // If no profile, prompt setup (even for anonymous)
          setIsProfileSetupOpen(true);
        }
        setIsAuthReady(true);
        setIsLoading(false);
        setAuthError(null);
      } else {
        setUser(null);
        setUserProfile(null);
        setIsAuthReady(true);
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch active users
  useEffect(() => {
    if (!user || !isAuthReady || !userProfile?.familyCode) return;
    const q = query(
      collection(db, 'users'), 
      where('familyCode', '==', userProfile.familyCode),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users', setAuthError);
    });
    return unsubscribe;
  }, [user, isAuthReady, userProfile]);

  const signUp = async (email: string, password: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Set display name from email (before @)
    const displayName = email.split('@')[0];
    await updateProfile(userCredential.user, { displayName });
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
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
      if (!userProfile?.familyCode) return; // Wait for profile in family mode
      inventoryQuery = query(
        collection(db, 'inventory'),
        where('familyCode', '==', userProfile.familyCode)
      );
    } else {
      inventoryQuery = query(
        collection(db, 'inventory'),
        where('uid', '==', user.uid)
      );
    }

    const unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      // Sort client-side to avoid index errors
      items.sort((a, b) => new Date(b.addedDate).getTime() - new Date(a.addedDate).getTime());
      setInventory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory', setAuthError);
    });

    let goalQuery;
    if (isFamilyMode) {
      if (!userProfile?.familyCode) return; // Wait for profile in family mode
      goalQuery = query(
        collection(db, 'goals'),
        where('familyCode', '==', userProfile.familyCode),
        limit(10)
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
      handleFirestoreError(error, OperationType.LIST, 'goals', setAuthError);
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
  }, [user, isAuthReady, userProfile]);

  // --- Actions ---
  const addItem = async (name: string, cost: number, quantity: number, unit: string, reminderDate?: string) => {
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
        uid: user.uid,
        familyCode: userProfile?.familyCode || '',
        authorName: userProfile?.displayName || user.displayName || 'Anonymous',
        authorPhoto: userProfile?.photoURL || user.photoURL || '',
        reminderDate: reminderDate || null
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
          uid: user.uid,
          familyCode: userProfile?.familyCode || ''
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    }
  };

  const saveProfile = async (name: string, photo: string, code: string, isNewFamily: boolean, gender: 'male' | 'female') => {
    if (!user) return;
    
    try {
      if (isNewFamily) {
        // Create family document
        await setDoc(doc(db, 'families', code), {
          familyCode: code,
          createdBy: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      const profile: UserProfile = {
        uid: user.uid,
        displayName: name,
        photoURL: photo,
        familyCode: code,
        gender: gender,
        email: user.email || undefined
      };
      
      await setDoc(doc(db, 'users', user.uid), profile);
      setUserProfile(profile);
      setIsProfileSetupOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
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

  if (!user) {
    return <LoginView onSignIn={signIn} onSignUp={signUp} theme={theme} t={t} />;
  }

  if (isProfileSetupOpen) {
    return <ProfileSetupView user={user} onSave={saveProfile} theme={theme} t={t} />;
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        "min-h-screen font-sans selection:bg-amber-500/30 overflow-x-hidden transition-colors duration-500 flex flex-col md:flex-row",
        theme === 'dark' ? "bg-[#1E292B] text-zinc-100" : "bg-[#F4F7F6] text-zinc-900"
      )}>
        {/* Mobile Header - Compact */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 px-3 flex items-center justify-between sidebar-gradient shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-accent/30 p-0.5 bg-white/10">
              <img 
                src={userProfile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'guest'}&gender=${userProfile?.gender || 'male'}`} 
                alt="Profile" 
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-sm truncate max-w-[120px]">{userProfile?.displayName || user?.displayName || 'Guest'}</h2>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/60 font-medium">{activeItems.length} active</span>
                <span className="w-1 h-1 rounded-full bg-accent"></span>
                <span className="text-[9px] text-white/60 font-medium">{finishedItems.length} done</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="md:hidden fixed top-[60px] left-0 bottom-0 w-[280px] sidebar-gradient z-50 flex flex-col shadow-2xl"
              >
                {/* User Profile Card */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-accent/30 p-0.5 bg-white/10">
                      <img 
                        src={userProfile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'guest'}&gender=${userProfile?.gender || 'male'}`} 
                        alt="Profile" 
                        className="w-full h-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-sm truncate">{userProfile?.displayName || user?.displayName || 'Guest User'}</h3>
                      <p className="text-white/50 text-[10px]">{user?.email || 'Guest Mode'}</p>
                      {userProfile?.gender && (
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full",
                          userProfile.gender === 'male' 
                            ? "bg-blue-500/20 text-blue-300" 
                            : "bg-pink-500/20 text-pink-300"
                        )}>
                          {userProfile.gender === 'male' ? '♂' : '♀'} {userProfile.gender}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Navigation */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                  <MobileNavButton 
                    active={activeTab === 'home'} 
                    onClick={() => { setActiveTab('home'); setIsMobileMenuOpen(false); }}
                    icon={<LayoutDashboard className="w-5 h-5" />} 
                    label={t.tabs.present}
                  />
                  <MobileNavButton 
                    active={activeTab === 'stats'} 
                    onClick={() => { setActiveTab('stats'); setIsMobileMenuOpen(false); }}
                    icon={<BarChart3 className="w-5 h-5" />} 
                    label={t.tabs.past}
                  />
                  <MobileNavButton 
                    active={activeTab === 'goal'} 
                    onClick={() => { setActiveTab('goal'); setIsMobileMenuOpen(false); }}
                    icon={<Target className="w-5 h-5" />} 
                    label={t.tabs.future}
                  />
                  <MobileNavButton 
                    active={activeTab === 'manage'} 
                    onClick={() => { setActiveTab('manage'); setIsMobileMenuOpen(false); }}
                    icon={<Settings2 className="w-5 h-5" />} 
                    label={t.tabs.manage}
                  />
                </nav>

                {/* Mobile Active Users */}
                <div className="p-4 border-t border-white/10">
                  <h3 className="text-accent text-[10px] font-black uppercase tracking-widest mb-3">Active Users</h3>
                  <div className="flex -space-x-2 mb-4">
                    {activeUsers.map((u) => (
                      <div key={u.uid} className="w-8 h-8 rounded-full border-2 border-sidebar overflow-hidden bg-white/10" title={u.displayName}>
                        <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setLang(lang === 'en' ? 'am' : 'en')}
                      className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-white/70"
                    >
                      <Languages className="w-4 h-4" />
                      <span className="text-xs font-bold">{lang === 'en' ? 'English' : 'Amharic'}</span>
                    </button>
                    <button 
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-white/70"
                    >
                      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      <span className="text-xs font-bold">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                    </button>
                  </div>
                  
                  <button 
                    onClick={logout}
                    className="w-full mt-2 py-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-red-400"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs font-bold">Logout</span>
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <aside className={cn(
          "sidebar-gradient shrink-0 hidden md:flex md:h-screen sticky top-0 z-50 flex-col transition-all duration-500",
          isSidebarCollapsed ? "w-24" : "w-72",
          "rounded-r-[3rem] shadow-2xl"
        )}>
          {/* Collapse Toggle */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-accent rounded-full hidden md:flex items-center justify-center text-black shadow-xl z-[60] hover:scale-110 transition-transform"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>

          {/* Profile Section */}
          <div className={cn("p-8 flex flex-col items-center text-center border-b border-white/5 transition-all", isSidebarCollapsed ? "px-4" : "px-8")}>
            <div className="relative mb-4">
              <div className={cn("rounded-full overflow-hidden border-2 border-accent/30 p-1 transition-all bg-white/10", isSidebarCollapsed ? "w-12 h-12" : "w-20 h-20")}>
                <img 
                  src={userProfile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'guest'}&gender=${userProfile?.gender || 'male'}`} 
                  alt="Profile" 
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-teal rounded-full border-2 border-sidebar" />
            </div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-white font-black tracking-tight text-lg uppercase">{userProfile?.displayName || user?.displayName || 'Guest User'}</h2>
                <p className="text-white/40 text-[10px] font-medium truncate w-full">{user?.email || 'guest@example.com'}</p>
              </motion.div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-6 space-y-2 overflow-y-auto scrollbar-hide">
            <NavButton 
              active={activeTab === 'home'} 
              onClick={() => setActiveTab('home')} 
              icon={<LayoutDashboard className="w-5 h-5" />} 
              label={t.tabs.present}
              theme={theme}
              t={t}
              collapsed={isSidebarCollapsed}
            />
            <NavButton 
              active={activeTab === 'stats'} 
              onClick={() => setActiveTab('stats')} 
              icon={<BarChart3 className="w-5 h-5" />} 
              label={t.tabs.past}
              theme={theme}
              t={t}
              collapsed={isSidebarCollapsed}
            />
            <NavButton 
              active={activeTab === 'goal'} 
              onClick={() => setActiveTab('goal')} 
              icon={<Target className="w-5 h-5" />} 
              label={t.tabs.future}
              theme={theme}
              t={t}
              collapsed={isSidebarCollapsed}
            />
            <NavButton 
              active={activeTab === 'manage'} 
              onClick={() => setActiveTab('manage')} 
              icon={<Settings2 className="w-5 h-5" />} 
              label={t.tabs.manage}
              theme={theme}
              t={t}
              collapsed={isSidebarCollapsed}
            />
          </nav>

          {/* Active Users Section */}
          <div className="p-8 border-t border-white/5">
            {!isSidebarCollapsed && <h3 className="text-accent text-[10px] font-black tracking-[0.2em] mb-4 uppercase">Active Users</h3>}
            <div className={cn("flex mb-6", isSidebarCollapsed ? "flex-col items-center gap-2" : "-space-x-3")}>
              {activeUsers.map((u) => (
                <div key={u.uid} className="w-8 h-8 rounded-full border-2 border-sidebar overflow-hidden bg-white/10" title={u.displayName}>
                  <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
              {!isSidebarCollapsed && activeUsers.length > 5 && (
                <div className="w-8 h-8 rounded-full border-2 border-sidebar bg-accent flex items-center justify-center text-[10px] font-black text-black">
                  +{activeUsers.length - 5}
                </div>
              )}
            </div>
            
            <div className={cn("flex items-center gap-3", isSidebarCollapsed ? "flex-col" : "flex-row")}>
              <button 
                onClick={() => setLang(lang === 'en' ? 'am' : 'en')}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
              >
                <Languages className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button 
                onClick={logout}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-red-400 transition-all"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative transition-all duration-500 pt-14 md:pt-0">
          {/* Top Bar - Hidden on mobile */}
          <header className="hidden md:flex p-4 md:p-10 justify-between items-start md:items-center shrink-0 gap-4">
            <div className="min-w-0">
              <h1 className={cn("text-xl md:text-3xl font-black tracking-tight flex items-center gap-2 md:gap-3 flex-wrap", theme === 'dark' ? "text-white" : "text-zinc-900")}>
                <span className="truncate">
                  {activeTab === 'home' && t.headers.kitchen}
                  {activeTab === 'stats' && t.headers.insight}
                  {activeTab === 'goal' && t.headers.milestone}
                  {activeTab === 'manage' && t.headers.console}
                </span>
                {isFamilyMode && (
                  <span className="px-2 md:px-3 py-1 bg-accent text-[9px] md:text-[10px] text-black font-black uppercase rounded-full tracking-tighter shrink-0">
                    {t.headers.family}
                  </span>
                )}
              </h1>
              <p className="text-[10px] md:text-xs text-zinc-500 font-medium mt-1">
                {activeTab === 'home' && `${activeItems.length} ${t.headers.activeItems}`}
                {activeTab === 'stats' && t.headers.consumptionData}
                {activeTab === 'goal' && t.headers.futurePlanning}
                {activeTab === 'manage' && t.headers.systemControl}
              </p>
            </div>

            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <button 
                onClick={() => isFamilyMode ? setIsFamilyMode(false) : setShowPasswordPrompt(true)}
                className={cn(
                  "px-3 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest transition-all flex items-center gap-1.5 md:gap-2",
                  isFamilyMode 
                    ? "bg-accent text-black shadow-xl shadow-accent/20" 
                    : theme === 'dark' ? "bg-white/5 text-zinc-400 border border-white/10 hover:text-white" : "bg-white text-zinc-600 border border-zinc-200 hover:text-zinc-900 shadow-sm"
                )}
              >
                <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{isFamilyMode ? 'Family Active' : 'Unlock Family'}</span>
                <span className="sm:hidden">{isFamilyMode ? 'Family' : 'Unlock'}</span>
              </button>
              
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-teal text-white flex items-center justify-center shadow-xl shadow-teal/20 hover:scale-105 transition-all active:scale-95"
              >
                <Plus className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>
          </header>

          {authError && (
            <div className="mx-6 md:mx-10 mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold uppercase tracking-widest">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{authError}</span>
              <button onClick={() => setAuthError(null)} className="ml-auto hover:scale-110 transition-transform">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-3 md:p-10 pb-24 md:pb-10 pt-0 scrollbar-hide">
            <AnimatePresence mode="wait">
              {activeTab === 'home' && (
                <motion.div 
                  key="home"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-8"
                >
                  {/* Top Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                    <SummaryCard 
                      title={t.summary.totalValue} 
                      value={`${inventory.reduce((acc, item) => acc + item.cost, 0).toLocaleString()} ETB`}
                      icon={<Wallet className="w-6 h-6" />}
                      color="bg-accent"
                      theme={theme}
                    />
                    <SummaryCard 
                      title={t.summary.activeItems} 
                      value={activeItems.length.toString()}
                      icon={<Package className="w-6 h-6" />}
                      color="bg-teal"
                      theme={theme}
                    />
                    <SummaryCard 
                      title={t.summary.goalProgress} 
                      value={`${Math.round((goal?.currentSavings || 0) / ((goal?.targetPrice || 1) * 0.25) * 100)}%`}
                      icon={<TrendingUp className="w-6 h-6" />}
                      color="bg-sidebar"
                      theme={theme}
                    />
                  </div>

                  {activeItems.length === 0 ? (
                    <div className="py-32 text-center space-y-6">
                      <div className={cn(
                        "w-24 h-24 rounded-[2.5rem] border flex items-center justify-center mx-auto relative group transition-colors",
                        theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
                      )}>
                        <Plus className="w-10 h-10 text-zinc-400 group-hover:text-accent transition-colors" />
                      </div>
                      <div>
                        <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.inventory.emptyTitle}</p>
                        <p className="text-zinc-500 text-sm mt-1">{t.inventory.emptyDesc}</p>
                      </div>
                    </div>
                  ) : (
                    <div className={cn(
                      "rounded-2xl md:rounded-[3rem] border overflow-hidden transition-colors",
                      theme === 'dark' ? "bg-white/5 border-white/5" : "bg-white border-zinc-200 shadow-sm"
                    )}>
                      <div className="p-4 md:p-8 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <h2 className={cn("text-lg md:text-xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>Active Inventory</h2>
                        <div className="flex gap-2">
                          <button onClick={() => setSortBy('frequency')} className={cn("px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", sortBy === 'frequency' ? "bg-accent text-black" : "text-zinc-500")}>Frequency</button>
                          <button onClick={() => setSortBy('cost')} className={cn("px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", sortBy === 'cost' ? "bg-accent text-black" : "text-zinc-500")}>Cost</button>
                        </div>
                      </div>
                      <div className="divide-y divide-white/5">
                        {activeItems.map((item) => (
                          <InventoryRow key={item.id} item={item} onFinish={() => finishItem(item.id!)} theme={theme} t={t} />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

            {activeTab === 'stats' && (
              <StatsView stats={stats} sortBy={sortBy} setSortBy={setSortBy} theme={theme} t={t} isFamilyMode={isFamilyMode} />
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
                  activeUsers={activeUsers}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#1E292B] to-[#2C3E3D] border-t border-white/10 px-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
          <div className="flex items-center justify-around h-16">
            {[
              { id: 'home', icon: LayoutDashboard, label: t.tabs.present },
              { id: 'stats', icon: BarChart3, label: t.tabs.past },
              { id: 'goal', icon: Target, label: t.tabs.future },
              { id: 'manage', icon: Settings2, label: t.tabs.manage },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-xl transition-all",
                  activeTab === tab.id 
                    ? "bg-accent/20 text-accent" 
                    : "text-white/50 hover:text-white/80"
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[9px] font-bold">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Floating Action Button - Desktop Only */}
        {activeTab === 'home' && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="hidden md:flex fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 text-black rounded-2xl shadow-2xl shadow-amber-500/40 items-center justify-center active:scale-90 transition-all z-30 group"
          >
            <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        )}

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
                  theme === 'dark' ? "bg-sidebar border-white/10" : "bg-white border-zinc-200"
                )}
              >
                <div className="w-20 h-20 bg-accent/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-accent/20">
                  <Users className="w-10 h-10 text-accent" />
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
                        : theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-accent"
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
                  className="w-full py-5 bg-accent text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-accent/20 mt-4"
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
    </div>
    </ErrorBoundary>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300",
        active 
          ? "bg-white/10 text-white shadow-lg" 
          : "text-white/50 hover:text-white hover:bg-white/5"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0",
        active ? "bg-accent text-black" : "bg-white/5"
      )}>
        {icon}
      </div>
      <span className="font-bold text-sm">{label}</span>
      {active && (
        <div className="ml-auto w-2 h-2 rounded-full bg-accent" />
      )}
    </button>
  );
}

function NavButton({ active, onClick, icon, label, theme, t, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, theme: 'light' | 'dark', t: any, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden",
        active 
          ? "bg-white/10 text-white shadow-lg" 
          : "text-white/40 hover:text-white hover:bg-white/5",
        collapsed && "px-3 justify-center"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
        active ? "bg-accent text-black" : "bg-white/5 text-white/40 group-hover:bg-white/10"
      )}>
        {icon}
      </div>
      {!collapsed && <span className="font-black uppercase text-[10px] tracking-[0.2em] truncate">{label}</span>}
      {active && !collapsed && (
        <motion.div 
          layoutId="sidebar-active"
          className="absolute left-0 w-1 h-8 bg-accent rounded-r-full"
        />
      )}
    </button>
  );
}

function SummaryCard({ title, value, icon, color, theme }: { title: string, value: string, icon: React.ReactNode, color: string, theme: 'light' | 'dark' }) {
  return (
    <div className={cn(
      "p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border relative overflow-hidden group transition-all duration-500",
      theme === 'dark' ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-white border-zinc-200 shadow-sm hover:shadow-md"
    )}>
      <div className="relative z-10">
        <div className={cn("w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 transition-transform duration-500 group-hover:scale-110", color, "text-white shadow-lg")}>
          {React.cloneElement(icon as React.ReactElement, { className: "w-4 h-4 md:w-6 md:h-6" })}
        </div>
        <h3 className="text-zinc-500 text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1 md:mb-2">{title}</h3>
        <div className={cn("text-lg md:text-2xl font-black tracking-tighter", theme === 'dark' ? "text-white" : "text-zinc-900")}>{value}</div>
      </div>
      <div className={cn("absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 blur-[30px] md:blur-[60px] -mr-10 -mt-10 md:-mr-16 md:-mt-16 opacity-20 transition-opacity duration-1000 group-hover:opacity-40", color)} />
    </div>
  );
}

function InventoryRow({ item, onFinish, theme, t }: { item: InventoryItem, onFinish: () => void | Promise<void>, theme: 'light' | 'dark', t: any, key?: string | number }) {
  const daysOld = differenceInDays(new Date(), parseISO(item.addedDate));
  const progress = Math.max(0, 100 - (daysOld * 10));

  return (
    <div className="p-3 md:p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
      <div className="flex items-center gap-2.5 md:gap-6 flex-1 min-w-0">
        {/* Compact avatar/icon for mobile */}
        <div className={cn(
          "w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-2xl flex items-center justify-center shrink-0 border overflow-hidden",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200"
        )}>
          {item.authorPhoto ? (
            <img src={item.authorPhoto} alt={item.authorName} className="w-full h-full object-cover" />
          ) : (
            <Package className={cn("w-4 h-4 md:w-6 md:h-6", theme === 'dark' ? "text-zinc-500" : "text-zinc-400")} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Name and quantity inline on mobile */}
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className={cn("font-bold md:font-black tracking-tight text-sm md:text-base truncate", theme === 'dark' ? "text-white" : "text-zinc-900")}>{item.name}</h3>
            <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-md font-bold border border-accent/20 shrink-0">
              {item.quantity} {item.unit.slice(0, 3)}
            </span>
          </div>
          
          {/* Compact info row */}
          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
            <span>{format(parseISO(item.addedDate), 'MMM d')}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-zinc-500"></span>
            <span className="font-mono text-accent">{item.cost.toLocaleString()}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline truncate">{item.authorName || 'Family'}</span>
          </div>
          
          {/* Mobile progress bar */}
          <div className="md:hidden mt-1.5 w-24">
            <div className={cn("w-full h-1 rounded-full overflow-hidden", theme === 'dark' ? "bg-white/10" : "bg-zinc-200")}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className={cn(
                  "h-full rounded-full",
                  progress > 50 ? "bg-teal" : progress > 20 ? "bg-accent" : "bg-red-500"
                )}
              />
            </div>
          </div>
          
          {item.reminderDate && (
            <div className="flex items-center gap-1 mt-1 text-accent">
              <Calendar className="w-2.5 h-2.5" />
              <span className="text-[8px] font-bold uppercase">
                {format(parseISO(item.reminderDate), 'MMM d')}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3 md:gap-8 shrink-0">
        {/* Desktop progress bar */}
        <div className="hidden md:block w-32">
          <div className={cn("w-full h-1.5 rounded-full overflow-hidden", theme === 'dark' ? "bg-white/5" : "bg-zinc-100")}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className={cn(
                "h-full rounded-full",
                progress > 50 ? "bg-teal" : progress > 20 ? "bg-accent" : "bg-red-500"
              )}
            />
          </div>
        </div>
        
        {/* Finish button */}
        <button 
          onClick={onFinish}
          className={cn(
            "w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center transition-all active:scale-90 border",
            theme === 'dark' ? "bg-white/5 text-zinc-500 border-white/10 hover:bg-teal hover:text-white hover:border-teal/50" : "bg-zinc-100 text-zinc-400 border-zinc-200 hover:bg-teal hover:text-white hover:border-teal/50"
          )}
        >
          <Check className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>
    </div>
  );
}

function StatsView({ stats, sortBy, setSortBy, theme, t, isFamilyMode }: { stats: any, sortBy: string, setSortBy: (s: 'frequency' | 'cost') => void, theme: 'light' | 'dark', t: any, isFamilyMode: boolean }) {
  return (
    <motion.div 
      key="stats"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-10"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={cn(
          "rounded-[2.5rem] p-8 border transition-colors relative overflow-hidden",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.stats.monthlySpend}</h2>
          <div className={cn("text-3xl font-black tracking-tighter", theme === 'dark' ? "text-white" : "text-zinc-900")}>
            {stats.chartData.reduce((a: number, b: any) => a + b.value, 0).toLocaleString()} 
            <span className="text-xs font-normal text-zinc-500 ml-1">{t.inventory.birr}</span>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal/5 blur-[60px] -mr-16 -mt-16" />
        </div>
        <div className={cn(
          "rounded-[2.5rem] p-8 border transition-colors relative overflow-hidden",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.stats.nextMonthEst}</h2>
          <div className="text-3xl font-black text-accent tracking-tighter">
            {Math.round(stats.frequency.reduce((a: number, b: any) => a + b.monthlyAvgCost, 0)).toLocaleString()} 
            <span className="text-xs font-normal text-zinc-500 ml-1">{t.inventory.birr}</span>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-[60px] -mr-16 -mt-16" />
        </div>
      </div>

      <div className={cn(
        "rounded-[3rem] p-10 border relative overflow-hidden group transition-colors",
        theme === 'dark' ? "bg-white/5 border-white/5" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <div className="relative z-10">
          <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-10">{t.stats.spendingTrend}</h2>
          <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <BarChart data={stats.chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 800 }} />
                <Tooltip 
                  cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', radius: 12 }}
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1E292B' : '#ffffff', 
                    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', 
                    borderRadius: '20px', 
                    padding: '16px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
                  }}
                  itemStyle={{ color: '#D4A017', fontWeight: 900, fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[12, 12, 12, 12]} barSize={40}>
                  {stats.chartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={index === stats.chartData.length - 1 ? '#D4A017' : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-[120px] -mr-48 -mt-48" />
      </div>

      {isFamilyMode && (
        <div className={cn(
          "rounded-[3rem] p-10 border relative overflow-hidden group transition-colors",
          theme === 'dark' ? "bg-white/5 border-white/5" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <div className="relative z-10">
            <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-10">{t.stats.familyTree}</h2>
            <div className="h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                <BarChart data={stats.memberContributions} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 800 }} width={100} />
                  <Tooltip 
                    cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', radius: 12 }}
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1E292B' : '#ffffff', 
                      border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', 
                      borderRadius: '20px', 
                      padding: '16px'
                    }}
                    itemStyle={{ color: '#D4A017', fontWeight: 900 }}
                  />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={24} fill="#D4A017" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{t.stats.insights}</h2>
          <div className={cn("p-1 rounded-2xl flex gap-1 transition-colors", theme === 'dark' ? "bg-white/5" : "bg-zinc-100")}>
            <button 
              onClick={() => setSortBy('frequency')}
              className={cn(
                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                sortBy === 'frequency' 
                  ? "bg-accent text-black shadow-lg shadow-accent/20" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t.stats.frequency}
            </button>
            <button 
              onClick={() => setSortBy('cost')}
              className={cn(
                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                sortBy === 'cost' 
                  ? "bg-accent text-black shadow-lg shadow-accent/20" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t.stats.avgCost}
            </button>
          </div>
        </div>

        {stats.frequency.length === 0 ? (
          <div className={cn("p-16 rounded-[3rem] border text-center transition-colors", theme === 'dark' ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
            <p className="text-zinc-500 text-sm font-medium">{t.stats.noHistory}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {stats.frequency
              .sort((a: any, b: any) => sortBy === 'frequency' ? b.count - a.count : b.monthlyAvgCost - a.monthlyAvgCost)
              .map((item: any, idx: number) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "rounded-[2.5rem] p-8 space-y-8 transition-all group border",
                    theme === 'dark' ? "bg-white/5 border-white/5 hover:border-white/20" : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={cn("font-black text-2xl tracking-tight transition-colors", theme === 'dark' ? "text-white group-hover:text-accent" : "text-zinc-900 group-hover:text-accent")}>{item.name}</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                        {t.inventory.boughtTimes.replace('{n}', item.count.toString())}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-black text-accent tracking-tighter">{Math.round(item.monthlyAvgCost).toLocaleString()} <span className="text-[10px] text-zinc-500 ml-1">ETB/mo</span></div>
                      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mt-1">{t.stats.monthlyAvgCost}</div>
                    </div>
                  </div>

                  <div className={cn("pt-8 border-t flex items-center justify-between transition-colors", theme === 'dark' ? "border-white/5" : "border-zinc-100")}>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center border border-accent/20">
                        <Calendar className="w-7 h-7 text-accent" />
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">{t.stats.nextMonthNeed}</div>
                        <div className={cn("font-black text-xl tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{item.nextMonthNeed.toFixed(1)} <span className="text-xs font-normal text-zinc-500">{item.unit}</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1">{t.stats.totalSpent}</div>
                      <div className={cn("font-mono text-sm font-bold", theme === 'dark' ? "text-zinc-300" : "text-zinc-700")}>{item.totalCost.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></div>
                    </div>
                  </div>
                </motion.div>
              ))}
          </div>
        )}
      </div>
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
        "p-10 rounded-[3rem] border space-y-8 transition-colors",
        theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
      )}>
        <h2 className={cn("text-3xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>{t.goals.setTitle}</h2>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.goals.targetPrice}</label>
            <input 
              type="number" 
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className={cn(
                "w-full border rounded-2xl p-5 font-mono text-xl transition-all outline-none",
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-accent"
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
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-accent"
              )}
            />
          </div>
          <button 
            onClick={() => {
              onUpdate(target, savings);
              setIsEditing(false);
            }}
            className="w-full py-5 bg-accent text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-accent/20"
          >
            {t.goals.saveBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className={cn(
          "p-10 rounded-[3rem] border relative overflow-hidden group transition-colors",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{t.goals.progress}</h2>
                <div className={cn("text-5xl font-black tracking-tighter", theme === 'dark' ? "text-white" : "text-zinc-900")}>
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

            <div className={cn("relative h-4 rounded-full mb-6 overflow-hidden", theme === 'dark' ? "bg-white/5" : "bg-zinc-100")}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-accent shadow-[0_0_20px_rgba(212,160,23,0.4)]"
              />
            </div>
            <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
              <span>{t.goals.current}</span>
              <span>{t.goals.downpayment}</span>
            </div>
          </div>
        </div>

        <div className={cn(
          "p-10 rounded-[3rem] border transition-colors",
          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        )}>
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-8">{t.goals.loanSummary}</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">{t.goals.bankLoan}</span>
              <span className={cn("font-mono font-bold text-lg", theme === 'dark' ? "text-white" : "text-zinc-900")}>{loanAmount.toLocaleString()} <span className="text-[10px] text-zinc-500">ETB</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">{t.goals.interestRate}</span>
              <span className="px-3 py-1 bg-accent/10 text-accent rounded-lg font-black text-xs border border-accent/20">16% {t.goals.annual}</span>
            </div>
            <div className={cn("pt-8 border-t flex justify-between items-end", theme === 'dark' ? "border-white/5" : "border-zinc-100")}>
              <div>
                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">{t.goals.monthlyPayment}</span>
                <span className="text-4xl font-black text-accent tracking-tighter font-mono">{Math.round(monthlyPayment).toLocaleString()}</span>
              </div>
              <span className="text-zinc-500 font-black text-xs mb-1">{t.goals.etbMo}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(
        "p-8 rounded-[2.5rem] border text-center transition-colors",
        theme === 'dark' ? "bg-accent/5 border-accent/10" : "bg-accent/5 border-accent/20"
      )}>
        <p className={cn("text-sm leading-relaxed italic font-medium", theme === 'dark' ? "text-zinc-400" : "text-zinc-600")}>
          "{t.goals.quote}"
        </p>
      </div>
    </div>
  );
}

function AddModal({ onClose, onAdd, theme, t }: { onClose: () => void, onAdd: (n: string, c: number, q: number, u: string, r?: string) => Promise<void>, theme: 'light' | 'dark', t: any }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('kg');
  const [reminderDate, setReminderDate] = useState('');
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
      await onAdd(name, Number(cost), quantity, unit, reminderDate);
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
          theme === 'dark' ? "bg-sidebar border-white/10" : "bg-white border-zinc-200"
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
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-accent"
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
                  theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-accent"
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

          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] block mb-3 ml-1">{t.inventory.reminder}</label>
            <input 
              type="datetime-local"
              className={cn(
                "w-full border rounded-2xl p-5 transition-all outline-none text-lg",
                theme === 'dark' ? "bg-white/5 border-white/10 text-white focus:ring-2 focus:ring-accent" : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-2 focus:ring-accent"
              )}
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
          </div>

          {cost && Number(cost) > 0 && (
            <div className={cn(
              "border rounded-2xl p-6 flex justify-between items-center transition-colors",
              theme === 'dark' ? "bg-accent/5 border-accent/10" : "bg-accent/5 border-accent/20"
            )}>
              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em]">{t.inventory.unitPrice}</span>
              <div className="text-right">
                <span className="text-xl font-black text-accent tracking-tight">
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
                      ? "bg-accent text-black border-accent/40 shadow-lg shadow-accent/20" 
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
              "w-full py-6 bg-accent text-black font-black uppercase tracking-widest rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-accent/20 mt-4 flex items-center justify-center gap-3",
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

function ManageView({ user, inventory, goal, theme, t, activeUsers }: { user: User | null, inventory: InventoryItem[], goal: Goal | null, theme: 'light' | 'dark', t: any, activeUsers: UserProfile[] }) {
  const [isClearing, setIsClearing] = useState(false);
  const finishedItems = inventory.filter(i => i.isFinished);
  const activeItems = inventory.filter(i => !i.isFinished);
  
  // Calculate user activities
  const userActivities = activeUsers.map(u => {
    const userItems = inventory.filter(i => i.uid === u.uid);
    const userFinished = userItems.filter(i => i.isFinished);
    const totalSpent = userFinished.reduce((sum, i) => sum + i.cost, 0);
    const lastActive = userItems.length > 0 
      ? Math.max(...userItems.map(i => new Date(i.addedDate).getTime()))
      : Date.now();
    
    return {
      ...u,
      itemsAdded: userItems.length,
      itemsFinished: userFinished.length,
      totalSpent,
      lastActive: new Date(lastActive)
    };
  }).sort((a, b) => b.itemsAdded - a.itemsAdded);

  const clearHistory = async () => {
    if (!window.confirm(t.manage.confirmClear.replace('{n}', finishedItems.length.toString()))) return;
    setIsClearing(true);
    try {
      console.log('Clearing items:', finishedItems);
      alert(t.manage.clearSuccess);
    } catch (error) {
      console.error('Error clearing history:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const getActivityLevel = (count: number) => {
    if (count >= 10) return { label: 'Very Active', color: 'bg-emerald-500', glow: 'shadow-emerald-500/30' };
    if (count >= 5) return { label: 'Active', color: 'bg-accent', glow: 'shadow-accent/30' };
    return { label: 'New', color: 'bg-blue-500', glow: 'shadow-blue-500/30' };
  };

  return (
    <div className="space-y-8">
      {/* Visual Hierarchy Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: LayoutDashboard, label: 'Dashboard', value: activeItems.length, color: 'from-accent to-yellow-400', subtext: 'Active Items' },
          { icon: Check, label: 'Completed', value: finishedItems.length, color: 'from-teal to-emerald-400', subtext: 'Finished Items' },
          { icon: Users, label: 'Family', value: activeUsers.length, color: 'from-blue-500 to-cyan-400', subtext: 'Members' },
          { icon: Wallet, label: 'Value', value: `${inventory.reduce((acc, i) => acc + i.cost, 0).toLocaleString()} ETB`, color: 'from-purple-500 to-pink-400', subtext: 'Total Inventory' }
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={cn(
              "relative overflow-hidden rounded-3xl p-6 border group cursor-pointer transition-all duration-500 hover:-translate-y-1",
              theme === 'dark' 
                ? "bg-white/5 border-white/10 hover:border-white/20" 
                : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm hover:shadow-xl"
            )}
          >
            <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br", stat.color)} style={{ opacity: 0.05 }} />
            <div className="relative z-10">
              <div className={cn("w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-4 shadow-lg", stat.color)}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className={cn("text-3xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-zinc-900")}>
                {stat.value}
              </div>
              <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mt-1">
                {stat.subtext}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User Activities Sidebar - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          <div className={cn(
            "rounded-[2.5rem] border overflow-hidden transition-all",
            theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
          )}>
            <div className="p-8 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-accent to-yellow-400 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20">
                    <Users className="w-7 h-7 text-black" />
                  </div>
                  <div>
                    <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Team Activity</h3>
                    <p className={cn("font-bold text-xl", theme === 'dark' ? "text-white" : "text-zinc-900")}>Family Members</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">{activeUsers.length} Online</span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {userActivities.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-500">No family members yet</p>
                </div>
              ) : (
                userActivities.map((member, idx) => {
                  const activity = getActivityLevel(member.itemsAdded);
                  return (
                    <motion.div
                      key={member.uid}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl p-6 border transition-all duration-300 hover:scale-[1.02]",
                        theme === 'dark' 
                          ? "bg-white/5 border-white/5 hover:border-white/20" 
                          : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                      )}
                    >
                      {/* Shimmer effect */}
                      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                      
                      <div className="relative flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-accent/30 p-0.5">
                            <img 
                              src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.uid}&gender=${member.gender || 'male'}`}
                              alt={member.displayName}
                              className="w-full h-full rounded-xl object-cover"
                            />
                          </div>
                          <div className={cn("absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2", activity.color, theme === 'dark' ? 'border-[#1E292B]' : 'border-white')} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={cn("font-bold text-lg truncate", theme === 'dark' ? "text-white" : "text-zinc-900")}>
                              {member.displayName}
                            </h4>
                            {member.uid === user?.uid && (
                              <span className="px-2 py-0.5 bg-accent/20 text-accent text-[9px] font-black uppercase rounded-full">You</span>
                            )}
                          </div>
                          <p className="text-zinc-500 text-xs mb-2">{member.email || member.familyCode}</p>
                          
                          {/* Activity Stats */}
                          <div className="flex items-center gap-4 text-[10px]">
                            <span className="text-zinc-400">
                              <span className="text-accent font-bold">{member.itemsAdded}</span> items added
                            </span>
                            <span className="text-zinc-400">
                              <span className="text-teal font-bold">{member.itemsFinished}</span> completed
                            </span>
                            <span className="text-zinc-400">
                              <span className="text-emerald-400 font-bold">{member.totalSpent.toLocaleString()}</span> ETB spent
                            </span>
                          </div>
                        </div>

                        {/* Activity Badge */}
                        <div className={cn("px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg", activity.color, activity.glow, "text-white")}>
                          {activity.label}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4">
                        <div className={cn("h-1.5 rounded-full overflow-hidden", theme === 'dark' ? 'bg-white/10' : 'bg-zinc-200')}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (member.itemsAdded / Math.max(...userActivities.map(u => u.itemsAdded))) * 100)}%` }}
                            transition={{ duration: 1, delay: 0.5 }}
                            className={cn("h-full rounded-full bg-gradient-to-r", activity.color.replace('bg-', 'from-').replace('500', '400'), activity.color.replace('bg-', 'to-'))}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Activity Timeline */}
          <div className={cn(
            "rounded-[2.5rem] border p-8 transition-all",
            theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200 shadow-sm"
          )}>
            <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">Recent Activity</h3>
            <div className="space-y-4">
              {inventory.slice(0, 5).map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5"
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    item.isFinished ? "bg-teal/20 text-teal" : "bg-accent/20 text-accent"
                  )}>
                    {item.isFinished ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-zinc-900")}>{item.name}</p>
                    <p className="text-zinc-500 text-xs">{item.authorName} • {format(parseISO(item.addedDate), 'MMM d, HH:mm')}</p>
                  </div>
                  <span className="text-accent font-mono font-bold">{item.cost.toLocaleString()} ETB</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar - System Status */}
        <div className="space-y-6">
          {/* System Status Card */}
          <div className={cn(
            "rounded-[2.5rem] border p-8 relative overflow-hidden transition-all",
            theme === 'dark' ? "bg-gradient-to-br from-teal/10 to-transparent border-teal/20" : "bg-gradient-to-br from-teal/5 to-transparent border-teal/10"
          )}>
            <div className="relative z-10">
              <div className="w-14 h-14 bg-teal/20 rounded-2xl flex items-center justify-center border border-teal/30 mb-6">
                <Database className="w-7 h-7 text-teal" />
              </div>
              <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">System Status</h3>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className={cn("font-bold text-xl", theme === 'dark' ? "text-white" : "text-zinc-900")}>Connected</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Database</span>
                  <span className="text-emerald-400 font-bold">Online</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Storage</span>
                  <span className="text-emerald-400 font-bold">Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Auth</span>
                  <span className="text-emerald-400 font-bold">Secure</span>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-40 h-40 bg-teal/10 blur-[80px]" />
          </div>

          {/* User Profile Card */}
          <div className={cn(
            "rounded-[2.5rem] border p-8 transition-all",
            theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
          )}>
            <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">Your Profile</h3>
            <div className="text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-accent/30 mx-auto mb-4 p-1">
                <img 
                  src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`}
                  alt="Profile"
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <h4 className={cn("font-bold text-lg", theme === 'dark' ? "text-white" : "text-zinc-900")}>{user?.displayName || 'User'}</h4>
              <p className="text-zinc-500 text-xs mb-4">{user?.email}</p>
              <div className="flex justify-center gap-4 text-[10px]">
                <div className="text-center">
                  <div className="text-accent font-bold text-lg">{activeItems.filter(i => i.uid === user?.uid).length}</div>
                  <div className="text-zinc-500">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-teal font-bold text-lg">{finishedItems.filter(i => i.uid === user?.uid).length}</div>
                  <div className="text-zinc-500">Done</div>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className={cn(
            "rounded-[2.5rem] border p-8 transition-all",
            theme === 'dark' ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100"
          )}>
            <h3 className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-2">Danger Zone</h3>
            <p className="text-zinc-500 text-xs mb-6">{t.manage.dangerDesc}</p>
            <button 
              onClick={clearHistory}
              disabled={isClearing || finishedItems.length === 0}
              className="w-full py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Clear {finishedItems.length} Items
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
