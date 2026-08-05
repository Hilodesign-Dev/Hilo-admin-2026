// Hash-based navigation functions for tab routing

export const VALID_PAGES = ['calculator','catalogue','offers','dashboard','growth','masters','users','collections','customers','fabrics','outsource','orders','production','fulfillment','delayed','leads','finance']
export const GROWTH_SUBTABS = ['roi','campaigns','analytics','adspend','orders','cogs-entry','settings']

let _lastSubTab = { growth: 'attribution' }

export const getHashPage = () => {
  const match = window.location.hash.match(/^#\/(\w+)/)
  return match ? match[1] : null
}

export const getHashSubTab = (validTabs, fallback) => {
  const match = window.location.hash.match(/^#\/\w+\/([\w-]+)/)
  const tab = match ? match[1] : null
  return validTabs.includes(tab) ? tab : fallback
}

export const getHashPath = () => {
  const page = getHashPage()
  const subTabMatch = window.location.hash.match(/^#\/\w+\/([\w-]+)/)
  const subTab = subTabMatch ? subTabMatch[1] : null
  return { page, subTab }
}

export const setHashPage = (tab) => {
  if (!VALID_PAGES.includes(tab)) return
  const subTab = _lastSubTab[tab] || ''
  const target = subTab ? `#/${tab}/${subTab}` : `#/${tab}`
  if (window.location.hash !== target) {
    window.history.pushState(null, '', target)
  }
}

export const setHashSubTab = (page, subTab) => {
  if (!VALID_PAGES.includes(page)) return
  // Persist last sub-tab so navigating away and back restores position
  _lastSubTab[page] = subTab
  const target = `#/${page}/${subTab}`
  if (window.location.hash !== target) {
    window.history.pushState(null, '', target)
  }
}
