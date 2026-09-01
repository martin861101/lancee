import { useState } from 'react'
import { MemberAvatar, type WorkspaceMember } from '../workspace/WorkspaceMember'
import './collaboration.css'

export function AssigneePicker({
  members,
  selected,
  onChange,
}: {
  members: WorkspaceMember[]
  selected: string[]
  onChange: (userIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="assignee-picker">
      <button type="button" className="assignee-picker__trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {selected.length ? `${selected.length} assignee${selected.length === 1 ? '' : 's'}` : 'Add assignees'}
      </button>
      {open && (
        <span className="assignee-picker__menu">
          {members.map((member) => {
            if (!member.userId) return null
            const checked = selected.includes(member.userId)
            return (
              <label key={member.userId}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={member.status !== 'active' && !checked}
                  onChange={() => onChange(checked
                    ? selected.filter((id) => id !== member.userId)
                    : [...selected, member.userId!])}
                />
                <MemberAvatar member={member} />
                <span title={member.name}>{member.name}{member.status === 'active' ? '' : ' (inactive)'}</span>
              </label>
            )
          })}
          {!members.length && <small>No active workspace members</small>}
          <button type="button" onClick={() => setOpen(false)}>Done</button>
        </span>
      )}
    </span>
  )
}
