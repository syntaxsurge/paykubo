const indexedKeyPattern = /^\d+$/
const indexedKeyThreshold = 100

export function omitIndexedCharacterMaps(value: unknown, depth = 0): unknown {
  if (depth > 12) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => omitIndexedCharacterMaps(item, depth + 1))
  }

  if (!isPlainRecord(value)) {
    return value
  }

  const entries = Object.entries(value)
  const indexedKeyCount = entries.filter(([key]) =>
    indexedKeyPattern.test(key)
  ).length
  const shouldDropIndexedKeys = indexedKeyCount > indexedKeyThreshold
  const normalizedEntries = entries
    .filter(([key]) => !shouldDropIndexedKeys || !indexedKeyPattern.test(key))
    .map(([key, item]) => [key, omitIndexedCharacterMaps(item, depth + 1)])

  if (!shouldDropIndexedKeys) {
    return Object.fromEntries(normalizedEntries)
  }

  return {
    ...Object.fromEntries(normalizedEntries),
    omittedIndexedCharacters: indexedKeyCount
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.prototype.toString.call(value) === '[object Object]'
  )
}
