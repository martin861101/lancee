import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type TeamMember = {
  id: string
  name: string
  email: string
  role: string
  status: string
  joinedAt: string
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'collaborator'>('collaborator')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    api.team
      .list()
      .then((res) => {
        if (isMounted) setMembers(res)
      })
      .catch(() => setError('Unable to load team members'))
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/workspace/team/invite', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || inviteEmail.split('@')[0],
          role: inviteRole,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to send invitation.')
      }
      setMembers((current) => [...current, payload])
      setInviteEmail('')
      setInviteName('')
      setInviteOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-container animate-fade-in" style={{ padding: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Team & Permissions</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            Manage workspace members, role assignments, and collaborator access control.
          </p>
        </div>
        <button
          className="button button--primary"
          onClick={() => setInviteOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>+</span> Invite Member
        </button>
      </header>

      {error && (
        <div style={{ background: 'rgba(219, 91, 83, 0.1)', color: 'var(--danger)', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {inviteOpen && (
        <form onSubmit={handleInvite} style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Invite a New Collaborator</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Colleague name (optional)"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              style={{ flex: 1, minWidth: '180px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}
            />
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'owner' | 'collaborator')}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}
            >
              <option value="collaborator">Collaborator</option>
              <option value="owner">Owner / Admin</option>
            </select>
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Invite'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setInviteOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="skeleton-line" style={{ height: '180px' }} />
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted)' }}>Member</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted)' }}>Role</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted)' }}>Status</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted)' }}>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #6854e8, #ee45aa)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '14px' }}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ display: 'block', color: 'var(--ink)' }}>{member.name}</strong>
                        <small style={{ color: 'var(--muted)' }}>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', textTransform: 'capitalize', fontWeight: 500 }}>
                    {member.role}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: member.status === 'active' ? 'rgba(71, 135, 46, 0.12)' : 'rgba(166, 107, 22, 0.12)',
                        color: member.status === 'active' ? 'var(--success)' : 'var(--warning)',
                      }}
                    >
                      {member.status === 'active' ? 'Active' : member.status === 'invited' ? 'Pending Invite' : member.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--muted)' }}>
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    No team members yet. Invite your first collaborator.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
