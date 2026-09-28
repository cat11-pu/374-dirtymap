// dirty.js：标记与回写（脏页表始终按页号升序）
export function markOf(dirty, page) {
  const next = Array.isArray(dirty) ? dirty.slice() : [];
  if (!next.includes(page)) {
    next.push(page);
    next.sort((a, b) => a - b);
  }
  return next;
}

export function takeOf(dirty) {
  return [];
}
