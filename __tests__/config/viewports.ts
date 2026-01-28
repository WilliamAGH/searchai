/**
 * Shared viewport configurations for Playwright tests
 * Ensures consistency across all test files
 */

export const viewports = {
  // Desktop
  desktop: { width: 1280, height: 720 },
  desktopHD: { width: 1920, height: 1080 },
  desktop4K: { width: 3840, height: 2160 },

  // Tablet
  tablet: { width: 768, height: 1024 },
  tabletLandscape: { width: 1024, height: 768 },
  iPadPro: { width: 1024, height: 1366 },

  // Mobile
  mobile: { width: 375, height: 667 }, // iPhone SE
  mobileL: { width: 390, height: 844 }, // iPhone 12
  mobileXL: { width: 414, height: 896 }, // iPhone 11 Pro Max

  // Specific devices
  iPhone12: { width: 390, height: 844 },
  iPhoneSE: { width: 375, height: 667 },
  pixel5: { width: 393, height: 851 },
  galaxyS21: { width: 384, height: 854 },
} as const;

// Default viewports for common test scenarios
export const desktopViewport = viewports.desktop;
export const mobileViewport = viewports.mobile;
export const tabletViewport = viewports.tablet;

// Helper to get viewport by device name
export function getViewport(device: keyof typeof viewports) {
  return viewports[device];
}
