import { test, expect } from '@playwright/test';

test.describe('Chat Flow Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should complete full chat flow: create, send, and receive message', async ({ page }) => {
    // Wait for app to load - look for the textarea by aria-label
    const messageInput = page.locator('textarea[aria-label="Message input"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    
    // Type a message
    const testMessage = 'What is the capital of France?';
    await messageInput.fill(testMessage);
    
    // Send the message - button with aria-label
    const sendButton = page.locator('button[aria-label="Send message"]');
    await sendButton.click();
    
    // Wait for user message to appear - using class selector
    const userMessage = page.locator('.message-item').filter({ hasText: testMessage });
    await expect(userMessage).toBeVisible({ timeout: 5000 });
    
    // Wait for AI response (could be streaming) - check for at least 2 messages
    await expect(page.locator('.message-item')).toHaveCount(2, { timeout: 30000 });
    
    // Verify AI response exists
    const aiMessage = page.locator('.message-item').nth(1);
    await expect(aiMessage).toBeVisible();
    
    // Verify AI response has content (check it's not empty)
    await expect(aiMessage).not.toBeEmpty();
    
    // Verify chat is saved (URL should change to include chat ID)
    await expect(page).toHaveURL(/\/chat\/[a-zA-Z0-9]+/, { timeout: 5000 });
  });

  test('should handle multiple messages in sequence', async ({ page }) => {
    const messageInput = page.locator('textarea[aria-label="Message input"]');
    const sendButton = page.locator('button[aria-label="Send message"]');
    
    // First message
    await messageInput.fill('Hello');
    await sendButton.click();
    await expect(page.locator('.message-item')).toHaveCount(2, { timeout: 30000 });
    
    // Second message
    await messageInput.fill('How are you?');
    await sendButton.click();
    await expect(page.locator('.message-item')).toHaveCount(4, { timeout: 30000 });
    
    // Verify message order
    const messages = page.locator('.message-item');
    await expect(messages.nth(0)).toContainText('Hello');
    await expect(messages.nth(2)).toContainText('How are you?');
  });

  test('should show loading state while generating response', async ({ page }) => {
    const messageInput = page.locator('textarea[aria-label="Message input"]');
    const sendButton = page.locator('button[aria-label="Send message"]');
    
    await messageInput.fill('Test message');
    await sendButton.click();
    
    // Check for loading indicator - look for skeleton or loading state
    const loadingIndicator = page.locator('.message-skeleton, .typing-indicator, [aria-label*="Loading"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 5000 });
    
    // Wait for response to complete
    await expect(page.locator('.message-item')).toHaveCount(2, { timeout: 30000 });
    
    // Loading should be gone
    await expect(loadingIndicator).not.toBeVisible();
  });

  test('should disable input while generating response', async ({ page }) => {
    const messageInput = page.locator('textarea[aria-label="Message input"]');
    const sendButton = page.locator('button[aria-label="Send message"]');
    
    await messageInput.fill('Test message');
    await sendButton.click();
    
    // Input should be disabled
    await expect(messageInput).toBeDisabled({ timeout: 2000 });
    
    // Wait for response
    await expect(page.locator('.message-item')).toHaveCount(2, { timeout: 30000 });
    
    // Input should be enabled again
    await expect(messageInput).toBeEnabled();
  });

  test('should handle empty message gracefully', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send message"]');
    
    // Try to send empty message - button should be disabled
    await expect(sendButton).toBeDisabled();
    
    // Type something to enable button
    const messageInput = page.locator('textarea[aria-label="Message input"]');
    await messageInput.fill('test');
    await expect(sendButton).toBeEnabled();
    
    // Clear and verify button is disabled again
    await messageInput.clear();
    await expect(sendButton).toBeDisabled();
  });
});