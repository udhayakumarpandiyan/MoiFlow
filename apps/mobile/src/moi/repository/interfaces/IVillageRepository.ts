import { Village } from '@moi/models/Village';

export interface IVillageRepository {
  create(village: Village): Promise<void>;
  getAll(): Promise<Village[]>;
  search(keyword: string): Promise<Village[]>;
  findOrCreate(name: string): Promise<Village>;
}
