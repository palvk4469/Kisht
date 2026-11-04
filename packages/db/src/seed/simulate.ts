// A deterministic simulation of six months of collections, used to seed the
// demo and to train the priority model (A9).
//
// Each loan has a hidden risk r in [0, 1]. Risk drives how often EMIs are
// missed, how quickly arrears are paid, how reachable the borrower is and
// whether promises are kept. The model never sees r; it only sees what a
// lender would see (DPD, payment and promise history, amount), which is what
// makes the back-test meaningful.
//
// Officers work the way the brief describes today: oldest overdue first.
// That gives the back-test a baseline to beat.

import {
  addDays,
  assignLoans,
  daysBetween,
  type IsoDay,
  isContactAllowed,
  istDayStart,
  type PaymentInput,
  resolvePromise,
} from "@kisht/domain";
import {
  BUSINESS_TYPES,
  PINCODES,
  type PincodeRef,
  SAMPLE_LOANS,
  type SampleLoan,
  STAFF,
} from "./reference.js";
import { createRng } from "./rng.js";

const HISTORY_DAYS = 180;
const WARMUP_DAYS = 90;
const GENERATED_LOANS = 2600;
const MINUTE_MS = 60_000;

export type SimBorrower = {
  id: string;
  name: string;
  businessType: string;
  phone: string;
  address: string;
  pincode: string;
  lat: number;
  lng: number;
};

export type SimLoan = {
  id: string;
  loanNo: string;
  borrowerId: string;
  branch: string;
  emiAmount: number;
  contactPaused: boolean;
};

export type SimSnapshot = {
  loanId: string;
  asOfDate: IsoDay;
  outstanding: number;
  dpd: number;
  lastPaymentDate: IsoDay | null;
  lastPaymentAmount: number | null;
};

export type SimPayment = { loanId: string; date: IsoDay; amount: number };

export type SimAssignment = {
  loanId: string;
  officer: string;
  startedAt: Date;
  endedAt: Date | null;
};

export type SimAttempt = {
  id: string;
  loanId: string;
  officer: string;
  channel: "CALL" | "VISIT";
  at: Date;
  receivedAt: Date;
  lat: number;
  lng: number;
  accuracyM: number;
  allowed: boolean;
  blockReason: string | null;
};

export type SimOutcome = {
  id: string;
  attemptId: string;
  loanId: string;
  officer: string;
  type: "PAID" | "PROMISE" | "NOT_REACHABLE" | "DISPUTE";
  amount: number | null;
  note: string | null;
  at: Date;
  receivedAt: Date;
  lat: number;
  lng: number;
  accuracyM: number;
};

export type SimPromise = {
  id: string;
  loanId: string;
  outcomeId: string;
  madeOn: IsoDay;
  dueDate: IsoDay;
  amount: number;
  status: "PENDING" | "KEPT" | "PARTIAL" | "BROKEN";
  paidAmount: number;
  resolvedOn: IsoDay | null;
  createdAt: Date;
};

export type Simulation = {
  today: IsoDay;
  historyStart: IsoDay;
  borrowers: SimBorrower[];
  loans: SimLoan[];
  snapshots: SimSnapshot[];
  payments: SimPayment[];
  assignments: SimAssignment[];
  attempts: SimAttempt[];
  outcomes: SimOutcome[];
  promises: SimPromise[];
  /** Hidden risk per loan, kept only so the seed log can sanity-check the data. */
  risk: Map<string, number>;
};

type LoanState = {
  loan: SimLoan;
  borrower: SimBorrower;
  pin: PincodeRef;
  risk: number;
  dueDay: number;
  outstanding: number;
  /** Unpaid EMI due dates, oldest first. */
  arrears: IsoDay[];
  lastPayment: { date: IsoDay; amount: number } | null;
  pendingPromise: { promise: SimPromise; payOn: IsoDay | null } | null;
  pausedUntil: IsoDay | null;
  script: SampleLoan | null;
  scriptMissOn: IsoDay | null;
};

const VISIT_NOTES_HI = ["दुकान बंद थी", "मालिक बाहर गए हैं", "ताला लगा था"];
const CALL_NOTES = ["Phone switched off", "Call not answered", "फोन बंद है", "घंटी गई, उठाया नहीं"];

function dayOfMonth(day: IsoDay): number {
  return Number(day.slice(8, 10));
}

function daysInMonth(day: IsoDay): number {
  const [y, m] = [Number(day.slice(0, 4)), Number(day.slice(5, 7))];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isSunday(day: IsoDay): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
}

function isDueDate(state: LoanState, day: IsoDay): boolean {
  return dayOfMonth(day) === Math.min(state.dueDay, daysInMonth(day));
}

function dpdOf(state: LoanState, day: IsoDay): number {
  const oldest = state.arrears[0];
  return oldest ? daysBetween(oldest, day) : 0;
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** "Company E", ..., "Company Z", "Company AA", ... (B–D are the brief's sample loans). */
function companyName(index: number): string {
  let n = index + 4; // 0 -> "E"
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Company ${s}`;
}

function at(day: IsoDay, minuteOfDay: number): Date {
  return new Date(istDayStart(day).getTime() + minuteOfDay * MINUTE_MS);
}

export function simulate(today: IsoDay, seed = 20261102): Simulation {
  const rng = createRng(seed);
  const historyStart = addDays(today, -(HISTORY_DAYS - 1));
  const simStart = addDays(historyStart, -WARMUP_DAYS);

  const officers = STAFF.filter((s) => s.role === "OFFICER");
  const territories = officers.map((o) => ({ officerId: o.key, pincodes: o.pincodes ?? [] }));
  const branchOfPin = new Map(PINCODES.map((p) => [p.pincode, p]));

  const states: LoanState[] = [];
  const usedNumbers = new Set(SAMPLE_LOANS.map((s) => s.loanNo));

  function makeBorrower(
    id: string,
    name: string,
    businessType: string,
    pin: PincodeRef,
  ): SimBorrower {
    return {
      id,
      name: `${name} (${businessType})`,
      businessType,
      phone: `90000${String(rng.int(0, 99999)).padStart(5, "0")}`,
      address: `Plot ${rng.int(1, 240)}, ${pin.area}, ${pin.branch === "IND" ? "Indore" : "Pithampur"} ${pin.pincode}`,
      pincode: pin.pincode,
      lat: pin.lat + rng.normal() * 0.006,
      lng: pin.lng + rng.normal() * 0.006,
    };
  }

  // Scripted sample loans (A15): exact outstanding and DPD as of today.
  for (const s of SAMPLE_LOANS) {
    const pin = branchOfPin.get(s.pincode);
    if (!pin) throw new Error(`Unknown pincode ${s.pincode}`);
    const digits = s.loanNo.slice(3);
    const borrower = makeBorrower(`brw_${digits}`, s.company, s.businessType, pin);
    const missOn = addDays(today, -s.dpd);
    states.push({
      loan: {
        id: `ln_${digits}`,
        loanNo: s.loanNo,
        borrowerId: borrower.id,
        branch: pin.branch,
        emiAmount: roundTo(s.outstanding / 24, 100),
        contactPaused: false,
      },
      borrower,
      pin,
      risk: 0.4,
      dueDay: dayOfMonth(missOn),
      outstanding: s.outstanding,
      arrears: [],
      lastPayment: null,
      pendingPromise: null,
      pausedUntil: null,
      script: s,
      scriptMissOn: missOn,
    });
  }

  const pinWeights = PINCODES.map((p) => (p.pincode === "452020" ? 0.15 : 1));
  const pinTotal = pinWeights.reduce((a, b) => a + b, 0);
  function pickPin(): PincodeRef {
    let x = rng.next() * pinTotal;
    for (let i = 0; i < PINCODES.length; i++) {
      x -= pinWeights[i] ?? 0;
      if (x <= 0) return PINCODES[i] as PincodeRef;
    }
    return PINCODES[PINCODES.length - 1] as PincodeRef;
  }

  for (let i = 0; i < GENERATED_LOANS; i++) {
    let num: number;
    do num = rng.int(10000, 19999);
    while (usedNumbers.has(`LN-${num}`));
    usedNumbers.add(`LN-${num}`);

    const pin = pickPin();
    const businessType = rng.pick(BUSINESS_TYPES);
    const borrower = makeBorrower(`brw_${num}`, companyName(i), businessType, pin);
    const outstanding = roundTo(
      Math.min(2_500_000, Math.max(50_000, Math.exp(Math.log(350_000) + 0.6 * rng.normal()))),
      1000,
    );
    states.push({
      loan: {
        id: `ln_${num}`,
        loanNo: `LN-${num}`,
        borrowerId: borrower.id,
        branch: pin.branch,
        emiAmount: roundTo(outstanding / rng.int(12, 48), 100),
        contactPaused: false,
      },
      borrower,
      pin,
      // Skewed towards good borrowers; a long tail of risky ones.
      risk: rng.next() ** 1.7,
      dueDay: rng.int(1, 28),
      outstanding,
      arrears: [],
      lastPayment: null,
      pendingPromise: null,
      pausedUntil: null,
      script: null,
      scriptMissOn: null,
    });
  }

  const byId = new Map(states.map((s) => [s.loan.id, s]));
  const snapshots: SimSnapshot[] = [];
  const payments: SimPayment[] = [];
  const assignments: SimAssignment[] = [];
  const attempts: SimAttempt[] = [];
  const outcomes: SimOutcome[] = [];
  const promises: SimPromise[] = [];
  const paymentsByLoan = new Map<string, PaymentInput[]>();
  const paymentByDay = new Map<string, SimPayment>();
  const openAssignment = new Map<string, SimAssignment>();
  let seq = 0;

  function recordPayment(state: LoanState, day: IsoDay, amount: number, inHistory: boolean) {
    state.lastPayment = { date: day, amount };
    state.outstanding = Math.max(
      0,
      state.outstanding - (state.script ? 0 : Math.round(amount * 0.75)),
    );
    if (!inHistory) return;
    const key = `${state.loan.id}|${day}`;
    const prev = paymentByDay.get(key);
    if (prev) prev.amount += amount;
    else {
      const row = { loanId: state.loan.id, date: day, amount };
      paymentByDay.set(key, row);
      payments.push(row);
    }
    const list = paymentsByLoan.get(state.loan.id) ?? [];
    list.push({ date: day, amount });
    paymentsByLoan.set(state.loan.id, list);
  }

  function pay(state: LoanState, day: IsoDay, inHistory: boolean): number {
    const installments = state.arrears.length;
    if (installments === 0) return 0;
    const clearsAll = installments === 1 || rng.chance(0.75);
    const count = clearsAll ? installments : 1;
    state.arrears.splice(0, count);
    const amount = count * state.loan.emiAmount;
    recordPayment(state, day, amount, inHistory);
    return amount;
  }

  function officerFix(officer: string): { lat: number; lng: number } {
    const o = STAFF.find((s) => s.key === officer);
    const pin = PINCODES.find((p) => p.pincode === o?.pincodes?.[0]) ?? PINCODES[0];
    return {
      lat: (pin?.lat ?? 22.72) + rng.normal() * 0.01,
      lng: (pin?.lng ?? 75.86) + rng.normal() * 0.01,
    };
  }

  function contact(
    state: LoanState,
    officer: string,
    day: IsoDay,
    forced?: { type: SimOutcome["type"]; minute: number; promiseDue?: IsoDay; note?: string },
  ): { outcome: SimOutcome | null; paidToday: boolean } {
    const channel: SimAttempt["channel"] = rng.chance(0.4) ? "VISIT" : "CALL";
    // A few attempts in history fall after 19:00 so the compliance view has data.
    const late = !forced && rng.chance(0.004);
    const minute =
      forced?.minute ??
      (late ? rng.int(19 * 60 + 2, 19 * 60 + 40) : rng.int(9 * 60 + 30, 18 * 60 + 45));
    const when = at(day, minute);
    // Most events sync within minutes; some wait for signal, a few until the next day.
    const lagMin = rng.chance(0.9) ? rng.int(0, 90) : rng.int(120, 16 * 60);
    const receivedAt = new Date(when.getTime() + lagMin * MINUTE_MS);
    const fix =
      channel === "VISIT"
        ? {
            lat: state.borrower.lat + rng.normal() * 0.0004,
            lng: state.borrower.lng + rng.normal() * 0.0004,
          }
        : officerFix(officer);
    const accuracyM = channel === "VISIT" ? rng.int(6, 35) : rng.int(15, 80);
    const allowed = isContactAllowed(when);
    const attempt: SimAttempt = {
      id: `att_${++seq}`,
      loanId: state.loan.id,
      officer,
      channel,
      at: when,
      receivedAt,
      ...fix,
      accuracyM,
      allowed,
      blockReason: allowed ? null : "OUTSIDE_CONTACT_WINDOW",
    };
    attempts.push(attempt);
    if (!allowed) return { outcome: null, paidToday: false };

    const base = {
      id: `out_${seq}`,
      attemptId: attempt.id,
      loanId: state.loan.id,
      officer,
      at: new Date(when.getTime() + rng.int(3, 20) * MINUTE_MS),
      receivedAt: new Date(receivedAt.getTime() + rng.int(3, 20) * MINUTE_MS),
      ...fix,
      accuracyM,
    };

    let type: SimOutcome["type"];
    let amount: number | null = null;
    let note: string | null = forced?.note ?? null;
    let paidToday = false;

    if (forced) {
      type = forced.type;
    } else {
      const r = state.risk;
      const dpd = dpdOf(state, day);
      // Contact makes payment more likely that day.
      const payHazard = 0.12 * (1 - r) ** 0.8 * (1 / (1 + dpd / 60)) * 1.4;
      if (rng.chance(payHazard)) {
        type = "PAID";
      } else if (rng.chance(0.82 - 0.4 * r)) {
        type = rng.chance(0.03) ? "DISPUTE" : "PROMISE";
      } else {
        type = "NOT_REACHABLE";
        note = rng.pick(channel === "VISIT" ? VISIT_NOTES_HI : CALL_NOTES);
      }
    }

    if (type === "PAID") {
      amount = pay(state, day, true);
      paidToday = true;
    }

    const outcome: SimOutcome = { ...base, type, amount, note };
    outcomes.push(outcome);

    if (type === "PROMISE") {
      const dueDate = forced?.promiseDue ?? addDays(day, rng.int(1, 7));
      const promiseAmount = Math.max(1, state.arrears.length) * state.loan.emiAmount;
      const promise: SimPromise = {
        id: `ptp_${seq}`,
        loanId: state.loan.id,
        outcomeId: outcome.id,
        madeOn: day,
        dueDate,
        amount: promiseAmount,
        status: "PENDING",
        paidAmount: 0,
        resolvedOn: null,
        createdAt: base.receivedAt,
      };
      outcome.amount = promiseAmount;
      promises.push(promise);
      const keeps = !state.script && rng.chance(0.95 * (1 - state.risk) ** 0.8);
      const span = Math.max(0, daysBetween(day, dueDate));
      state.pendingPromise = {
        promise,
        payOn: keeps ? addDays(day, rng.int(Math.min(1, span), span)) : null,
      };
    }
    if (type === "DISPUTE") {
      state.pausedUntil = addDays(day, rng.int(3, 12));
    }
    return { outcome, paidToday };
  }

  for (let day = simStart; day <= today; day = addDays(day, 1)) {
    const inHistory = day >= historyStart;

    // 1. EMIs fall due.
    for (const s of states) {
      if (!isDueDate(s, day)) continue;
      if (s.script) {
        if (day === s.scriptMissOn) s.arrears.push(day);
        else if (day < (s.scriptMissOn as IsoDay))
          recordPayment(s, day, s.loan.emiAmount, inHistory);
        continue;
      }
      const missP = 0.03 + 0.33 * s.risk ** 2;
      if (s.arrears.length > 0 || rng.chance(missP)) s.arrears.push(day);
      else recordPayment(s, day, s.loan.emiAmount, inHistory);
    }

    // 2. The morning overdue list, and assignment with continuity.
    const overdue = states.filter((s) => s.arrears.length > 0 && dpdOf(s, day) >= 1);
    const morning = at(day, 8 * 60 - 30);
    for (const [loanId, a] of openAssignment) {
      const s = byId.get(loanId);
      if (!s || s.arrears.length === 0) {
        a.endedAt = morning;
        openAssignment.delete(loanId);
      }
    }
    const result = assignLoans(
      overdue.map((s) => ({
        loanId: s.loan.id,
        pincode: s.borrower.pincode,
        currentOfficerId: openAssignment.get(s.loan.id)?.officer ?? null,
      })),
      territories,
    );
    for (const d of result.assigned) {
      if (d.kind === "KEPT") continue;
      const prev = openAssignment.get(d.loanId);
      if (prev) prev.endedAt = morning;
      const next: SimAssignment = {
        loanId: d.loanId,
        officer: d.officerId,
        startedAt: morning,
        endedAt: null,
      };
      openAssignment.set(d.loanId, next);
      assignments.push(next);
    }

    if (inHistory) {
      for (const s of overdue) {
        snapshots.push({
          loanId: s.loan.id,
          asOfDate: day,
          outstanding: s.outstanding,
          dpd: dpdOf(s, day),
          lastPaymentDate: s.lastPayment?.date ?? null,
          lastPaymentAmount: s.lastPayment?.amount ?? null,
        });
      }
    }

    // 3. Promised payments that the borrower honours.
    for (const s of overdue) {
      if (s.pendingPromise?.payOn === day) {
        pay(s, day, inHistory);
        s.pendingPromise.payOn = null;
      }
    }

    // 4. Officers work their lists, oldest overdue first (today's practice).
    const contactedToday = new Set<string>();
    const perDay = isSunday(day) ? 5 : 16;
    for (const o of officers) {
      const list = overdue
        .filter((s) => !s.script && openAssignment.get(s.loan.id)?.officer === o.key)
        .filter((s) => !(s.pausedUntil && day <= s.pausedUntil))
        .filter((s) => !(s.pendingPromise && day <= addDays(s.pendingPromise.promise.dueDate, 1)))
        .sort((a, b) => dpdOf(b, day) - dpdOf(a, day))
        .slice(0, perDay);
      for (const s of list) {
        if (s.arrears.length === 0) continue;
        // Today's work hasn't happened yet: the demo opens at the start of the day.
        if (inHistory && day !== today) contact(s, o.key, day);
        contactedToday.add(s.loan.id);
      }
    }

    // 5. Borrowers who pay without being contacted that day.
    for (const s of overdue) {
      if (s.script || contactedToday.has(s.loan.id) || s.arrears.length === 0) continue;
      const hazard = 0.12 * (1 - s.risk) ** 0.8 * (1 / (1 + dpdOf(s, day) / 60));
      if (rng.chance(hazard)) pay(s, day, inHistory);
    }

    // 6. Clear finished promises so officers resume chasing.
    for (const s of states) {
      if (s.pendingPromise && day > addDays(s.pendingPromise.promise.dueDate, 1))
        s.pendingPromise = null;
      if (s.pendingPromise && s.arrears.length === 0) s.pendingPromise = null;
    }
  }

  // Scripted contact history for the three sample loans.
  for (const s of states) {
    const script = s.script;
    if (!script) continue;
    const missOn = s.scriptMissOn as IsoDay;
    if (script.loanNo === "LN-10871") {
      contact(s, script.officer, addDays(missOn, 9), {
        type: "NOT_REACHABLE",
        minute: 11 * 60 + 5,
        note: "फोन बंद है",
      });
      contact(s, script.officer, addDays(today, -3), {
        type: "NOT_REACHABLE",
        minute: 16 * 60 + 40,
        note: "दुकान बंद थी",
      });
    }
    if (script.promise) {
      const madeOn = addDays(today, -script.promise.madeDaysAgo);
      contact(s, script.officer, madeOn, {
        type: "PROMISE",
        minute: 12 * 60 + 20,
        promiseDue: addDays(today, script.promise.daysFromToday),
        ...(script.loanNo === "LN-11930" ? { note: "अगले हफ्ते भुगतान का वादा" } : {}),
      });
    }
  }

  // Final promise statuses use the same rule as the live app.
  for (const p of promises) {
    const r = resolvePromise(p, paymentsByLoan.get(p.loanId) ?? [], today);
    p.status = r.status;
    p.paidAmount = r.paidAmount;
    p.resolvedOn = r.resolvedOn;
  }
  // At most one pending promise per loan (enforced by the DB): keep the latest.
  const latestPending = new Map<string, SimPromise>();
  for (const p of promises) {
    if (p.status !== "PENDING") continue;
    const prev = latestPending.get(p.loanId);
    if (prev) {
      prev.status = "BROKEN";
      prev.resolvedOn = p.madeOn;
    }
    latestPending.set(p.loanId, p);
  }

  // A couple of disputes still awaiting the manager today (A12).
  for (const s of states) {
    if (s.pausedUntil && s.pausedUntil >= today && s.arrears.length > 0)
      s.loan.contactPaused = true;
  }

  return {
    today,
    historyStart,
    borrowers: states.map((s) => s.borrower),
    loans: states.map((s) => s.loan),
    snapshots,
    payments,
    assignments,
    attempts: attempts.filter((a) => a.at >= istDayStart(historyStart)),
    outcomes,
    promises,
    risk: new Map(states.map((s) => [s.loan.id, s.risk])),
  };
}
