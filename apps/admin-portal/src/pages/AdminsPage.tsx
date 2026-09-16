/**
 * Admin accounts management (superadmin only).
 *
 * Lists back-office admins and lets a superadmin create new ones, change a
 * role, and activate/deactivate accounts. The backend enforces the same
 * superadmin restriction and prevents self-lockout; this page mirrors those
 * rules in the UI for a clean experience.
 */
import { useCallback, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/api/client';
import type { AdminAccount, AdminRole, CreateAdminInput } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, Badge, type Column } from '@/components/DataTable';
import { formatDateTime, orDash } from '@/lib/format';

const ROLES: AdminRole[] = ['superadmin', 'admin', 'viewer'];

const EMPTY_FORM: CreateAdminInput = {
  email: '',
  name: '',
  password: '',
  role: 'admin',
};

export function AdminsPage() {
  // Self-lockout (deactivating/demoting your own account) is enforced by the
  // backend, which returns a clear error surfaced via rowError.
  const fetcher = useCallback(() => api.admins({ limit: 100, offset: 0 }), []);
  const { data, loading, error, reload } = useApiResource<AdminAccount[]>(fetcher);

  const [form, setForm] = useState<CreateAdminInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const setField = <K extends keyof CreateAdminInput>(key: K, value: CreateAdminInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateOk(null);

    if (form.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }

    setCreating(true);
    try {
      const created = await api.createAdmin({
        ...form,
        email: form.email.trim(),
        name: form.name.trim(),
      });
      setCreateOk(`Created admin ${created.email}.`);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setCreateError(err instanceof Error ? err.message : 'Failed to create admin.');
    } finally {
      setCreating(false);
    }
  };

  const runUpdate = async (
    a: AdminAccount,
    patch: Parameters<typeof api.updateAdmin>[1],
  ) => {
    setRowError(null);
    setBusyId(a.id);
    try {
      await api.updateAdmin(a.id, patch);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setRowError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminAccount>[] = [
    { key: 'email', header: 'Email', render: (a) => a.email },
    { key: 'name', header: 'Name', render: (a) => orDash(a.name) },
    {
      key: 'role',
      header: 'Role',
      render: (a) => (
        <select
          className="field__input field__input--inline"
          value={a.role}
          disabled={busyId === a.id}
          onChange={(e) => runUpdate(a, { role: e.target.value })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) =>
        a.is_active ? <Badge tone="positive">Active</Badge> : <Badge tone="muted">Inactive</Badge>,
    },
    { key: 'last_login', header: 'Last login', render: (a) => formatDateTime(a.last_login_at) },
    { key: 'created', header: 'Created', render: (a) => formatDateTime(a.created_at) },
    {
      key: 'actions',
      header: 'Actions',
      render: (a) => (
        <button
          type="button"
          className={a.is_active ? 'btn btn--small btn--danger' : 'btn btn--small'}
          disabled={busyId === a.id}
          onClick={() => runUpdate(a, { is_active: !a.is_active })}
        >
          {busyId === a.id ? 'Working...' : a.is_active ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ];

  return (
    <Page title="Admins" subtitle="Manage back-office administrator accounts">
      {/* Create form */}
      <form className="card form-card" onSubmit={handleCreate}>
        <h3 className="form-card__title">Add admin</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="field__input"
              type="text"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Role</span>
            <select
              className="field__input"
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        {createError ? <p className="form-msg form-msg--error">{createError}</p> : null}
        {createOk ? <p className="form-msg form-msg--ok">{createOk}</p> : null}
        <div className="form-card__actions">
          <button type="submit" className="btn btn--primary" disabled={creating}>
            {creating ? 'Creating...' : 'Create admin'}
          </button>
        </div>
      </form>

      {/* List */}
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {rowError ? <ErrorState message={rowError} /> : null}
      {data ? (
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(a) => a.id}
          emptyMessage="No admin accounts found."
        />
      ) : null}
    </Page>
  );
}
