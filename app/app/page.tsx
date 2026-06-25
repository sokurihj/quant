'use client';

import { useState } from 'react';
import { QuantApp } from '@/components/quant-app';
import type { Symbol, OpenOrder } from '@/components/quant-app';

export default function Home() {
  const [sym, setSym] = useState<Symbol>('TQQQ');
  const [openOrdersCache, setOpenOrdersCache] = useState<Partial<Record<Symbol, OpenOrder[] | null>>>({});

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Quant</h1>
            <p className="text-xs text-muted-foreground">레버리지 ETF · BTC 계산기</p>
          </div>
          <div className="flex gap-1.5 bg-muted p-1 rounded-lg">
            {(['TQQQ', 'SOXL', 'HYNIX2X', 'BTC', 'RAM'] as Symbol[]).map(s => (
              <button
                key={s}
                onClick={() => setSym(s)}
                className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
                  sym === s
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <QuantApp
          key={sym}
          sym={sym}
          openOrders={openOrdersCache[sym] ?? null}
          setOpenOrders={(orders) => setOpenOrdersCache(prev => ({ ...prev, [sym]: orders }))}
        />
      </div>
    </main>
  );
}
