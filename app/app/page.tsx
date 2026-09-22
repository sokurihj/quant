'use client';

import { useState } from 'react';
import { QuantApp } from '@/components/quant-app';
import { Portfolio } from '@/components/portfolio';
import type { Symbol, OpenOrder } from '@/components/quant-app';

export default function Home() {
  // 'ALL'은 심볼이 아니라 전체 포트폴리오 비중 화면을 가리킨다
  const [sym, setSym] = useState<Symbol | 'ALL'>('TQQQ');
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
            {(['TQQQ', 'SOXL', 'HYNIX2X', 'BTC', 'RAM', 'ALL'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSym(s)}
                className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
                  sym === s
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? '전체' : s}
              </button>
            ))}
          </div>
        </div>

        {sym === 'ALL' ? (
          <Portfolio />
        ) : (
          <QuantApp
            key={sym}
            sym={sym}
            openOrders={openOrdersCache[sym] ?? null}
            setOpenOrders={(orders) => setOpenOrdersCache(prev => ({ ...prev, [sym]: orders }))}
          />
        )}
      </div>
    </main>
  );
}
