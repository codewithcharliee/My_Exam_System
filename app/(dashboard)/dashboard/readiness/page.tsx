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

const CHECK_LABELS: Record<string, string> = {
  JavaScript: 'Exam page works',
  IndexedDB: 'Save and recover your answers',
  'Web Crypto API': 'Protect your saved answers',
  Network: 'Internet connection',
  Camera: 'Camera',
  Fullscreen: 'Full-screen mode',
  'Local Storage Write': 'Save information on this device',
  'Autosave Simulation': 'Save a practice response',
  'Sync Endpoint Reachability': 'Connect to the exam',
  'Submission Endpoint Reachability': 'Send your finished exam',
};

function ReadinessContent() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    results.push({ name: 'JavaScript', status: 'pass', icon: <Monitor className="h-4 w-4" />, details: 'Your exam page is working and ready to use.' });

    try {
      const db = window.indexedDB;
      results.push({ name: 'IndexedDB', status: db ? 'pass' : 'fail', icon: <Database className="h-4 w-4" />, details: db ? 'This browser can save exam progress on your device.' : 'This browser cannot save exam progress. Enable site data in browser settings or try an up-to-date browser.' });
    } catch {
      results.push({ name: 'IndexedDB', status: 'fail', icon: <Database className="h-4 w-4" />, details: 'Could not check whether this browser can save exam progress. Enable site data in browser settings or try an up-to-date browser.' });
    }

    try {
      const cryptoApi = window.crypto?.subtle;
      results.push({ name: 'Web Crypto API', status: cryptoApi ? 'pass' : 'fail', icon: <Lock className="h-4 w-4" />, details: cryptoApi ? 'Your saved exam answers can be protected on this device.' : 'Your browser cannot protect saved exam answers. Try an up-to-date browser and open the exam site using its normal secure web address.' });
    } catch {
      results.push({ name: 'Web Crypto API', status: 'fail', icon: <Lock className="h-4 w-4" />, details: 'Could not confirm that saved answers can be protected. Try an up-to-date browser and open the exam site using its normal secure web address.' });
    }

    results.push({ name: 'Network', status: navigator?.onLine ? 'pass' : 'fail', icon: <Wifi className="h-4 w-4" />, details: navigator?.onLine ? 'Your device is connected to the internet.' : 'Your device appears to be offline. Connect to the internet before starting.' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t: any) => t?.stop?.());
      results.push({ name: 'Camera', status: 'pass', icon: <Camera className="h-4 w-4" />, details: 'Your camera is working and ready to use.' });
    } catch {
      results.push({ name: 'Camera', status: 'fail', icon: <Camera className="h-4 w-4" />, details: 'Allow camera access when your browser asks. If it is already allowed, check that another app is not using the camera.' });
    }

    try {
      const canFS = document.documentElement?.requestFullscreen !== undefined;
      results.push({ name: 'Fullscreen', status: canFS ? 'pass' : 'fail', icon: <Monitor className="h-4 w-4" />, details: canFS ? 'Your browser supports full-screen mode for exams.' : 'Full-screen mode is not supported. Try an up-to-date browser on a computer.' });
    } catch {
      results.push({ name: 'Fullscreen', status: 'fail', icon: <Monitor className="h-4 w-4" />, details: 'Could not check full-screen support. Try an up-to-date browser on a computer.' });
    }

    try {
      localStorage.setItem('readiness_write_test', 'ok');
      const value = localStorage.getItem('readiness_write_test');
      localStorage.removeItem('readiness_write_test');
      results.push({ name: 'Local Storage Write', status: value === 'ok' ? 'pass' : 'fail', icon: <HardDrive className="h-4 w-4" />, details: value === 'ok' ? 'This browser can save exam information on your device.' : 'This browser could not save exam information. Allow site data in browser settings.' });
    } catch {
      results.push({ name: 'Local Storage Write', status: 'fail', icon: <HardDrive className="h-4 w-4" />, details: 'This browser could not save exam information. Allow site data in browser settings.' });
    }

    try {
      const test = { ping: true, at: Date.now() };
      localStorage.setItem('autosave_sim_test', JSON.stringify(test));
      const raw = localStorage.getItem('autosave_sim_test');
      const parsed = raw ? JSON.parse(raw) : null;
      localStorage.removeItem('autosave_sim_test');
      results.push({ name: 'Autosave Simulation', status: parsed?.ping ? 'pass' : 'fail', icon: <Upload className="h-4 w-4" />, details: parsed?.ping ? 'A test response could be saved and read back on this device.' : 'The test response could not be saved. Allow site data in browser settings.' });
    } catch {
      results.push({ name: 'Autosave Simulation', status: 'fail', icon: <Upload className="h-4 w-4" />, details: 'The test response could not be saved. Allow site data in browser settings.' });
    }

    try {
      const syncRes = await fetch('/api/attempts/health/sync-check', { method: 'OPTIONS' });
      results.push({ name: 'Sync Endpoint Reachability', status: syncRes.ok || syncRes.status === 404 ? 'pass' : 'fail', icon: <Send className="h-4 w-4" />, details: 'Your device can contact the exam site to save your answers.' });
    } catch {
      results.push({ name: 'Sync Endpoint Reachability', status: 'fail', icon: <Send className="h-4 w-4" />, details: 'Could not contact the exam site. Check your internet connection and try again.' });
    }

    try {
      const submitRes = await fetch('/api/attempts/health/submit-check', { method: 'OPTIONS' });
      results.push({ name: 'Submission Endpoint Reachability', status: submitRes.ok || submitRes.status === 404 ? 'pass' : 'fail', icon: <Send className="h-4 w-4" />, details: 'Your device can contact the exam site to send your finished exam.' });
    } catch {
      results.push({ name: 'Submission Endpoint Reachability', status: 'fail', icon: <Send className="h-4 w-4" />, details: 'Could not contact the exam site. Check your internet connection and try again.' });
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
        toast.error('Some checks need attention. You will not be able to start an exam until all required checks are ready.');
      }
    } catch {
      // ignore
    }

    setRunning(false);
    const allPass = results.every(r => r.status === 'pass');
    if (allPass) toast.success('Everything is ready. You can start your exam.');
    else toast.info('Please fix the items marked “Needs attention” before starting your exam.');
  };

  const passCount = checks.filter(c => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <CheckCircle className="h-6 w-6 text-primary" /> Readiness Check
        </h1>
        <p className="text-muted-foreground">Check that your device, camera, internet connection, and browser are ready before your exam.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Before you begin</span>
            <Button onClick={runChecks} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {checks.length ? 'Re-run Checks' : 'Run Checks'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Select “Run Checks” to make sure your device is ready for the exam.</p>
          ) : (
            <div className="space-y-3">
              {checks.map((c, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${c.status === 'pass' ? 'bg-green-50' : 'bg-red-50'}`}>
                  {c.status === 'pass' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{CHECK_LABELS[c.name] ?? c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.details}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.status === 'pass' ? 'Ready' : 'Needs attention'}
                  </span>
                </div>
              ))}
              <div className="pt-3 text-center">
                <p className="text-lg font-display font-bold">{passCount} of {checks.length} items ready</p>
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
