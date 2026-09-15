import { Person } from '@moi/models/Person';

export interface IPersonRepository {
  create(person: Person): Promise<void>;
  update(person: Person): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Person | null>;
  getAll(): Promise<Person[]>;
  search(keyword: string): Promise<Person[]>;
  findOrCreate(name: string, villageName?: string): Promise<Person>;
}
