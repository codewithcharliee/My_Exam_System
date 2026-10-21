'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'candidate', matricNumber: '', academicLevel: '100', staffTitle: '' });
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (res.ok) setUsers(await res.json());
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    void loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('User created successfully');
        setShowCreate(false);
        setForm({ name: '', email: '', password: '', role: 'candidate', matricNumber: '', academicLevel: '100', staffTitle: '' });
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data?.error || 'Failed to create user');
      }
    } catch (e) { toast.error('Error creating user'); }
    setCreating(false);
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountStatus: newStatus }),
      });
      if (res.ok) {
        toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
        fetchUsers();
      }
    } catch (e) { toast.error('Failed to update user'); }
  };

  const filtered = users.filter((u: any) =>
    (u?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u?.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-700',
      exam_officer: 'bg-purple-100 text-purple-700',
      lecturer: 'bg-blue-100 text-blue-700',
      invigilator: 'bg-amber-100 text-amber-700',
      candidate: 'bg-emerald-100 text-emerald-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] ?? 'bg-gray-100 text-gray-700'}`}>{role}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground">Create, edit, and manage all platform users</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Full Name</Label><Input value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} required /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e: any) => setForm({...form, email: e.target.value})} required /></div>
              <div><Label htmlFor="new-user-password">Password</Label><PasswordInput id="new-user-password" value={form.password} onChange={(e: any) => setForm({...form, password: e.target.value})} required minLength={6} /></div>
              {form.role === 'candidate' && (
                <>
                  <div><Label>Matric number</Label><Input value={form.matricNumber} onChange={(e: any) => setForm({...form, matricNumber: e.target.value})} required /></div>
                  <div><Label>Academic level</Label>
                    <Select value={form.academicLevel} onValueChange={(value: string) => setForm({...form, academicLevel: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[100, 200, 300, 400, 500].map((level) => <SelectItem key={level} value={String(level)}>{level} Level</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {form.role === 'lecturer' && (
                <div><Label>Staff title / designation</Label><Input value={form.staffTitle} onChange={(e: any) => setForm({...form, staffTitle: e.target.value})} placeholder="Lecturer, HOD, Dean, Assistant Lecturer" /></div>
              )}
              <div><Label>Role</Label>
                <Select value={form.role} onValueChange={(v: string) => setForm({...form, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="lecturer">Lecturer</SelectItem>
                    <SelectItem value="invigilator">Invigilator</SelectItem>
                    <SelectItem value="exam_officer">Exam Officer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create User
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u?.name ?? ''}</TableCell>
                    <TableCell>{u?.email ?? ''}</TableCell>
                    <TableCell>{u?.role === 'candidate' ? `${u?.academicLevel ?? 'Level unset'} ${u?.matricNumber ? `· ${u.matricNumber}` : ''}` : u?.staffTitle ?? '—'}</TableCell>
                    <TableCell>{roleBadge(u?.role ?? '')}</TableCell>
                    <TableCell>
                      <Badge variant={u?.accountStatus === 'active' ? 'default' : 'destructive'}>
                        {u?.accountStatus ?? 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(u.id, u?.accountStatus ?? 'active')}>
                        {u?.accountStatus === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
