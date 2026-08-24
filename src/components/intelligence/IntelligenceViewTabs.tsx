import { useRef, type KeyboardEvent } from 'react'

export type IntelligenceView = 'findings' | 'activity'

export default function IntelligenceViewTabs({
  activeView,
  findingCount,
  activityCount,
  onChange,
}: {
  activeView: IntelligenceView
  findingCount: number
  activityCount: number
  onChange: (view: IntelligenceView) => void
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const tabs: Array<{ id: IntelligenceView; label: string; count: number }> = [
    { id: 'findings', label: 'Things I’ve noticed', count: findingCount },
    { id: 'activity', label: 'Lancee activity', count: activityCount },
  ]

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[nextIndex].id)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div className="intelligence-view-tabs" role="tablist" aria-label="Connected Intelligence views">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => { refs.current[index] = node }}
          type="button"
          role="tab"
          id={`intelligence-tab-${tab.id}`}
          aria-selected={activeView === tab.id}
          aria-controls={`intelligence-panel-${tab.id}`}
          tabIndex={activeView === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <span>{tab.label}</span>
          <small aria-label={`${tab.count} ${tab.label.toLowerCase()}`}>{tab.count.toLocaleString('en-ZA')}</small>
        </button>
      ))}
    </div>
  )
}
