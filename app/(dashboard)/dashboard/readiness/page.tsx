'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, RefreshCw, Monitor, Wifi, Camera, Database, Lock, HardDrive, Upload, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ClientOnly } from '@/components/client-only';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'pending';
  icon: React.ReactNode;
  details: string;
}

function ReadinessContent() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    results.push({ name: 'JavaScript', status: 'pass', icon: <Monitor className="h-4 w-4" />, details: 'JavaScript is enabled and working' });

    try {
      const db = window.indexedDB;
      results.push({ name: 'IndexedDB', status: db ? 'pass' : 'fail', icon: <Database className="h-4 w-4" />, details: db ? 'IndexedDB is available for local data storage' : 'IndexedDB is not available' });
    } catch {
      results.push({ name: 'IndexedDB', status: 'fail', icon: <Database className="h-4 w-4" />, details: 'IndexedDB check failed' });
    }

    try {
      const cryptoApi = window.crypto?.subtle;
      results.push({ name: 'Web Crypto API', status: cryptoApi ? 'pass' : 'fail', icon: <Lock className="h-4 w-4" />, details: cryptoApi ? 'Encryption capabilities available' : 'Web Crypto API not available' });
    } catch {
      results.push({ name: 'Web Crypto API', status: 'fail', icon: <Lock className="h-4 w-4" />, details: 'Web Crypto check failed' });
    }

    results.push({ name: 'Network', status: navigator?.onLine ? 'pass' : 'fail', icon: <Wifi className="h-4 w-4" />, details: navigator?.onLine ? 'Network connection detected' : 'No network connection' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t: any) => t?.stop?.());
      results.push({ name: 'Camera', status: 'pass', icon: <Camera className="h-4 w-4" />, details: 'Camera permission granted and working' });
    } catch {
      results.push({ name: 'Camera', status: 'fail', icon: <Camera className="h-4 w-4" />, details: 'Camera unavailable or permission denied' });
    }

    try {
      const canFS = document.documentElement?.requestFullscreen !== undefined;
      results.push({ name: 'Fullscreen', status: canFS ? 'pass' : 'fail', icon: <Monitor className="h-4 w-4" />, details: canFS ? 'Fullscreen API supported' : 'Fullscreen not supported' });
    } catch {
      results.push({ name: 'Fullscreen', status: 'fail', icon: <Monitor className="h-4 w-4" />, details: 'Fullscreen check failed' });
    }

    try {
      localStorage.setItem('readiness_write_test', 'ok');
      const value = localStorage.getItem('readiness_write_test');
      localStorage.removeItem('readiness_write_test');
      results.push({ name: 'Local Storage Write', status: value === 'ok' ? 'pass' : 'fail', icon: <HardDrive className="h-4 w-4" />, details: value === 'ok' ? 'Local storage read/write succeeded' : 'Local storage write test failed' });
    } catch {
      results.push({ name: 'Local Storage Write', status: 'fail', icon: <HardDrive className="h-4 w-4" />, details: 'Local storage write test failed' });
    }

    try {
      const test = { ping: true, at: Date.now() };
      localStorage.setItem('autosave_sim_test', JSON.stringify(test));
      const raw = localStorage.getItem('autosave_sim_test');
      const parsed = raw ? JSON.parse(raw) : null;
      localStorage.removeItem('autosave_sim_test');
      results.push({ name: 'Autosave Simulation', status: parsed?.ping ? 'pass' : 'fail', icon: <Upload className="h-4 w-4" />, details: parsed?.ping ? 'Autosave simulation succeeded' : 'Autosave simulation failed' });
    } catch {
      results.push({ name: 'Autosave Simulation', status: 'fail', icon: <Upload className="h-4 w-4" />, details: 'Autosave simulation failed' });
    }

    try {
      const syncRes = await fetch('/api/attempts/health/sync-check', { method: 'OPTIONS' });
      results.push({ name: 'Sync Endpoint Reachability', status: syncRes.ok || syncRes.status === 404 ? 'pass' : 'fail', icon: <Send className="h-4 w-4" />, details: 'Network path to sync endpoint is reachable' });
    } catch {
      results.push({ name: 'Sync Endpoint Reachability', status: 'fail', icon: <Send className="h-4 w-4" />, details: 'Cannot reach sync endpoint path' });
    }

    try {
      const submitRes = await fetch('/api/attempts/health/submit-check', { method: 'OPTIONS' });
      results.push({ name: 'Submission Endpoint Reachability', status: submitRes.ok || submitRes.status === 404 ? 'pass' : 'fail', icon: <Send className="h-4 w-4" />, details: 'Network path to submission endpoint is reachable' });
    } catch {
      results.push({ name: 'Submission Endpoint Reachability', status: 'fail', icon: <Send className="h-4 w-4" />, details: 'Cannot reach submission endpoint path' });
    }

    setChecks(results);

    try {
      const response = await fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: results.map(r => ({ checkType: r.name, status: r.status, details: { message: r.details } })) }),
      });
      const data = await response.json();
      if (data?.summary?.blocked) {
        toast.error('Readiness failed. Start exam will be blocked until all required checks pass.');
      }
    } catch {
      // ignore
    }

    setRunning(false);
    const allPass = results.every(r => r.status === 'pass');
    if (allPass) toast.success('All required checks passed! You are ready.');
    else toast.info('Some checks failed. Resolve them before starting an examination.');
  };

  const passCount = checks.filter(c => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <CheckCircle className="h-6 w-6 text-primary" /> Readiness Check
        </h1>
        <p className="text-muted-foreground">Verify browser, storage, autosave and submission readiness before exams</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Readiness Verification</span>
            <Button onClick={runChecks} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {checks.length ? 'Re-run Checks' : 'Run Checks'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Run checks to verify your exam readiness.</p>
          ) : (
            <div className="space-y-3">
              {checks.map((c, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${c.status === 'pass' ? 'bg-green-50' : 'bg-red-50'}`}>
                  {c.status === 'pass' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.details}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.status === 'pass' ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
              <div className="pt-3 text-center">
                <p className="text-lg font-display font-bold">{passCount}/{checks.length} checks passed</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReadinessPage() {
  return <ClientOnly fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}><ReadinessContent /></ClientOnly>;
}
