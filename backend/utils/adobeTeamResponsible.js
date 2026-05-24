/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
/**
 * @param {*} raw - JSON string from OSCAL prop, array, or undefined
 * @returns {[string, string, string]}
 */
export function normalizeAdobeTeamResponsibleSlots(raw) {
  if (raw == null) {
    return ['', '', ''];
  }
  if (Array.isArray(raw)) {
    return [0, 1, 2].map((i) => (raw[i] != null ? String(raw[i]).trim() : ''));
  }
  const s = String(raw).trim();
  if (!s) {
    return ['', '', ''];
  }
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return normalizeAdobeTeamResponsibleSlots(parsed);
    }
  } catch {
    // ignore
  }
  return ['', '', ''];
}
