/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared responsive page container. Wrap a feature's content in one of these so
 * it inherits the app-wide fluid layout (see styles/layout.css) instead of
 * hard-coding widths:
 *
 *   <PageSection variant="wide">   ...data / tables / results...   </PageSection>
 *   <PageSection variant="readable"> ...forms / prose... </PageSection>
 *
 * variant "wide" fills the screen (up to an ultra-wide ceiling); "readable"
 * keeps a comfortable centered column. Both add a viewport-relative side gutter.
 */
import React from 'react';

export default function PageSection({ variant = 'wide', as: Tag = 'div', className = '', children, ...rest }) {
  const base = variant === 'readable' ? 'container-readable' : 'container-wide';
  const classes = className ? `${base} ${className}` : base;
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
