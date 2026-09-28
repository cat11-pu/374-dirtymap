// dirty.js：标记与回写（纯函数：不改动入参，返回新表，始终按页号升序）
export function markOf(dirty, page) {
  const table = Array.isArray(dirty) ? dirty.slice() : [];
  if (!table.includes(page)) {
    table.push(page);
  }
  table.sort(function (a, b) { return a - b; });
  return table;
}

export function takeOf(dirty) {
  return [];
}
