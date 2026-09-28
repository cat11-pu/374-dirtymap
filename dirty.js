// dirty.js：标记与回写（基线：一律原样返回）
export function markOf(dirty, page) {
  return dirty;
}

export function takeOf(dirty) {
  return dirty;
}
