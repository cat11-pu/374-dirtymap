// dirtyrun.js：按处理预算处理并留账，收尾不限预算把账做完
import { markOf, takeOf } from "./dirty.js";

const DEFAULT_CODES = {
  bad_page: "E_BAD_PAGE",
  dup: "E_DUP_DIRTY",
  clean: "E_CLEAN",
  bad_event: "E_BAD_EVENT"
};

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codeOf(spec, key, fallback) {
  return (spec && spec[key]) || fallback;
}

function isKnownEvent(ev) {
  return ev !== null && typeof ev === "object"
    && (ev.kind === "mark" || ev.kind === "flush");
}

function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// 结构与页号先于预算、先于脏页表状态全量校验。
function validate(events, spec) {
  for (const ev of events) {
    if (!isKnownEvent(ev)) {
      fail(codeOf(spec, "event_error_code", DEFAULT_CODES.bad_event), "事件结构不合法");
    }
    if (ev.kind === "mark" && !isPositiveInteger(ev.page)) {
      fail(codeOf(spec, "bad_page_code", DEFAULT_CODES.bad_page), "页号必须是正整数");
    }
  }
}

function toLedgerRow(ev) {
  return [ev.kind, ev.kind === "mark" ? ev.page : null, null];
}

function cloneState(state) {
  state = state || {};
  return {
    dirty: Array.isArray(state.dirty) ? state.dirty.slice() : [],
    flushed: Array.isArray(state.flushed) ? state.flushed.slice() : [],
    ledger: Array.isArray(state.ledger) ? state.ledger.slice() : [],
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

// 真正落状态：重复标记 / 空回写按当前脏页表判，预算不够时根本走不到这里。
function applyOne(state, kind, page, codes) {
  if (kind === "mark") {
    if (state.dirty.includes(page)) {
      fail(codes.dup, "同一页重复标记");
    }
    state.dirty = markOf(state.dirty, page);
  } else {
    if (state.dirty.length === 0) {
      fail(codes.clean, "没有脏页还回写");
    }
    state.flushed.push([state.dirty.length]);
    state.dirty = takeOf(state.dirty);
  }
}

export function step(spec) {
  spec = spec || {};
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  validate(events, spec);

  const codes = {
    dup: codeOf(spec, "dup_code", DEFAULT_CODES.dup),
    clean: codeOf(spec, "clean_code", DEFAULT_CODES.clean)
  };

  let capacity = Number.isFinite(spec.budget)
    ? Math.max(0, Math.trunc(spec.budget)) : 0;
  const judgedBound = state.ledger.length + events.length;

  // 旧账压在前头，先于新来的事件排队处理。
  const pending = state.ledger;
  state.ledger = [];
  let served = 0;

  for (const row of pending) {
    if (capacity > 0) {
      applyOne(state, row[0], row[1], codes);
      served += 1;
      capacity -= 1;
    } else {
      state.ledger.push(row);
    }
  }

  for (const ev of events) {
    // 重放：已入账/已处理过的事件整条跳过，不花预算、不再压账。
    if (ev.id !== undefined && ev.id !== null && state.applied.includes(ev.id)) {
      continue;
    }
    if (ev.id !== undefined && ev.id !== null) {
      state.applied.push(ev.id);
    }
    if (capacity > 0) {
      applyOne(state, ev.kind, ev.kind === "mark" ? ev.page : null, codes);
      served += 1;
      capacity -= 1;
    } else {
      state.ledger.push(toLedgerRow(ev));
    }
  }

  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.slice(),
    judged: served,
    judged_bound: judgedBound
  };
}

export function close(spec) {
  spec = spec || {};
  const state = cloneState(spec.state);
  const codes = {
    dup: codeOf(spec, "dup_code", DEFAULT_CODES.dup),
    clean: codeOf(spec, "clean_code", DEFAULT_CODES.clean)
  };

  let catchup = 0;
  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    applyOne(state, row[0], row[1], codes);
    catchup += 1;
  }
  return { state, catchup };
}
