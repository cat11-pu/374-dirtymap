// dirtyrun.js：按处理预算处理并留账（纯函数：跨轮状态原样保留，只返回新状态）
import { markOf, takeOf } from "./dirty.js";

const DEFAULT_CODES = {
  bad_page_code: "E_BAD_PAGE",
  dup_code: "E_DUP_DIRTY",
  clean_code: "E_CLEAN",
  event_error_code: "E_BAD_EVENT"
};

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isPositiveInteger(page) {
  return Number.isSafeInteger(page) && page > 0;
}

function cloneState(state) {
  const src = state || {};
  return {
    dirty: Array.isArray(src.dirty) ? src.dirty.slice() : [],
    flushed: Array.isArray(src.flushed) ? src.flushed.map(function (row) {
      return Array.isArray(row) ? row.slice() : row;
    }) : [],
    ledger: Array.isArray(src.ledger) ? src.ledger.slice() : [],
    applied: Array.isArray(src.applied) ? src.applied.slice() : []
  };
}

// 结构与页号校验：都先于业务规则校验。
function inspect(raw, codes) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail(codes.event_error_code, "事件必须是对象");
  }
  if (raw.kind === "mark") {
    if (!isPositiveInteger(raw.page)) {
      fail(codes.bad_page_code, "页号必须是正整数");
    }
  } else if (raw.kind === "flush") {
    // 回写事件不带参数。
  } else {
    fail(codes.event_error_code, "事件种类不合法");
  }
}

function applyEvent(state, raw, codes) {
  if (raw.kind === "mark") {
    if (state.dirty.includes(raw.page)) {
      fail(codes.dup_code, "页 " + raw.page + " 已经在脏页表里");
    }
    state.dirty = markOf(state.dirty, raw.page);
  } else {
    if (state.dirty.length === 0) {
      fail(codes.clean_code, "一页都不脏不能回写");
    }
    state.flushed.push([state.dirty.length]);
    state.dirty = takeOf(state.dirty);
  }
  if (raw.id !== undefined && raw.id !== null && !state.applied.includes(raw.id)) {
    state.applied.push(raw.id);
  }
}

// 压在账上的请求对外按 [kind, page, null] 序列化。
function ledgerView(ledger) {
  return ledger.map(function (raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return [raw.kind, raw.kind === "mark" ? raw.page : null, null];
    }
    return [null, null, null];
  });
}

function codesOf(spec) {
  const codes = Object.assign({}, DEFAULT_CODES);
  Object.keys(DEFAULT_CODES).forEach(function (key) {
    if (spec[key]) { codes[key] = spec[key]; }
  });
  return codes;
}

// 先还账：每花一次预算先处理一条旧账；再按序处理新事件，
// 已经处理过的事件直接跳过（不花预算、不再上账）；预算用尽后连着压账。
function run(spec, limit) {
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  const beforeLedger = state.ledger.length;
  let spent = 0;
  let served = 0;
  let budgeted = limit === Infinity;

  function withinBudget() {
    return budgeted || spent < limit;
  }

  while (state.ledger.length > 0) {
    if (!withinBudget()) { break; }
    const raw = state.ledger.shift();
    inspect(raw, codes);
    applyEvent(state, raw, codes);
    spent += 1;
    served += 1;
  }

  let i = 0;
  for (; i < events.length; i += 1) {
    const raw = events[i];
    if (raw && typeof raw === "object" && !Array.isArray(raw)
        && raw.id !== undefined && raw.id !== null
        && state.applied.includes(raw.id)) {
      continue;
    }
    if (!withinBudget()) { break; }
    inspect(raw, codes);
    applyEvent(state, raw, codes);
    spent += 1;
    served += 1;
  }

  for (; i < events.length; i += 1) {
    const raw = events[i];
    if (raw && typeof raw === "object" && !Array.isArray(raw)
        && raw.id !== undefined && raw.id !== null
        && state.applied.includes(raw.id)) {
      continue;
    }
    state.ledger.push(raw);
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: ledgerView(state.ledger),
    judged: served,
    judged_bound: beforeLedger + events.length
  };
}

export function step(spec) {
  const budget = Number.isFinite(spec.budget) && spec.budget > 0
    ? Math.floor(spec.budget) : 0;
  return run(spec, budget);
}

export function close(spec) {
  const result = run(Object.assign({}, spec, { events: [] }), Infinity);
  return { state: result.state, catchup: result.served };
}
