import { Person } from '../models/Person';
import { IPersonRepository } from '../repository/interfaces/IPersonRepository';

export class PersonService {
  constructor(private readonly personRepo: IPersonRepository) {}

  async getAllPersons(): Promise<Person[]> {
    return this.personRepo.getAll();
  }

  async searchPersons(keyword: string): Promise<Person[]> {
    if (!keyword.trim()) return this.personRepo.getAll();
    return this.personRepo.search(keyword.trim());
  }

  async getPersonById(id: string): Promise<Person | null> {
    return this.personRepo.getById(id);
  }

  async findOrCreatePerson(name: string, villageName?: string): Promise<Person> {
    return this.personRepo.findOrCreate(name, villageName);
  }
}
