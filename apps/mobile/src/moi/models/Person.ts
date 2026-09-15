export interface Person {
  id: string;
  name: string;
  phone?: string;
  villageId?: string;
  villageName?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreatePersonInput {
  name: string;
  phone?: string;
  villageName?: string;
}
