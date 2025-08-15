/**
 * Three Dots Animation Component
 * Extracted from SearchProgress.tsx for reuse across the application
 */

import React from "react";

interface ThreeDotsProps {
  size?: "sm" | "md";
  color?: string;
  className?: string;
}

const sizeClasses = {
  sm: "w-1 h-1",
  md: "w-1.5 h-1.5",
};

export const ThreeDots: React.FC<ThreeDotsProps> = ({
  size = "md",
  color = "bg-emerald-500",
  className = "",
}) => {
  const dotSizeClass = sizeClasses[size];
  const spacing = size === "sm" ? "space-x-0.5" : "space-x-1";

  return (
    <div className={`flex ${spacing} ${className}`} aria-hidden="true">
      <div
        className={`${dotSizeClass} ${color} rounded-full animate-bounce [animation-delay:0ms]`}
      />
      <div
        className={`${dotSizeClass} ${color} rounded-full animate-bounce [animation-delay:100ms]`}
      />
      <div
        className={`${dotSizeClass} ${color} rounded-full animate-bounce [animation-delay:200ms]`}
      />
    </div>
  );
};
