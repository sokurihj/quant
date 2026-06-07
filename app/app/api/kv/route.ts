import { createSupabaseServer, createSupabaseAuth } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_KEYS = /^(st|hist|undo|journal)_(TQQQ|SOXL)$/;

async function getUser() {
  const supabase = await createSupabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from('kv_store').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { key, value } = await req.json();
  if (!ALLOWED_KEYS.test(key)) return NextResponse.json({ error: 'invalid key' }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('kv_store').upsert({ key, value });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
