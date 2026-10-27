'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardPathForRole, isUserRole, type LoginPortal } from '@/lib/role-access';

export function LoginForm({ portal }: { portal: LoginPortal }) {
  const router = useRouter();
  const portalLabels: Record<LoginPortal, string> = {
    admin: 'Admin Portal',
    exam_officer: 'Exam Officer Portal',
    lecturer: 'Lecturer Portal',
    invigilator: 'Invigilator Portal',
    candidate: 'Student Portal',
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        portal,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid credentials or this account is not authorized for this portal.');
        return;
      }

      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Unable to verify the signed-in account.');
      }

      const session = await response.json() as { user?: { role?: unknown } };
      if (!isUserRole(session.user?.role) || session.user.role !== portal) {
        throw new Error('Unable to verify the signed-in account role.');
      }

      router.push(dashboardPathForRole(session.user.role));
    } catch {
      setError('Sign in could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2e5a] via-[#1a2e5a] to-[#0f1d3d] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#d4a017]/20 mb-4" aria-label="Bingham University home">
            <Shield className="w-8 h-8 text-[#d4a017]" />
          </Link>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Bingham University</h1>
          <p className="text-white/70 mt-1">Faculty of Law Examination System</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-display">
              {portalLabels[portal]}
            </CardTitle>
            <CardDescription>Only accounts assigned the {portalLabels[portal].replace(' Portal', '')} role can sign in here.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="your.email@bingham.edu"
                    value={email}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                Sign In
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {portal === 'candidate'
                ? 'Need access? Contact an authorized staff member to have your profile created.'
                : <Link href="/login" className="text-primary hover:underline font-medium">Choose another role portal</Link>}
            </div>
            <div className="mt-3 text-center text-sm">
              <Link href="/" className="text-muted-foreground hover:underline">Back to home</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
