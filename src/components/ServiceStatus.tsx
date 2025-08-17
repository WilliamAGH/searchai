/**
 * Service Status Component
 * Displays the current health status of all services
 */

import React, { useEffect, useState } from "react";
import { serviceRegistry } from "../lib/services/ServiceConfig";
import { healthCheckManager } from "../lib/services/HealthCheck";
import { logger } from "../lib/logger";

interface ServiceStatusProps {
  /** Show detailed status information */
  detailed?: boolean;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Compact display mode */
  compact?: boolean;
}

export const ServiceStatus: React.FC<ServiceStatusProps> = ({
  detailed = false,
  refreshInterval = 60000,
  compact = false,
}) => {
  const [systemHealth, setSystemHealth] = useState<{
    status: "healthy" | "degraded" | "critical";
    services: Array<{
      name: string;
      status: string;
      responseTime?: number;
      lastCheck: Date;
    }>;
    message: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Start health monitoring
    healthCheckManager.startMonitoring(refreshInterval);

    // Initial check
    updateStatus();

    // Set up refresh interval
    const interval = setInterval(() => {
      updateStatus();
    }, refreshInterval);

    return () => {
      clearInterval(interval);
      healthCheckManager.stopMonitoring();
    };
  }, [refreshInterval]);

  const updateStatus = async () => {
    setIsRefreshing(true);
    try {
      await healthCheckManager.checkAllServices();
      const status = healthCheckManager.getSystemStatus();
      setSystemHealth(status);
    } catch (error) {
      logger.error("Failed to update service status", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!systemHealth) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-500";
      case "degraded":
        return "text-yellow-500";
      case "unhealthy":
      case "critical":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return "✓";
      case "degraded":
        return "⚠";
      case "unhealthy":
      case "critical":
        return "✗";
      default:
        return "?";
    }
  };

  const getStatusBadge = (status: string) => {
    const color = getStatusColor(status);
    const icon = getStatusIcon(status);
    return (
      <span className={`inline-flex items-center ${color}`}>
        <span className="mr-1">{icon}</span>
        <span className="capitalize">{status}</span>
      </span>
    );
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2 text-sm">
        <span className={getStatusColor(systemHealth.status)}>
          {getStatusIcon(systemHealth.status)}
        </span>
        <span className="text-gray-600 dark:text-gray-400">
          System: {systemHealth.status}
        </span>
        {isRefreshing && <span className="animate-spin">⟳</span>}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Service Status
        </h3>
        <button
          onClick={updateStatus}
          disabled={isRefreshing}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          aria-label="Refresh status"
        >
          <span className={isRefreshing ? "animate-spin" : ""}>⟳</span>
        </button>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Overall Status
          </span>
          {getStatusBadge(systemHealth.status)}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          {systemHealth.message}
        </p>
      </div>

      {detailed && (
        <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Individual Services
          </h4>
          {systemHealth.services.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-gray-600 dark:text-gray-400 capitalize">
                {service.name}
              </span>
              <div className="flex items-center space-x-2">
                {service.responseTime !== undefined && (
                  <span className="text-xs text-gray-500">
                    {service.responseTime}ms
                  </span>
                )}
                {getStatusBadge(service.status)}
              </div>
            </div>
          ))}
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            Last checked:{" "}
            {new Date(systemHealth.services[0]?.lastCheck).toLocaleTimeString()}
          </div>
        </div>
      )}

      {systemHealth.status !== "healthy" && !detailed && (
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          <button
            onClick={() => window.location.reload()}
            className="underline hover:text-gray-900 dark:hover:text-gray-200"
          >
            Try refreshing the page
          </button>
          {" if you experience issues."}
        </div>
      )}
    </div>
  );
};

/**
 * Service Status Indicator
 * Small indicator for displaying in headers/footers
 */
export const ServiceStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<
    "healthy" | "degraded" | "critical" | "unknown"
  >("unknown");

  useEffect(() => {
    const updateStatus = () => {
      const systemHealth = serviceRegistry.getSystemHealth();
      setStatus(systemHealth.status);
    };

    // Initial check
    updateStatus();

    // Update every 30 seconds
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const getIndicatorColor = () => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "degraded":
        return "bg-yellow-500";
      case "critical":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="flex items-center space-x-1">
      <div
        className={`w-2 h-2 rounded-full ${getIndicatorColor()} animate-pulse`}
      />
      <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
        {status === "unknown" ? "Checking..." : status}
      </span>
    </div>
  );
};
