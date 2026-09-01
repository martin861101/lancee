import { useEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import { api } from '../../lib/api'
import { MemberAvatar, type WorkspaceMember } from '../workspace/WorkspaceMember'
import './collaboration.css'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}

export function MentionTextarea({ value, onChange, ...props }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (query === null) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.team.search(query).then((results) => {
        if (!cancelled) {
          setMembers(results as WorkspaceMember[])
          setActiveIndex(0)
        }
      }).catch(() => { if (!cancelled) setMembers([]) })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  function inspectMention(nextValue: string, caret: number) {
    const prefix = nextValue.slice(0, caret)
    const match = prefix.match(/(?:^|\s)@([^@\n]{0,60})$/)
    if (!match) {
      setQuery(null)
      setRange(null)
      return
    }
    const at = prefix.lastIndexOf('@')
    setQuery(match[1].trim())
    setRange({ start: at, end: caret })
  }

  function choose(member: WorkspaceMember) {
    if (!range || !member.userId) return
    const token = `@[${member.name}](user:${member.userId}) `
    const nextValue = `${value.slice(0, range.start)}${token}${value.slice(range.end)}`
    const caret = range.start + token.length
    onChange(nextValue)
    setQuery(null)
    setRange(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(caret, caret)
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || !members.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + members.length) % members.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      choose(members[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setQuery(null)
    }
  }

  return (
    <span className="mention-input">
      <textarea
        {...props}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          inspectMention(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => inspectMention(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
      />
      {query !== null && (
        <span className="mention-menu" role="listbox" aria-label="Workspace members">
          {members.map((member, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : ''}
              key={member.userId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(member)}
            >
              <MemberAvatar member={member} />
              <span><strong>{member.name}</strong><small>{member.email}</small></span>
            </button>
          ))}
          {!members.length && <small className="mention-menu__empty">No active members found</small>}
        </span>
      )}
    </span>
  )
}
