export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createAuditEvent } from '@/lib/audit';

function isValidBinghamEmail(email: string) {
  return email.toLowerCase().endsWith('@bingham.edu');
}

function isValidMatric(matric: string) {
  return /^[A-Za-z0-9\/-]{6,40}$/.test(matric);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: 'Database is not configured. Set DATABASE_URL and run Prisma db push.' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const emailValue = typeof body.email === 'string' ? body.email.trim() : '';
    const passwordValue = typeof body.password === 'string' ? body.password.trim() : '';
    const nameValue = typeof body.name === 'string' ? body.name.trim() : '';
    const matricValue = typeof body.matricNumber === 'string' ? body.matricNumber.trim() : '';

    if (!emailValue || !passwordValue || !nameValue || !matricValue) {
      return NextResponse.json({ error: 'Name, email, password and matric number are required' }, { status: 400 });
    }

    if (!isValidBinghamEmail(emailValue)) {
      return NextResponse.json({ error: 'Only Bingham University email addresses are allowed.' }, { status: 400 });
    }

    if (!isValidMatric(matricValue)) {
      return NextResponse.json({ error: 'Invalid matric number format.' }, { status: 400 });
    }

    const normalizedEmail = emailValue.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { matricNumber: matricValue },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ error: 'Email or matric number already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(passwordValue, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: nameValue,
        matricNumber: matricValue,
        passwordHash,
        role: 'candidate',
      },
    });

    await createAuditEvent({
      actorId: user.id,
      actionType: 'signup',
      entityType: 'user',
      entityId: user.id,
      metadata: { matricNumber: matricValue },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      matricNumber: user.matricNumber,
      role: user.role,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Signup error:', error);

    const dbErrorMap: Record<string, string> = {
      P1001: 'The database server is unreachable. Check DATABASE_URL and database service.',
      P1000: 'The database connection could not be established. Check Prisma setup.',
      P2021: 'The database schema is missing required tables. Run `npx prisma db push`.',
      P2022: 'A uniqueness constraint failed. Email or matric number already exists.',
      P2002: 'Email or matric number already exists.',
    };

    const friendlyError = dbErrorMap[error?.code] ?? 'Database error while creating account. Check your database setup and try again.';
    return NextResponse.json({ error: friendlyError }, { status: 500 });
  }
}
