/**
 * Authentication Context
 * Manages user authentication state and provides auth-related functions
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Use relative URLs for production compatibility
// In production, frontend is served from backend/public, so relative URLs work
// In development, vite proxy handles /api requests

// Role constants
export const ROLES = {
  PLATFORM_ADMIN: 'Platform Admin',
  USER: 'User',
  ASSESSOR: 'Assessor'
};

// Permission check helpers
export const PERMISSIONS = {
  canEditSettings: (role) => role === ROLES.PLATFORM_ADMIN,
  canEditAssessorDetails: (role) => role === ROLES.ASSESSOR || role === ROLES.PLATFORM_ADMIN,
  canEditImplementationStatus: (role) => role === ROLES.ASSESSOR || role === ROLES.PLATFORM_ADMIN,
  canEditTestingMethod: (role) => role === ROLES.ASSESSOR || role === ROLES.PLATFORM_ADMIN,
  canEditSystemInfo: (role) => role === ROLES.USER || role === ROLES.PLATFORM_ADMIN,
  canManageUsers: (role) => role === ROLES.PLATFORM_ADMIN,
  canViewReports: (role) => true, // All roles can view
  canExportReports: (role) => true, // All roles can export
  canCompareReports: (role) => true // All roles can compare
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('sessionToken');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setSessionToken(storedToken);
        setUser(parsedUser);
        
        // Validate session with backend
        validateSession(storedToken, parsedUser);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        logout();
      }
    }
    
    setLoading(false);
  }, []);

  // Validate session with backend
  const validateSession = async (token, userData) => {
    try {
      const response = await axios.get('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data.valid) {
        console.log('✅ Session validated');
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      logout();
    }
  };

  // Login function
  const login = async (username, password) => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });
      
      if (response.data.success) {
        const { user: userData, sessionToken: token } = response.data;
        
        // Store in state
        setUser(userData);
        setSessionToken(token);
        
        // Store in localStorage
        localStorage.setItem('sessionToken', token);
        localStorage.setItem('user', JSON.stringify(userData));
        
        console.log('✅ Login successful:', userData);
        return { success: true };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      setError(errorMessage);
      console.error('❌ Login error:', error);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (sessionToken) {
        await axios.post('/api/auth/logout', {}, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear state and localStorage
      setUser(null);
      setSessionToken(null);
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('user');
      console.log('✅ Logged out');
    }
  };

  // Change password function
  const changePassword = async (oldPassword, newPassword) => {
    try {
      const response = await axios.post(
        '/api/auth/change-password',
        { oldPassword, newPassword },
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        }
      );
      
      return { success: true, message: response.data.message };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to change password';
      return { success: false, error: errorMessage };
    }
  };

  // Get axios config with auth header
  const getAuthConfig = () => {
    if (!sessionToken) return {};
    return {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    };
  };

  // Permission check functions
  const hasPermission = (permission) => {
    if (!user || !user.role) return false;
    return permission(user.role);
  };

  const value = {
    user,
    sessionToken,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    changePassword,
    getAuthConfig,
    hasPermission,
    // Direct permission helpers
    canEditSettings: () => hasPermission(PERMISSIONS.canEditSettings),
    canEditAssessorDetails: () => hasPermission(PERMISSIONS.canEditAssessorDetails),
    canEditImplementationStatus: () => hasPermission(PERMISSIONS.canEditImplementationStatus),
    canEditTestingMethod: () => hasPermission(PERMISSIONS.canEditTestingMethod),
    canEditSystemInfo: () => hasPermission(PERMISSIONS.canEditSystemInfo),
    canManageUsers: () => hasPermission(PERMISSIONS.canManageUsers)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

