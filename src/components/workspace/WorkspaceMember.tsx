export type WorkspaceMember = {
  id: string
  userId: string | null
  name: string
  email: string
  avatarUrl: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'invited' | 'disabled'
  invitedAt: string | null
  joinedAt: string | null
  createdAt: string
  expiresAt?: string
}

export function MemberAvatar({ member }: { member: Pick<WorkspaceMember, 'name' | 'email' | 'avatarUrl'> }) {
  const initials = (member.name || member.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return member.avatarUrl ? (
    <img className="team-member-avatar" src={member.avatarUrl} alt="" />
  ) : <span className="team-member-avatar" aria-hidden="true">{initials || '?'}</span>
}

export function MemberBadge({ role, status }: Pick<WorkspaceMember, 'role' | 'status'>) {
  const label = status === 'invited' ? 'Invited' : status === 'disabled' ? 'Disabled' : role[0].toUpperCase() + role.slice(1)
  return <span className={`team-member-badge team-member-badge--${status === 'active' ? role : status}`}>{label}</span>
}
