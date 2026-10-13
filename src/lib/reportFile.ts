/*
 * The trip report as a file of its own, to keep or send: the report as the page shows it, with the
 * app's styles and its photos inside, so it opens in any browser, and prints from there, without the
 * app. It runs nothing: it's the page's HTML, and links into the app (which wouldn't work from a
 * file) keep only their text.
 */

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read a photo"))
    reader.readAsDataURL(blob)
  })
}

/** The app's own styles, as text. */
function appStyles(): string {
  return [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText)
      } catch {
        return []
      }
    })
    .join('\n')
}

/**
 * `node` (the report) as an HTML file. Elements marked `no-export` are left out, folded parts open,
 * and each `img[data-photo]` gets its photo from `photos` (or goes, with its tile, if there's none).
 */
export async function reportFile(node: HTMLElement, title: string, photos: Map<string, Blob>): Promise<Blob> {
  const copy = node.cloneNode(true) as HTMLElement
  for (const el of copy.querySelectorAll('.no-export')) el.remove()
  for (const details of copy.querySelectorAll('details')) details.setAttribute('open', '')
  for (const a of [...copy.querySelectorAll('a')]) a.replaceWith(...a.childNodes)
  for (const img of [...copy.querySelectorAll('img')]) {
    const photo = photos.get(img.dataset.photo ?? '')
    if (photo) {
      img.src = await dataUrl(photo)
      img.removeAttribute('loading')
      img.removeAttribute('data-photo')
    } else {
      ;(img.closest('.tile') ?? img).remove()
    }
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${appStyles()}</style>
</head>
<body>
<main class="page page-plain">${copy.outerHTML}</main>
</body>
</html>
`
  return new Blob([html], { type: 'text/html' })
}
