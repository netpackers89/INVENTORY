export interface InventoryItem {
  id?: string;
  name: string;
  addedDate: string;
  cost: number;
  quantity: number;
  unit: string;
  isFinished: boolean;
  finishedDate?: string;
  uid: string;
  familyCode: string;
  reminderDate?: string;
  authorName?: string;
  authorPhoto?: string;
}

export interface Goal {
  id?: string;
  currentSavings: number;
  targetPrice: number;
  downpaymentPercent: number;
  interestRate: number;
  uid: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  familyCode?: string;
  gender?: 'male' | 'female';
  email?: string;
}
