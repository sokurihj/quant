import math
from config import SYMBOLS


def byeol_pct(symbol: str, division: int, T: float) -> float:
    """T값에 따른 별지점 비율(%) 계산 — 후반전에서 음수 허용"""
    conf = SYMBOLS[symbol]
    slope = conf['byeol_slope'].get(division, conf['byeol_slope'][40])
    return conf['byeol_base'] - slope * T


def byeol_price(avg_price: float, symbol: str, division: int, T: float) -> float:
    """별지점 가격"""
    return round(avg_price * (1 + byeol_pct(symbol, division, T) / 100), 2)


def full_target_price(avg_price: float, symbol: str) -> float:
    """전량매도 목표가 (평단 +15% 또는 +20%)"""
    pct = SYMBOLS[symbol]['target_pct']
    return round(avg_price * (1 + pct / 100), 2)


def one_time_buy_amount(remaining_capital: float, division: int, T: float) -> float:
    """1회 매수금액 = 잔금 ÷ (분할수 - T)"""
    slots = division - T
    if slots <= 0:
        return 0.0
    return remaining_capital / slots


def new_avg_price(old_avg: float, old_shares: float, buy_price: float, buy_shares: float) -> float:
    """매수 후 새 평단가"""
    total_cost = old_avg * old_shares + buy_price * buy_shares
    total_shares = old_shares + buy_shares
    return total_cost / total_shares if total_shares > 0 else 0.0


# ── 리버스모드 전용 ──────────────────────────────────────────────────────────

def reverse_t_after_sell(T: float, division: int) -> float:
    """리버스 매도 후 T: 20분할 ×0.90, 40분할 ×0.95"""
    factor = 0.90 if division == 20 else 0.95
    return round(T * factor, 4)


def reverse_t_after_buy(T: float, division: int) -> float:
    """리버스 매수 후 T: T + (분할수 - T) × 0.25"""
    return round(T + (division - T) * 0.25, 4)


def reverse_sell_qty(shares: float, division: int) -> int:
    """리버스 매도 수량: 직전 보유량 ÷ (분할수/2) 내림 — 20분할=10등분, 40분할=20등분"""
    return math.floor(shares / (division / 2))


def reverse_buy_amount(remaining_capital: float) -> float:
    """리버스 매수금액: 잔금 ÷ 4"""
    return remaining_capital / 4


def reverse_exit_threshold(avg_price: float, symbol: str) -> float:
    """리버스 종료 기준가: 평단 × (1 - target_pct/100)"""
    return avg_price * (1 - SYMBOLS[symbol]['target_pct'] / 100)
