import json
from dataclasses import dataclass, asdict
from pathlib import Path
from datetime import datetime
from typing import Optional

STATE_FILE = Path(__file__).parent / 'state.json'


@dataclass
class SymbolState:
    symbol: str
    T: float = 0.0
    avg_price: float = 0.0
    shares: float = 0.0
    remaining_capital: float = 0.0
    total_capital: float = 0.0
    division: int = 40
    status: str = 'idle'  # idle | running | paused
    cycle: int = 0
    last_updated: str = ''
    mode: str = 'normal'  # normal | reverse
    reverse_day: int = 0  # 리버스모드 진행 일수 (0 = 첫날 MOC)

    def is_half_way(self) -> bool:
        return self.T >= self.division / 2

    def should_enter_reverse(self) -> bool:
        return self.T > self.division - 1


class StateManager:
    def __init__(self):
        self.states: dict[str, SymbolState] = {}
        self._load()

    def _load(self):
        if STATE_FILE.exists():
            with open(STATE_FILE) as f:
                data = json.load(f)
            self.states = {k: SymbolState(**v) for k, v in data.items()}

    def save(self):
        data = {k: asdict(v) for k, v in self.states.items()}
        with open(STATE_FILE, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def get(self, symbol: str) -> Optional[SymbolState]:
        return self.states.get(symbol)

    def init_symbol(self, symbol: str, total_capital: float, division: int):
        self.states[symbol] = SymbolState(
            symbol=symbol,
            total_capital=total_capital,
            remaining_capital=total_capital,
            division=division,
            last_updated=datetime.now().isoformat(),
        )
        self.save()

    def start_cycle(self, symbol: str):
        state = self.states[symbol]
        state.status = 'running'
        state.cycle += 1
        state.last_updated = datetime.now().isoformat()
        self.save()

    def apply_buy(self, symbol: str, price: float, shares: float, amount: float, T_delta: float):
        from calculator import new_avg_price
        state = self.states[symbol]
        state.avg_price = new_avg_price(state.avg_price, state.shares, price, shares)
        state.shares += shares
        state.remaining_capital -= amount
        state.T = round(state.T + T_delta, 4)
        state.last_updated = datetime.now().isoformat()
        self.save()

    def apply_sell(self, symbol: str, shares: float, is_quarter: bool):
        state = self.states[symbol]
        state.shares = round(state.shares - shares, 6)

        if is_quarter:
            state.T = round(state.T * 0.75, 4)
        else:
            # 전량매도 → 사이클 종료
            proceeds = shares * state.avg_price  # 실제 체결가는 runner에서 전달
            state.remaining_capital += proceeds
            state.shares = 0.0
            state.T = 0.0
            state.avg_price = 0.0
            state.status = 'idle'

        if state.shares < 0.001:
            state.shares = 0.0
            state.T = 0.0
            state.avg_price = 0.0
            state.status = 'idle'

        state.last_updated = datetime.now().isoformat()
        self.save()

    def complete_sell(self, symbol: str, proceeds: float):
        """전량매도 완료 후 자본 복원"""
        state = self.states[symbol]
        state.remaining_capital = state.total_capital + (proceeds - state.total_capital + state.remaining_capital)
        state.last_updated = datetime.now().isoformat()
        self.save()

    def pause(self, symbol: str):
        self.states[symbol].status = 'paused'
        self.states[symbol].last_updated = datetime.now().isoformat()
        self.save()

    def resume(self, symbol: str):
        self.states[symbol].status = 'running'
        self.states[symbol].last_updated = datetime.now().isoformat()
        self.save()

    def reset(self, symbol: str):
        state = self.states[symbol]
        total = state.total_capital
        division = state.division
        self.states[symbol] = SymbolState(
            symbol=symbol,
            total_capital=total,
            remaining_capital=total,
            division=division,
            last_updated=datetime.now().isoformat(),
        )
        self.save()
