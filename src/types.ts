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
}

export interface Goal {
  id?: string;
  currentSavings: number;
  targetPrice: number;
  downpaymentPercent: number;
  interestRate: number;
  uid: string;
}
