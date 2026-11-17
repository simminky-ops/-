"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { MoneyUnit } from "@/lib/format";

export type PeriodMode = "month" | "quarter" | "cumulative";

interface Prefs {
  unit: MoneyUnit;
  setUnit: (u: MoneyUnit) => void;
  period: PeriodMode;
  setPeriod: (p: PeriodMode) => void;
}

const Ctx = createContext<Prefs>({ unit: "EOK", setUnit: () => {}, period: "month", setPeriod: () => {} });

function load<T>(k: string, fb: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<MoneyUnit>("EOK");
  const [period, setPeriodState] = useState<PeriodMode>("month");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnitState(load("ad.unit", "EOK"));
    setPeriodState(load("ad.period", "month"));
  }, []);
  return (
    <Ctx.Provider
      value={{
        unit,
        setUnit: (u) => {
          setUnitState(u);
          save("ad.unit", u);
        },
        period,
        setPeriod: (p) => {
          setPeriodState(p);
          save("ad.period", p);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const usePrefs = () => useContext(Ctx);
