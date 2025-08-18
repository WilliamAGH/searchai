/**
 * Test Provider Wrappers
 *
 * Provides necessary context providers for testing components
 * that require them. This prevents "useContext must be used within Provider"
 * errors in tests.
 */

import React from "react";
import { InputActivityProvider } from "../../src/contexts/InputActivityContext";

interface TestProvidersProps {
  children: React.ReactNode;
}

/**
 * Wrapper that includes all necessary providers for testing
 * Add new providers here as they're created
 */
export function TestProviders({ children }: TestProvidersProps) {
  return <InputActivityProvider>{children}</InputActivityProvider>;
}

/**
 * Render helper that wraps children with test providers
 * Use this in tests that need context providers
 */
export function withTestProviders(children: React.ReactNode) {
  return <TestProviders>{children}</TestProviders>;
}
