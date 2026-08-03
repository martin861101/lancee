"use client";

import type { ReactNode } from "react";

const GlitchText = ({ children, speed = 1, enableShadows = true, enableOnHover = false, className = "" }: {
  children: ReactNode;
  speed?: number;
  enableShadows?: boolean;
  enableOnHover?: boolean;
  className?: string;
}) => {
const inlineStyles = {
    "--after-duration": `${speed * 3}s`,
    "--before-duration": `${speed * 2}s`,
    "--after-shadow": enableShadows ? "-3px 0 #ff4422" : "none",
    "--before-shadow": enableShadows ? "3px 0 #00ddcc" : "none"
  } as React.CSSProperties;

  const hoverClass = enableOnHover ? "enable-on-hover" : "";

  return (
    <div className={`glitch ${hoverClass} ${className}`} style={inlineStyles} data-text={children}>
      {children}
    </div>
  );
};

export default GlitchText;