import Link from 'next/link';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2e5a] via-[#1a2e5a] to-[#0f1d3d] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#d4a017]/20 mb-4">
            <Shield className="w-8 h-8 text-[#d4a017]" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Bingham University</h1>
          <p className="text-white/70 mt-1">Faculty of Law Examination System</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-display">Registration is managed by staff</CardTitle>
            <CardDescription>
              Student profiles can only be created by authorized university staff. Please contact your department for access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login/student">Go to Student Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
