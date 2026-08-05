import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { save } from '../lib/storage'
import Icon from './Icon'

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" style={{background:'rgba(0,0,0,0.5)'}}>
    <div className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl fade-in flex flex-col w-full max-w-full ${wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl'} mx-2 sm:mx-4`} style={{maxHeight:'min(92vh, calc(100vh - 32px))'}}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0 gap-3">
        <h2 className="text-sm sm:text-lg font-semibold text-gray-800 truncate flex-1 min-w-0">{title}</h2>
        <button onClick={onClose} className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 flex-shrink-0 text-gray-600 hover:text-gray-800"><Icon name="close" cls="w-4 h-4 sm:w-5 sm:h-5" /></button>
      </div>
      <div className="overflow-y-auto scrollbar-thin flex-1 p-4 sm:p-6">{children}</div>
    </div>
  </div>
);

export default Modal
