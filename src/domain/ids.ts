/**
 * An id made from `parts`, the same on every phone (16 URL-safe characters, like any other id): for
 * records that each phone may create on its own but that must end up as one, such as someone's
 * review of an item. Changing how it's made would split those records in two, so it never changes.
 */
export async function derivedId(...parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')))
  let text = ''
  for (const b of new Uint8Array(digest).subarray(0, 12)) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_')
}
