/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Frontend accessor for config/constants/roles.json — the same role NAME strings
 * the backend uses (backend/auth/roles.js). Must stay identical across tiers.
 */
import rolesData from '../../../config/constants/roles.json';

export const ROLES = rolesData.roles;
