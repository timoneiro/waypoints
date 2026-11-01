import { LINKS } from '../src/lib/links.ts'
import { expect, test } from './fixtures.ts'

test('a fresh phone shows the Welcome screen with the guide link', async ({ page }) => {
  await page.goto('')
  const link = page.getByRole('link', { name: 'Read the guide' })
  await expect(page.getByText('New here?')).toBeVisible()
  await expect(link).toHaveAttribute('href', LINKS.guide)
  await expect(link).toHaveAttribute('target', '_blank')
})
