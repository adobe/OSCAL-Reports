/**
 * User Management Component - Platform Admin only
 * Manage users, roles, and permissions
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth, ROLES } from '../contexts/AuthContext';
import './UserManagement.css';

// Use relative URLs for production compatibility

function UserManagement({ onClose }) {
  const { canManageUsers, getAuthConfig } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [deletionInfo, setDeletionInfo] = useState({}); // Store deletion info for each user
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    role: ROLES.USER,
    fullName: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    if (!canManageUsers()) {
      setError('You do not have permission to manage users');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get('/api/users', getAuthConfig());
      setUsers(response.data.users);
      setError('');
      
      // Load deletion info for deactivated users
      const info = {};
      for (const user of response.data.users) {
        if (!user.isActive) {
          try {
            const infoResponse = await axios.get(
              `/api/users/${user.id}/deactivation-info`,
              getAuthConfig()
            );
            info[user.id] = infoResponse.data;
          } catch (err) {
            console.error(`Failed to load deletion info for user ${user.id}:`, err);
          }
        }
      }
      setDeletionInfo(info);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Email validation function
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    
    // Validate username is email format
    if (!isValidEmail(newUser.username)) {
      alert('Username must be a valid email address');
      return;
    }
    
    // Validate email field is also email format
    if (!isValidEmail(newUser.email)) {
      alert('Email must be a valid email address');
      return;
    }
    
    // Ensure username and email match
    if (newUser.username !== newUser.email) {
      alert('Username and Email must match (both should be the same email address)');
      return;
    }

    // Password will be auto-generated and sent via email/Slack
    // Remove password requirement from frontend
    try {
      const userData = {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        fullName: newUser.fullName || newUser.username.split('@')[0]
      };
      
      await axios.post('/api/users', userData, getAuthConfig());
      setNewUser({
        username: '',
        email: '',
        role: ROLES.USER,
        fullName: ''
      });
      setShowAddUser(false);
      loadUsers();
      alert('✅ User created successfully. Password has been sent via configured messaging channel.');
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || 'Failed to create user'));
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      await axios.put(`/api/users/${userId}`, 
        { isActive: !isActive }, 
        getAuthConfig()
      );
      loadUsers();
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || 'Failed to update user'));
    }
  };

  const handleDeleteUser = async (userId, username) => {
    const info = deletionInfo[userId];
    
    if (!info || !info.canDelete) {
      const daysRemaining = info?.daysRemaining || 'unknown';
      alert(`⚠️ Cannot delete user yet.\n\nUser must be deactivated for at least 45 days before permanent deletion.\n\nDays remaining: ${daysRemaining}`);
      return;
    }
    
    if (!confirm(`⚠️ PERMANENT DELETE\n\nAre you sure you want to permanently delete user "${username}"?\n\nThis action cannot be undone. The user will be completely removed from the system.`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/users/${userId}`, getAuthConfig());
      alert('✅ User permanently deleted');
      loadUsers();
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || 'Failed to delete user'));
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt('Enter new password (min 6 characters):');
    if (!newPassword) return;

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    try {
      await axios.post(`/api/users/${userId}/reset-password`, 
        { newPassword }, 
        getAuthConfig()
      );
      alert('✅ Password reset successfully');
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || 'Failed to reset password'));
    }
  };

  if (loading) {
    return (
      <div className="user-management-container">
        <div className="user-management-header">
          <h2>👥 User Management</h2>
          <button className="close-btn" onClick={onClose}>✖</button>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  if (!canManageUsers()) {
    return (
      <div className="user-management-container">
        <div className="user-management-header">
          <h2>👥 User Management</h2>
          <button className="close-btn" onClick={onClose}>✖</button>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#dc3545' }}>
          ⚠️ You do not have permission to manage users. Only Platform Admins can access this feature.
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <h2>👥 User Management</h2>
        <button className="close-btn" onClick={onClose}>✖</button>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div style={{
        background: '#e3f2fd',
        border: '1px solid #2196f3',
        borderRadius: '6px',
        padding: '1rem',
        margin: '1rem 0',
        fontSize: '0.9rem',
        color: '#1565c0'
      }}>
        <strong>ℹ️ User Deletion Policy:</strong>
        <ul style={{ margin: '0.5rem 0 0 1.0rem', padding: 0 }}>
          <li>Manual deletion requires <strong>45 days</strong> of deactivation</li>
          <li>Automatic deletion occurs after <strong>90 days</strong> of deactivation</li>
          <li>Default system users (admin, user, assessor) are protected from deletion</li>
        </ul>
      </div>

      <div className="user-management-actions">
        <button 
          className="btn-primary"
          onClick={() => setShowAddUser(!showAddUser)}
        >
          {showAddUser ? '✖ Cancel' : '➕ Add New User'}
        </button>
        <button 
          className="btn-secondary"
          onClick={loadUsers}
        >
          🔄 Refresh
        </button>
      </div>

      {showAddUser && (
        <form className="add-user-form" onSubmit={handleAddUser}>
          <h3>Add New User</h3>
          <div className="form-group">
            <label>Email Address (Username) *</label>
            <input
              type="email"
              placeholder="user@example.com"
              value={newUser.username}
              onChange={(e) => {
                const email = e.target.value;
                setNewUser({
                  ...newUser, 
                  username: email,
                  email: email // Username and email are the same
                });
              }}
              required
            />
            <small>The email address will be used as both username and email.</small>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name (Optional)</label>
              <input
                type="text"
                placeholder="John Doe"
                value={newUser.fullName}
                onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Role *</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                required
              >
                <option value={ROLES.USER}>User</option>
                <option value={ROLES.ASSESSOR}>Assessor</option>
                <option value={ROLES.PLATFORM_ADMIN}>Admin</option>
              </select>
            </div>
          </div>
          <div style={{
            background: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '6px',
            padding: '0.75rem',
            margin: '0.5rem 0',
            fontSize: '0.9rem',
            color: '#1565c0'
          }}>
            ℹ️ <strong>Password Information:</strong> A 12-character alphanumeric password will be automatically generated and sent to the user via the configured messaging channel (Email or Slack).
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary">Create User</button>
          </div>
        </form>
      )}

      <div className="users-list">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className={!user.isActive ? 'inactive' : ''}>
                <td><strong>{user.username}</strong></td>
                <td>{user.fullName || '-'}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge role-${user.role.toLowerCase().replace(' ', '-')}`}>
                    {user.role === 'Platform Admin' ? 'Admin' : user.role}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? '✓' : '✖'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-small btn-warning"
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      title={user.isActive ? 'Deactivate user' : 'Activate user'}
                    >
                      {user.isActive ? '🔒 Deactivate' : '🔓 Activate'}
                    </button>
                    {!user.isActive && (
                      <button 
                        className="btn-small btn-danger"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title={
                          deletionInfo[user.id]?.canDelete 
                            ? 'Permanently delete user (deactivated for 45+ days)'
                            : `Cannot delete yet. ${deletionInfo[user.id]?.daysRemaining || '?'} day(s) remaining before deletion allowed.`
                        }
                        disabled={!deletionInfo[user.id]?.canDelete}
                        style={{
                          opacity: deletionInfo[user.id]?.canDelete ? 1 : 0.5,
                          cursor: deletionInfo[user.id]?.canDelete ? 'pointer' : 'not-allowed'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    )}
                    <button 
                      className="btn-small btn-info"
                      onClick={() => handleResetPassword(user.id)}
                      title="Reset password"
                    >
                      🔑 Reset
                    </button>
                  </div>
                  {!user.isActive && deletionInfo[user.id] && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: '#666', 
                      marginTop: '0.25rem',
                      fontStyle: 'italic'
                    }}>
                      {deletionInfo[user.id].canDelete 
                        ? `✓ Can be deleted (deactivated ${deletionInfo[user.id].daysSinceDeactivation} days ago)`
                        : `⏳ Deactivated ${deletionInfo[user.id].daysSinceDeactivation} days ago. ${deletionInfo[user.id].daysRemaining} day(s) until deletion allowed.`
                      }
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;

