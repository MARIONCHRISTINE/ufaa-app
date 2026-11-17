import { useCallback, useEffect, useState } from 'react';
import { Ban, CircleCheck, Search, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { fmtDateTime, initials } from '../../lib/format';

const ROLES = [
  ['compliance_officer', 'Compliance Officer'],
  ['compliance_admin', 'Compliance Admin'],
  ['both', 'Both (Admin & Officer)'],
];
const EMPTY = { username: '', fullname: '', email: '', password: '', role: 'compliance_officer' };

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async (q = '') => {
    try {
      const res = await api('/admin/users', { params: { search: q } });
      setUsers(res.users);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/users', { method: 'POST', body: form });
      toast.success(`User '${form.username}' created.`);
      setCreating(false);
      setForm(EMPTY);
      load(search);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn, success) => {
    try {
      await fn();
      toast.success(success);
      load(search);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggle = (u) => run(() => api(`/admin/users/${u.id}/toggle-active`, { method: 'POST' }),
    `User '${u.username}' ${u.is_active ? 'suspended' : 'reactivated'}.`);
  const changeRole = (u, role) => run(() => api(`/admin/users/${u.id}/role`, { method: 'POST', body: { role } }),
    `Role updated for '${u.username}'.`);
  const remove = (u) => setConfirm({
    title: 'Delete user',
    message: `Permanently delete the account '${u.username}'? This cannot be undone.`,
    action: () => run(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }), `User '${u.username}' deleted.`),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        icon={UsersRound}
        title="User Management"
        subtitle="Create accounts, assign roles, and suspend or reactivate portal users."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> Add User</button>}
      />

      <div className="card overflow-hidden">
        <form className="flex gap-2 border-b border-slate-200 p-4" onSubmit={(e) => { e.preventDefault(); load(search); }}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search username, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-outline" type="submit">Search</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="table-head">
              <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Last Login</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody className="table-body">
              {users === null ? (
                <tr><td colSpan={7}><div className="flex justify-center py-10 text-slate-400"><Spinner className="h-6 w-6" /></div></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={UsersRound}>No users found.</EmptyState></td></tr>
              ) : users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-extrabold text-white">{initials(u.fullname || u.username)}</div>
                        <div>
                          <div className="font-bold text-slate-900">{u.username}{self && <span className="ml-1 text-xs text-slate-400">(you)</span>}</div>
                          <div className="text-xs text-slate-500">{u.fullname}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-600">{u.email}</td>
                    <td>
                      <select className="input w-auto py-1 text-xs" value={u.role} disabled={self} onChange={(e) => changeRole(u, e.target.value)}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.is_active
                        ? <span className="badge bg-green-100 text-green-700">Active</span>
                        : <span className="badge bg-red-100 text-red-700">Suspended</span>}
                    </td>
                    <td className="text-xs text-slate-500">{fmtDateTime(u.created_at)}</td>
                    <td className="text-xs text-slate-500">{u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <button className="btn-outline btn-sm" disabled={self} onClick={() => toggle(u)}>
                          {u.is_active ? <><Ban className="h-3.5 w-3.5" /> Suspend</> : <><CircleCheck className="h-3.5 w-3.5" /> Reactivate</>}
                        </button>
                        <button className="btn-outline btn-sm text-red-600" disabled={self} onClick={() => remove(u)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add User" icon={<UserPlus className="h-5 w-5 text-airtel" />}>
        <form onSubmit={create} className="space-y-3">
          <div><label className="label">Username *</label><input className="input" value={form.username} onChange={set('username')} required /></div>
          <div><label className="label">Full Name</label><input className="input" value={form.fullname} onChange={set('fullname')} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={set('email')} /></div>
          <div><label className="label">Password *</label><input type="password" className="input" value={form.password} onChange={set('password')} required autoComplete="new-password" /></div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={set('role')}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-outline" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner /> : <UserPlus className="h-4 w-4" />} Create User</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title}
        footer={<><button className="btn-outline" onClick={() => setConfirm(null)}>Cancel</button><button className="btn-primary" onClick={() => { const a = confirm.action; setConfirm(null); a(); }}>Delete</button></>}>
        <p className="text-sm text-slate-600">{confirm?.message}</p>
      </Modal>
    </div>
  );
}
