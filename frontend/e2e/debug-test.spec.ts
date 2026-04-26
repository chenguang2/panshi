import { test, expect } from '@playwright/test'

test.describe('Debug Test', () => {
  test('should open add cluster modal', async ({ page }) => {
    console.log('1. Go to login page')
    await page.goto('/login')
    await page.waitForSelector('#username', { timeout: 10000 })

    console.log('2. Login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
    await page.waitForTimeout(1000)

    console.log('3. Click 集群管理')
    await page.click('text=集群管理')
    await page.waitForTimeout(2000)

    console.log('4. Click 添加集群 button')
    const addBtn = page.locator('text=添加集群')
    await addBtn.waitFor({ state: 'visible', timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(2000)

    console.log('5. Check modal title')
    const modalTitle = page.locator('.ant-modal-title')
    const titleText = await modalTitle.textContent()
    console.log('Modal title:', titleText)

    console.log('6. Check all inputs in the modal')
    const inputs = page.locator('.ant-modal input')
    const count = await inputs.count()
    console.log('Number of inputs:', count)

    for (let i = 0; i < count; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder')
      const type = await inputs.nth(i).getAttribute('type')
      console.log(`Input ${i}: type=${type}, placeholder=${placeholder}`)
    }

    console.log('7. Check if name input exists by label')
    const nameLabel = page.locator('.ant-form-item-label label:has-text("名称")')
    const nameLabelVisible = await nameLabel.isVisible()
    console.log('Name label visible:', nameLabelVisible)

    console.log('8. Try to find the name input directly')
    const nameInput = page.locator('.ant-modal input').first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.fill('test-cluster')
    console.log('Successfully filled name input')

    await page.waitForTimeout(3000)
  })
})