import '@testing-library/jest-dom/vitest';

// Polyfill IntersectionObserver for jsdom (used in NotificationsPage for infinite scroll)
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn();
  thresholds = [];
  root = null;
  rootMargin = '';
  constructor() {}
}
global.IntersectionObserver = MockIntersectionObserver;
