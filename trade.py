"""
무한매수법 V4.0 수동 매매 보조 도구

사용법:
  python trade.py status                         현황 조회
  python trade.py buy TQQQ 250                   250달러 매수 (현재가 자동 조회)
  python trade.py buy TQQQ 250 --price 73.05     가격 직접 입력
  python trade.py sell TQQQ quarter              쿼터매도 (1/4 매도)
  python trade.py sell TQQQ all                  지정가매도 (쿼터매도 후 잔여 3/4 체결 시)
  python trade.py init TQQQ 10000 40             종목 초기화 (자본 10000, 40분할)
  python trade.py reset TQQQ                     상태 초기화
"""

import argparse
import math
import sys
from typing import Optional
from state import StateManager
from calculator import (
    byeol_pct, byeol_price, full_target_price,
    one_time_buy_amount, new_avg_price,
)
from config import SYMBOLS


def get_current_price(symbol: str) -> Optional[float]:
    try:
        import yfinance as yf
        hist = yf.Ticker(symbol).history(period='2d')
        return float(hist['Close'].iloc[-1]) if not hist.empty else None
    except Exception:
        return None


LINE = '─' * 40


def print_summary(state, current_price: float = None):
    """현재 상태 요약 출력"""
    print(f'\n{LINE}')
    print(f'  {state.symbol}  |  사이클 {state.cycle}회  |  상태: {state.status}')
    print(LINE)

    if state.avg_price > 0:
        byeol = byeol_price(state.avg_price, state.symbol, state.division, state.T)
        full = full_target_price(state.avg_price, state.symbol)
        b_pct = byeol_pct(state.symbol, state.division, state.T)
        next_amount = one_time_buy_amount(state.remaining_capital, state.division, state.T)
        progress = state.T / state.division * 100

        print(f'  T값      : {state.T:.2f} / {state.division}  ({progress:.0f}%)')
        print(f'  평단가   : ${state.avg_price:.2f}')
        print(f'  보유주식 : {state.shares:.4f}주')
        print(f'  잔여자본 : ${state.remaining_capital:,.2f}')

        if current_price:
            pnl = (current_price - state.avg_price) / state.avg_price * 100
            print(f'  현재가   : ${current_price:.2f}  ({pnl:+.1f}%)')

        print(LINE)
        print(f'  🎯 별지점       : ${byeol:.2f}  (+{b_pct:.2f}%)  ← 쿼터매도 (1/4)')
        print(f'  📌 지정가매도목표 : ${full:.2f}  (+{SYMBOLS[state.symbol]["target_pct"]}%)  ← 잔여 3/4')
        print(f'  💵 다음 1회 매수금 : ${next_amount:.2f}')
    else:
        print(f'  가용 자본 : ${state.remaining_capital:,.2f}')
        print(f'  {state.division}분할 기준 1회 매수금 : ${state.remaining_capital / state.division:.2f}')

    print(LINE)


def cmd_status(sm: StateManager, symbol: str = None):
    targets = [symbol] if symbol else list(sm.states.keys())
    if not targets:
        print('저장된 상태 없음. init 명령으로 초기화하세요.')
        return

    for sym in targets:
        state = sm.get(sym)
        if not state:
            print(f'{sym}: 초기화 필요 (python trade.py init {sym} 10000 40)')
            continue
        price = get_current_price(sym)
        print_summary(state, price)


def cmd_init(sm: StateManager, symbol: str, capital: float, division: int):
    sm.init_symbol(symbol, capital, division)
    print(f'\n✅ {symbol} 초기화 완료')
    print(f'   자본: ${capital:,.2f}  |  분할: {division}  |  1회 매수금: ${capital/division:.2f}')
    sm.start_cycle(symbol)
    print(f'   사이클 1회 시작')
    print_summary(sm.get(symbol))


def cmd_buy(sm: StateManager, symbol: str, amount_usd: float, price: float = None):
    state = sm.get(symbol)
    if not state:
        print(f'{symbol} 초기화 필요. init 명령을 먼저 실행하세요.')
        return

    if state.status == 'idle':
        sm.start_cycle(symbol)
        state = sm.get(symbol)

    # 가격 조회
    if price is None:
        print(f'{symbol} 현재가 조회 중...')
        price = get_current_price(symbol)
        if not price:
            print('가격 조회 실패. --price 옵션으로 직접 입력하세요.')
            return

    shares = amount_usd / price

    T_delta = 1.0  # 정상 체결 기준 T +1

    sm.apply_buy(symbol, price, shares, amount_usd, T_delta)
    state = sm.get(symbol)

    print(f'\n✅ 매수 기록 완료')
    print(f'   {symbol}  {shares:.4f}주  @  ${price:.2f}  (${amount_usd:.2f})')
    print_summary(state)


def cmd_sell(sm: StateManager, symbol: str, sell_type: str, price: float = None):
    state = sm.get(symbol)
    if not state or state.avg_price == 0:
        print(f'{symbol} 보유 포지션 없음.')
        return

    if price is None:
        print(f'{symbol} 현재가 조회 중...')
        price = get_current_price(symbol)
        if not price:
            print('가격 조회 실패. --price 옵션으로 직접 입력하세요.')
            return

    if sell_type == 'quarter':
        shares = math.floor(state.shares * 0.25)
        if shares <= 0:
            print('보유 주수가 너무 적어 쿼터매도(1주 이상)가 불가능합니다.')
            return
        proceeds = shares * price
        sm.apply_sell(symbol, shares, is_quarter=True)
        print(f'\n✅ 쿼터매도 기록 완료')
        print(f'   {symbol}  {shares}주  @  ${price:.2f}  (${proceeds:.2f})')

    elif sell_type == 'all':
        shares = state.shares
        proceeds = shares * price
        sm.apply_sell(symbol, shares, is_quarter=False)
        sm.complete_sell(symbol, proceeds)
        profit = proceeds - (state.avg_price * shares)
        print(f'\n✅ 전량매도 기록 완료')
        print(f'   {symbol}  {shares:.4f}주  @  ${price:.2f}  (${proceeds:.2f})')
        print(f'   손익: ${profit:+,.2f}')

    else:
        print(f'알 수 없는 매도 유형: {sell_type}  (quarter 또는 all)')
        return

    print_summary(sm.get(symbol))


def cmd_reset(sm: StateManager, symbol: str):
    if symbol not in sm.states:
        print(f'{symbol}: 상태 없음.')
        return
    confirm = input(f'{symbol} 상태를 초기화하시겠습니까? (y/N): ').strip().lower()
    if confirm == 'y':
        sm.reset(symbol)
        print(f'{symbol} 초기화 완료.')
    else:
        print('취소.')


def main():
    parser = argparse.ArgumentParser(
        description='무한매수법 V4.0 수동 매매 보조',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest='cmd')

    # status
    p_status = sub.add_parser('status', help='현황 조회')
    p_status.add_argument('symbol', nargs='?', help='종목 (생략 시 전체)')

    # init
    p_init = sub.add_parser('init', help='종목 초기화')
    p_init.add_argument('symbol', choices=list(SYMBOLS.keys()))
    p_init.add_argument('capital', type=float, help='총 자본 (달러)')
    p_init.add_argument('division', type=int, nargs='?', default=40, help='분할 수 (기본 40)')

    # buy
    p_buy = sub.add_parser('buy', help='매수 기록')
    p_buy.add_argument('symbol', choices=list(SYMBOLS.keys()))
    p_buy.add_argument('amount', type=float, help='매수 금액 (달러)')
    p_buy.add_argument('--price', type=float, help='매수가 (생략 시 현재가 자동 조회)')

    # sell
    p_sell = sub.add_parser('sell', help='매도 기록')
    p_sell.add_argument('symbol', choices=list(SYMBOLS.keys()))
    p_sell.add_argument('type', choices=['quarter', 'all'], help='quarter: 쿼터매도, all: 전량매도')
    p_sell.add_argument('--price', type=float, help='매도가 (생략 시 현재가 자동 조회)')

    # reset
    p_reset = sub.add_parser('reset', help='상태 초기화')
    p_reset.add_argument('symbol', choices=list(SYMBOLS.keys()))

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        sys.exit(0)

    sm = StateManager()

    if args.cmd == 'status':
        cmd_status(sm, getattr(args, 'symbol', None))
    elif args.cmd == 'init':
        cmd_init(sm, args.symbol, args.capital, args.division)
    elif args.cmd == 'buy':
        cmd_buy(sm, args.symbol, args.amount, getattr(args, 'price', None))
    elif args.cmd == 'sell':
        cmd_sell(sm, args.symbol, args.type, getattr(args, 'price', None))
    elif args.cmd == 'reset':
        cmd_reset(sm, args.symbol)


if __name__ == '__main__':
    main()
