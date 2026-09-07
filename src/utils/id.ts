let seq = 0;

export const uid = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
