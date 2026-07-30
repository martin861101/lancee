import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import './dashboard-page.css'

type TeamMember = {
  id: string
  name: string
  email: string
  role: string
  status: string
  joinedAt: string
}

export default function TeamPage({ canInvite }: { canInvite: boolean }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'collaborator' | 'viewer'>('collaborator')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'invited' | 'disabled'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'collaborator' | 'viewer'>('all')
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'owner' | 'collaborator' | 'viewer'>('collaborator')

  const loadMembers = useCallback(async () => {
    setError('')
    const list = await api.team.list()
    setMembers(list)
  }, [])

  useEffect(() => {
    let isMounted = true
    loadMembers()
      .catch(() => {
        if (isMounted) setError('Unable to load team members')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [loadMembers])

  const stats = useMemo(() => {
    const active = members.filter((member) => member.status === 'active').length
    const invited = members.filter((member) => member.status === 'invited').length
    const owners = members.filter((member) => member.role === 'owner').length
    return { total: members.length, active, invited, owners }
  }, [members])

  const filteredMembers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return members.filter((member) => {
      if (statusFilter !== 'all' && member.status !== statusFilter) return false
      if (roleFilter !== 'all' && member.role !== roleFilter) return false
      if (!needle) return true
      return `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(needle)
    })
  }, [members, roleFilter, search, statusFilter])

  const handleRefresh = async () => {
    setNotice('')
    try {
      await loadMembers()
      setNotice('Team list refreshed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh team members.')
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const member = await api.team.invite({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      })
      setMembers((current) => {
        const withoutDuplicate = current.filter(
          (item) => item.id !== member.id && item.email.toLowerCase() !== member.email.toLowerCase(),
        )
        return [...withoutDuplicate, member]
      })
      setInviteEmail('')
      setInviteName('')
      setInviteOpen(false)
      setInviteLink(member.delivery === 'sent' ? '' : member.acceptUrl)
      setNotice(
        member.delivery === 'sent'
          ? `Invitation emailed to ${member.email}.`
          : member.delivery === 'failed'
            ? `Email delivery failed. Share the invitation link with ${member.email}.`
            : `Invitation created. Share the link with ${member.email}.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  const copyValue = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(message)
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        document.body.appendChild(textarea)
        textarea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (successful) {
          setNotice(message)
          return
        }
        throw new Error('fallback failed')
      } catch {
        setError('Unable to copy email to clipboard.')
      }
    }
  }

  const saveMember = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setSubmitting(true)
    setError('')
    try {
      const member = await api.team.update(editing.id, {
        name: editName.trim(),
        role: editRole,
      })
      setMembers((items) => items.map((item) => item.id === member.id ? member : item))
      setEditing(null)
      setNotice(`${member.name} was updated.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update this member.')
    } finally {
      setSubmitting(false)
    }
  }

  const removeMember = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name || member.email} from this workspace?`)) return
    setError('')
    try {
      await api.team.remove(member.id)
      setMembers((items) => items.filter((item) => item.id !== member.id))
      setNotice(`${member.name || member.email} was removed.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove this member.')
    }
  }

  return (
    <div className="content-container animate-fade-in dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <h2 className="dashboard-page__title">Team <em>permissions</em></h2>
          <p className="dashboard-page__description">
            Manage workspace members, role assignments, and collaborator access control.
          </p>
        </div>
        <div className="dashboard-page__actions">
          <button type="button" className="button button--ghost" onClick={() => void handleRefresh()} disabled={loading}>
            Refresh
          </button>
          {canInvite && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setInviteOpen(true)}
            >
              Invite member
            </button>
          )}
        </div>
      </header>

      {error && <div className="dashboard-alert">{error}</div>}
      {notice && <div className="dashboard-alert dashboard-alert--success">{notice}</div>}
      {inviteLink && (
        <div className="dashboard-link-form" style={{ marginBottom: '16px' }}>
          <label>
            Invitation link
            <input
              value={inviteLink}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void copyValue(inviteLink, 'Invitation link copied.')}
          >
            Copy invitation link
          </button>
        </div>
      )}

      <div className="dashboard-stat-grid">
        <div className="dashboard-stat">
          <span>Total members</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Active</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Pending invites</span>
          <strong>{stats.invited}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Owners</span>
          <strong>{stats.owners}</strong>
        </div>
      </div>

      {canInvite && inviteOpen && (
        <form className="dashboard-link-form" onSubmit={handleInvite}>
          <h3>Invite a new collaborator</h3>
          <div className="dashboard-link-form__grid">
            <label>
              Name (optional)
              <input
                type="text"
                placeholder="Colleague name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Role
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
                <option value="collaborator">Collaborator</option>
                <option value="viewer">Viewer</option>
                <option value="owner">Admin</option>
              </select>
            </label>
          </div>
          <div className="dashboard-link-form__footer">
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send invite'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="dashboard-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search team members"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Pending invite</option>
          <option value="disabled">Disabled</option>
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} aria-label="Filter by role">
          <option value="all">All roles</option>
          <option value="owner">Owners</option>
          <option value="collaborator">Collaborators</option>
          <option value="viewer">Viewers</option>
        </select>
      </div>

      {loading ? (
        <div className="skeleton-line" style={{ height: '180px' }} />
      ) : (
        <div className="dashboard-panel">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6854e8, #ee45aa)',
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 700,
                          fontSize: '14px',
                          flexShrink: 0,
                        }}
                      >
                        {((member.name.trim() || member.email).charAt(0) || '?').toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ display: 'block', color: 'var(--ink)' }}>{member.name}</strong>
                        <small style={{ color: 'var(--muted)' }}>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{member.role}</td>
                  <td>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          member.status === 'active'
                            ? 'rgba(71, 135, 46, 0.12)'
                            : member.status === 'disabled'
                              ? 'rgba(219, 91, 83, 0.12)'
                              : 'rgba(166, 107, 22, 0.12)',
                        color:
                          member.status === 'active'
                            ? 'var(--success)'
                            : member.status === 'disabled'
                              ? 'var(--danger)'
                              : 'var(--warning)',
                      }}
                    >
                      {member.status === 'active'
                        ? 'Active'
                        : member.status === 'invited'
                          ? 'Pending invite'
                          : member.status === 'disabled'
                            ? 'Disabled'
                            : member.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="team-row-actions">
                      <button type="button" className="button button--ghost button--small" onClick={() => void copyValue(member.email, `Copied ${member.email}`)}>
                        Copy
                      </button>
                      {canInvite && (
                        <>
                          <button type="button" className="button button--secondary button--small" onClick={() => {
                            setEditing(member)
                            setEditName(member.name)
                            setEditRole(member.role as typeof editRole)
                          }}>
                            Edit
                          </button>
                          <button type="button" className="button button--danger button--small" onClick={() => void removeMember(member)}>
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="dashboard-empty">
                    {members.length === 0
                      ? 'No team members yet. Invite your first collaborator.'
                      : 'No members match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="team-edit-backdrop" onMouseDown={() => setEditing(null)}>
          <form className="team-edit-dialog" onSubmit={(event) => void saveMember(event)} onMouseDown={(event) => event.stopPropagation()}>
            <h3>Edit team member</h3>
            <p>{editing.email}</p>
            <label>
              Name
              <input value={editName} onChange={(event) => setEditName(event.target.value)} required />
            </label>
            <label>
              Role
              <select value={editRole} onChange={(event) => setEditRole(event.target.value as typeof editRole)}>
                <option value="owner">Admin</option>
                <option value="collaborator">Collaborator</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <small>Admins manage workspace settings. Collaborators edit work. Viewers have read-only access.</small>
            <div>
              <button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="button button--primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save member'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
