import React from 'react'
import Icon from './Icon'

// Utility functions for user display
// Accepts either a string (email) or a member object with avatar_url
export const getAvatarUrl = (memberOrEmail) => {
  if (memberOrEmail && typeof memberOrEmail === 'object' && memberOrEmail.avatar_url) {
    return memberOrEmail.avatar_url;
  }
  const email = (typeof memberOrEmail === 'string' ? memberOrEmail : memberOrEmail?.email) || 'user';
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(email)}&scale=85&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

export const getDisplayName = (email) => {
  if (!email) return 'User'
  const name = email.split('@')[0]
  return name.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export const getUserRole = (email) => {
  // This would be determined by checking if user is in an admin list or similar
  // For now, return a default role
  return 'Staff'
}

const ProfilePopover = ({ user, onLogout, onClose, position = 'above' }) => {
  return (
    <div className={`absolute right-0 ${position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 bg-white rounded-xl shadow-xl min-w-48 overflow-hidden border border-gray-200`}>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Account</div>
      </div>
      <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
        <div className="font-medium">{getDisplayName(user?.email)}</div>
        <div className="text-xs text-gray-500">{user?.email}</div>
      </div>
      <button onClick={onLogout} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
        <Icon name="close" cls="w-4 h-4" />
        Sign Out
      </button>
      {onClose && (
        <button onClick={onClose} className="w-full px-4 py-2 text-left text-xs text-gray-400 hover:bg-gray-50">
          Close
        </button>
      )}
    </div>
  )
}

export default ProfilePopover
