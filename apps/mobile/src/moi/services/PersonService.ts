import { Person } from '@moi/models/Person';
import { IPersonRepository } from '@moi/repository/interfaces/IPersonRepository';
import type { EntitlementService } from '@common/subscription/EntitlementService';

export class PersonService {
  constructor(
    private readonly personRepo: IPersonRepository,
    private readonly entitlement?: EntitlementService,
  ) {}

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

  /**
   * Find an existing person (by name + village) or create a new one.
   *
   * The Free-plan people limit is enforced here in the service layer, but only
   * when a NEW person would actually be created — referencing an existing
   * person is always allowed (so Free users can keep using their data). This
   * check is best-effort: if the person already exists, findOrCreate returns it
   * without consuming a slot.
   */
  async findOrCreatePerson(name: string, villageName?: string): Promise<Person> {
    if (this.entitlement && !this.entitlement.isPremium()) {
      const existing = await this.findExisting(name, villageName);
      if (!existing) {
        // Would create a new person → enforce the Free cap.
        await this.entitlement.assertCanAddPerson();
      }
    }
    return this.personRepo.findOrCreate(name, villageName);
  }

  /** Best-effort lookup used to decide whether findOrCreate will insert. */
  private async findExisting(
    name: string,
    villageName?: string,
  ): Promise<Person | null> {
    const trimmed = name.trim().toLowerCase();
    const village = villageName?.trim().toLowerCase();
    const matches = await this.personRepo.search(name.trim());
    return (
      matches.find(p => {
        if (p.name.trim().toLowerCase() !== trimmed) return false;
        if (village) return (p.villageName?.trim().toLowerCase() ?? '') === village;
        return true;
      }) ?? null
    );
  }
}
